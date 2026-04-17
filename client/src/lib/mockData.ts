export interface ColorVariation {
  name: string;
  hex: string;
}

export type ProductCondition = 'New' | 'Like New' | 'Good' | 'Fair';

export const PRODUCT_CONDITIONS: ProductCondition[] = ['New', 'Like New', 'Good', 'Fair'];

export interface Product {
  id: string;
  name: string;
  description: string | string[]; // Can be legacy HTML string or array of bullet points
  price: number;
  images: string[];
  category: string;
  inventory: { nodeId: string; quantity: number }[];
  createdAt: string;
  sku?: string; // Format: [CAT]-[SIZE]-[BATCH]-[SEQ] e.g., EL-S-2501-042 (admin only)
  productCode?: string; // Format: GM-XXX (3 random alphanumeric, shown to hosts/buyers)
  canonicalProductId?: string | null; // If set, this product is a batch linked to the canonical product
  parentProductId?: string | null; // Parent product ID for hierarchical linking
  relationshipType?: 'variant' | 'batch' | null; // 'variant' = distinct product | 'batch' = quantity absorbed into parent
  variantSuffix?: string | null; // For color/size variants: e.g., "W" for white. Full code = base-suffix
  variantName?: string | null; // Display name for this variant: e.g., "White", "Black", "Large"
  colors?: ColorVariation[]; // Available color options
  condition?: ProductCondition; // Product condition, defaults to 'New'
  costPrice?: number; // Cost price from spreadsheet
  sheetRow?: number; // Row number in source spreadsheet
  sheetSource?: string; // Spreadsheet ID
  sourceUrl?: string; // Original product URL
  purchaseDate?: string; // Purchase date from spreadsheet
  sheetQuantity?: number; // Quantity from spreadsheet column C
  deletedAt?: string | null; // Soft delete timestamp
  customHandoffFee?: number | null; // Per-product handoff fee override (e.g., oversized items)
  customerPaysHandoff?: boolean | null; // If true, customer pays the handoff fee for this product
  sortOrder?: number | null; // Order within category for display
}

// Helper to convert URLs in text to clickable links
function linkifyText(text: string): string {
  // Match URLs (http, https, or www)
  const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
  return text.replace(urlRegex, (url) => {
    const href = url.startsWith('www.') ? `https://${url}` : url;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">${url}</a>`;
  });
}

// Helper to normalize description to array of bullet points
export function getDescriptionPoints(description: string | string[]): string[] {
  if (Array.isArray(description)) {
    return description.map(d => linkifyText(cleanMalformedDescription(d)));
  }
  
  // First clean malformed JSON
  const cleaned = cleanMalformedDescription(description);
  
  // Legacy string: try to parse HTML list items or split by newlines
  if (cleaned.includes('<li>')) {
    const matches = cleaned.match(/<li[^>]*>([^<]+)<\/li>/g);
    if (matches) {
      return matches.map(m => linkifyText(m.replace(/<\/?li[^>]*>/g, '').trim())).filter(Boolean);
    }
  }
  // Plain text: split by newlines or bullet characters
  const lines = cleaned.split(/[\n•]+/).map(s => s.trim()).filter(Boolean);
  return (lines.length > 0 ? lines : [cleaned]).map(linkifyText);
}

