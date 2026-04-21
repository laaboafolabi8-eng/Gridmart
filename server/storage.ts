import { db } from "../db/index";
import { eq, and, desc, sql, isNull, isNotNull, gt, inArray } from "drizzle-orm";
import {
  users, insertUserSchema, type InsertUser, type User,
  products, insertProductSchema, type InsertProduct, type Product,
  productTemplates, type InsertProductTemplate, type ProductTemplate,
  inventoryBatches, type InsertInventoryBatch, type InventoryBatch,
  duplicateQueue, type InsertDuplicateQueue, type DuplicateQueue,
  nodes, insertNodeSchema, type InsertNode, type Node,
  inventory, insertInventorySchema, type InsertInventory, type Inventory,
  orders, insertOrderSchema, type InsertOrder, type Order,
  orderItems, insertOrderItemSchema, type InsertOrderItem, type OrderItem,
  orderFeedback, type InsertOrderFeedback, type OrderFeedback,
  nodeAvailability, insertNodeAvailabilitySchema, type InsertNodeAvailability, type NodeAvailability,
  nodeApplications, applicationStatuses, insertNodeApplicationSchema, type InsertNodeApplication, type NodeApplication, type ApplicationStatus,
  spreadsheetSync, type SpreadsheetSync,
  crates, type InsertCrate, type Crate,
  crateItems, type InsertCrateItem, type CrateItem,
  nodeCrateAssignments, type InsertNodeCrateAssignment, type NodeCrateAssignment,
  bundleItems,
  emailSubscribers,
  adminSettings,
  userLabelTemplates, type UserLabelTemplate,
  agreements, type Agreement,
  listingTemplates, type InsertListingTemplate, type ListingTemplate,
  categories, type InsertCategory, type Category,
  promoCodes, type InsertPromoCode, type PromoCode,
  promoCodeUsages, type PromoCodeUsage,
  inviteTokens, type InsertInviteToken, type InviteToken,
  userAddresses, type InsertUserAddress, type UserAddress,
  phoneVerificationCodes, type PhoneVerificationCode,
  screeningQuestions, type InsertScreeningQuestion, type ScreeningQuestion,
  primaryScreeningQuestions, type InsertPrimaryScreeningQuestion, type PrimaryScreeningQuestion,
  servingCities, type InsertServingCity, type ServingCity,
  screeningLinks, type InsertScreeningLink, type ScreeningLink,
  screeningResponses, type InsertScreeningResponse, type ScreeningResponse,
  notifications, type InsertNotification, type Notification,
  siteSettings,
  userPreferences,
  socialFbAccounts, type InsertSocialFbAccount, type SocialFbAccount,
  socialCategories, type InsertSocialCategory, type SocialCategory,
  socialGroups, type InsertSocialGroup, type SocialGroup,
  socialPosts, type InsertSocialPost, type SocialPost,
  hostPayments, type InsertHostPayment, type HostPayment,
  landingPages, type InsertLandingPage, type LandingPage,
  savedQrCodes, type InsertSavedQrCode, type SavedQrCode,
  productGroups, type ProductGroup,
  productGroupMembers,
} from "@shared/schema";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUserRoles(id: string, roles: string[]): Promise<User | undefined>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  
  // Product operations
  getAllProducts(): Promise<Product[]>;
  getDeletedProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  getProductByIdPrefix(prefix: string): Promise<Product | undefined>;
  getProductsByIds(ids: string[]): Promise<Product[]>;
  getProductByCode(code: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;
  restoreProduct(id: string): Promise<Product | undefined>;
  permanentlyDeleteProduct(id: string): Promise<boolean>;
  setProductParent(productId: string, parentProductId: string | null, relationshipType?: 'variant' | 'batch'): Promise<Product | undefined>;
  getProductChildren(productId: string): Promise<Product[]>;
  getProductsWithHierarchy(): Promise<(Product & { children: Product[], totalQuantity: number })[]>;
  insertProductRows(afterRow: number, count: number): Promise<Product[]>;
  
  // Node operations
  getAllNodes(): Promise<Node[]>;
  getAllNodesAdmin(): Promise<Node[]>;
  getNode(id: string): Promise<Node | undefined>;
  getNodeByUserId(userId: string): Promise<Node | undefined>;
  createNode(node: InsertNode): Promise<Node>;
  updateNode(id: string, node: Partial<InsertNode>): Promise<Node | undefined>;
  deleteNode(id: string): Promise<boolean>;
  
  // Inventory operations
  getInventoryByNode(nodeId: string): Promise<Inventory[]>;
  getInventoryByProduct(productId: string): Promise<Inventory[]>;
  getInventoryItem(productId: string, nodeId: string): Promise<Inventory | undefined>;
  upsertInventory(inv: InsertInventory): Promise<Inventory>;
  updateInventoryQuantity(productId: string, nodeId: string, change: number): Promise<Inventory | undefined>;
  
  // Order operations
  getAllOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  getOrdersByBuyer(buyerId: string): Promise<Order[]>;
  getOrdersByNode(nodeId: string): Promise<Order[]>;
  deleteOrder(id: string): Promise<boolean>;
  deleteOrderItems(orderId: string): Promise<void>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  updateOrderStatus(id: string, status: string): Promise<Order | undefined>;
  updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined>;
  getOrderItems(orderId: string): Promise<OrderItem[]>;
  markOrderSmsSent(id: string): Promise<Order | undefined>;
  
  // Node availability operations
  getNodeAvailability(nodeId: string): Promise<NodeAvailability[]>;
  upsertNodeAvailability(availability: InsertNodeAvailability): Promise<NodeAvailability>;
  deleteNodeAvailability(id: string): Promise<boolean>;
  saveNodeAvailabilityBulk(nodeId: string, schedule: Array<{ dayOfWeek: string; startTime: string; endTime: string }>): Promise<NodeAvailability[]>;
  
  // Node application operations
  createNodeApplication(application: InsertNodeApplication): Promise<NodeApplication>;
  getAllNodeApplications(): Promise<NodeApplication[]>;
  updateNodeApplicationStatus(id: string, status: string): Promise<NodeApplication | undefined>;
  deleteNodeApplication(id: string): Promise<boolean>;
  updateNodeApplicationDetails(id: string, updates: { onboardingStatus?: string | null; notes?: string | null }): Promise<NodeApplication | undefined>;
  
  // Application status operations
  getAllApplicationStatuses(): Promise<ApplicationStatus[]>;
  createApplicationStatus(status: { name: string; color: string; sortOrder: number }): Promise<ApplicationStatus>;
  updateApplicationStatus(id: string, updates: { name?: string; color?: string; sortOrder?: number }): Promise<ApplicationStatus | undefined>;
  deleteApplicationStatus(id: string): Promise<boolean>;
  
  // Spreadsheet sync operations
  getSpreadsheetSyncSettings(): Promise<SpreadsheetSync | undefined>;
  upsertSpreadsheetSyncSettings(settings: { spreadsheetId: string; useTitleFromSheet?: boolean; usePicturesFromSheet?: boolean }): Promise<SpreadsheetSync>;
  updateSpreadsheetSyncStatus(spreadsheetId: string, lastSyncedRow: number, spreadsheetName?: string | null): Promise<SpreadsheetSync | undefined>;
  
  // Product Template operations
  getAllProductTemplates(): Promise<ProductTemplate[]>;
  getProductTemplate(id: string): Promise<ProductTemplate | undefined>;
  getProductTemplateByCode(productCode: string): Promise<ProductTemplate | undefined>;
  createProductTemplate(template: InsertProductTemplate): Promise<ProductTemplate>;
  updateProductTemplate(id: string, template: Partial<InsertProductTemplate>): Promise<ProductTemplate | undefined>;
  deleteProductTemplate(id: string): Promise<boolean>;
  
  // Inventory Batch operations
  getAllInventoryBatches(): Promise<InventoryBatch[]>;
  getInventoryBatch(id: string): Promise<InventoryBatch | undefined>;
  getInventoryBatchesByTemplate(templateId: string): Promise<InventoryBatch[]>;
  getInventoryBatchesByNode(nodeId: string): Promise<InventoryBatch[]>;
  getInventoryBatchBySheetRow(sheetId: string, sheetRow: number): Promise<InventoryBatch | undefined>;
  createInventoryBatch(batch: InsertInventoryBatch): Promise<InventoryBatch>;
  updateInventoryBatch(id: string, batch: Partial<InsertInventoryBatch>): Promise<InventoryBatch | undefined>;
  deleteInventoryBatch(id: string): Promise<boolean>;
  
  // Duplicate Queue operations
  getPendingDuplicates(): Promise<DuplicateQueue[]>;
  createDuplicateQueueItem(item: InsertDuplicateQueue): Promise<DuplicateQueue>;
  updateDuplicateQueueStatus(id: string, status: string): Promise<DuplicateQueue | undefined>;
  
  // Crate operations
  getAllCrates(): Promise<Crate[]>;
  getCrate(id: string): Promise<Crate | undefined>;
  createCrate(crate: InsertCrate, items: { productId: string; quantity: number }[]): Promise<Crate>;
  updateCrate(id: string, data: { name?: string; description?: string | null; isActive?: boolean }, items?: { productId: string; quantity: number }[]): Promise<Crate | undefined>;
  deleteCrate(id: string): Promise<boolean>;
  getCrateItems(crateId: string): Promise<CrateItem[]>;
  updateCrateItemQuantity(id: string, quantity: number): Promise<CrateItem | undefined>;
  
  // Node crate assignment operations
  assignCrateToNode(crateId: string, nodeId: string): Promise<NodeCrateAssignment>;
  getNodeCrateAssignments(nodeId: string): Promise<NodeCrateAssignment[]>;
  getAllCrateAssignments(): Promise<NodeCrateAssignment[]>;
  updateCrateAssignmentStatus(id: string, status: string): Promise<NodeCrateAssignment | undefined>;
  deleteCrateAssignment(id: string): Promise<boolean>;
  
  // Email subscriber operations
  createEmailSubscriber(subscriber: { email: string; source?: string }): Promise<any>;
  getAllEmailSubscribers(): Promise<any[]>;
  deleteEmailSubscriber(id: string): Promise<boolean>;
  
  // Admin settings operations
  getAdminSetting(key: string): Promise<string | undefined>;
  getAllAdminSettings(): Promise<Record<string, string>>;
  upsertAdminSetting(key: string, value: string): Promise<void>;
  
  // Product group operations
  getAllProductGroups(): Promise<ProductGroup[]>;
  createProductGroup(name: string, color: string): Promise<ProductGroup>;
  updateProductGroup(id: string, data: { name?: string; color?: string }): Promise<ProductGroup | undefined>;
  deleteProductGroup(id: string): Promise<boolean>;
  getAllProductGroupMemberships(): Promise<{ productId: string; groupId: string }[]>;
  addProductsToGroup(groupId: string, productIds: string[]): Promise<void>;
  removeProductsFromGroup(groupId: string, productIds: string[]): Promise<void>;
  setProductGroupMembers(groupId: string, productIds: string[]): Promise<void>;

  // User label template operations
  getUserLabelTemplates(userId: string): Promise<UserLabelTemplate[]>;
  upsertUserLabelTemplate(userId: string, labelSize: string, template: any): Promise<UserLabelTemplate>;
  
  // Feedback operations
  getAllFeedback(): Promise<OrderFeedback[]>;
  getFeedbackByOrderId(orderId: string): Promise<OrderFeedback | undefined>;
  getFeedbackByNodeId(nodeId: string): Promise<OrderFeedback[]>;
  createFeedback(feedback: InsertOrderFeedback): Promise<OrderFeedback>;
  
  // Listing template operations
  getAllListingTemplates(): Promise<ListingTemplate[]>;
  getListingTemplate(id: string): Promise<ListingTemplate | undefined>;
  createListingTemplate(template: InsertListingTemplate): Promise<ListingTemplate>;
  updateListingTemplate(id: string, template: Partial<InsertListingTemplate>): Promise<ListingTemplate | undefined>;
  deleteListingTemplate(id: string): Promise<boolean>;
  
  // Category operations
  getAllCategories(): Promise<Category[]>;
  getCategory(id: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, category: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: string): Promise<boolean>;
  reorderCategories(orderedIds: string[]): Promise<boolean>;
  reorderProducts(orderedIds: string[]): Promise<boolean>;
  
  // Promo code operations
  getAllPromoCodes(): Promise<PromoCode[]>;
  getPromoCode(id: string): Promise<PromoCode | undefined>;
  getPromoCodeByCode(code: string): Promise<PromoCode | undefined>;
  getPromoCodesByNodeId(nodeId: string): Promise<PromoCode[]>;
  createPromoCode(promoCode: InsertPromoCode): Promise<PromoCode>;
  updatePromoCode(id: string, promoCode: Partial<InsertPromoCode>): Promise<PromoCode | undefined>;
  deletePromoCode(id: string): Promise<boolean>;
  incrementPromoCodeUsage(id: string): Promise<PromoCode | undefined>;
  getPromoCodesByBatchId(batchId: string): Promise<PromoCode[]>;
  updatePromoCodeGivenOut(id: string, givenOut: boolean): Promise<PromoCode | undefined>;
  
  // Promo code usage tracking
  getPromoCodeUsageCount(promoCodeId: string, userId: string): Promise<number>;
  recordPromoCodeUsage(promoCodeId: string, userId: string, orderId?: string): Promise<PromoCodeUsage>;
  
  // Invite token operations
  getAllInviteTokens(): Promise<InviteToken[]>;
  getInviteToken(id: string): Promise<InviteToken | undefined>;
  getInviteTokenByToken(token: string): Promise<InviteToken | undefined>;
  createInviteToken(invite: InsertInviteToken): Promise<InviteToken>;
  useInviteToken(token: string, userId: string): Promise<InviteToken | undefined>;
  deleteInviteToken(id: string): Promise<boolean>;
  
  // User address operations
  getUserAddresses(userId: string): Promise<UserAddress[]>;
  getUserAddress(id: string): Promise<UserAddress | undefined>;
  createUserAddress(address: InsertUserAddress): Promise<UserAddress>;
  updateUserAddress(id: string, address: Partial<InsertUserAddress>): Promise<UserAddress | undefined>;
  deleteUserAddress(id: string): Promise<boolean>;
  clearDefaultAddresses(userId: string): Promise<void>;
  
  // Phone verification code operations
  getVerificationCode(phone: string): Promise<PhoneVerificationCode | undefined>;
  saveVerificationCode(phone: string, code: string, expiresAt: Date): Promise<PhoneVerificationCode>;
  deleteVerificationCode(phone: string): Promise<boolean>;
  incrementVerificationAttempts(phone: string): Promise<void>;
  
  // Screening question operations
  getAllScreeningQuestions(): Promise<ScreeningQuestion[]>;
  getActiveScreeningQuestions(): Promise<ScreeningQuestion[]>;
  getScreeningQuestion(id: string): Promise<ScreeningQuestion | undefined>;
  createScreeningQuestion(question: InsertScreeningQuestion): Promise<ScreeningQuestion>;
  updateScreeningQuestion(id: string, question: Partial<InsertScreeningQuestion>): Promise<ScreeningQuestion | undefined>;
  deleteScreeningQuestion(id: string): Promise<boolean>;
  
  // Primary screening question operations
  getAllPrimaryScreeningQuestions(): Promise<PrimaryScreeningQuestion[]>;
  getActivePrimaryScreeningQuestions(): Promise<PrimaryScreeningQuestion[]>;
  getPrimaryScreeningQuestion(id: string): Promise<PrimaryScreeningQuestion | undefined>;
  createPrimaryScreeningQuestion(question: InsertPrimaryScreeningQuestion): Promise<PrimaryScreeningQuestion>;
  updatePrimaryScreeningQuestion(id: string, question: Partial<InsertPrimaryScreeningQuestion>): Promise<PrimaryScreeningQuestion | undefined>;
  deletePrimaryScreeningQuestion(id: string): Promise<boolean>;

  // Serving cities operations
  getServingCities(): Promise<ServingCity[]>;
  getServingCity(id: string): Promise<ServingCity | undefined>;
  createServingCity(city: InsertServingCity): Promise<ServingCity>;
  updateServingCity(id: string, city: Partial<InsertServingCity>): Promise<ServingCity | undefined>;
  deleteServingCity(id: string): Promise<boolean>;
  
  // Screening link operations
  getScreeningLink(id: string): Promise<ScreeningLink | undefined>;
  getScreeningLinkByToken(token: string): Promise<ScreeningLink | undefined>;
  getScreeningLinkByApplication(applicationId: string): Promise<ScreeningLink | undefined>;
  getAllScreeningLinks(): Promise<ScreeningLink[]>;
  createScreeningLink(link: InsertScreeningLink): Promise<ScreeningLink>;
  markScreeningLinkCompleted(id: string, name?: string, email?: string): Promise<ScreeningLink | undefined>;
  deleteScreeningLink(id: string): Promise<boolean>;
  
  // Screening response operations
  getScreeningResponses(linkId: string): Promise<ScreeningResponse[]>;
  getScreeningResponsesByLink(linkId: string): Promise<(ScreeningResponse & { question?: ScreeningQuestion })[]>;
  createScreeningResponses(responses: InsertScreeningResponse[]): Promise<ScreeningResponse[]>;
  
  // Site settings operations
  getSiteSetting(key: string): Promise<string | null>;
  setSiteSetting(key: string, value: string): Promise<void>;
  getAllSiteSettings(): Promise<Record<string, string>>;
  
  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string): Promise<Notification[]>;
  markNotificationRead(id: string, userId: string): Promise<void>;
  
  // User preferences operations
  getUserPreference(userId: string, key: string): Promise<string | null>;
  setUserPreference(userId: string, key: string, value: string): Promise<void>;

  // Social media tracker operations
  getSocialFbAccounts(): Promise<SocialFbAccount[]>;
  createSocialFbAccount(account: InsertSocialFbAccount): Promise<SocialFbAccount>;
  updateSocialFbAccount(id: string, data: Partial<InsertSocialFbAccount>): Promise<SocialFbAccount | undefined>;
  deleteSocialFbAccount(id: string): Promise<void>;
  getSocialCategories(): Promise<SocialCategory[]>;
  createSocialCategory(cat: InsertSocialCategory): Promise<SocialCategory>;
  updateSocialCategory(id: string, data: Partial<InsertSocialCategory>): Promise<SocialCategory | undefined>;
  deleteSocialCategory(id: string): Promise<void>;
  getSocialGroups(): Promise<SocialGroup[]>;
  createSocialGroup(group: InsertSocialGroup): Promise<SocialGroup>;
  updateSocialGroup(id: string, data: Partial<InsertSocialGroup>): Promise<SocialGroup | undefined>;
  deleteSocialGroup(id: string): Promise<void>;
  getSocialPosts(): Promise<SocialPost[]>;
  createSocialPost(post: InsertSocialPost): Promise<SocialPost>;
  updateSocialPost(id: string, data: Partial<InsertSocialPost>): Promise<SocialPost | undefined>;
  deleteSocialPost(id: string): Promise<void>;

  getHostPayments(): Promise<HostPayment[]>;
  createHostPayment(payment: InsertHostPayment): Promise<HostPayment>;
  updateHostPayment(id: string, data: Partial<InsertHostPayment>): Promise<HostPayment | undefined>;
  deleteHostPayment(id: string): Promise<void>;
  
  getAllLandingPages(): Promise<LandingPage[]>;
  getLandingPageBySlug(slug: string): Promise<LandingPage | undefined>;
  getLandingPage(id: string): Promise<LandingPage | undefined>;
  createLandingPage(page: InsertLandingPage): Promise<LandingPage>;
  updateLandingPage(id: string, data: Partial<InsertLandingPage>): Promise<LandingPage | undefined>;
  deleteLandingPage(id: string): Promise<void>;

  getAllSavedQrCodes(): Promise<SavedQrCode[]>;
  createSavedQrCode(qr: InsertSavedQrCode): Promise<SavedQrCode>;
  deleteSavedQrCode(id: string): Promise<void>;
}

