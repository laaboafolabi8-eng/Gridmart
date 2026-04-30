import { sql } from "drizzle-orm";
import { pgTable, varchar, text, integer, decimal, timestamp, boolean, jsonb, json, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { withTimezone: false }).notNull(),
});

// Users table - supports buyer, node, and admin types
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password"),
  name: text("name").notNull(),
  phone: text("phone"), // For SMS notifications
  smsOptIn: boolean("sms_opt_in").default(false), // User consent for SMS
  emailOptIn: boolean("email_opt_in").default(true), // User consent for email notifications
  type: text("type").notNull(), // 'buyer', 'node', 'admin' - primary role
  roles: text("roles").array(), // Additional roles user can switch to e.g., ['buyer', 'node']
  deletedAt: timestamp("deleted_at"), // Soft delete for account deletion
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Products table
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }), // Cost/purchase price from spreadsheet
  image: text("image").notNull(),
  images: text("images").array(), // All product images (used for display, image field is first/main)
  videos: text("videos").array(), // Product video URLs (YouTube, Vimeo, direct MP4, etc.)
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  condition: text("condition").default('New'), // New, Like New, Good, Fair
  sku: text("sku"), // Format: [CAT]-[SIZE]-[BATCH]-[SEQ] e.g., EL-S-2501-042 (admin only)
  productCode: text("product_code"), // Format: GM-XXX (3 random alphanumeric, shown to hosts/buyers)
  canonicalProductId: varchar("canonical_product_id"), // Self-referencing FK: if set, this product is a batch of another
  parentProductId: varchar("parent_product_id"), // Parent product ID for hierarchical linking
  relationshipType: text("relationship_type").default('variant'), // 'variant' = distinct product (own code, counted separately) | 'batch' = quantity absorbed into parent
  variantSuffix: text("variant_suffix"), // For color/size variants: e.g., "W" for white, "BK" for black. Full code = GM-XXXX-suffix
  variantName: text("variant_name"), // Display name for this variant: e.g., "White", "Black", "Large"
  sheetRow: integer("sheet_row"), // Row number in source spreadsheet
  sheetSource: text("sheet_source"), // Spreadsheet ID
  sourceUrl: text("source_url"), // Original product URL from spreadsheet
  purchaseDate: text("purchase_date"), // Date from spreadsheet (column F)
  sheetQuantity: integer("sheet_quantity").default(0), // Quantity from spreadsheet column C
  brand: text("brand"), // Brand name extracted from URL or manual entry
  customHandoffFee: decimal("custom_handoff_fee", { precision: 10, scale: 2 }), // Per-product handoff fee override (e.g., oversized items)
  customerPaysHandoff: boolean("customer_pays_handoff").default(false), // If true, customer pays the handoff fee for this product
  sortOrder: integer("sort_order").default(0), // Order within category for display
  comingSoon: boolean("coming_soon").default(false), // Show as "Coming Soon" on storefront (only for out-of-stock products)
  imageOverlays: jsonb("image_overlays"), // Overlay data per image: [{imageIndex, overlays: [{id, imageUrl, x, y, width, height}]}]
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // Soft delete timestamp - null means active, set means deleted
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// Categories table - product categories (supports subcategories via parentId)
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  parentId: varchar("parent_id"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
});

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

// Product Templates table - canonical product listings (what customers see)
export const productTemplates = pgTable("product_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productCode: text("product_code").notNull().unique(), // Format: GM-XXXX (auto-generated, unique identifier)
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(), // Display price (can be averaged from batches)
  images: text("images").array(), // Aggregated images from all batches
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  condition: text("condition").default('new'), // new, like_new, good, fair
  colors: jsonb("colors"), // Array of {name, hex} objects
  isActive: boolean("is_active").default(true), // Whether to show on frontend
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// For API validation: productCode is optional (server auto-generates if missing)
export const insertProductTemplateSchema = createInsertSchema(productTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  productCode: z.string().optional(), // Server generates if not provided
});

export type InsertProductTemplate = z.infer<typeof insertProductTemplateSchema>;
export type ProductTemplate = typeof productTemplates.$inferSelect;

