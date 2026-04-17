import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let twilioClient: twilio.Twilio | null = null;

function getClient(): twilio.Twilio | null {
  if (!accountSid || !authToken) {
    console.warn('Twilio credentials not configured - SMS notifications disabled');
    return null;
  }
  if (!twilioClient) {
    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

export interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function sendViaTwilio(client: twilio.Twilio, to: string, body: string): Promise<{ sid: string }> {
  const result = await client.messages.create({
    body,
    from: twilioPhoneNumber!,
    to,
  });

  const adminPhone = process.env.ADMIN_SMS_PHONE;
  if (adminPhone) {
    const formattedAdmin = formatPhoneNumber(adminPhone);
    if (formattedAdmin && formattedAdmin !== to) {
      try {
        await client.messages.create({
          body: `[CC → ${to}]\n${body}`,
          from: twilioPhoneNumber!,
          to: formattedAdmin,
        });
      } catch (err: any) {
        console.error(`[SMS] Failed to CC admin: ${err.message}`);
      }
    }
  }

  return result;
}

// Default SMS templates with placeholders
export const DEFAULT_SMS_TEMPLATES = {
  order_ready_buyer: `GridMart: Your order is ready for pickup! 📦

Pickup Code: {{pickupCode}}
Location: {{nodeName}}
Address: {{nodeAddress}}
{{#availabilityWindow}}

Pickup today: {{availabilityWindow}}
{{/availabilityWindow}}
{{#pickupInstructions}}

📍 {{pickupInstructions}}
{{/pickupInstructions}}

⚠️ Please pick up by {{#pickupDeadline}}{{pickupDeadline}}{{/pickupDeadline}}{{^pickupDeadline}}end of day{{/pickupDeadline}}{{#pickupDate}} ({{pickupDate}}){{/pickupDate}} or your order will be canceled and refunded.

Reply HERE when you arrive.`,

  order_placed_host: `GridMart: New order #{{orderNumber}}!

Customer: {{customerFirstName}}
Items: {{itemsList}}

Reply READY when prepared.`,

  order_reminder_host: `GridMart Reminder: Order #{{orderNumber}} is still waiting!

Customer {{customerFirstName}} is expecting pickup today.
Items: {{itemsList}}

Please reply READY when the order is prepared.`,

  customer_arrived_host: `GridMart: Customer has arrived! 🚗

Order: #{{orderNumber}}
Pickup Code: {{pickupCode}}
Customer: {{customerName}}

Reply COMPLETE when order is handed off.`,

  order_complete_buyer: `GridMart: Thank you for your pickup! 🎉

We hope you love your items. Got feedback? We'd love to hear it!

Visit gridmart.ca/feedback to share your experience.

See you next time! 💚`,

  inventory_added_host: `GridMart: New inventory added to {{nodeName}}!

Product Code: {{productCode}}
Quantity: {{quantity}}

This listing is now live.`,

  customer_here_confirmation: `Got it! The host has been notified and should be out shortly.

Reminder: Please have your pickup code ready and meet the host at the designated pickup area.`,

  location_closed_today: `The pickup location is currently closed.

{{#openDays}}Open days: {{openDays}}{{/openDays}}{{^openDays}}No availability scheduled.{{/openDays}}

Please return during open hours to pick up your order.`,

  location_closed_hours: `The pickup location is currently closed.

Today's hours: {{todayHours}}

Please return during open hours to pick up your order.`,
};

export type SmsTemplateKey = keyof typeof DEFAULT_SMS_TEMPLATES;

// Template variable definitions for UI hints
export const SMS_TEMPLATE_VARIABLES: Record<SmsTemplateKey, { name: string; description: string; recipient: string; variables: string[] }> = {
  order_ready_buyer: {
    name: 'Order Ready',
    description: 'Sent to buyer when their order is marked ready for pickup',
    recipient: 'Buyer',
    variables: ['pickupCode', 'nodeName', 'nodeAddress', 'availabilityWindow', 'pickupDate', 'pickupDeadline', 'pickupInstructions'],
  },
  order_placed_host: {
    name: 'New Order Received',
    description: 'Sent to host when a new order is placed at their node',
    recipient: 'Host',
    variables: ['orderNumber', 'customerFirstName', 'itemsList'],
  },
  order_reminder_host: {
    name: 'Order Reminder',
    description: 'Sent to host as a reminder when order is not yet marked ready',
    recipient: 'Host',
    variables: ['orderNumber', 'customerFirstName', 'itemsList'],
  },
  customer_arrived_host: {
    name: 'Customer Arrived',
    description: 'Sent to host when customer replies HERE to indicate they have arrived',
    recipient: 'Host',
    variables: ['orderNumber', 'pickupCode', 'customerName'],
  },
  order_complete_buyer: {
    name: 'Order Complete',
    description: 'Sent to buyer when host marks order as picked up with COMPLETE',
    recipient: 'Buyer',
    variables: ['orderId'],
  },
  inventory_added_host: {
    name: 'Inventory Added',
    description: 'Sent to host when new inventory is added and goes live',
    recipient: 'Host',
    variables: ['nodeName', 'productCode', 'quantity'],
  },
  customer_here_confirmation: {
    name: 'Customer HERE Confirmation',
    description: 'Sent back to customer when they text HERE to confirm arrival',
    recipient: 'Buyer',
    variables: [],
  },
  location_closed_today: {
    name: 'Location Closed (No Hours Today)',
    description: 'Sent to customer when they text HERE but the node has no availability today',
    recipient: 'Buyer',
    variables: ['openDays'],
  },
  location_closed_hours: {
    name: 'Location Closed (Outside Hours)',
    description: 'Sent to customer when they text HERE outside of today\'s operating hours',
    recipient: 'Buyer',
    variables: ['todayHours'],
  },
};

// Simple template interpolation with mustache-like syntax
function interpolateTemplate(template: string, data: Record<string, string | number | undefined>): string {
  let result = template;
  
  // Handle conditional blocks {{#var}}...{{/var}} (show if truthy)
  result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
    return data[key] ? content : '';
  });
  
  // Handle inverted conditional blocks {{^var}}...{{/var}} (show if falsy)
  result = result.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
    return !data[key] ? content : '';
  });
  
  // Handle simple variables {{var}}
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return data[key] !== undefined ? String(data[key]) : '';
  });
  
  // Clean up any double newlines from removed conditional blocks
  result = result.replace(/\n{3,}/g, '\n\n');
  
  return result.trim();
}

