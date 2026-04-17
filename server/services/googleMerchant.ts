import { google } from 'googleapis';
import { objectStorageClient } from '../replit_integrations/object_storage/objectStorage';
import { randomUUID } from 'crypto';
import { productUrl as makeProductUrl } from '../../shared/slugify';

interface ProductData {
  id: string;
  productCode: string;
  name: string;
  description: string;
  price: string;
  image: string;
  images?: string[];
  category?: string;
  condition?: string;
  brand?: string;
  quantity?: number;
  // Variant fields
  parentProductId?: string | null;
  parentProductCode?: string | null;
  variantName?: string | null;
  variantSuffix?: string | null;
  colors?: Array<{ name: string; hex: string }> | null;
}

interface SyncResult {
  success: boolean;
  productId: string;
  productCode: string;
  error?: string;
}

class GoogleMerchantService {
  private auth: any;
  private content: any;
  private merchantId: string | null = null;
  private initialized = false;

  // Check if URL is a base64 data URI
  private isBase64Image(url: string): boolean {
    return url?.startsWith('data:image/');
  }

  // Upload base64 image to object storage and return URL
  private async uploadBase64Image(base64Data: string, productCode: string, siteUrl: string): Promise<string | null> {
    try {
      // Extract mime type and data from base64 string
      const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        console.log(`[Google Merchant] Invalid base64 format for ${productCode}`);
        return null;
      }
      
      const [, format, data] = matches;
      const extension = format === 'jpeg' ? 'jpg' : format;
      const buffer = Buffer.from(data, 'base64');
      
      // Generate unique filename - use sanitized product code
      const safeProductCode = productCode.replace(/[^a-zA-Z0-9-]/g, '_');
      const filename = `google-merchant/${safeProductCode}-${randomUUID()}.${extension}`;
      
      // Get bucket name from env
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) {
        console.log(`[Google Merchant] Object storage not configured`);
        return null;
      }
      
      // Upload to public directory
      const bucket = objectStorageClient.bucket(bucketId);
      const file = bucket.file(`public/${filename}`);
      
      await file.save(buffer, {
        metadata: {
          contentType: `image/${format}`,
        },
        public: true,
      });
      
      // Make the file public
      await file.makePublic();
      