// Inventory Batches table - individual entries from different sources (sheet rows)
export const inventoryBatches = pgTable("inventory_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => productTemplates.id),
  
  // Sheet source information
  sheetId: text("sheet_id"), // Google Sheet ID
  sheetName: text("sheet_name"), // Sheet tab name
  sheetRow: integer("sheet_row"), // Row number in spreadsheet
  sourceUrl: text("source_url"), // Original product URL from spreadsheet
  
  // Batch-specific data
  quantity: integer("quantity").notNull().default(0), // How many items in this batch
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }), // What we paid per unit
  purchaseDate: text("purchase_date"), // When we acquired this batch
  batchNotes: text("batch_notes"), // Any notes about this specific batch
  
  // Node allocation - note: references nodes table defined below
  nodeId: varchar("node_id"), // Which node has this batch (FK added via migration)
  
  // Tracking
  status: text("status").notNull().default('available'), // available, sold, returned
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInventoryBatchSchema = createInsertSchema(inventoryBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInventoryBatch = z.infer<typeof insertInventoryBatchSchema>;
export type InventoryBatch = typeof inventoryBatches.$inferSelect;

// Duplicate Detection Queue - for manual review of potential duplicates
export const duplicateQueue = pgTable("duplicate_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id").notNull().references(() => inventoryBatches.id),
  suggestedTemplateId: varchar("suggested_template_id").references(() => productTemplates.id),
  similarityScore: decimal("similarity_score", { precision: 5, scale: 4 }), // 0.0000 to 1.0000
  status: text("status").notNull().default('pending'), // pending, approved, rejected, auto_merged
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDuplicateQueueSchema = createInsertSchema(duplicateQueue).omit({
  id: true,
  createdAt: true,
});

export type InsertDuplicateQueue = z.infer<typeof insertDuplicateQueueSchema>;
export type DuplicateQueue = typeof duplicateQueue.$inferSelect;

// Nodes table - fulfillment locations
export const nodes = pgTable("nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  servingCityId: varchar("serving_city_id").references(() => servingCities.id),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  pickupInstructions: text("pickup_instructions"),
  rating: decimal("rating", { precision: 3, scale: 2 }).default('4.5'),
  totalHandoffs: integer("total_handoffs").default(0),
  monthlyFee: decimal("monthly_fee", { precision: 10, scale: 2 }).default('55.00'),
  earningsPerHandoff: decimal("earnings_per_handoff", { precision: 10, scale: 2 }).default('2.50'),
  kitCount: integer("kit_count").default(0),
  kitFee: decimal("kit_fee", { precision: 10, scale: 2 }).default('55.00'),
  status: text("status").notNull().default('active'), // 'active', 'inactive'
  availabilityNoticeHours: integer("availability_notice_hours").default(48), // Hours in advance availability changes are locked
  minimumAvailabilityHours: integer("minimum_availability_hours").default(4), // Minimum hours of availability required per week
  isAdminNode: boolean("is_admin_node").default(false), // Admin nodes have special permissions (can set notice hours to 0)
  nodeType: text("node_type").default('residential'), // 'residential' | 'storefront'
  storeHours: text("store_hours"), // Display hours for storefront nodes, e.g. "Daily: 10 AM – 7 PM"
  handoffTiers: jsonb("handoff_tiers"), // Array of {minQty: number, fee: number} for tiered handoff fees
  availabilityOverrides: jsonb("availability_overrides"), // Date-specific schedule overrides {date: {type, windows}}
  notificationPhone: text("notification_phone"), // Phone number for receiving order update SMS
  googleStoreCode: text("google_store_code"), // Google Business Profile store code for local inventory sync
  activatedAt: timestamp("activated_at"), // When node was first activated (lock-in only applies after this)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNodeSchema = createInsertSchema(nodes).omit({
  id: true,
  createdAt: true,
  activatedAt: true,
  rating: true,
  totalHandoffs: true,
});

export type InsertNode = z.infer<typeof insertNodeSchema>;
export type Node = typeof nodes.$inferSelect;

// Inventory table - tracks product stock at each node
export const inventory = pgTable("inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id),
  nodeId: varchar("node_id").notNull().references(() => nodes.id),
  quantity: integer("quantity").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_inventory_product_node").on(table.productId, table.nodeId),
]);

export const insertInventorySchema = createInsertSchema(inventory).omit({
  id: true,
  updatedAt: true,
});

export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type Inventory = typeof inventory.$inferSelect;

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  buyerId: varchar("buyer_id").references(() => users.id), // Nullable for manual sales
  nodeId: varchar("node_id").references(() => nodes.id), // Nullable for manual sales
  status: text("status").notNull().default('paid'), // 'pending_payment', 'confirmed', 'ready', 'picked_up', 'cancelled', 'expired'
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  pickupCode: text("pickup_code").notNull(),
  pickupDate: text("pickup_date"), // Nullable for manual sales
  pickupTime: text("pickup_time"), // Nullable for manual sales
  buyerName: text("buyer_name"), // Nullable for manual sales
  buyerEmail: text("buyer_email"), // Nullable for manual sales
  buyerPhone: text("buyer_phone"), // For SMS notifications
  smsSent: boolean("sms_sent").default(false), // Track if ready SMS was sent
  hostNotifiedAt: timestamp("host_notified_at"), // When host was first notified of order
  lastReminderSentAt: timestamp("last_reminder_sent_at"), // When last reminder was sent
  reminderCount: integer("reminder_count").default(0), // Number of reminders sent
  stripePaymentIntentId: text("stripe_payment_intent_id"), // For refunds
  refundedAmount: decimal("refunded_amount", { precision: 10, scale: 2 }).default('0'), // Total amount refunded
  promoCode: text("promo_code"), // Applied promo code string
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }), // Original subtotal before discount
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default('0'), // Discount from promo code
  giftProductIds: text("gift_product_ids").array(), // Gift products from promo code
  saleSource: text("sale_source").default('online'), // 'online' or 'manual' for off-platform sales
  paymentMethod: text("payment_method"), // 'stripe', 'cash', 'e_transfer', 'other'
  saleNotes: text("sale_notes"), // Notes for manual sales (e.g., "FB Marketplace sale")
  readyAt: timestamp("ready_at"), // When order was marked ready by host
  customerArrivedAt: timestamp("customer_arrived_at"), // When customer texted HERE
  pickedUpAt: timestamp("picked_up_at"), // When order was handed off / picked up
  hostNotificationQueued: boolean("host_notification_queued").default(false), // Queued until pickup window opens
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// Order items table - line items for each order
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true,
});

