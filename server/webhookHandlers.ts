import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';
import { sendOrderPlacedSmsToHost } from './services/sms';
import { isWithinPickupWindow, isNodeCurrentlyAvailable } from './services/orderQueue';
import { db } from '../db';
import { paymentLinks } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    const stripe = await getUncachableStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event: Stripe.Event;
    
    try {
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      } else {
        event = JSON.parse(payload.toString()) as Stripe.Event;
      }
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      throw new Error(`Webhook Error: ${err.message}`);
    }
    
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        const paymentIntentId = typeof session.payment_intent === 'string' 
          ? session.payment_intent 
          : session.payment_intent?.id;
        
        // Handle manual payment link completion
        if (session.metadata?.paymentLinkType === 'manual') {
          try {
            const updated = await db.update(paymentLinks)
              .set({ 
                status: 'paid', 
                paidAt: new Date(),
                stripePaymentIntentId: paymentIntentId || null,
              })
              .where(eq(paymentLinks.stripeSessionId, session.id))
              .returning();
            if (updated.length > 0) {
              console.log(`Payment link ${updated[0].id} marked as paid via webhook`);
            }
          } catch (e) {
            console.error('Failed to update payment link status:', e);
          }
          break;
        }

        if (orderId) {
          console.log(`Payment completed for order ${orderId}, payment intent: ${paymentIntentId}`);
          await storage.updateOrderStatus(orderId, 'confirmed');
          
          // Store the payment intent ID for refunds
          if (paymentIntentId) {
            await storage.updateOrder(orderId, { stripePaymentIntentId: paymentIntentId });
          }
          
          const order = await storage.getOrder(orderId);
          if (order) {
            const orderItems = await storage.getOrderItems(orderId);
            for (const item of orderItems) {
              await storage.updateInventoryQuantity(item.productId, order.nodeId, -item.quantity);
            }
            
            const nodeCurrentlyAvailable = order.nodeId ? await isNodeCurrentlyAvailable(order.nodeId) : true;
            if (!nodeCurrentlyAvailable) {
              await storage.updateOrder(orderId, { hostNotificationQueued: true });
              console.log(`Order ${order.pickupCode} queued for notification (node outside availability window)`);
            } else {
              try {
                const node = await storage.getNode(order.nodeId);
                if (node) {
                  const nodeUser = await storage.getUser(node.userId);
                  const hostPhone = node.notificationPhone || nodeUser?.phone;
                  if (hostPhone) {
                    const itemsWithCodes = await Promise.all(
                      orderItems.map(async (item) => {
                        const product = await storage.getProduct(item.productId);
                        return {
                          code: product?.productCode || item.productId.slice(0, 8).toUpperCase(),
                          quantity: item.quantity,
                        };
                      })
                    );
                    
                    const firstName = order.buyerName.split(' ')[0];
                    
                    await sendOrderPlacedSmsToHost(hostPhone, {
                      orderNumber: order.pickupCode,
                      customerFirstName: firstName,
                      items: itemsWithCodes,
                    });
                    console.log(`Order notification SMS sent to node host at ${hostPhone} for order ${orderId}`);
                    await storage.updateOrder(orderId, { hostNotifiedAt: new Date() });
                  }
                }
              } catch (smsError) {
                console.error('Failed to send order notification SMS to host:', smsError);
              }
            }
          }
        }
        break;
      }
      
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        
        // Handle manual payment link expiry
        if (session.metadata?.paymentLinkType === 'manual') {
          try {
            await db.update(paymentLinks)
              .set({ status: 'expired' })
              .where(eq(paymentLinks.stripeSessionId, session.id));
            console.log(`Payment link expired via webhook for session ${session.id}`);
          } catch (e) {
            console.error('Failed to update payment link expired status:', e);
          }
          break;
        }

        if (orderId) {
          console.log(`Payment expired for order ${orderId}`);
          await storage.updateOrderStatus(orderId, 'cancelled');
        }
        break;
      }
      
      case 'payment_intent.payment_failed': {
        console.log('Payment failed event received');
        break;
      }
    }
    
    await sync.processWebhook(payload, signature);
  }
}
