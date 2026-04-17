import { storage } from '../storage';
import { sendOrderPlacedSmsToHost, isSmsConfigured } from './sms';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { orders, nodeAvailability } from '@shared/schema';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

const TIMEZONE = 'America/Toronto';

function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
  const trimmed = timeStr.trim();

  const match12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (match12) {
    let hours = parseInt(match12[1]);
    const minutes = match12[2] ? parseInt(match12[2]) : 0;
    const ampm = match12[3].toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return { hours, minutes };
  }

  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return { hours: parseInt(match24[1]), minutes: parseInt(match24[2]) };
  }

  return null;
}

export function parsePickupWindow(pickupDate: string, pickupTime: string): { start: Date; end: Date } | null {
  if (!pickupDate || !pickupTime) return null;

  const timeParts = pickupTime.split(' - ');
  if (timeParts.length !== 2) return null;

  const startTime = parseTimeString(timeParts[0]);
  const endTime = parseTimeString(timeParts[1]);
  if (!startTime || !endTime) return null;

  const startStr = `${pickupDate}T${String(startTime.hours).padStart(2, '0')}:${String(startTime.minutes).padStart(2, '0')}:00`;
  const endStr = `${pickupDate}T${String(endTime.hours).padStart(2, '0')}:${String(endTime.minutes).padStart(2, '0')}:00`;

  const start = fromZonedTime(startStr, TIMEZONE);
  const end = fromZonedTime(endStr, TIMEZONE);

  return { start, end };
}

export function isWithinPickupWindow(pickupDate: string, pickupTime: string): boolean {
  const window = parsePickupWindow(pickupDate, pickupTime);
  if (!window) return true;

  const now = new Date();
  return now >= window.start && now <= window.end;
}