      // Return the direct GCS public URL
      const publicUrl = `https://storage.googleapis.com/${bucketId}/public/${filename}`;
      console.log(`[Google Merchant] Uploaded base64 image for ${productCode}: ${publicUrl}`);
      return publicUrl;
    } catch (error: any) {
      console.error(`[Google Merchant] Failed to upload base64 image for ${productCode}:`, error.message);
      return null;
    }
  }

  async initialize() {
    if (this.initialized) return true;

    const credentialsJson = process.env.GOOGLE_MERCHANT_PRIVATE_KEY;
    const clientEmailEnv = process.env.GOOGLE_MERCHANT_CLIENT_EMAIL;
    this.merchantId = process.env.GOOGLE_MERCHANT_ACCOUNT_ID || null;

    console.log('[Google Merchant] Init check - has privateKey:', !!credentialsJson, 'has merchantId:', !!this.merchantId, 'has clientEmail:', !!clientEmailEnv);

    if (!credentialsJson || !this.merchantId) {
      console.log('[Google Merchant] Missing credentials - service not initialized');
      return false;
    }

    try {
      let privateKey: string;
      let clientEmail: string;

      // Try to parse as JSON first (full credentials file)
      try {
        const credentials = JSON.parse(credentialsJson);
        privateKey = credentials.private_key;
        clientEmail = credentials.client_email;
        console.log('[Google Merchant] Parsed credentials from JSON file');
      } catch {
        // Fall back to treating it as just the private key
        privateKey = credentialsJson;
        clientEmail = clientEmailEnv || '';
        console.log('[Google Merchant] Using separate private key and email');
      }

      if (!privateKey || !clientEmail) {
        console.error('[Google Merchant] Missing private key or client email');
        return false;
      }

      this.auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/content'],
      });

      this.content = google.content({
        version: 'v2.1',
        auth: this.auth,
      });

      this.initialized = true;
      console.log(`[Google Merchant] Initialized for merchant ID: ${this.merchantId}`);
      return true;
    } catch (error) {
      console.error('[Google Merchant] Initialization error:', error);
      return false;
    }
  }

  isConfigured(): boolean {
    return this.initialized && this.merchantId !== null;
  }

  // Clean description text for Google Merchant
  private cleanDescription(text: string): string {
    if (!text) return '';
    // Remove HTML tags
    let cleaned = text.replace(/<[^>]*>/g, ' ');
    // Decode HTML entities
    cleaned = cleaned.replace(/&nbsp;/g, ' ')
                     .replace(/&amp;/g, '&')
                     .replace(/&lt;/g, '<')
                     .replace(/&gt;/g, '>')
                     .replace(/&quot;/g, '"')
                     .replace(/&#39;/g, "'");
    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
  }

  async syncProduct(product: ProductData, siteUrl: string): Promise<SyncResult> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.merchantId) {
        throw new Error('Merchant ID not configured');
      }

      const prodUrl = `${siteUrl}${makeProductUrl(product)}`;
      
      // Map availability based on quantity
      const quantity = product.quantity || 0;
      const availability = quantity > 0 ? 'in_stock' : 'out_of_stock';

      // Map condition
      const conditionMap: Record<string, string> = {
        'New': 'new',
        'Like New': 'used',
        'Good': 'used',
        'Fair': 'used',
      };

      // Google Merchant max URL length is 2000 characters
      const MAX_URL_LENGTH = 2000;
      
      // Helper to convert relative URLs to absolute URLs
      const toAbsoluteUrl = (url: string): string => {
        if (!url) return '';
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return url;
        }
        if (url.startsWith('/')) {
          return `${siteUrl}${url}`;
        }
        return `${siteUrl}/${url}`;
      };
      
      // Helper to check if URL is valid for Google Merchant
      const isValidImageUrl = (url: string): boolean => {
        if (!url || url.length === 0) return false;
        if (this.isBase64Image(url)) return false;
        if (url.length > MAX_URL_LENGTH) {
          console.log(`[Google Merchant] Skipping image URL (too long: ${url.length} chars)`);
          return false;
        }
        return true;
      };
      
      // Process image - convert base64 to URL if needed
      const processImage = async (url: string): Promise<string | null> => {
        if (!url) return null;
        
        // Handle base64 images - upload to object storage
        if (this.isBase64Image(url)) {
          const uploadedUrl = await this.uploadBase64Image(url, product.productCode, siteUrl);
          return uploadedUrl;
        }
        
        // Convert relative URLs to absolute
        const absoluteUrl = toAbsoluteUrl(url);
        
        // Check length
        if (absoluteUrl.length > MAX_URL_LENGTH) {
          console.log(`[Google Merchant] Skipping image URL (too long: ${absoluteUrl.length} chars)`);
          return null;
        }
        
        return absoluteUrl;
      };

      // Process main image
      let imageLink = await processImage(product.image);
      
      // If main image failed, try additional images
      if (!imageLink) {
        for (const img of (product.images || [])) {
          const processed = await processImage(img);
          if (processed) {
            imageLink = processed;
            break;
          }
        }
      }
      
      // Process additional images
      const additionalImages: string[] = [];
      for (const img of (product.images?.slice(1, 10) || [])) {
        const processed = await processImage(img);
        if (processed) {
          additionalImages.push(processed);
        }
      }

      const requestBody: Record<string, any> = {
        offerId: product.productCode || product.id,
        title: product.name.substring(0, 150),
        description: this.cleanDescription(product.description).substring(0, 5000),
        link: prodUrl,
        imageLink: imageLink,
        additionalImageLinks: additionalImages,
        availability: availability,
        condition: conditionMap[product.condition || 'New'] || 'new',
        price: {
          value: parseFloat(product.price).toFixed(2),
          currency: 'CAD',
        },
        brand: product.brand || 'GridMart',
        contentLanguage: 'en',
        targetCountry: 'CA',
        channel: 'online',
      };
      
      // Add variant attributes if this is a variant product
      // Determine itemGroupId: use parent's code, or extract base code if this product has a suffix
      let itemGroupId: string | null = null;
      
      if (product.parentProductCode) {
        // Child variant - use parent's product code as group ID
        itemGroupId = product.parentProductCode;
      } else if (product.variantSuffix && product.productCode) {
        // Parent with suffix - extract base code (remove the suffix portion)
        const suffix = `-${product.variantSuffix}`;
        if (product.productCode.endsWith(suffix)) {
          itemGroupId = product.productCode.slice(0, -suffix.length);
        } else {
          itemGroupId = product.productCode.replace(/-[^-]+$/, '');
        }
      }
      
      if (itemGroupId) {
        requestBody.itemGroupId = itemGroupId;
        
        // Add color attribute from variantName or first color in colors array
        if (product.variantName) {
          requestBody.color = product.variantName;
        } else if (product.colors && product.colors.length > 0) {
          requestBody.color = product.colors[0].name;
        }
        
        console.log(`[Google Merchant] Variant ${product.productCode} linked to group ${itemGroupId}`);
      } else if (product.colors && product.colors.length > 0) {
        // Standalone product with color - add as color attribute
        requestBody.color = product.colors[0].name;
      }

      await this.content.products.insert({
        merchantId: this.merchantId,
        requestBody,
      });

      return {
        success: true,
        productId: product.id,
        productCode: product.productCode,
      };
    } catch (error: any) {
      const errorDetails = error.errors?.[0]?.message || error.message || 'Unknown error';
      console.error(`[Google Merchant] Failed to sync ${product.productCode}:`, errorDetails);
      if (error.response?.data) {
        console.error(`[Google Merchant] Full error:`, JSON.stringify(error.response.data, null, 2));
      }
      return {
        success: false,
        productId: product.id,
        productCode: product.productCode,
        error: errorDetails,
      };
    }
  }

  async syncProducts(products: ProductData[], siteUrl: string): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: SyncResult[];
  }> {
    const results: SyncResult[] = [];
    
    for (const product of products) {
      const result = await this.syncProduct(product, siteUrl);
      results.push(result);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[Google Merchant] Sync complete: ${successful} successful, ${failed} failed`);

    return {
      total: products.length,
      successful,
      failed,
      results,
    };
  }

  async listProducts(): Promise<any[]> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.merchantId) {
        throw new Error('Merchant ID not configured');
      }

      const response = await this.content.products.list({
        merchantId: this.merchantId,
      });

      return response.data.resources || [];
    } catch (error) {
      console.error('[Google Merchant] Failed to list products:', error);
      throw error;
    }
  }

  async syncLocalProduct(product: ProductData, siteUrl: string): Promise<SyncResult> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      if (!this.merchantId) {
        throw new Error('Merchant ID not configured');
      }

      const prodUrl = `${siteUrl}${makeProductUrl(product)}`;
      const quantity = product.quantity || 0;
      const availability = quantity > 0 ? 'in_stock' : 'out_of_stock';

      const conditionMap: Record<string, string> = {
        'New': 'new',
        'Like New': 'used',
        'Good': 'used',
        'Fair': 'used',
      };

      const toAbsoluteUrl = (url: string): string => {
        if (!url) return '';
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('/')) return `${siteUrl}${url}`;
        return `${siteUrl}/${url}`;
      };

      const processImage = async (url: string): Promise<string | null> => {
        if (!url) return null;
        if (this.isBase64Image(url)) {
          return await this.uploadBase64Image(url, product.productCode, siteUrl);
        }
        const absoluteUrl = toAbsoluteUrl(url);
        if (absoluteUrl.length > 2000) return null;
        return absoluteUrl;
      };

      let imageLink = await processImage(product.image);
      if (!imageLink) {
        for (const img of (product.images || [])) {
          const processed = await processImage(img);
          if (processed) { imageLink = processed; break; }
        }
      }

      const requestBody: Record<string, any> = {
        offerId: product.productCode || product.id,
        title: product.name.substring(0, 150),
        description: this.cleanDescription(product.description).substring(0, 5000),
        link: prodUrl,
        imageLink: imageLink,
        availability: availability,
        condition: conditionMap[product.condition || 'New'] || 'new',
        price: {
          value: parseFloat(product.price).toFixed(2),
          currency: 'CAD',
        },
        brand: product.brand || 'GridMart',
        contentLanguage: 'en',
        targetCountry: 'CA',
        channel: 'local',
      };

      await this.content.products.insert({
        merchantId: this.merchantId,
        requestBody,
      });

      console.log(`[Google Merchant] Local product synced: ${product.productCode}`);
      return { success: true, productId: product.id, productCode: product.productCode };
    } catch (error: any) {
      const errorDetails = error.errors?.[0]?.message || error.message || 'Unknown error';
      console.error(`[Google Merchant] Failed to sync local product ${product.productCode}:`, errorDetails);
      return { success: false, productId: product.id, productCode: product.productCode, error: errorDetails };
    }
  }

  async insertLocalInventory(productCode: string, storeCode: string, quantity: number, pickupMethod: string = 'buy', pickupSla: string = 'same day'): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      if (!this.merchantId) {
        throw new Error('Merchant ID not configured');
      }

      const productId = `local:en:CA:${productCode}`;
      const availability = quantity > 0 ? 'inStock' : 'outOfStock';

      await this.content.localinventory.insert({
        merchantId: this.merchantId,
        productId: productId,
        requestBody: {
          storeCode: storeCode,
          availability: availability,
          quantity: quantity,
          pickupMethod: pickupMethod,
          pickupSla: pickupSla,
        },
      });

      console.log(`[Google Merchant] Local inventory updated: ${productCode} @ ${storeCode} = ${quantity}`);
      return { success: true };
    } catch (error: any) {
      const errorDetails = error.errors?.[0]?.message || error.message || 'Unknown error';
      console.error(`[Google Merchant] Failed to update local inventory ${productCode} @ ${storeCode}:`, errorDetails);
      return { success: false, error: errorDetails };
    }
  }

  async syncAllLocalInventory(inventoryData: Array<{
    product: ProductData;
    storeCode: string;
    quantity: number;
  }>, siteUrl: string): Promise<{
    productsSync: { total: number; successful: number; failed: number };
    inventorySync: { total: number; successful: number; failed: number };
    results: Array<{ productCode: string; storeCode: string; success: boolean; error?: string }>;
  }> {
    const syncedProducts = new Set<string>();
    let prodSuccess = 0, prodFail = 0;
    const results: Array<{ productCode: string; storeCode: string; success: boolean; error?: string }> = [];

    for (const item of inventoryData) {
      if (!syncedProducts.has(item.product.productCode)) {
        const prodResult = await this.syncLocalProduct(item.product, siteUrl);
        if (prodResult.success) prodSuccess++;
        else prodFail++;
        syncedProducts.add(item.product.productCode);
      }

      const invResult = await this.insertLocalInventory(
        item.product.productCode,
        item.storeCode,
        item.quantity,
      );
      results.push({
        productCode: item.product.productCode,
        storeCode: item.storeCode,
        success: invResult.success,
        error: invResult.error,
      });
    }

    const invSuccess = results.filter(r => r.success).length;
    const invFail = results.filter(r => !r.success).length;

    console.log(`[Google Merchant] Local inventory sync: ${syncedProducts.size} products (${prodSuccess} ok, ${prodFail} fail), ${results.length} inventory entries (${invSuccess} ok, ${invFail} fail)`);

    return {
      productsSync: { total: syncedProducts.size, successful: prodSuccess, failed: prodFail },
      inventorySync: { total: results.length, successful: invSuccess, failed: invFail },
      results,
    };
  }

  async deleteProduct(productId: string): Promise<boolean> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.merchantId) {
        throw new Error('Merchant ID not configured');
      }

      await this.content.products.delete({
        merchantId: this.merchantId,
        productId: `online:en:CA:${productId}`,
      });

      return true;
    } catch (error) {
      console.error('[Google Merchant] Failed to delete product:', error);
      return false;
    }
  }
}

export const googleMerchantService = new GoogleMerchantService();
