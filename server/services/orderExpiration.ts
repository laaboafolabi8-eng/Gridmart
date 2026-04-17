import Stripe from 'stripe';
import { storage } from '../storage';
import { sendSms } from './sms';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-04-30.basil',
});

export async function processExpiredOrders(): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const allOrders = await storage.getAllOrders();
    
    const expiredOrders = allOrders.filter(order => {
      if (!['confirmed', 'ready'].includes(order.status)) return false;
      if (!order.pickupDate) return false;
      return order.pickupDate < todayStr;
    });

    console.log(`Found ${expiredOrders.length} expired orders to process`);

    for (const order of expiredOrders) {
      try {
        const orderTotal = parseFloat(order.total);
        
        // Mark as expired (not cancelled) - admin will handle refunds manually
        await storage.updateOrderStatus(order.id, 'expired');
        
        // Restore inventory for cancelled order items
        const orderItems = await storage.getOrderItems(order.id);
        for (const item of orderItems) {
          await storage.updateInventoryQuantity(item.productId, order.nodeId, item.quantity);
        }

        // No SMS on expiration - admin will manually process refunds and send notification

        processed++;
        console.log(`Order ${order.id} (${order.pickupCode}) expired - inventory restored, manual refund required`);
      } catch (orderError: any) {
        const errorMsg = `Failed to process order ${order.id}: ${orderError.message}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }
  } catch (error: any) {
    console.error('Error in processExpiredOrders:', error);
    errors.push(error.message);
  }

  return { processed, errors };
}

let intervalId: NodeJS.Timeout | null = null;

export function startOrderExpirationJob(intervalHours: number = 1): void {
  if (intervalId) {
    console.log('Order expiration job already running');
    return;
  }

  console.log(`Starting order expiration job (runs every ${intervalHours} hour(s))`);
  
  setTimeout(() => {
    processExpiredOrders()
      .then(result => console.log(`Initial expiration check: ${result.processed} orders processed`))
      .catch(err => console.error('Initial expiration check failed:', err));
  }, 10000);

  intervalId = setInterval(async () => {
    console.log('Running scheduled order expiration check...');
    const result = await processExpiredOrders();
    console.log(`Expiration check complete: ${result.processed} orders processed, ${result.errors.length} errors`);
  }, intervalHours * 60 * 60 * 1000);
}

export function stopOrderExpirationJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('Order expiration job stopped');
  }
}