export function hasPickupWindowStarted(pickupDate: string, pickupTime: string): boolean {
  const window = parsePickupWindow(pickupDate, pickupTime);
  if (!window) return true;

  const now = new Date();
  return now >= window.start;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function isNodeCurrentlyAvailable(nodeId: string): Promise<boolean> {
  if (!nodeId) return true;

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const availability = await storage.getNodeAvailability(nodeId);
      if (!availability || availability.length === 0) return true;

      const enabledSlots = availability.filter(a => a.enabled);
      if (enabledSlots.length === 0) return true;

      const nowET = formatInTimeZone(new Date(), TIMEZONE, 'EEEE');
      const currentTime = formatInTimeZone(new Date(), TIMEZONE, 'HH:mm');

      const todaySlots = enabledSlots.filter(a => a.dayOfWeek === nowET);
      if (todaySlots.length === 0) return false;

      return todaySlots.some(slot => currentTime >= slot.startTime && currentTime <= slot.endTime);
    } catch (err) {
      console.error(`[QUEUE] Error checking node availability for ${nodeId} (attempt ${attempt + 1}/${maxRetries + 1}):`, err);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  console.log(`[QUEUE] All retries failed for node ${nodeId}, defaulting to QUEUE (not sending SMS)`);
  return false;
}

export function getNextAvailabilityStart(availabilitySlots: Array<{ dayOfWeek: string; startTime: string; endTime: string; enabled: boolean }>): Date | null {
  const enabledSlots = availabilitySlots.filter(a => a.enabled);
  if (enabledSlots.length === 0) return null;

  const now = new Date();
  const nowET = formatInTimeZone(now, TIMEZONE, 'EEEE');
  const currentTime = formatInTimeZone(now, TIMEZONE, 'HH:mm');
  const todayIndex = DAY_NAMES.indexOf(nowET);

  for (let daysAhead = 0; daysAhead < 7; daysAhead++) {
    const dayIndex = (todayIndex + daysAhead) % 7;
    const dayName = DAY_NAMES[dayIndex];
    const daySlots = enabledSlots.filter(a => a.dayOfWeek === dayName).sort((a, b) => a.startTime.localeCompare(b.startTime));

    for (const slot of daySlots) {
      if (daysAhead === 0 && slot.startTime <= currentTime) continue;

      const futureDate = new Date(now);
      futureDate.setDate(futureDate.getDate() + daysAhead);
      const dateStr = formatInTimeZone(futureDate, TIMEZONE, 'yyyy-MM-dd');
      const startParsed = parseTimeString(slot.startTime);
      if (!startParsed) continue;

      const startStr = `${dateStr}T${String(startParsed.hours).padStart(2, '0')}:${String(startParsed.minutes).padStart(2, '0')}:00`;
      return fromZonedTime(startStr, TIMEZONE);
    }
  }

  return null;
}

async function sendHostNotificationForOrder(order: any) {
  if (!isSmsConfigured()) return;

  if (order.hostNotifiedAt) {
    await storage.updateOrder(order.id, { hostNotificationQueued: false });
    return;
  }

  try {
    const node = await storage.getNode(order.nodeId);
    if (!node) return;

    const nodeUser = await storage.getUser(node.userId);
    const hostPhone = (node as any).notificationPhone || nodeUser?.phone;
    if (!hostPhone) return;

    const orderItems = await storage.getOrderItems(order.id);
    const products = await storage.getProductsByIds(orderItems.map((i: any) => i.productId));
    const items = orderItems.map((item: any) => {
      const product = products.find((p: any) => p.id === item.productId);
      return { code: product?.productCode || 'ITEM', quantity: item.quantity };
    });

    const smsResult = await sendOrderPlacedSmsToHost(hostPhone, {
      orderNumber: order.pickupCode,
      customerFirstName: order.buyerName?.split(' ')[0] || 'Customer',
      items,
    });

    if (smsResult.success) {
      console.log(`[QUEUE] Order placed SMS sent to host ${hostPhone} for order ${order.pickupCode}`);
      await storage.updateOrder(order.id, { 
        hostNotifiedAt: new Date(),
        hostNotificationQueued: false,
      });
    } else {
      console.error(`[QUEUE] Failed to send SMS to host ${hostPhone}: ${smsResult.error}`);
    }
  } catch (err) {
    console.error(`[QUEUE] Error sending notification for order ${order.id}:`, err);
  }
}

export async function processQueuedOrderNotifications() {
  try {
    const queuedOrders = await db.select().from(orders).where(
      and(
        eq(orders.hostNotificationQueued, true),
        eq(orders.status, 'confirmed'),
        isNull(orders.hostNotifiedAt)
      )
    );

    if (queuedOrders.length === 0) return;

    const ordersByNode = new Map<string, typeof queuedOrders>();
    for (const order of queuedOrders) {
      const nodeId = order.nodeId || '';
      if (!ordersByNode.has(nodeId)) ordersByNode.set(nodeId, []);
      ordersByNode.get(nodeId)!.push(order);
    }

    for (const [nodeId, nodeOrders] of ordersByNode) {
      if (!nodeId) {
        for (const order of nodeOrders) {
          await sendHostNotificationForOrder(order);
        }
        continue;
      }

      const available = await isNodeCurrentlyAvailable(nodeId);
      if (!available) {
        continue;
      }

      console.log(`[QUEUE] Node ${nodeId} is now available, sending ${nodeOrders.length} queued notification(s)`);
      for (const order of nodeOrders) {
        await sendHostNotificationForOrder(order);
      }
    }
  } catch (err) {
    console.error('[QUEUE] Error processing queued order notifications:', err);
  }
}

let queueInterval: NodeJS.Timeout | null = null;

export function startOrderNotificationQueue() {
  if (queueInterval) return;
  queueInterval = setInterval(processQueuedOrderNotifications, 60_000);
  console.log('[QUEUE] Order notification queue started (checks every 60s)');
}

export function stopOrderNotificationQueue() {
  if (queueInterval) {
    clearInterval(queueInterval);
    queueInterval = null;
  }
}