export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

// Order Feedback table - customer ratings after pickup
export const orderFeedback = pgTable("order_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  nodeId: varchar("node_id").notNull().references(() => nodes.id),
  hostRating: integer("host_rating").notNull(), // 1-5 stars
  overallRating: integer("overall_rating").notNull(), // 1-5 stars
  comment: text("comment"), // Optional text feedback
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOrderFeedbackSchema = createInsertSchema(orderFeedback).omit({
  id: true,
  createdAt: true,
});

export type InsertOrderFeedback = z.infer<typeof insertOrderFeedbackSchema>;
export type OrderFeedback = typeof orderFeedback.$inferSelect;

// Node availability table
export const nodeAvailability = pgTable("node_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nodeId: varchar("node_id").notNull().references(() => nodes.id),
  dayOfWeek: text("day_of_week").notNull(), // 'Monday', 'Tuesday', etc.
  startTime: text("start_time").notNull(), // '09:00'
  endTime: text("end_time").notNull(), // '18:00'
  enabled: boolean("enabled").default(true),
});

export const insertNodeAvailabilitySchema = createInsertSchema(nodeAvailability).omit({
  id: true,
});

export type InsertNodeAvailability = z.infer<typeof insertNodeAvailabilitySchema>;
export type NodeAvailability = typeof nodeAvailability.$inferSelect;

export const availabilityEditHistory = pgTable("availability_edit_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nodeId: varchar("node_id").notNull().references(() => nodes.id),
  editType: text("edit_type").notNull(),
  editedBy: text("edited_by").notNull(),
  editedByName: text("edited_by_name"),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AvailabilityEditHistory = typeof availabilityEditHistory.$inferSelect;

// Application Statuses table - customizable onboarding statuses
export const applicationStatuses = pgTable("application_statuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default('#9CA3AF'), // Tailwind gray-400
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertApplicationStatusSchema = createInsertSchema(applicationStatuses).omit({
  id: true,
  createdAt: true,
});

export type InsertApplicationStatus = z.infer<typeof insertApplicationStatusSchema>;
export type ApplicationStatus = typeof applicationStatuses.$inferSelect;

// Node Applications table - for prospective nodes
export const nodeApplications = pgTable("node_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  cityNeighborhood: text("city_neighborhood").notNull(),
  nodeType: text("node_type").notNull(), // 'home', 'storefront', 'warehouse'
  availabilityWindow: text("availability_window").notNull(),
  lateAvailability7pm: boolean("late_availability_7pm").notNull(),
  lateAvailability9pm: boolean("late_availability_9pm").notNull(),
  storageSize: text("storage_size").notNull(), // 'small', 'medium', 'large'
  prepaidAgreement: boolean("prepaid_agreement").notNull(),
  canStoreCrate: text("can_store_crate"),
  comfortableMeetingOutside: text("comfortable_meeting_outside"),
  comfortableAdjustingAvailability: text("comfortable_adjusting_availability"),
  canPauseHandoffs: text("can_pause_handoffs"),
  additionalNotes: text("additional_notes"),
  screeningAnswers: jsonb("screening_answers"), // JSON array of {questionId, question, answer} from dynamic primary screening
  status: text("status").notNull().default('pending'), // 'pending', 'approved', 'rejected'
  onboardingStatus: text("onboarding_status"), // References applicationStatuses.name
  notes: text("notes"), // Admin notes for this application
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNodeApplicationSchema = createInsertSchema(nodeApplications).omit({
  id: true,
  status: true,
  onboardingStatus: true,
  notes: true,
  createdAt: true,
});

export type InsertNodeApplication = z.infer<typeof insertNodeApplicationSchema>;
export type NodeApplication = typeof nodeApplications.$inferSelect;

// Bundles table - standardized inventory packages
export const bundles = pgTable("bundles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBundleSchema = createInsertSchema(bundles).omit({
  id: true,
  createdAt: true,
});

export type InsertBundle = z.infer<typeof insertBundleSchema>;
export type Bundle = typeof bundles.$inferSelect;

// Bundle items table - products and quantities in each bundle
export const bundleItems = pgTable("bundle_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bundleId: varchar("bundle_id").notNull().references(() => bundles.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull().default(1),
});

export const insertBundleItemSchema = createInsertSchema(bundleItems).omit({
  id: true,
});

export type InsertBundleItem = z.infer<typeof insertBundleItemSchema>;
export type BundleItem = typeof bundleItems.$inferSelect;

// Node bundles table - tracks bundles assigned to nodes
export const nodeBundles = pgTable("node_bundles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nodeId: varchar("node_id").notNull().references(() => nodes.id),
  bundleId: varchar("bundle_id").notNull().references(() => bundles.id),
  status: text("status").notNull().default('active'), // 'active', 'returned', 'merged'
  month: text("month").notNull(), // '2026-01' format
  droppedAt: timestamp("dropped_at").defaultNow().notNull(),
  returnedAt: timestamp("returned_at"),
});