// Storage interface for getting templates
let getTemplateFromStorage: ((key: string) => Promise<string | undefined>) | null = null;

export function setSmsTemplateStorage(getter: (key: string) => Promise<string | undefined>) {
  getTemplateFromStorage = getter;
}

async function getTemplate(key: SmsTemplateKey): Promise<string> {
  if (getTemplateFromStorage) {
    const stored = await getTemplateFromStorage(`sms_template_${key}`);
    if (stored) return stored;
  }
  return DEFAULT_SMS_TEMPLATES[key];
}

export async function sendOrderReadySms(
  phoneNumber: string,
  orderDetails: {
    orderId: string;
    pickupCode: string;
    nodeName: string;
    nodeAddress: string;
    availabilityWindow?: string;
    pickupDate?: string;
    pickupDeadline?: string;
    pickupInstructions?: string;
  }
): Promise<SendSmsResult> {
  const client = getClient();
  
  if (!client) {
    return { success: false, error: 'SMS service not configured' };
  }

  if (!twilioPhoneNumber) {
    return { success: false, error: 'Twilio phone number not configured' };
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);
  if (!formattedPhone) {
    return { success: false, error: 'Invalid phone number format' };
  }

  const template = await getTemplate('order_ready_buyer');
  const message = interpolateTemplate(template, {
    pickupCode: orderDetails.pickupCode,
    nodeName: orderDetails.nodeName,
    nodeAddress: orderDetails.nodeAddress,
    availabilityWindow: orderDetails.availabilityWindow,
    pickupDate: orderDetails.pickupDate,
    pickupDeadline: orderDetails.pickupDeadline,
    pickupInstructions: orderDetails.pickupInstructions,
  });

  try {
    const result = await sendViaTwilio(client, formattedPhone, message);

    console.log(`SMS sent successfully to ${formattedPhone}, SID: ${result.sid}`);
    return { success: true, messageId: result.sid };
  } catch (error: any) {
    console.error('Failed to send SMS:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendOrderPlacedSmsToHost(
  phoneNumber: string,
  orderDetails: {
    orderNumber: string;
    customerFirstName: string;
    items: { code: string; quantity: number }[];
  }
): Promise<SendSmsResult> {
  const client = getClient();
  
  if (!client) {
    return { success: false, error: 'SMS service not configured' };
  }

  if (!twilioPhoneNumber) {
    return { success: false, error: 'Twilio phone number not configured' };
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);
  if (!formattedPhone) {
    return { success: false, error: 'Invalid phone number format' };
  }

  const itemsList = orderDetails.items
    .map(item => `${item.code} (x${item.quantity})`)
    .join(', ');

  const template = await getTemplate('order_placed_host');
  const message = interpolateTemplate(template, {
    orderNumber: orderDetails.orderNumber,
    customerFirstName: orderDetails.customerFirstName,
    itemsList,
  });

  try {
    const result = await sendViaTwilio(client, formattedPhone, message);

    console.log(`Order placed SMS sent to host ${formattedPhone}, SID: ${result.sid}`);
    return { success: true, messageId: result.sid };
  } catch (error: any) {
    console.error('Failed to send order placed SMS:', error.message);
    return { success: false, error: error.message };
  }
}

function formatPhoneNumber(phone: string): string | null {
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  } else if (cleaned.length > 10 && cleaned.startsWith('+')) {
    return phone;
  }
  
  return null;
}

export function isSmsConfigured(): boolean {
  return !!(accountSid && authToken && twilioPhoneNumber);
}

export async function sendSms(phoneNumber: string, message: string): Promise<SendSmsResult> {
  const client = getClient();
  
  if (!client) {
    return { success: false, error: 'SMS service not configured' };
  }

  if (!twilioPhoneNumber) {
    return { success: false, error: 'Twilio phone number not configured' };
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);
  if (!formattedPhone) {
    return { success: false, error: 'Invalid phone number format' };
  }

  try {
    const result = await sendViaTwilio(client, formattedPhone, message);

    console.log(`SMS sent to ${formattedPhone}, SID: ${result.sid}`);
    return { success: true, messageId: result.sid };
  } catch (error: any) {
    console.error('Failed to send SMS:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendInventoryAddedSms(
  phoneNumber: string,
  details: {
    productCode: string;
    quantity: number;
    nodeName: string;
  }
): Promise<SendSmsResult> {
  const client = getClient();
  
  if (!client) {
    return { success: false, error: 'SMS service not configured' };
  }

  if (!twilioPhoneNumber) {
    return { success: false, error: 'Twilio phone number not configured' };
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);
  if (!formattedPhone) {
    return { success: false, error: 'Invalid phone number format' };
  }

  const template = await getTemplate('inventory_added_host');
  const message = interpolateTemplate(template, {
    nodeName: details.nodeName,
    productCode: details.productCode,
    quantity: details.quantity,
  });

  try {
    const result = await sendViaTwilio(client, formattedPhone, message);

    console.log(`Inventory SMS sent successfully to ${formattedPhone}, SID: ${result.sid}`);
    return { success: true, messageId: result.sid };
  } catch (error: any) {
    console.error('Failed to send inventory SMS:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendVerificationCode(phoneNumber: string, code: string): Promise<SendSmsResult> {
  const client = getClient();
  
  if (!client) {
    return { success: false, error: 'SMS service not configured' };
  }

  if (!twilioPhoneNumber) {
    return { success: false, error: 'Twilio phone number not configured' };
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);
  if (!formattedPhone) {
    return { success: false, error: 'Invalid phone number format' };
  }

  try {
    const result = await sendViaTwilio(client, formattedPhone, `GridMart: Your verification code is ${code}. This code expires in 5 minutes.`);

    console.log(`Verification SMS sent to ${formattedPhone}, SID: ${result.sid}`);
    return { success: true, messageId: result.sid };
  } catch (error: any) {
    console.error('Failed to send verification SMS:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendCustomerArrivedSms(
  phoneNumber: string,
  details: {
    orderNumber: string;
    pickupCode: string;
    customerName: string;
  }
): Promise<SendSmsResult> {
  const client = getClient();
  
  if (!client) {
    return { success: false, error: 'SMS service not configured' };
  }

  if (!twilioPhoneNumber) {
    return { success: false, error: 'Twilio phone number not configured' };
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);
  if (!formattedPhone) {
    return { success: false, error: 'Invalid phone number format' };
  }

  const template = await getTemplate('customer_arrived_host');
  const message = interpolateTemplate(template, {
    orderNumber: details.orderNumber,
    pickupCode: details.pickupCode,
    customerName: details.customerName,
  });

  try {
    const result = await sendViaTwilio(client, formattedPhone, message);

    console.log(`Customer arrived SMS sent to host ${formattedPhone}, SID: ${result.sid}`);
    return { success: true, messageId: result.sid };
  } catch (error: any) {
    console.error('Failed to send customer arrived SMS:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendOrderReminderSms(
  phoneNumber: string,
  orderDetails: {
    orderNumber: string;
    customerFirstName: string;
    items: { code: string; quantity: number }[];
  }
): Promise<SendSmsResult> {
  const client = getClient();
  
  if (!client) {
    return { success: false, error: 'SMS service not configured' };
  }

  if (!twilioPhoneNumber) {
    return { success: false, error: 'Twilio phone number not configured' };
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);
  if (!formattedPhone) {
    return { success: false, error: 'Invalid phone number format' };
  }

  const itemsList = orderDetails.items
    .map(item => `${item.code} (x${item.quantity})`)
    .join(', ');

  const template = await getTemplate('order_reminder_host');
  const message = interpolateTemplate(template, {
    orderNumber: orderDetails.orderNumber,
    customerFirstName: orderDetails.customerFirstName,
    itemsList,
  });

  try {
    const result = await sendViaTwilio(client, formattedPhone, message);

    console.log(`Order reminder SMS sent to host ${formattedPhone}, SID: ${result.sid}`);
    return { success: true, messageId: result.sid };
  } catch (error: any) {
    console.error('Failed to send order reminder SMS:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendOrderCompleteSms(
  phoneNumber: string,
  details: {
    orderId: string;
  }
): Promise<SendSmsResult> {
  const client = getClient();
  
  if (!client) {
    return { success: false, error: 'SMS service not configured' };
  }

  if (!twilioPhoneNumber) {
    return { success: false, error: 'Twilio phone number not configured' };
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);
  if (!formattedPhone) {
    return { success: false, error: 'Invalid phone number format' };
  }

  const template = await getTemplate('order_complete_buyer');
  const message = interpolateTemplate(template, {
    orderId: details.orderId,
  });

  try {
    const result = await sendViaTwilio(client, formattedPhone, message);

    console.log(`Order complete SMS sent to customer ${formattedPhone}, SID: ${result.sid}`);
    return { success: true, messageId: result.sid };
  } catch (error: any) {
    console.error('Failed to send order complete SMS:', error.message);
    return { success: false, error: error.message };
  }
}