// Helper to clean up malformed JSON-escaped descriptions (NO bullet insertion - just decode)
export function cleanMalformedDescription(text: string): string {
  if (!text) return text;
  
  // Detect nested JSON escaping patterns like {"{\"Features:\",\"
  if (text.startsWith('{"{') || text.startsWith('{"') || text.includes('\\"') || text.includes('\\",\\"')) {
    try {
      // Try to extract the actual content from nested JSON
      let cleaned = text;
      
      // Remove outer braces and quotes - various patterns
      cleaned = cleaned.replace(/^\{"\{/g, '');
      cleaned = cleaned.replace(/\}"\}$/g, '');
      cleaned = cleaned.replace(/^"\{/g, '');
      cleaned = cleaned.replace(/\}"$/g, '');
      cleaned = cleaned.replace(/^\{"/g, '');
      cleaned = cleaned.replace(/"}\s*$/g, '');
      
      // Unescape JSON escapes
      cleaned = cleaned.replace(/\\"/g, '"');
      cleaned = cleaned.replace(/\\n/g, '\n');
      cleaned = cleaned.replace(/\\t/g, '\t');
      cleaned = cleaned.replace(/\\\\/g, '\\');
      
      // Clean up remaining artifacts - convert JSON array separators to newlines (NO bullets)
      cleaned = cleaned.replace(/^["']+|["']+$/g, '');
      cleaned = cleaned.replace(/","/g, '\n');
      cleaned = cleaned.replace(/"\s*,\s*"/g, '\n');
      
      // If still looks like JSON array, extract items
      if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
        try {
          const arr = JSON.parse(cleaned);
          if (Array.isArray(arr)) {
            return arr.join('\n');
          }
        } catch {}
      }
      
      return cleaned.trim();
    } catch {
      return text;
    }
  }
  
  return text;
}

// Helper to normalize description for storage - strips bullet prefixes so renderers can add them
export function normalizeDescriptionForStorage(text: string): string {
  if (!text) return text;
  
  // First clean any malformed JSON
  let cleaned = cleanMalformedDescription(text);
  
  // Split by newlines and strip bullet prefixes from each line
  const lines = cleaned.split('\n').map(line => {
    // Remove leading bullet characters and whitespace
    return line.replace(/^[\s•\-*]+\s*/, '').trim();
  }).filter(line => line.length > 0);
  
  return lines.join('\n');
}

// Helper to normalize description to string
export function getDescriptionString(description: string | string[]): string {
  if (Array.isArray(description)) {
    return description.map(d => cleanMalformedDescription(d)).join('\n');
  }
  return cleanMalformedDescription(description);
}

// Common color presets for quick selection
export const COLOR_PRESETS: ColorVariation[] = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Gray', hex: '#6B7280' },
  { name: 'Navy', hex: '#1E3A5F' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Brown', hex: '#92400E' },
  { name: 'Beige', hex: '#D4B896' },
];

// SKU Category codes
export const SKU_CATEGORIES = {
  EL: 'Electronics',
  HG: 'Home Goods',
  AC: 'Attire',
  BG: 'Body Care',
  OT: 'Other',
} as const;

export type SkuCategoryCode = keyof typeof SKU_CATEGORIES;

// SKU Size codes
export const SKU_SIZES = {
  S: 'Small',
  O: 'Oversize',
} as const;

export type SkuSizeCode = keyof typeof SKU_SIZES;

// Generate random alphanumeric product code (GM-XXX)
export function generateProductCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `GM-${code}`;
}

// Generate SKU based on category, size, batch, and sequence
export function generateSku(
  categoryCode: SkuCategoryCode,
  sizeCode: SkuSizeCode,
  batchDate: Date,
  sequence: number
): string {
  const batch = `${String(batchDate.getFullYear()).slice(-2)}${String(batchDate.getMonth() + 1).padStart(2, '0')}`;
  const seq = String(sequence).padStart(3, '0');
  return `${categoryCode}-${sizeCode}-${batch}-${seq}`;
}

// Auto-detect category from product title
export function detectCategoryFromTitle(title: string): SkuCategoryCode {
  const lowerTitle = title.toLowerCase();
  
  // Electronics keywords
  if (/phone|laptop|tablet|computer|charger|cable|headphone|speaker|camera|watch|electronic|tech|usb|bluetooth|wireless|battery|power bank|earbuds|monitor|keyboard|mouse/.test(lowerTitle)) {
    return 'EL';
  }
  
  // Attire keywords
  if (/shirt|pants|dress|jacket|coat|shoe|sock|hat|cap|glove|scarf|sweater|hoodie|jeans|shorts|skirt|blouse|suit|tie|belt|clothing|wear|fashion|apparel/.test(lowerTitle)) {
    return 'AC';
  }
  
  // Body Care keywords
  if (/lotion|soap|shampoo|conditioner|cream|moisturizer|perfume|cologne|deodorant|toothpaste|brush|skincare|makeup|cosmetic|beauty|body|hair|nail|spa|bath|hygiene/.test(lowerTitle)) {
    return 'BG';
  }
  
  // Home Goods keywords
  if (/kitchen|towel|pillow|blanket|lamp|furniture|decor|rug|curtain|plate|cup|bowl|utensil|pot|pan|storage|organizer|home|house|living|bed|table|chair|shelf/.test(lowerTitle)) {
    return 'HG';
  }
  
  return 'OT';
}

export interface Category {
  id: string;
  name: string;
  description: string;
}

export interface Node {
  id: string;
  name: string;
  address: string;
  postalCode?: string;
  city: string;
  distance?: string;
  rating: number | string;
  totalHandoffs: number;
  availability?: TimeSlot[];
  pickupInstructions?: string;
  kitCount?: number;
  kitFee?: number;
  earningsPerHandoff: number | string;
  monthlyFee?: number | string;
  status: 'active' | 'inactive';
  latitude?: number | string;
  longitude?: number | string;
  userId?: string;
  createdAt?: string;
  availabilityNoticeHours?: number;
  handoffTiers?: Array<{minQty: number; fee: number}> | null;
  servingCityId?: string | null;
}

export interface TimeSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface Order {
  id: string;
  buyerName: string;
  buyerEmail: string;
  items: { product: Product; quantity: number }[];
  node: Node;
  timeSlot: TimeSlot;
  status: 'paid' | 'ready' | 'picked_up' | 'canceled';
  total: number;
  discount?: number;
  appliedDeals?: string[];
  createdAt: string;
  pickupCode: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedColor?: { name: string; hex: string };
}

export interface ChatMessage {
  id: string;
  orderId: string;
  senderType: 'buyer' | 'node';
  senderName: string;
  message: string;
  timestamp: string;
}

export interface Crate {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  mapData?: any;
  items: { productId: string; productName: string; productCode?: string | null; quantity: number; variantCount?: number; image?: string }[];
}

export interface CrateAssignment {
  id: string;
  nodeId: string;
  crateId: string;
  crateName: string;
  status: 'active' | 'returned' | 'merged';
  month: string;
  droppedAt: string;
  quantityOverrides?: Record<string, { quantity: number; originalQuantity: number }> | null;
}

export type NodeKit = Crate;
export type NodeKitAssignment = CrateAssignment;

export type DiscountType = 'percentage' | 'fixed_amount' | 'free_product' | 'free_gift' | 'gift_choice';
export type DiscountConditionType = 'cart_total' | 'product_bundle' | 'product_quantity';

export interface DiscountCondition {
  type: DiscountConditionType;
  minCartTotal?: number;
  requiredProductIds?: string[];
  minQuantity?: number;
}

export interface DiscountAction {
  type: DiscountType;
  value?: number;
  freeProductId?: string;
  freeProductOptions?: string[];
  maxUses?: number;
  giftProductIds?: string[];
  giftQuantity?: number;
  giftPoolSize?: number;
  giftSelectCount?: number;
}

export interface Deal {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  condition: DiscountCondition;
  action: DiscountAction;
  priority: number;
  stackable: boolean;
  validFrom?: string;
  validTo?: string;
}

export const categories: Category[] = [
  { id: 'cat1', name: 'Electronics', description: 'Electronic devices and gadgets' },
  { id: 'cat2', name: 'Audio', description: 'Speakers, headphones, and audio equipment' },
  { id: 'cat3', name: 'Accessories', description: 'Chargers, cables, and accessories' },
  { id: 'cat4', name: 'Gaming', description: 'Gaming controllers and accessories' },
  { id: 'cat5', name: 'Home', description: 'Home and office products' },
];

export const products: Product[] = [
  {
    id: 'p1',
    name: 'Wireless Earbuds Pro',
    description: 'Premium true wireless earbuds with active noise cancellation and 24hr battery life.',
    price: 129.99,
    images: ['https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&h=400&fit=crop'],
    category: 'Audio',
    inventory: [{ nodeId: 'n1', quantity: 8 }],
    createdAt: '2025-01-01T10:00:00Z',
    colors: [
      { name: 'Black', hex: '#000000' },
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Navy', hex: '#1E3A5F' },
    ],
  },
  {
    id: 'p2',
    name: 'USB-C Fast Charger 65W',
    description: 'Compact GaN charger with multiple ports. Powers laptops, tablets, and phones.',
    price: 49.99,
    images: ['https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400&h=400&fit=crop'],
    category: 'Accessories',
    inventory: [{ nodeId: 'n1', quantity: 15 }],
    createdAt: '2025-01-02T14:30:00Z',
    colors: [
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Black', hex: '#000000' },
    ],
  },
  {
    id: 'p3',
    name: 'Mechanical Keyboard RGB',
    description: 'Hot-swappable mechanical keyboard with customizable RGB lighting and aluminum frame.',
    price: 89.99,
    images: ['https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=400&h=400&fit=crop'],
    category: 'Electronics',
    inventory: [{ nodeId: 'n1', quantity: 6 }],
    createdAt: '2025-01-03T09:15:00Z',
    colors: [
      { name: 'Black', hex: '#000000' },
      { name: 'White', hex: '#FFFFFF' },
      { name: 'Pink', hex: '#EC4899' },
      { name: 'Purple', hex: '#A855F7' },
    ],
  },
  {
    id: 'p4',
    name: 'Portable SSD 1TB',
    description: 'Ultra-fast portable SSD with USB 3.2 Gen 2. Read speeds up to 1050MB/s.',
    price: 119.00,
    images: ['https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=400&h=400&fit=crop'],
    category: 'Electronics',
    inventory: [{ nodeId: 'n1', quantity: 5 }],
    createdAt: '2025-01-04T16:45:00Z',
  },
  {
    id: 'p5',
    name: 'Gaming Controller',
    description: 'Wireless gaming controller with haptic feedback. Compatible with PC, console, and mobile.',
    price: 69.99,
    images: ['https://images.unsplash.com/photo-1592840496694-26d035b52b48?w=400&h=400&fit=crop'],
    category: 'Gaming',
    inventory: [{ nodeId: 'n1', quantity: 10 }],
    createdAt: '2025-01-05T11:20:00Z',
  },
  {
    id: 'p6',
    name: 'Smart Watch Series 5',
    description: 'Fitness tracking, heart rate monitoring, GPS, and 5-day battery life.',
    price: 249.00,
    images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop'],
    category: 'Electronics',
    inventory: [{ nodeId: 'n1', quantity: 4 }],
    createdAt: '2025-01-06T08:00:00Z',
  },
  {
    id: 'p7',
    name: 'Webcam 4K HDR',
    description: 'Professional 4K webcam with auto-focus, noise-canceling mic, and low-light correction.',
    price: 159.99,
    images: ['https://images.unsplash.com/photo-1587826080692-f439cd0b70da?w=400&h=400&fit=crop'],
    category: 'Electronics',
    inventory: [{ nodeId: 'n1', quantity: 7 }],
    createdAt: '2025-01-07T13:30:00Z',
  },
  {
    id: 'p8',
    name: 'Bluetooth Speaker',
    description: 'Waterproof portable speaker with 360° sound and 20-hour playtime.',
    price: 79.99,
    images: ['https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=400&fit=crop'],
    category: 'Audio',
    inventory: [{ nodeId: 'n1', quantity: 12 }],
    createdAt: '2025-01-08T10:45:00Z',
  },
  {
    id: 'p9',
    name: 'AA Batteries 8-Pack',
    description: 'Long-lasting alkaline batteries for all your devices.',
    price: 9.99,
    images: ['https://images.unsplash.com/photo-1619641805634-98e5c4a52e28?w=400&h=400&fit=crop'],
    category: 'Accessories',
    inventory: [{ nodeId: 'n1', quantity: 25 }],
    createdAt: '2025-01-08T15:00:00Z',
  },
];

const generateTimeSlots = (): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  const startDate = new Date();
  
  for (let day = 0; day < 7; day++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 1) {
      slots.push(
        { id: `slot-${day}-0`, date: dateStr, startTime: '09:00', endTime: '12:00', available: true },
        { id: `slot-${day}-1`, date: dateStr, startTime: '17:00', endTime: '20:00', available: true }
      );
    } else if (dayOfWeek === 3) {
      slots.push(
        { id: `slot-${day}-0`, date: dateStr, startTime: '10:00', endTime: '14:00', available: true }
      );
    } else if (dayOfWeek === 6) {
      slots.push(
        { id: `slot-${day}-0`, date: dateStr, startTime: '09:00', endTime: '13:00', available: true }
      );
    }
  }
  
  return slots;
};

export const nodes: Node[] = [
  {
    id: 'n1',
    name: "Elm & College Pickup",
    address: 'Corner of Elm and College',
    postalCode: 'N9A 4J4',
    city: 'Windsor, ON',
    distance: '0.3 km',
    rating: 4.9,
    totalHandoffs: 0,
    availability: generateTimeSlots(),
    pickupInstructions: 'Look for the GridMart sign. Text when arriving for handoff.',
    kitCount: 1,
    kitFee: 55,
    earningsPerHandoff: 2.50,
    status: 'active',
    latitude: 42.3149,
    longitude: -83.0364,
  },
  {
    id: 'n2',
    name: "Downtown London Hub",
    address: '123 Dundas Street',
    postalCode: 'N6A 1G2',
    city: 'London, ON',
    distance: '0.5 km',
    rating: 0,
    totalHandoffs: 0,
    availability: generateTimeSlots(),
    pickupInstructions: 'Located in the downtown core. Ring doorbell on arrival.',
    kitCount: 1,
    kitFee: 55,
    earningsPerHandoff: 2.50,
    status: 'inactive',
    latitude: 42.9849,
    longitude: -81.2453,
  },
  {
    id: 'n3',
    name: "Square One Pickup",
    address: '100 City Centre Drive',
    postalCode: 'L5B 2C9',
    city: 'Mississauga, ON',
    distance: '0.2 km',
    rating: 0,
    totalHandoffs: 0,
    availability: generateTimeSlots(),
    pickupInstructions: 'Near Square One shopping centre. Text on arrival.',
    kitCount: 1,
    kitFee: 55,
    earningsPerHandoff: 2.50,
    status: 'inactive',
    latitude: 43.5931,
    longitude: -79.6404,
  },
];

export const nodeKits: NodeKit[] = [
  {
    id: 'nk1',
    name: 'January 2026 Standard Kit',
    description: 'Standard monthly kit for January 2026',
    items: [
      { productId: 'p1', productName: 'Wireless Earbuds Pro', quantity: 8 },
      { productId: 'p2', productName: 'USB-C Fast Charger 65W', quantity: 15 },
      { productId: 'p3', productName: 'Mechanical Keyboard RGB', quantity: 6 },
      { productId: 'p4', productName: 'Portable SSD 1TB', quantity: 5 },
      { productId: 'p5', productName: 'Gaming Controller', quantity: 10 },
      { productId: 'p6', productName: 'Smart Watch Series 5', quantity: 4 },
      { productId: 'p7', productName: 'Webcam 4K HDR', quantity: 7 },
      { productId: 'p8', productName: 'Bluetooth Speaker', quantity: 12 },
    ],
  },
];

export const crates: Crate[] = nodeKits;

export const crateAssignments: CrateAssignment[] = [
  {
    id: 'nka1',
    nodeId: 'n1',
    crateId: 'nk1',
    crateName: 'January 2026 Standard Crate',
    status: 'active',
    month: '2026-01',
    droppedAt: '2026-01-01T10:00:00Z',
  },
];

export const nodeKitAssignments: NodeKitAssignment[] = crateAssignments;

export const deals: Deal[] = [
  {
    id: 'd1',
    name: 'Spend $100, Get 10% Off',
    description: 'Get 10% off your entire order when you spend $100 or more',
    status: 'active',
    condition: {
      type: 'cart_total',
      minCartTotal: 100,
    },
    action: {
      type: 'percentage',
      value: 10,
    },
    priority: 1,
    stackable: false,
  },
  {
    id: 'd2',
    name: 'Gaming Bundle Deal',
    description: 'Buy a Gaming Controller with Batteries and get 15% off both',
    status: 'active',
    condition: {
      type: 'product_bundle',
      requiredProductIds: ['p5', 'p9'],
    },
    action: {
      type: 'percentage',
      value: 15,
    },
    priority: 2,
    stackable: true,
  },
  {
    id: 'd3',
    name: 'Free Batteries with Keyboard',
    description: 'Get free batteries when you purchase a Mechanical Keyboard',
    status: 'active',
    condition: {
      type: 'product_bundle',
      requiredProductIds: ['p3'],
    },
    action: {
      type: 'free_product',
      freeProductId: 'p9',
    },
    priority: 3,
    stackable: true,
  },
];

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export const formatDate = (dateStr: string | Date): string => {
  let date: Date;
  
  if (typeof dateStr === 'string') {
    // If it's a date-only string (YYYY-MM-DD), parse it as local time to avoid timezone shift
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-').map(Number);
      date = new Date(year, month - 1, day); // month is 0-indexed
    } else {
      date = new Date(dateStr);
    }
  } else {
    date = dateStr;
  }
  
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Toronto',
  });
};

export const formatTime = (timeStr: string): string => {
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

export const generatePickupCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const generateOrderId = (): string => {
  return `GM-${Date.now().toString(36).toUpperCase()}`;
};

export const evaluateDeals = (cartItems: CartItem[], activeDeals: Deal[]): { 
  applicableDeals: Deal[]; 
  totalDiscount: number;
  freeProducts: Product[];
} => {
  const applicableDeals: Deal[] = [];
  let totalDiscount = 0;
  const freeProducts: Product[] = [];
  
  const cartTotal = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cartProductIds = cartItems.map(item => item.product.id);
  
  const sortedDeals = [...activeDeals].sort((a, b) => a.priority - b.priority);
  
  for (const deal of sortedDeals) {
    if (deal.status !== 'active') continue;
    
    let conditionMet = false;
    
    switch (deal.condition.type) {
      case 'cart_total':
        conditionMet = cartTotal >= (deal.condition.minCartTotal || 0);
        break;
      case 'product_bundle':
        const requiredIds = deal.condition.requiredProductIds || [];
        conditionMet = requiredIds.every(id => cartProductIds.includes(id));
        break;
      case 'product_quantity':
        break;
    }
    
    if (conditionMet) {
      applicableDeals.push(deal);
      
      switch (deal.action.type) {
        case 'percentage':
          if (deal.condition.type === 'product_bundle') {
            const bundleTotal = cartItems
              .filter(item => deal.condition.requiredProductIds?.includes(item.product.id))
              .reduce((sum, item) => sum + item.product.price * item.quantity, 0);
            totalDiscount += bundleTotal * ((deal.action.value || 0) / 100);
          } else {
            totalDiscount += cartTotal * ((deal.action.value || 0) / 100);
          }
          break;
        case 'fixed_amount':
          totalDiscount += deal.action.value || 0;
          break;
        case 'free_product':
          const freeProduct = products.find(p => p.id === deal.action.freeProductId);
          if (freeProduct && !cartProductIds.includes(freeProduct.id)) {
            freeProducts.push(freeProduct);
          }
          break;
      }
      
      if (!deal.stackable) break;
    }
  }
  
  return { applicableDeals, totalDiscount, freeProducts };
};