export const insertNodeBundleSchema = createInsertSchema(nodeBundles).omit({
  id: true,
  droppedAt: true,
  returnedAt: true,
});

export type InsertNodeBundle = z.infer<typeof insertNodeBundleSchema>;
export type NodeBundle = typeof nodeBundles.$inferSelect;

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'new_node', 'order_update', 'system', 'promotion'
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  link: text("link"), // Optional link to navigate to
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  read: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Messages table - for chat between buyers and nodes
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(), // Can be actual order or admin-node chat
  senderId: varchar("sender_id").notNull(),
  senderType: text("sender_type").notNull(), // 'buyer', 'node', 'admin'
  senderName: text("sender_name").notNull(),
  content: text("content").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  read: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Spreadsheet sync settings table
export const spreadsheetSync = pgTable("spreadsheet_sync", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  spreadsheetId: text("spreadsheet_id").notNull(),
  spreadsheetName: text("spreadsheet_name"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncedRow: integer("last_synced_row").default(0),
  useTitleFromSheet: boolean("use_title_from_sheet").default(false), // false = fetch from URL, true = use column A
  usePicturesFromSheet: boolean("use_pictures_from_sheet").default(false), // true = use column H for images
  lastSyncLog: text("last_sync_log"), // JSON array of sync results per row
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSpreadsheetSyncSchema = createInsertSchema(spreadsheetSync).omit({
  id: true,
  createdAt: true,
});

export type InsertSpreadsheetSync = z.infer<typeof insertSpreadsheetSyncSchema>;
export type SpreadsheetSync = typeof spreadsheetSync.$inferSelect;

// Crates table - groups of products to assign to nodes
export const crates = pgTable("crates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(false).notNull(),
  mapData: jsonb("map_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCrateSchema = createInsertSchema(crates).omit({
  id: true,
  createdAt: true,
});

export type InsertCrate = z.infer<typeof insertCrateSchema>;
export type Crate = typeof crates.$inferSelect;

// Crate items table - products in a crate with quantities
export const crateItems = pgTable("crate_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  crateId: varchar("crate_id").notNull().references(() => crates.id, { onDelete: 'cascade' }),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: 'cascade' }),
  quantity: integer("quantity").notNull().default(1),
});

export const insertCrateItemSchema = createInsertSchema(crateItems).omit({
  id: true,
});

export type InsertCrateItem = z.infer<typeof insertCrateItemSchema>;
export type CrateItem = typeof crateItems.$inferSelect;

// Node crate assignments table - tracks crates assigned to nodes with status
export const nodeCrateAssignments = pgTable("node_crate_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  crateId: varchar("crate_id").notNull().references(() => crates.id, { onDelete: 'cascade' }),
  nodeId: varchar("node_id").notNull().references(() => nodes.id, { onDelete: 'cascade' }),
  status: text("status").notNull().default('active'), // 'active', 'completed', 'cancelled'
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  quantityOverrides: jsonb("quantity_overrides"), // { productId: { quantity: number, originalQuantity: number } }
});

export const insertNodeCrateAssignmentSchema = createInsertSchema(nodeCrateAssignments).omit({
  id: true,
  assignedAt: true,
  completedAt: true,
});

export type InsertNodeCrateAssignment = z.infer<typeof insertNodeCrateAssignmentSchema>;
export type NodeCrateAssignment = typeof nodeCrateAssignments.$inferSelect;

// Email subscribers table - for launch notification signups
export const emailSubscribers = pgTable("email_subscribers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  source: text("source").notNull().default('coming_soon'), // 'coming_soon', 'footer', etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmailSubscriberSchema = createInsertSchema(emailSubscribers).omit({
  id: true,
  createdAt: true,
});