export class DBStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).where(isNull(users.deletedAt));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  
  async updateUserRoles(id: string, roles: string[]): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ roles })
      .where(eq(users.id, id))
      .returning();
    return user;
  }
  
  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return true;
  }

  // Product operations
  async getAllProducts(): Promise<Product[]> {
    // Exclude soft-deleted products
    return await db.select().from(products).where(isNull(products.deletedAt));
  }

  async getDeletedProducts(): Promise<Product[]> {
    // Return only soft-deleted products
    return await db.select().from(products).where(isNotNull(products.deletedAt));
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getProductByIdPrefix(prefix: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(
      sql`${products.id}::text LIKE ${prefix + '%'}`
    );
    return product;
  }

  async getProductsByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    return db.select().from(products).where(inArray(products.id, ids));
  }

  async getProductByCode(code: string): Promise<Product | undefined> {
    // Only return non-deleted products by code
    const [product] = await db.select().from(products).where(
      and(eq(products.productCode, code), isNull(products.deletedAt))
    );
    return product;
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [product] = await db.insert(products).values(insertProduct).returning();
    return product;
  }

  async updateProduct(id: string, updateData: Partial<InsertProduct>): Promise<Product | undefined> {
    const [product] = await db.update(products).set(updateData).where(eq(products.id, id)).returning();
    return product;
  }

  async deleteProduct(id: string): Promise<boolean> {
    // Soft delete - set deletedAt timestamp
    await db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, id));
    return true;
  }

  async restoreProduct(id: string): Promise<Product | undefined> {
    // Restore a soft-deleted product by clearing deletedAt
    const [product] = await db.update(products).set({ deletedAt: null }).where(eq(products.id, id)).returning();
    return product;
  }

  async permanentlyDeleteProduct(id: string): Promise<boolean> {
    // Hard delete - permanently remove product and related records
    await db.delete(inventory).where(eq(inventory.productId, id));
    await db.delete(orderItems).where(eq(orderItems.productId, id));
    await db.delete(bundleItems).where(eq(bundleItems.productId, id));
    await db.delete(crateItems).where(eq(crateItems.productId, id));
    await db.delete(products).where(eq(products.id, id));
    return true;
  }

  async setProductParent(productId: string, parentProductId: string | null, relationshipType: 'variant' | 'batch' = 'batch'): Promise<Product | undefined> {
    const [product] = await db.update(products)
      .set({ parentProductId, relationshipType })
      .where(eq(products.id, productId))
      .returning();
    return product;
  }

  async getProductChildren(productId: string): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.parentProductId, productId));
  }

  async getProductsWithHierarchy(): Promise<(Product & { children: Product[], totalQuantity: number })[]> {
    // Exclude soft-deleted products
    const allProducts = await db.select().from(products).where(isNull(products.deletedAt));
    const allInventory = await db.select().from(inventory);
    
    // Build a map of product quantities
    const productQuantities: Record<string, number> = {};
    for (const inv of allInventory) {
      productQuantities[inv.productId] = (productQuantities[inv.productId] || 0) + inv.quantity;
    }
    
    // Build parent-child relationships
    const childrenMap: Record<string, Product[]> = {};
    const parentProducts: Product[] = [];
    
    for (const product of allProducts) {
      if (product.parentProductId) {
        if (!childrenMap[product.parentProductId]) {
          childrenMap[product.parentProductId] = [];
        }
        childrenMap[product.parentProductId].push(product);
      } else {
        parentProducts.push(product);
      }
    }
    
    // Calculate totals including children (recursive)
    const calculateTotal = (productId: string): number => {
      let total = productQuantities[productId] || 0;
      const children = childrenMap[productId] || [];
      for (const child of children) {
        total += calculateTotal(child.id);
      }
      return total;
    };
    
    // Return parent products with their children and totals
    return parentProducts.map(product => ({
      ...product,
      children: childrenMap[product.id] || [],
      totalQuantity: calculateTotal(product.id)
    }));
  }

  async insertProductRows(afterRow: number, count: number): Promise<Product[]> {
    // Step 1: Get all products with sheetRow > afterRow, sorted ascending
    const existingProducts = await db.select()
      .from(products)
      .where(
        and(
          gt(products.sheetRow, afterRow),
          isNull(products.deletedAt)
        )
      )
      .orderBy(products.sheetRow);
    
    // Step 2: Gap-aware shifting - only shift rows that collide with inserted or shifted rows
    // Track occupied positions: starts with inserted rows (afterRow+1 to afterRow+count)
    const occupiedRows = new Set<number>();
    for (let i = 1; i <= count; i++) {
      occupiedRows.add(afterRow + i);
    }
    
    for (const product of existingProducts) {
      const currentRow = product.sheetRow;
      if (currentRow === null) continue;
      
      // Only shift if this row collides with an occupied position
      if (occupiedRows.has(currentRow)) {
        // Shift this row by count
        const newRow = currentRow + count;
        await db.update(products)
          .set({ sheetRow: newRow })
          .where(eq(products.id, product.id));
        
        // Mark the new position as occupied (for potential cascade)
        occupiedRows.add(newRow);
      }
      // If no collision, leave the row alone - preserve the gap
    }
    
    // Step 3: Create blank products with new row numbers
    const newProducts: Product[] = [];
    for (let i = 1; i <= count; i++) {
      const newRow = afterRow + i;
      const [created] = await db.insert(products).values({
        name: `New Product (Row ${newRow})`,
        description: '',
        price: '0',
        category: 'Electronics',
        image: '',
        images: [],
        sheetRow: newRow,
        sheetQuantity: 0,
      }).returning();
      newProducts.push(created);
    }
    
    return newProducts;
  }

  // Node operations
  async getAllNodes(): Promise<Node[]> {
    return await db.select().from(nodes).where(eq(nodes.status, 'active')).orderBy(nodes.createdAt);
  }
  
  async getAllNodesAdmin(): Promise<Node[]> {
    return await db.select().from(nodes).orderBy(nodes.createdAt);
  }

  async getNode(id: string): Promise<Node | undefined> {
    const [node] = await db.select().from(nodes).where(eq(nodes.id, id));
    return node;
  }

  async getNodeByUserId(userId: string): Promise<Node | undefined> {
    const [node] = await db.select().from(nodes).where(eq(nodes.userId, userId));
    return node;
  }

  async createNode(insertNode: InsertNode): Promise<Node> {
    const [node] = await db.insert(nodes).values(insertNode).returning();
    return node;
  }

  async updateNode(id: string, updateData: Partial<InsertNode>): Promise<Node | undefined> {
    const [node] = await db.update(nodes).set(updateData).where(eq(nodes.id, id)).returning();
    return node;
  }
  
  async deleteNode(id: string): Promise<boolean> {
    await db.delete(inventory).where(eq(inventory.nodeId, id));
    const result = await db.delete(nodes).where(eq(nodes.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Inventory operations
  async getInventoryByNode(nodeId: string): Promise<Inventory[]> {
    return await db.select().from(inventory).where(eq(inventory.nodeId, nodeId));
  }

  async getInventoryByProduct(productId: string): Promise<Inventory[]> {
    return await db.select().from(inventory).where(eq(inventory.productId, productId));
  }

  async getInventoryItem(productId: string, nodeId: string): Promise<Inventory | undefined> {
    const [item] = await db.select().from(inventory).where(
      and(eq(inventory.productId, productId), eq(inventory.nodeId, nodeId))
    );
    return item;
  }

  async upsertInventory(inv: InsertInventory): Promise<Inventory> {
    const [result] = await db.insert(inventory)
      .values(inv)
      .onConflictDoUpdate({
        target: [inventory.productId, inventory.nodeId],
        set: { quantity: inv.quantity, updatedAt: new Date() },
      })
      .returning();
    return result;
  }

  async updateInventoryQuantity(productId: string, nodeId: string, change: number): Promise<Inventory | undefined> {
    const item = await this.getInventoryItem(productId, nodeId);
    if (!item) return undefined;
    
    const newQuantity = Math.max(0, parseInt(item.quantity.toString()) + change);
    const [updated] = await db.update(inventory)
      .set({ quantity: newQuantity, updatedAt: new Date() })
      .where(eq(inventory.id, item.id))
      .returning();
    return updated;
  }

  // Order operations
  async getAllOrders(): Promise<Order[]> {
    return await db.select().from(orders).orderBy(desc(orders.createdAt));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrdersByBuyer(buyerId: string): Promise<Order[]> {
    return await db.select().from(orders)
      .where(eq(orders.buyerId, buyerId))
      .orderBy(desc(orders.createdAt));
  }

  async getOrdersByNode(nodeId: string): Promise<Order[]> {
    return await db.select().from(orders)
      .where(eq(orders.nodeId, nodeId))
      .orderBy(desc(orders.createdAt));
  }

  async deleteOrder(id: string): Promise<boolean> {
    await db.delete(orderItems).where(eq(orderItems.orderId, id));
    const result = await db.delete(orders).where(eq(orders.id, id)).returning();
    return result.length > 0;
  }

  async deleteOrderItems(orderId: string): Promise<void> {
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async createOrder(insertOrder: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    const [order] = await db.insert(orders).values(insertOrder).returning();
    
    // Insert order items with the actual order ID
    if (items.length > 0) {
      const itemsWithOrderId = items.map(item => ({
        ...item,
        orderId: order.id,
      }));
      await db.insert(orderItems).values(itemsWithOrderId);
    }
    
    return order;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order | undefined> {
    const updates: any = { status };
    if (status === 'ready' || status === 'picked_up' || status === 'completed') {
      const [existing] = await db.select({ readyAt: orders.readyAt, pickedUpAt: orders.pickedUpAt }).from(orders).where(eq(orders.id, id));
      if (!existing?.readyAt) {
        updates.readyAt = new Date();
      }
      if ((status === 'picked_up' || status === 'completed') && !existing?.pickedUpAt) {
        updates.pickedUpAt = new Date();
      }
    }
    const [order] = await db.update(orders)
      .set(updates)
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
    const [order] = await db.update(orders)
      .set(updates)
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async markOrderSmsSent(id: string): Promise<Order | undefined> {
    const [order] = await db.update(orders)
      .set({ smsSent: true })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  // Node availability operations
  async getNodeAvailability(nodeId: string): Promise<NodeAvailability[]> {
    return await db.select().from(nodeAvailability).where(eq(nodeAvailability.nodeId, nodeId));
  }

  async upsertNodeAvailability(availability: InsertNodeAvailability): Promise<NodeAvailability> {
    // Check if availability for this node/day already exists
    const [existing] = await db.select().from(nodeAvailability).where(
      and(
        eq(nodeAvailability.nodeId, availability.nodeId),
        eq(nodeAvailability.dayOfWeek, availability.dayOfWeek)
      )
    );
    
    if (existing) {
      const [updated] = await db.update(nodeAvailability)
        .set(availability)
        .where(eq(nodeAvailability.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(nodeAvailability).values(availability).returning();
      return created;
    }
  }

  async deleteNodeAvailability(id: string): Promise<boolean> {
    await db.delete(nodeAvailability).where(eq(nodeAvailability.id, id));
    return true;
  }

  async saveNodeAvailabilityBulk(nodeId: string, schedule: Array<{ dayOfWeek: string; startTime: string; endTime: string }>): Promise<NodeAvailability[]> {
    // Delete all existing availability for this node
    await db.delete(nodeAvailability).where(eq(nodeAvailability.nodeId, nodeId));
    
    // Insert all new availability entries
    if (schedule.length === 0) {
      return [];
    }
    
    const entries = schedule.map(s => ({
      nodeId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      enabled: true
    }));
    
    const results = await db.insert(nodeAvailability).values(entries).returning();
    return results;
  }

  // Node application operations
  async createNodeApplication(application: InsertNodeApplication): Promise<NodeApplication> {
    const [created] = await db.insert(nodeApplications).values(application).returning();
    return created;
  }

  async getAllNodeApplications(): Promise<NodeApplication[]> {
    return await db.select().from(nodeApplications).orderBy(desc(nodeApplications.createdAt));
  }

  async updateNodeApplicationStatus(id: string, status: string): Promise<NodeApplication | undefined> {
    const [updated] = await db.update(nodeApplications)
      .set({ status })
      .where(eq(nodeApplications.id, id))
      .returning();
    return updated;
  }

  async deleteNodeApplication(id: string): Promise<boolean> {
    // Delete related screening responses and links first (FK constraints)
    const links = await db.select({ id: screeningLinks.id }).from(screeningLinks).where(eq(screeningLinks.applicationId, id));
    for (const link of links) {
      await db.delete(screeningResponses).where(eq(screeningResponses.linkId, link.id));
    }
    await db.delete(screeningLinks).where(eq(screeningLinks.applicationId, id));
    await db.delete(nodeApplications).where(eq(nodeApplications.id, id));
    return true;
  }

  async updateNodeApplicationDetails(id: string, updates: { onboardingStatus?: string | null; notes?: string | null }): Promise<NodeApplication | undefined> {
    const [updated] = await db.update(nodeApplications)
      .set(updates)
      .where(eq(nodeApplications.id, id))
      .returning();
    return updated;
  }

  // Application status operations
  async getAllApplicationStatuses(): Promise<ApplicationStatus[]> {
    return await db.select().from(applicationStatuses).orderBy(applicationStatuses.sortOrder);
  }

  async createApplicationStatus(status: { name: string; color: string; sortOrder: number }): Promise<ApplicationStatus> {
    const [created] = await db.insert(applicationStatuses).values(status).returning();
    return created;
  }

  async updateApplicationStatus(id: string, updates: { name?: string; color?: string; sortOrder?: number }): Promise<ApplicationStatus | undefined> {
    const [updated] = await db.update(applicationStatuses)
      .set(updates)
      .where(eq(applicationStatuses.id, id))
      .returning();
    return updated;
  }

  async deleteApplicationStatus(id: string): Promise<boolean> {
    await db.delete(applicationStatuses).where(eq(applicationStatuses.id, id));
    return true;
  }

  // Spreadsheet sync operations
  async getSpreadsheetSyncSettings(): Promise<SpreadsheetSync | undefined> {
    const [settings] = await db.select().from(spreadsheetSync).limit(1);
    return settings;
  }

  async upsertSpreadsheetSyncSettings(settings: { spreadsheetId: string; useTitleFromSheet?: boolean; usePicturesFromSheet?: boolean }): Promise<SpreadsheetSync> {
    const existing = await this.getSpreadsheetSyncSettings();
    
    if (existing) {
      const [updated] = await db.update(spreadsheetSync)
        .set({
          spreadsheetId: settings.spreadsheetId,
          useTitleFromSheet: settings.useTitleFromSheet ?? existing.useTitleFromSheet,
          usePicturesFromSheet: settings.usePicturesFromSheet ?? existing.usePicturesFromSheet,
        })
        .where(eq(spreadsheetSync.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(spreadsheetSync).values({
        spreadsheetId: settings.spreadsheetId,
        useTitleFromSheet: settings.useTitleFromSheet ?? false,
        usePicturesFromSheet: settings.usePicturesFromSheet ?? false,
      }).returning();
      return created;
    }
  }

  async updateSpreadsheetSyncStatus(spreadsheetId: string, lastSyncedRow: number, spreadsheetName?: string | null, syncLog?: string): Promise<SpreadsheetSync | undefined> {
    const existing = await this.getSpreadsheetSyncSettings();
    
    if (existing) {
      const [updated] = await db.update(spreadsheetSync)
        .set({
          lastSyncAt: new Date(),
          lastSyncedRow,
          spreadsheetName: spreadsheetName ?? existing.spreadsheetName,
          lastSyncLog: syncLog ?? existing.lastSyncLog,
        })
        .where(eq(spreadsheetSync.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(spreadsheetSync).values({
        spreadsheetId,
        lastSyncAt: new Date(),
        lastSyncedRow,
        spreadsheetName,
        lastSyncLog: syncLog,
      }).returning();
      return created;
    }
  }

  // Product Template operations
  async getAllProductTemplates(): Promise<ProductTemplate[]> {
    return await db.select().from(productTemplates);
  }

  async getProductTemplate(id: string): Promise<ProductTemplate | undefined> {
    const [template] = await db.select().from(productTemplates).where(eq(productTemplates.id, id));
    return template;
  }

  async getProductTemplateByCode(productCode: string): Promise<ProductTemplate | undefined> {
    const [template] = await db.select().from(productTemplates).where(eq(productTemplates.productCode, productCode));
    return template;
  }

  async createProductTemplate(template: InsertProductTemplate): Promise<ProductTemplate> {
    const [created] = await db.insert(productTemplates).values(template).returning();
    return created;
  }

  async updateProductTemplate(id: string, updateData: Partial<InsertProductTemplate>): Promise<ProductTemplate | undefined> {
    const [updated] = await db.update(productTemplates)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(productTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteProductTemplate(id: string): Promise<boolean> {
    await db.delete(inventoryBatches).where(eq(inventoryBatches.templateId, id));
    await db.delete(productTemplates).where(eq(productTemplates.id, id));
    return true;
  }

  // Inventory Batch operations
  async getAllInventoryBatches(): Promise<InventoryBatch[]> {
    return await db.select().from(inventoryBatches);
  }

  async getInventoryBatch(id: string): Promise<InventoryBatch | undefined> {
    const [batch] = await db.select().from(inventoryBatches).where(eq(inventoryBatches.id, id));
    return batch;
  }

  async getInventoryBatchesByTemplate(templateId: string): Promise<InventoryBatch[]> {
    return await db.select().from(inventoryBatches).where(eq(inventoryBatches.templateId, templateId));
  }

  async getInventoryBatchesByNode(nodeId: string): Promise<InventoryBatch[]> {
    return await db.select().from(inventoryBatches).where(eq(inventoryBatches.nodeId, nodeId));
  }

  async getInventoryBatchBySheetRow(sheetId: string, sheetRow: number): Promise<InventoryBatch | undefined> {
    const [batch] = await db.select().from(inventoryBatches).where(
      and(eq(inventoryBatches.sheetId, sheetId), eq(inventoryBatches.sheetRow, sheetRow))
    );
    return batch;
  }

  async createInventoryBatch(batch: InsertInventoryBatch): Promise<InventoryBatch> {
    const [created] = await db.insert(inventoryBatches).values(batch).returning();
    return created;
  }

  async updateInventoryBatch(id: string, updateData: Partial<InsertInventoryBatch>): Promise<InventoryBatch | undefined> {
    const [updated] = await db.update(inventoryBatches)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(inventoryBatches.id, id))
      .returning();
    return updated;
  }

  async deleteInventoryBatch(id: string): Promise<boolean> {
    await db.delete(inventoryBatches).where(eq(inventoryBatches.id, id));
    return true;
  }

  // Duplicate Queue operations
  async getPendingDuplicates(): Promise<DuplicateQueue[]> {
    return await db.select().from(duplicateQueue).where(eq(duplicateQueue.status, 'pending'));
  }

  async createDuplicateQueueItem(item: InsertDuplicateQueue): Promise<DuplicateQueue> {
    const [created] = await db.insert(duplicateQueue).values(item).returning();
    return created;
  }

  async updateDuplicateQueueStatus(id: string, status: string): Promise<DuplicateQueue | undefined> {
    const [updated] = await db.update(duplicateQueue)
      .set({ status, reviewedAt: new Date() })
      .where(eq(duplicateQueue.id, id))
      .returning();
    return updated;
  }
  
  // Crate operations
  async getAllCrates(): Promise<Crate[]> {
    return await db.select().from(crates).orderBy(desc(crates.createdAt));
  }
  
  async getCrate(id: string): Promise<Crate | undefined> {
    const [crate] = await db.select().from(crates).where(eq(crates.id, id));
    return crate;
  }
  
  async createCrate(crateData: InsertCrate, items: { productId: string; quantity: number }[]): Promise<Crate> {
    const [newCrate] = await db.insert(crates).values(crateData).returning();
    if (items.length > 0) {
      await db.insert(crateItems).values(
        items.map(item => ({
          crateId: newCrate.id,
          productId: item.productId,
          quantity: item.quantity,
        }))
      );
    }
    return newCrate;
  }
  
  async updateCrate(
    id: string, 
    data: { name?: string; description?: string | null; isActive?: boolean; mapData?: any }, 
    items?: { productId: string; quantity: number }[]
  ): Promise<Crate | undefined> {
    const existingCrate = await this.getCrate(id);
    if (!existingCrate) return undefined;
    
    const updateData: Partial<InsertCrate> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.mapData !== undefined) (updateData as any).mapData = data.mapData;
    
    let updatedCrate = existingCrate;
    if (Object.keys(updateData).length > 0) {
      const [crate] = await db.update(crates)
        .set(updateData)
        .where(eq(crates.id, id))
        .returning();
      updatedCrate = crate;
    }
    
    // Only update items if provided
    if (items !== undefined) {
      await db.delete(crateItems).where(eq(crateItems.crateId, id));
      
      const validItems = items.filter(item => item.quantity > 0);
      if (validItems.length > 0) {
        await db.insert(crateItems).values(
          validItems.map(item => ({
            crateId: id,
            productId: item.productId,
            quantity: item.quantity,
          }))
        );
      }
    }
    
    return updatedCrate;
  }
  
  async deleteCrate(id: string): Promise<boolean> {
    await db.delete(crates).where(eq(crates.id, id));
    return true;
  }
  
  async getCrateItems(crateId: string): Promise<CrateItem[]> {
    return await db.select().from(crateItems).where(eq(crateItems.crateId, crateId));
  }

  async updateCrateItemQuantity(id: string, quantity: number): Promise<CrateItem | undefined> {
    const [updated] = await db.update(crateItems).set({ quantity }).where(eq(crateItems.id, id)).returning();
    return updated;
  }
  
  // Node crate assignment operations
  async assignCrateToNode(crateId: string, nodeId: string): Promise<NodeCrateAssignment> {
    const [assignment] = await db.insert(nodeCrateAssignments).values({
      crateId,
      nodeId,
      status: 'active',
    }).returning();
    return assignment;
  }
  
  async getNodeCrateAssignments(nodeId: string): Promise<NodeCrateAssignment[]> {
    return await db.select().from(nodeCrateAssignments)
      .where(eq(nodeCrateAssignments.nodeId, nodeId))
      .orderBy(desc(nodeCrateAssignments.assignedAt));
  }
  
  async getAllCrateAssignments(): Promise<NodeCrateAssignment[]> {
    return await db.select().from(nodeCrateAssignments)
      .orderBy(desc(nodeCrateAssignments.assignedAt));
  }
  
  async updateCrateAssignmentStatus(id: string, status: string): Promise<NodeCrateAssignment | undefined> {
    const [updated] = await db.update(nodeCrateAssignments)
      .set({ 
        status, 
        completedAt: status === 'completed' ? new Date() : null 
      })
      .where(eq(nodeCrateAssignments.id, id))
      .returning();
    return updated;
  }
  
  async deleteCrateAssignment(id: string): Promise<boolean> {
    await db.delete(nodeCrateAssignments).where(eq(nodeCrateAssignments.id, id));
    return true;
  }
  
  async getCrateAssignment(id: string): Promise<NodeCrateAssignment | undefined> {
    const [assignment] = await db.select().from(nodeCrateAssignments)
      .where(eq(nodeCrateAssignments.id, id));
    return assignment;
  }
  
  async updateCrateAssignmentQuantityOverrides(id: string, quantityOverrides: Record<string, { quantity: number; originalQuantity: number }>): Promise<NodeCrateAssignment | undefined> {
    const [updated] = await db.update(nodeCrateAssignments)
      .set({ quantityOverrides })
      .where(eq(nodeCrateAssignments.id, id))
      .returning();
    return updated;
  }
  
  // Email subscriber operations
  async createEmailSubscriber(subscriber: { email: string; source?: string }): Promise<any> {
    const [created] = await db.insert(emailSubscribers).values({
      email: subscriber.email,
      source: subscriber.source || 'coming_soon',
    }).returning();
    return created;
  }
  
  async getAllEmailSubscribers(): Promise<any[]> {
    return await db.select().from(emailSubscribers).orderBy(desc(emailSubscribers.createdAt));
  }
  
  async deleteEmailSubscriber(id: string): Promise<boolean> {
    await db.delete(emailSubscribers).where(eq(emailSubscribers.id, id));
    return true;
  }
  
  // Admin settings operations
  async getAdminSetting(key: string): Promise<string | undefined> {
    const [setting] = await db.select().from(adminSettings).where(eq(adminSettings.key, key));
    return setting?.value;
  }
  
  async getAllAdminSettings(): Promise<Record<string, string>> {
    const settings = await db.select().from(adminSettings);
    return settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);
  }
  
  async upsertAdminSetting(key: string, value: string): Promise<void> {
    await db.insert(adminSettings)
      .values({ key, value })
      .onConflictDoUpdate({ 
        target: adminSettings.key, 
        set: { value, updatedAt: new Date() } 
      });
  }
  
  // Product group operations
  async getAllProductGroups(): Promise<ProductGroup[]> {
    return await db.select().from(productGroups).orderBy(productGroups.createdAt);
  }

  async createProductGroup(name: string, color: string): Promise<ProductGroup> {
    const [group] = await db.insert(productGroups).values({ name, color }).returning();
    return group;
  }

  async updateProductGroup(id: string, data: { name?: string; color?: string }): Promise<ProductGroup | undefined> {
    const [group] = await db.update(productGroups).set(data).where(eq(productGroups.id, id)).returning();
    return group;
  }

  async deleteProductGroup(id: string): Promise<boolean> {
    await db.delete(productGroupMembers).where(eq(productGroupMembers.groupId, id));
    const result = await db.delete(productGroups).where(eq(productGroups.id, id));
    return (result as any).rowCount > 0;
  }

  async getAllProductGroupMemberships(): Promise<{ productId: string; groupId: string }[]> {
    return await db.select().from(productGroupMembers);
  }

  async addProductsToGroup(groupId: string, productIds: string[]): Promise<void> {
    if (!productIds.length) return;
    await db.insert(productGroupMembers)
      .values(productIds.map(productId => ({ productId, groupId })))
      .onConflictDoNothing();
  }

  async removeProductsFromGroup(groupId: string, productIds: string[]): Promise<void> {
    if (!productIds.length) return;
    await db.delete(productGroupMembers).where(
      and(eq(productGroupMembers.groupId, groupId), inArray(productGroupMembers.productId, productIds))
    );
  }

  async setProductGroupMembers(groupId: string, productIds: string[]): Promise<void> {
    await db.delete(productGroupMembers).where(eq(productGroupMembers.groupId, groupId));
    if (productIds.length) {
      await db.insert(productGroupMembers)
        .values(productIds.map(productId => ({ productId, groupId })));
    }
  }

  // User label template operations
  async getUserLabelTemplates(userId: string): Promise<UserLabelTemplate[]> {
    return await db.select().from(userLabelTemplates).where(eq(userLabelTemplates.userId, userId));
  }
  
  async deleteUserLabelTemplate(userId: string, labelSize: string): Promise<void> {
    await db.delete(userLabelTemplates)
      .where(and(
        eq(userLabelTemplates.userId, userId),
        eq(userLabelTemplates.labelSize, labelSize)
      ));
  }

  async upsertUserLabelTemplate(userId: string, labelSize: string, template: any): Promise<UserLabelTemplate> {
    // Check if template exists for this user and label size
    const [existing] = await db.select().from(userLabelTemplates)
      .where(and(
        eq(userLabelTemplates.userId, userId),
        eq(userLabelTemplates.labelSize, labelSize)
      ));
    
    if (existing) {
      const [updated] = await db.update(userLabelTemplates)
        .set({ template, updatedAt: new Date() })
        .where(eq(userLabelTemplates.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(userLabelTemplates)
        .values({ userId, labelSize, template })
        .returning();
      return created;
    }
  }
  
  // Agreement operations
  async getAllAgreements(): Promise<Agreement[]> {
    return await db.select().from(agreements);
  }
  
  async getAgreement(key: string): Promise<Agreement | undefined> {
    const [agreement] = await db.select().from(agreements).where(eq(agreements.key, key));
    return agreement;
  }
  
  async upsertAgreement(key: string, title: string, content: string): Promise<Agreement> {
    const [existing] = await db.select().from(agreements).where(eq(agreements.key, key));
    
    if (existing) {
      const [updated] = await db.update(agreements)
        .set({ title, content, updatedAt: new Date() })
        .where(eq(agreements.key, key))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(agreements)
        .values({ key, title, content })
        .returning();
      return created;
    }
  }
  
  // Feedback operations
  async getAllFeedback(): Promise<OrderFeedback[]> {
    return await db.select().from(orderFeedback).orderBy(desc(orderFeedback.createdAt));
  }
  
  async getFeedbackByOrderId(orderId: string): Promise<OrderFeedback | undefined> {
    const [feedback] = await db.select().from(orderFeedback).where(eq(orderFeedback.orderId, orderId));
    return feedback;
  }
  
  async getFeedbackByNodeId(nodeId: string): Promise<OrderFeedback[]> {
    return await db.select().from(orderFeedback).where(eq(orderFeedback.nodeId, nodeId)).orderBy(desc(orderFeedback.createdAt));
  }
  
  async createFeedback(feedback: InsertOrderFeedback): Promise<OrderFeedback> {
    const [created] = await db.insert(orderFeedback).values(feedback).returning();
    return created;
  }
  
  // Listing template operations
  async getAllListingTemplates(): Promise<ListingTemplate[]> {
    return await db.select().from(listingTemplates).orderBy(desc(listingTemplates.createdAt));
  }
  
  async getListingTemplate(id: string): Promise<ListingTemplate | undefined> {
    const [template] = await db.select().from(listingTemplates).where(eq(listingTemplates.id, id));
    return template;
  }
  
  async createListingTemplate(template: InsertListingTemplate): Promise<ListingTemplate> {
    const [created] = await db.insert(listingTemplates).values(template).returning();
    return created;
  }
  
  async updateListingTemplate(id: string, template: Partial<InsertListingTemplate>): Promise<ListingTemplate | undefined> {
    const [updated] = await db.update(listingTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(eq(listingTemplates.id, id))
      .returning();
    return updated;
  }
  
  async deleteListingTemplate(id: string): Promise<boolean> {
    const result = await db.delete(listingTemplates).where(eq(listingTemplates.id, id));
    return true;
  }
  
  // Category operations
  async getAllCategories(): Promise<Category[]> {
    return await db.select().from(categories).orderBy(categories.sortOrder, categories.name);
  }
  
  async reorderCategories(orderedIds: string[]): Promise<boolean> {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.update(categories).set({ sortOrder: i }).where(eq(categories.id, orderedIds[i]));
    }
    return true;
  }
  
  async reorderProducts(orderedIds: string[]): Promise<boolean> {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.update(products).set({ sortOrder: i }).where(eq(products.id, orderedIds[i]));
    }
    return true;
  }
  
  async getCategory(id: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category;
  }
  
  async createCategory(category: InsertCategory): Promise<Category> {
    const [created] = await db.insert(categories).values(category).returning();
    return created;
  }
  
  async updateCategory(id: string, category: Partial<InsertCategory>): Promise<Category | undefined> {
    const [updated] = await db.update(categories)
      .set(category)
      .where(eq(categories.id, id))
      .returning();
    return updated;
  }
  
  async deleteCategory(id: string): Promise<boolean> {
    await db.delete(categories).where(eq(categories.id, id));
    return true;
  }
  
  // Promo code operations
  async getAllPromoCodes(): Promise<PromoCode[]> {
    return await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
  }
  
  async getPromoCode(id: string): Promise<PromoCode | undefined> {
    const [promoCode] = await db.select().from(promoCodes).where(eq(promoCodes.id, id));
    return promoCode;
  }
  
  async getPromoCodeByCode(code: string): Promise<PromoCode | undefined> {
    const [promoCode] = await db.select().from(promoCodes).where(
      eq(sql`LOWER(${promoCodes.code})`, code.toLowerCase())
    );
    return promoCode;
  }

  async getPromoCodesByNodeId(nodeId: string): Promise<PromoCode[]> {
    return await db.select().from(promoCodes)
      .where(eq(promoCodes.assignedNodeId, nodeId))
      .orderBy(desc(promoCodes.createdAt));
  }
  
  async createPromoCode(promoCode: InsertPromoCode): Promise<PromoCode> {
    const [created] = await db.insert(promoCodes).values(promoCode).returning();
    return created;
  }
  
  async updatePromoCode(id: string, updateData: Partial<InsertPromoCode>): Promise<PromoCode | undefined> {
    const [updated] = await db.update(promoCodes)
      .set(updateData)
      .where(eq(promoCodes.id, id))
      .returning();
    return updated;
  }
  
  async deletePromoCode(id: string): Promise<boolean> {
    await db.delete(promoCodes).where(eq(promoCodes.id, id));
    return true;
  }
  
  async incrementPromoCodeUsage(id: string): Promise<PromoCode | undefined> {
    const [updated] = await db.update(promoCodes)
      .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
      .where(eq(promoCodes.id, id))
      .returning();
    return updated;
  }
  
  async getPromoCodesByBatchId(batchId: string): Promise<PromoCode[]> {
    return await db.select().from(promoCodes)
      .where(eq(promoCodes.batchId, batchId))
      .orderBy(promoCodes.code);
  }

  async updatePromoCodeGivenOut(id: string, givenOut: boolean): Promise<PromoCode | undefined> {
    const [updated] = await db.update(promoCodes)
      .set({ givenOut })
      .where(eq(promoCodes.id, id))
      .returning();
    return updated;
  }

  async getPromoCodeUsageCount(promoCodeId: string, userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(promoCodeUsages)
      .where(and(
        eq(promoCodeUsages.promoCodeId, promoCodeId),
        eq(promoCodeUsages.userId, userId)
      ));
    return Number(result[0]?.count || 0);
  }
  
  async recordPromoCodeUsage(promoCodeId: string, userId: string, orderId?: string): Promise<PromoCodeUsage> {
    const [usage] = await db.insert(promoCodeUsages).values({
      promoCodeId,
      userId,
      orderId: orderId || null,
    }).returning();
    return usage;
  }
  
  // Invite token operations
  async getAllInviteTokens(): Promise<InviteToken[]> {
    return db.select().from(inviteTokens).orderBy(desc(inviteTokens.createdAt));
  }
  
  async getInviteToken(id: string): Promise<InviteToken | undefined> {
    const [token] = await db.select().from(inviteTokens).where(eq(inviteTokens.id, id));
    return token;
  }
  
  async getInviteTokenByToken(token: string): Promise<InviteToken | undefined> {
    const [invite] = await db.select().from(inviteTokens).where(eq(inviteTokens.token, token));
    return invite;
  }
  
  async createInviteToken(invite: InsertInviteToken): Promise<InviteToken> {
    const [created] = await db.insert(inviteTokens).values(invite).returning();
    return created;
  }
  
  async useInviteToken(token: string, userId: string): Promise<InviteToken | undefined> {
    const [updated] = await db.update(inviteTokens)
      .set({ usedAt: new Date(), usedByUserId: userId })
      .where(and(
        eq(inviteTokens.token, token),
        isNull(inviteTokens.usedAt)
      ))
      .returning();
    return updated;
  }
  
  async deleteInviteToken(id: string): Promise<boolean> {
    await db.delete(inviteTokens).where(eq(inviteTokens.id, id));
    return true;
  }
  
  // User address operations
  async getUserAddresses(userId: string): Promise<UserAddress[]> {
    return db.select().from(userAddresses).where(eq(userAddresses.userId, userId)).orderBy(desc(userAddresses.isDefault), desc(userAddresses.createdAt));
  }
  
  async getUserAddress(id: string): Promise<UserAddress | undefined> {
    const [address] = await db.select().from(userAddresses).where(eq(userAddresses.id, id));
    return address;
  }
  
  async createUserAddress(address: InsertUserAddress): Promise<UserAddress> {
    const [created] = await db.insert(userAddresses).values(address).returning();
    return created;
  }
  
  async updateUserAddress(id: string, address: Partial<InsertUserAddress>): Promise<UserAddress | undefined> {
    const [updated] = await db.update(userAddresses).set(address).where(eq(userAddresses.id, id)).returning();
    return updated;
  }
  
  async deleteUserAddress(id: string): Promise<boolean> {
    await db.delete(userAddresses).where(eq(userAddresses.id, id));
    return true;
  }
  
  async clearDefaultAddresses(userId: string): Promise<void> {
    await db.update(userAddresses).set({ isDefault: false }).where(eq(userAddresses.userId, userId));
  }
  
  // Phone verification code operations
  async getVerificationCode(phone: string): Promise<PhoneVerificationCode | undefined> {
    const [code] = await db.select().from(phoneVerificationCodes).where(eq(phoneVerificationCodes.phone, phone));
    return code;
  }
  
  async saveVerificationCode(phone: string, code: string, expiresAt: Date): Promise<PhoneVerificationCode> {
    // Delete any existing code for this phone first
    await db.delete(phoneVerificationCodes).where(eq(phoneVerificationCodes.phone, phone));
    // Insert new code
    const [created] = await db.insert(phoneVerificationCodes).values({
      phone,
      code,
      expiresAt,
      attempts: 0,
    }).returning();
    return created;
  }
  
  async deleteVerificationCode(phone: string): Promise<boolean> {
    await db.delete(phoneVerificationCodes).where(eq(phoneVerificationCodes.phone, phone));
    return true;
  }
  
  async incrementVerificationAttempts(phone: string): Promise<void> {
    await db.update(phoneVerificationCodes)
      .set({ attempts: sql`${phoneVerificationCodes.attempts} + 1` })
      .where(eq(phoneVerificationCodes.phone, phone));
  }
  
  // Screening question operations
  async getAllScreeningQuestions(): Promise<ScreeningQuestion[]> {
    return await db.select().from(screeningQuestions).orderBy(screeningQuestions.sortOrder);
  }
  
  async getActiveScreeningQuestions(): Promise<ScreeningQuestion[]> {
    return await db.select().from(screeningQuestions)
      .where(eq(screeningQuestions.isActive, true))
      .orderBy(screeningQuestions.sortOrder);
  }
  
  async getScreeningQuestion(id: string): Promise<ScreeningQuestion | undefined> {
    const [question] = await db.select().from(screeningQuestions).where(eq(screeningQuestions.id, id));
    return question;
  }
  
  async createScreeningQuestion(question: InsertScreeningQuestion): Promise<ScreeningQuestion> {
    const [created] = await db.insert(screeningQuestions).values(question).returning();
    return created;
  }
  
  async updateScreeningQuestion(id: string, question: Partial<InsertScreeningQuestion>): Promise<ScreeningQuestion | undefined> {
    const [updated] = await db.update(screeningQuestions)
      .set({ ...question, updatedAt: new Date() })
      .where(eq(screeningQuestions.id, id))
      .returning();
    return updated;
  }
  
  async deleteScreeningQuestion(id: string): Promise<boolean> {
    await db.delete(screeningQuestions).where(eq(screeningQuestions.id, id));
    return true;
  }
  
  // Primary screening question operations
  async getAllPrimaryScreeningQuestions(): Promise<PrimaryScreeningQuestion[]> {
    return await db.select().from(primaryScreeningQuestions).orderBy(primaryScreeningQuestions.sortOrder);
  }
  
  async getActivePrimaryScreeningQuestions(): Promise<PrimaryScreeningQuestion[]> {
    return await db.select().from(primaryScreeningQuestions)
      .where(eq(primaryScreeningQuestions.isActive, true))
      .orderBy(primaryScreeningQuestions.sortOrder);
  }
  
  async getPrimaryScreeningQuestion(id: string): Promise<PrimaryScreeningQuestion | undefined> {
    const [question] = await db.select().from(primaryScreeningQuestions).where(eq(primaryScreeningQuestions.id, id));
    return question;
  }
  
  async createPrimaryScreeningQuestion(question: InsertPrimaryScreeningQuestion): Promise<PrimaryScreeningQuestion> {
    const [created] = await db.insert(primaryScreeningQuestions).values(question).returning();
    return created;
  }
  
  async updatePrimaryScreeningQuestion(id: string, question: Partial<InsertPrimaryScreeningQuestion>): Promise<PrimaryScreeningQuestion | undefined> {
    const [updated] = await db.update(primaryScreeningQuestions)
      .set({ ...question, updatedAt: new Date() })
      .where(eq(primaryScreeningQuestions.id, id))
      .returning();
    return updated;
  }
  
  async deletePrimaryScreeningQuestion(id: string): Promise<boolean> {
    await db.delete(primaryScreeningQuestions).where(eq(primaryScreeningQuestions.id, id));
    return true;
  }

  async getServingCities(): Promise<ServingCity[]> {
    return await db.select().from(servingCities).orderBy(servingCities.sortOrder);
  }

  async getServingCity(id: string): Promise<ServingCity | undefined> {
    const [city] = await db.select().from(servingCities).where(eq(servingCities.id, id));
    return city;
  }

  async createServingCity(city: InsertServingCity): Promise<ServingCity> {
    const [created] = await db.insert(servingCities).values(city).returning();
    return created;
  }

  async updateServingCity(id: string, city: Partial<InsertServingCity>): Promise<ServingCity | undefined> {
    const [updated] = await db.update(servingCities).set(city).where(eq(servingCities.id, id)).returning();
    return updated;
  }

  async deleteServingCity(id: string): Promise<boolean> {
    await db.delete(servingCities).where(eq(servingCities.id, id));
    return true;
  }
  
  // Screening link operations
  async getScreeningLink(id: string): Promise<ScreeningLink | undefined> {
    const [link] = await db.select().from(screeningLinks).where(eq(screeningLinks.id, id));
    return link;
  }
  
  async getScreeningLinkByToken(token: string): Promise<ScreeningLink | undefined> {
    const [link] = await db.select().from(screeningLinks).where(eq(screeningLinks.token, token));
    return link;
  }
  
  async getScreeningLinkByApplication(applicationId: string): Promise<ScreeningLink | undefined> {
    const [link] = await db.select().from(screeningLinks).where(eq(screeningLinks.applicationId, applicationId));
    return link;
  }
  
  async createScreeningLink(link: InsertScreeningLink): Promise<ScreeningLink> {
    const [created] = await db.insert(screeningLinks).values(link).returning();
    return created;
  }
  
  async markScreeningLinkCompleted(id: string, name?: string, email?: string): Promise<ScreeningLink | undefined> {
    const updateData: any = { completedAt: new Date() };
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    
    const [updated] = await db.update(screeningLinks)
      .set(updateData)
      .where(eq(screeningLinks.id, id))
      .returning();
    return updated;
  }
  
  async deleteScreeningLink(id: string): Promise<boolean> {
    await db.delete(screeningResponses).where(eq(screeningResponses.linkId, id));
    const result = await db.delete(screeningLinks).where(eq(screeningLinks.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }
  
  async getAllScreeningLinks(): Promise<ScreeningLink[]> {
    return await db.select().from(screeningLinks).orderBy(sql`${screeningLinks.createdAt} DESC`);
  }
  
  async getScreeningResponsesByLink(linkId: string): Promise<(ScreeningResponse & { question?: ScreeningQuestion })[]> {
    const responses = await db.select().from(screeningResponses).where(eq(screeningResponses.linkId, linkId));
    const questions = await db.select().from(screeningQuestions);
    const questionMap = new Map(questions.map(q => [q.id, q]));
    return responses.map(r => ({ ...r, question: questionMap.get(r.questionId) }));
  }
  
  // Screening response operations
  async getScreeningResponses(linkId: string): Promise<ScreeningResponse[]> {
    return await db.select().from(screeningResponses).where(eq(screeningResponses.linkId, linkId));
  }
  
  async createScreeningResponses(responses: InsertScreeningResponse[]): Promise<ScreeningResponse[]> {
    if (responses.length === 0) return [];
    const created = await db.insert(screeningResponses).values(responses).returning();
    return created;
  }
  
  // Site settings operations
  async getSiteSetting(key: string): Promise<string | null> {
    const [setting] = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
    return setting?.value ?? null;
  }
  
  async setSiteSetting(key: string, value: string): Promise<void> {
    await db.insert(siteSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
  }
  
  async getAllSiteSettings(): Promise<Record<string, string>> {
    const settings = await db.select().from(siteSettings);
    return Object.fromEntries(settings.map(s => [s.key, s.value]));
  }
  
  // User preferences operations
  async getUserPreference(userId: string, key: string): Promise<string | null> {
    const [pref] = await db.select().from(userPreferences)
      .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)));
    return pref?.value ?? null;
  }
  
  async setUserPreference(userId: string, key: string, value: string): Promise<void> {
    const existing = await db.select().from(userPreferences)
      .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)));
    
    if (existing.length > 0) {
      await db.update(userPreferences)
        .set({ value, updatedAt: new Date() })
        .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)));
    } else {
      await db.insert(userPreferences).values({ userId, key, value });
    }
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async getUserNotifications(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async markNotificationRead(id: string, userId: string): Promise<void> {
    await db.update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async getSocialFbAccounts(): Promise<SocialFbAccount[]> {
    return await db.select().from(socialFbAccounts).orderBy(socialFbAccounts.name);
  }

  async createSocialFbAccount(account: InsertSocialFbAccount): Promise<SocialFbAccount> {
    const [created] = await db.insert(socialFbAccounts).values(account).returning();
    return created;
  }

  async updateSocialFbAccount(id: string, data: Partial<InsertSocialFbAccount>): Promise<SocialFbAccount | undefined> {
    const [updated] = await db.update(socialFbAccounts).set(data).where(eq(socialFbAccounts.id, id)).returning();
    return updated;
  }

  async deleteSocialFbAccount(id: string): Promise<void> {
    await db.delete(socialFbAccounts).where(eq(socialFbAccounts.id, id));
  }

  async getSocialGroups(): Promise<SocialGroup[]> {
    return await db.select().from(socialGroups).orderBy(socialGroups.createdAt);
  }

  async getSocialCategories(): Promise<SocialCategory[]> {
    return await db.select().from(socialCategories).orderBy(socialCategories.name);
  }

  async createSocialCategory(cat: InsertSocialCategory): Promise<SocialCategory> {
    const [created] = await db.insert(socialCategories).values(cat).returning();
    return created;
  }

  async updateSocialCategory(id: string, data: Partial<InsertSocialCategory>): Promise<SocialCategory | undefined> {
    const [updated] = await db.update(socialCategories).set(data).where(eq(socialCategories.id, id)).returning();
    return updated;
  }

  async deleteSocialCategory(id: string): Promise<void> {
    await db.delete(socialCategories).where(eq(socialCategories.id, id));
  }

  async createSocialGroup(group: InsertSocialGroup): Promise<SocialGroup> {
    const [created] = await db.insert(socialGroups).values(group).returning();
    return created;
  }

  async updateSocialGroup(id: string, data: Partial<InsertSocialGroup>): Promise<SocialGroup | undefined> {
    const [updated] = await db.update(socialGroups).set(data).where(eq(socialGroups.id, id)).returning();
    return updated;
  }

  async deleteSocialGroup(id: string): Promise<void> {
    await db.delete(socialGroups).where(eq(socialGroups.id, id));
  }

  async getSocialPosts(): Promise<SocialPost[]> {
    return await db.select().from(socialPosts).orderBy(desc(socialPosts.createdAt));
  }

  async createSocialPost(post: InsertSocialPost): Promise<SocialPost> {
    const [created] = await db.insert(socialPosts).values(post).returning();
    return created;
  }

  async updateSocialPost(id: string, data: Partial<InsertSocialPost>): Promise<SocialPost | undefined> {
    const [updated] = await db.update(socialPosts).set(data).where(eq(socialPosts.id, id)).returning();
    return updated;
  }

  async deleteSocialPost(id: string): Promise<void> {
    await db.delete(socialPosts).where(eq(socialPosts.id, id));
  }

  async getHostPayments(): Promise<HostPayment[]> {
    return await db.select().from(hostPayments).orderBy(desc(hostPayments.paidAt));
  }

  async createHostPayment(payment: InsertHostPayment): Promise<HostPayment> {
    const [created] = await db.insert(hostPayments).values(payment).returning();
    return created;
  }

  async updateHostPayment(id: string, data: Partial<InsertHostPayment>): Promise<HostPayment | undefined> {
    const [updated] = await db.update(hostPayments).set(data).where(eq(hostPayments.id, id)).returning();
    return updated;
  }

  async deleteHostPayment(id: string): Promise<void> {
    await db.delete(hostPayments).where(eq(hostPayments.id, id));
  }

  async getAllLandingPages(): Promise<LandingPage[]> {
    return await db.select().from(landingPages).orderBy(desc(landingPages.createdAt));
  }

  async getLandingPageBySlug(slug: string): Promise<LandingPage | undefined> {
    const [page] = await db.select().from(landingPages).where(eq(landingPages.slug, slug));
    return page;
  }

  async getLandingPage(id: string): Promise<LandingPage | undefined> {
    const [page] = await db.select().from(landingPages).where(eq(landingPages.id, id));
    return page;
  }

  async createLandingPage(page: InsertLandingPage): Promise<LandingPage> {
    const [created] = await db.insert(landingPages).values(page).returning();
    return created;
  }

  async updateLandingPage(id: string, data: Partial<InsertLandingPage>): Promise<LandingPage | undefined> {
    const [updated] = await db.update(landingPages).set(data).where(eq(landingPages.id, id)).returning();
    return updated;
  }

  async deleteLandingPage(id: string): Promise<void> {
    await db.delete(landingPages).where(eq(landingPages.id, id));
  }

  async getAllSavedQrCodes(): Promise<SavedQrCode[]> {
    return await db.select().from(savedQrCodes).orderBy(desc(savedQrCodes.createdAt));
  }

  async createSavedQrCode(qr: InsertSavedQrCode): Promise<SavedQrCode> {
    const [created] = await db.insert(savedQrCodes).values(qr).returning();
    return created;
  }

  async deleteSavedQrCode(id: string): Promise<void> {
    await db.delete(savedQrCodes).where(eq(savedQrCodes.id, id));
  }
}

export const storage = new DBStorage();
