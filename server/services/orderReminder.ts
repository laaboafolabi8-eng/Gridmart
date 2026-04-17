import { storage } from '../storage';
import { sendOrderReminderSms, isSmsConfigured } from './sms';
import { formatInTimeZone } from 'date-fns-tz';
import { isNodeCurrentlyAvailable } from './orderQueue';

const REMINDER_INTERVAL_MINUTES = 30;
const TIMEZONE = 'America/Toronto';

export async function processOrderReminders(): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  if (!isSmsConfigured()) {
    console.log('SMS not configured, skipping order reminders');
    return { sent: 0, errors: [] };
  }

  try {
    const now = new Date();
    const torontoHour = parseInt(formatInTimeZone(now, TIMEZONE, 'H'), 10);
    const todayToronto = formatInTimeZone(now, TIMEZONE, 'yyyy-MM-dd');
    
    if (torontoHour < 9 || torontoHour >= 21) {
      console.log(`Outside reminder hours (9am-9pm Toronto time), current hour: ${torontoHour}, skipping reminders`);
      return { sent: 0, errors: [] };
    }

    const allOrders = await storage.getAllOrders();
    
    const ordersNeedingReminder = allOrders.filter(order => {
      if (order.status !== 'confirmed') return false;
      if (order.pickupDate !== todayToronto) return false;
      if (!order.hostNotifiedAt) return false;
      
      const hostNotifiedAt = new Date(order.hostNotifiedAt);
      const lastReminderAt = order.lastReminderSentAt ? new Date(order.lastReminderSentAt) : null;
      
      const checkTime = lastReminderAt || hostNotifiedAt;
      const minutesSinceLastNotification = (now.getTime() - checkTime.getTime()) / (1000 * 60);
      
      return minutesSinceLastNotification >= REMINDER_INTERVAL_MINUTES;
    });

    console.log(`Found ${ordersNeedingReminder.length} orders needing reminders`);

    for (const order of ordersNeedingReminder) {
      try {
        const node = await storage.getNode(order.nodeId);
        if (!node) {
          console.log(`Node not found for order ${order.id}, skipping reminder`);
          continue;
        }

        const nodeAvailable = await isNodeCurrentlyAvailable(order.nodeId);
        if (!nodeAvailable) {
          console.log(`Node ${node.name} not in availability window, skipping reminder for order ${order.pickupCode}`);
          continue;
        }

        const nodeUser = await storage.getUser(node.userId);
        const hostPhone = (node as any).notificationPhone || nodeUser?.phone;
        if (!hostPhone) {
          console.log(`Host phone not found for node ${node.id}, skipping reminder`);
          continue;
        }

        const orderItems = await storage.getOrderItems(order.id);
        const itemsWithDetails = await Promise.all(
          orderItems.map(async (item) => {
            const product = await storage.getProduct(item.productId);
            return {
              code: product?.productCode || 'Unknown',
              quantity: item.quantity,
            };
          })
        );

        const result = await sendOrderReminderSms(hostPhone, {
          orderNumber: order.pickupCode,
          customerFirstName: order.buyerName.split(' ')[0],
          items: itemsWithDetails,
        });

        if (result.success) {
          await storage.updateOrder(order.id, {
            lastReminderSentAt: new Date(),
            reminderCount: (order.reminderCount || 0) + 1,
          });
          sent++;
          console.log(`Reminder sent for order ${order.pickupCode} at ${node.name} (reminder #${(order.reminderCount || 0) + 1})`);
        } else {
          errors.push(`Failed to send reminder for order ${order.id}: ${result.error}`);
        }
      } catch (orderError: any) {
        const errorMsg = `Failed to process reminder for order ${order.id}: ${orderError.message}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }
  } catch (error: any) {
    console.error('Error in processOrderReminders:', error);
    errors.push(error.message);
  }

  return { sent, errors };
}

let intervalId: NodeJS.Timeout | null = null;

export function startOrderReminderJob(intervalMinutes: number = 5): void {
  if (intervalId) {
    console.log('Order reminder job already running');
    return;
  }

  console.log(`Starting order reminder job (checks every ${intervalMinutes} minutes)`);
  
  setTimeout(() => {
    processOrderReminders()
      .then(result => console.log(`Initial reminder check: ${result.sent} reminders sent`))
      .catch(err => console.error('Initial reminder check failed:', err));
  }, 30000);

  intervalId = setInterval(async () => {
    console.log('Running scheduled order reminder check...');
    const result = await processOrderReminders();
    console.log(`Reminder check complete: ${result.sent} sent, ${result.errors.length} errors`);
  }, intervalMinutes * 60 * 1000);
}

export function stopOrderReminderJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('Order reminder job stopped');
  }
}