export type InsertEmailSubscriber = z.infer<typeof insertEmailSubscriberSchema>;
export type EmailSubscriber = typeof emailSubscribers.$inferSelect;

// Admin settings table - for notification emails and other admin configurations
export const adminSettings = pgTable("admin_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // e.g., 'application_notifications_email', 'launch_notifications_email'
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAdminSettingSchema = createInsertSchema(adminSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertAdminSetting = z.infer<typeof insertAdminSettingSchema>;
export type AdminSetting = typeof adminSettings.$inferSelect;

// User label templates table - stores label design templates per user
export const userLabelTemplates = pgTable("user_label_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  labelSize: text("label_size").notNull(), // e.g., '30256', '30252'
  template: jsonb("template").notNull(), // The template data (elements, positions, etc.)
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserLabelTemplateSchema = createInsertSchema(userLabelTemplates).omit({
  id: true,
  updatedAt: true,
});

export type InsertUserLabelTemplate = z.infer<typeof insertUserLabelTemplateSchema>;
export type UserLabelTemplate = typeof userLabelTemplates.$inferSelect;

// Agreements table - for Terms of Service, Refund Policy, Host Handoff content
export const agreements = pgTable("agreements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // 'terms', 'refund', 'host_handoff'
  title: text("title").notNull(),
  content: text("content").notNull(), // The agreement text content
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAgreementSchema = createInsertSchema(agreements).omit({
  id: true,
  updatedAt: true,
});

export type InsertAgreement = z.infer<typeof insertAgreementSchema>;
export type Agreement = typeof agreements.$inferSelect;

// Listing templates table - saved product configurations for quick reuse
export const listingTemplates = pgTable("listing_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Template name for identification
  // Fields that can be included in template (null means not included)
  includeName: boolean("include_name").default(false),
  includeDescription: boolean("include_description").default(false),
  includePrice: boolean("include_price").default(false),
  includeCategory: boolean("include_category").default(false),
  includeCondition: boolean("include_condition").default(false),
  includeImages: boolean("include_images").default(false),
  includeColors: boolean("include_colors").default(false),
  // Stored values
  productName: text("product_name"),
  description: text("description"),
  price: text("price"),
  category: text("category"),
  condition: text("condition"),
  images: text("images").array(),
  colors: jsonb("colors"), // Array of {name, hex} objects
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertListingTemplateSchema = createInsertSchema(listingTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertListingTemplate = z.infer<typeof insertListingTemplateSchema>;
export type ListingTemplate = typeof listingTemplates.$inferSelect;

// Promo codes table - discount codes that customers can enter at checkout
export const promoCodes = pgTable("promo_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // The code customers enter (e.g., "SAVE10")
  name: text("name").notNull(), // Display name for admin (e.g., "Summer Sale 10%")
  description: text("description"), // Optional description
  discountType: text("discount_type").notNull(), // 'percentage', 'fixed', 'free_gift', 'gift_choice', or 'combo'
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(), // 10 for 10% or $10 (0 for gift types)
  minOrderAmount: decimal("min_order_amount", { precision: 10, scale: 2 }), // Minimum order total to apply
  maxUses: integer("max_uses"), // Total uses allowed (null = unlimited)
  usedCount: integer("used_count").default(0).notNull(), // How many times it's been used
  maxUsesPerCustomer: integer("max_uses_per_customer").default(1), // Uses per customer (null = unlimited)
  validFrom: timestamp("valid_from"), // Start date (null = immediately)
  validTo: timestamp("valid_to"), // End date (null = no expiry)
  status: text("status").notNull().default('active'), // 'active' or 'inactive'
  stackable: boolean("stackable").default(false), // Can combine with other discounts
  giftProductIds: text("gift_product_ids").array(), // Array of product IDs for free gifts
  giftQuantity: integer("gift_quantity").default(1), // How many free gift items customer receives
  giftPoolSize: integer("gift_pool_size"), // For gift_choice: how many products to show in pool
  giftSelectCount: integer("gift_select_count"), // For gift_choice: how many customer can select from pool
  // Combo benefits - allows combining discount + multiple gift types in one promo
  benefits: jsonb("benefits"), // Array of benefit objects: [{type, value, productIds, quantity, poolSize, selectCount}]
  assignedNodeId: varchar("assigned_node_id").references(() => nodes.id), // Node host this coupon is assigned to (null = general/unassigned)
  nodeOnly: boolean("node_only").default(false), // If true and assignedNodeId is set, coupon can only be redeemed at that specific node
  batchId: text("batch_id"), // Groups codes generated together (e.g., "BATCH-abc123") for aggregate stats
  givenOut: boolean("given_out").default(false), // Node host marks when they've handed this code to someone
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({
  id: true,
  usedCount: true,
  createdAt: true,
});

export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type PromoCode = typeof promoCodes.$inferSelect;

// Promo code usages table - tracks which users have used which codes
export const promoCodeUsages = pgTable("promo_code_usages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promoCodeId: varchar("promo_code_id").notNull().references(() => promoCodes.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  orderId: varchar("order_id").references(() => orders.id), // The order where it was used
  usedAt: timestamp("used_at").defaultNow().notNull(),
});

export const insertPromoCodeUsageSchema = createInsertSchema(promoCodeUsages).omit({
  id: true,
  usedAt: true,
});

export type InsertPromoCodeUsage = z.infer<typeof insertPromoCodeUsageSchema>;
export type PromoCodeUsage = typeof promoCodeUsages.$inferSelect;

// Invite tokens table - one-time links for node host onboarding
export const inviteTokens = pgTable("invite_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(), // The unique token in the URL
  email: text("email"), // Optional: pre-fill email if known
  nodeName: text("node_name"), // Optional: pre-fill node name
  expiresAt: timestamp("expires_at").notNull(), // Token expiration
  usedAt: timestamp("used_at"), // When the token was used (null = not used)
  usedByUserId: varchar("used_by_user_id"), // The user ID who used this token
  createdByUserId: varchar("created_by_user_id").notNull(), // Admin who created it
  notes: text("notes"), // Admin notes about this invite
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInviteTokenSchema = createInsertSchema(inviteTokens).omit({
  id: true,
  usedAt: true,
  usedByUserId: true,
  createdAt: true,
});

export type InsertInviteToken = z.infer<typeof insertInviteTokenSchema>;
export type InviteToken = typeof inviteTokens.$inferSelect;

// Phone verification codes table - for SMS login
export const phoneVerificationCodes = pgTable("phone_verification_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull().unique(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PhoneVerificationCode = typeof phoneVerificationCodes.$inferSelect;

// User addresses table - saved addresses for checkout
export const userAddresses = pgTable("user_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  label: text("label").notNull(), // e.g., "Home", "Work"
  name: text("name").notNull(), // Recipient name
  phone: text("phone"),
  street: text("street").notNull(),
  city: text("city").notNull(),
  province: text("province").notNull(),
  postalCode: text("postal_code").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserAddressSchema = createInsertSchema(userAddresses).omit({
  id: true,
  createdAt: true,
});

export type InsertUserAddress = z.infer<typeof insertUserAddressSchema>;
export type UserAddress = typeof userAddresses.$inferSelect;

// Screening questions - editable questions for secondary node application screening
export const screeningQuestions = pgTable("screening_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  questionType: text("question_type").notNull().default('text'), // 'text', 'textarea', 'select', 'boolean'
  options: text("options").array(), // For select type questions
  elaborationOptions: text("elaboration_options").array(), // Which options trigger a follow-up text box
  isRequired: boolean("is_required").default(true),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertScreeningQuestionSchema = createInsertSchema(screeningQuestions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertScreeningQuestion = z.infer<typeof insertScreeningQuestionSchema>;
export type ScreeningQuestion = typeof screeningQuestions.$inferSelect;

// Primary screening questions - editable questions for the "Become a Node Host" application form
export const primaryScreeningQuestions = pgTable("primary_screening_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  questionType: text("question_type").notNull().default('text'), // 'text', 'textarea', 'radio', 'checkbox', 'confirmation'
  options: text("options").array(),
  hasOtherOption: boolean("has_other_option").default(false),
  isRequired: boolean("is_required").default(true),
  sortOrder: integer("sort_order").default(0),
  fieldKey: text("field_key"), // maps to form field for submission storage
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPrimaryScreeningQuestionSchema = createInsertSchema(primaryScreeningQuestions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPrimaryScreeningQuestion = z.infer<typeof insertPrimaryScreeningQuestionSchema>;
export type PrimaryScreeningQuestion = typeof primaryScreeningQuestions.$inferSelect;

// Screening links - unique tokens for secondary screening forms
export const screeningLinks = pgTable("screening_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id").references(() => nodeApplications.id), // Optional - can be standalone
  name: varchar("name"), // Applicant name (for standalone links or collected on form)
  email: varchar("email"), // Applicant email (for standalone links or collected on form)
  token: text("token").notNull().unique(), // Unique link token
  expiresAt: timestamp("expires_at"), // Optional expiration
  completedAt: timestamp("completed_at"), // When the form was submitted
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScreeningLinkSchema = createInsertSchema(screeningLinks).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertScreeningLink = z.infer<typeof insertScreeningLinkSchema>;
export type ScreeningLink = typeof screeningLinks.$inferSelect;

// Screening responses - answers to screening questions
export const screeningResponses = pgTable("screening_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  linkId: varchar("link_id").notNull().references(() => screeningLinks.id),
  questionId: varchar("question_id").notNull().references(() => screeningQuestions.id),
  answer: text("answer").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScreeningResponseSchema = createInsertSchema(screeningResponses).omit({
  id: true,
  createdAt: true,
});

export type InsertScreeningResponse = z.infer<typeof insertScreeningResponseSchema>;
export type ScreeningResponse = typeof screeningResponses.$inferSelect;

// Site settings - global configuration
export const siteSettings = pgTable("site_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSiteSettingSchema = createInsertSchema(siteSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertSiteSetting = z.infer<typeof insertSiteSettingSchema>;
export type SiteSetting = typeof siteSettings.$inferSelect;

// User preferences table - stores per-user settings like tab order
export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  key: varchar("key").notNull(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserPreferenceSchema = createInsertSchema(userPreferences).omit({
  id: true,
  updatedAt: true,
});

export type InsertUserPreference = z.infer<typeof insertUserPreferenceSchema>;
export type UserPreference = typeof userPreferences.$inferSelect;

export const surveys = pgTable("surveys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  allowMultiple: boolean("allow_multiple").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSurveySchema = createInsertSchema(surveys).omit({
  id: true,
  createdAt: true,
});

export type InsertSurvey = z.infer<typeof insertSurveySchema>;
export type Survey = typeof surveys.$inferSelect;

export const surveyOptions = pgTable("survey_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surveyId: varchar("survey_id").notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSurveyOptionSchema = createInsertSchema(surveyOptions).omit({
  id: true,
  createdAt: true,
});

export type InsertSurveyOption = z.infer<typeof insertSurveyOptionSchema>;
export type SurveyOption = typeof surveyOptions.$inferSelect;

export const surveyResponses = pgTable("survey_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surveyId: varchar("survey_id").notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  reasons: text("reasons").array().notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSurveyResponseSchema = createInsertSchema(surveyResponses).omit({
  id: true,
  createdAt: true,
});

export type InsertSurveyResponse = z.infer<typeof insertSurveyResponseSchema>;
export type SurveyResponse = typeof surveyResponses.$inferSelect;

export const servingCities = pgTable("serving_cities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  province: text("province").notNull(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  mapLat: text("map_lat"),
  mapLng: text("map_lng"),
  mapZoom: text("map_zoom"),
  isAvailable: boolean("is_available").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertServingCitySchema = createInsertSchema(servingCities).omit({
  id: true,
  createdAt: true,
});

export type InsertServingCity = z.infer<typeof insertServingCitySchema>;
export type ServingCity = typeof servingCities.$inferSelect;

// Social Media Post Tracker
export const socialFbAccounts = pgTable("social_fb_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'personal', 'page'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSocialFbAccountSchema = createInsertSchema(socialFbAccounts).omit({
  id: true,
  createdAt: true,
});

export type InsertSocialFbAccount = z.infer<typeof insertSocialFbAccountSchema>;
export type SocialFbAccount = typeof socialFbAccounts.$inferSelect;

export const socialCategories = pgTable("social_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  color: text("color").notNull(),
  type: text("type").notNull(), // 'post', 'group', 'label'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSocialCategorySchema = createInsertSchema(socialCategories).omit({
  id: true,
  createdAt: true,
});

export type InsertSocialCategory = z.infer<typeof insertSocialCategorySchema>;
export type SocialCategory = typeof socialCategories.$inferSelect;

export const socialGroups = pgTable("social_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  url: text("url"),
  schedule: text("schedule").notNull(), // 'daily', 'weekly_fixed', 'weekly_flexible'
  scheduleDays: text("schedule_days").array(), // e.g. ['monday','wednesday'] for weekly_fixed
  assignedDay: text("assigned_day"), // for weekly_flexible - user picks a day
  notes: text("notes"),
  labels: jsonb("labels").$type<Array<{ text: string; color: string }>>(),
  categoryId: varchar("category_id"),
  fbAccountId: varchar("fb_account_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSocialGroupSchema = createInsertSchema(socialGroups).omit({
  id: true,
  createdAt: true,
});

export type InsertSocialGroup = z.infer<typeof insertSocialGroupSchema>;
export type SocialGroup = typeof socialGroups.$inferSelect;

export const socialPosts = pgTable("social_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: text("date").notNull(), // YYYY-MM-DD
  content: text("content"),
  imageUrl: text("image_url"),
  groupIds: text("group_ids").array(), // groups this post was shared to
  groupDetails: jsonb("group_details"), // { [groupId]: { notes: string, labels: { text: string, color: string }[] } }
  categoryId: varchar("category_id"),
  fbAccountId: varchar("fb_account_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSocialPostSchema = createInsertSchema(socialPosts).omit({
  id: true,
  createdAt: true,
});

export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type SocialPost = typeof socialPosts.$inferSelect;

export const paymentLinks = pgTable("payment_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  memo: text("memo"),
  status: text("status").notNull().default('pending'), // 'pending', 'paid', 'expired', 'cancelled'
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  url: text("url"),
  customerEmail: text("customer_email"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentLinkSchema = createInsertSchema(paymentLinks).omit({
  id: true,
  createdAt: true,
});

export type InsertPaymentLink = z.infer<typeof insertPaymentLinkSchema>;
export type PaymentLink = typeof paymentLinks.$inferSelect;

export const hostPayments = pgTable("host_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nodeId: varchar("node_id").notNull().references(() => nodes.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull().default('etransfer'),
  memo: text("memo"),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHostPaymentSchema = createInsertSchema(hostPayments).omit({
  id: true,
  createdAt: true,
});

export type InsertHostPayment = z.infer<typeof insertHostPaymentSchema>;
export type HostPayment = typeof hostPayments.$inferSelect;

export const landingPages = pgTable("landing_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  productId: text("product_id").notNull(),
  mode: text("mode").notNull().default("single"),
  productIds: text("product_ids").array(),
  nodeId: text("node_id"),
  status: text("status").notNull().default("active"),
  headline: text("headline"),
  subheadline: text("subheadline"),
  showPrice: boolean("show_price").default(true),
  showDescription: boolean("show_description").default(true),
  showCondition: boolean("show_condition").default(false),
  showBrand: boolean("show_brand").default(false),
  promoCodes: text("promo_codes").array(),
  promoTitle: text("promo_title"),
  shopMoreMode: text("shop_more_mode").default("subcategory"),
  shopMoreProductIds: text("shop_more_product_ids").array(),
  gradientFrom: text("gradient_from").default("#0d9488"),
  gradientTo: text("gradient_to").default("#1e3a5f"),
  ctaText: text("cta_text").default("Find My Pickup Spot"),
  ctaColor: text("cta_color").default("#14b8a6"),
  layoutOrder: text("layout_order").array(),
  postSearchLayoutOrder: text("post_search_layout_order").array(),
  headlineFontSize: integer("headline_font_size"),
  subheadlineFontSize: integer("subheadline_font_size"),
  priceFontSize: integer("price_font_size"),
  carouselProductIds: text("carousel_product_ids").array(),
  carouselEnabled: boolean("carousel_enabled").default(true),
  carouselAutoplay: boolean("carousel_autoplay").default(false),
  carouselSpeed: integer("carousel_speed").default(3),
  carouselVisibleCount: integer("carousel_visible_count").default(3),
  shopMoreText: text("shop_more_text"),
  shopMoreLink: text("shop_more_link"),
  showMapCircle: boolean("show_map_circle").default(true),
  mapCircleSize: integer("map_circle_size").default(500),
  groupByCategory: boolean("group_by_category").default(true),
  showSubcategories: boolean("show_subcategories").default(false),
  textboxContent: text("textbox_content"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const landingPageModes = ['single', 'multi', 'location', 'product-location', 'postal-code'] as const;
export type LandingPageMode = typeof landingPageModes[number];

export const insertLandingPageSchema = createInsertSchema(landingPages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  mode: z.enum(landingPageModes).default('single'),
});

export type InsertLandingPage = z.infer<typeof insertLandingPageSchema>;
export type LandingPage = typeof landingPages.$inferSelect;

export const savedQrCodes = pgTable("saved_qr_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  linkType: text("link_type").notNull(),
  customUrl: text("custom_url"),
  dataUrl: text("data_url").notNull(),
  size: integer("size").notNull().default(300),
  fgColor: text("fg_color").notNull().default('#1D3557'),
  bgColor: text("bg_color").notNull().default('#FFFFFF'),
  borderEnabled: boolean("border_enabled").default(false),
  borderColor: text("border_color").default('#1D3557'),
  borderWidth: integer("border_width").default(8),
  cornerRadius: integer("corner_radius").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSavedQrCodeSchema = createInsertSchema(savedQrCodes).omit({ id: true, createdAt: true });
export type InsertSavedQrCode = z.infer<typeof insertSavedQrCodeSchema>;
export type SavedQrCode = typeof savedQrCodes.$inferSelect;

export const dropoutSurveys = pgTable("dropout_surveys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reasons: text("reasons").array().notNull(),
  comment: text("comment"),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ===== Product Groups =====

export const productGroups = pgTable("product_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  color: text("color").notNull().default('#6366f1'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productGroupMembers = pgTable("product_group_members", {
  productId: varchar("product_id").notNull(),
  groupId: varchar("group_id").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.productId, t.groupId] }),
}));

export const insertProductGroupSchema = createInsertSchema(productGroups).omit({ id: true, createdAt: true });
export type InsertProductGroup = z.infer<typeof insertProductGroupSchema>;
export type ProductGroup = typeof productGroups.$inferSelect;
