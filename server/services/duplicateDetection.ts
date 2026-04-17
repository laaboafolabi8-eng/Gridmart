// Duplicate Detection Service - identifies similar products and suggests merges
import OpenAI from "openai";

// Lazy-load OpenAI client to avoid initialization errors
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined
    });
  }
  return openaiClient;
}

// Simple text similarity using Jaccard index on word sets
function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2);
}

function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

export function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(normalizeText(text1));
  const words2 = new Set(normalizeText(text2));
  return jaccardSimilarity(words1, words2);
}

// Calculate overall similarity between two product entries
export function calculateProductSimilarity(
  product1: { name: string; description?: string; category?: string; price?: number },
  product2: { name: string; description?: string; category?: string; price?: number }
): number {
  // Name similarity (most important - 50% weight)
  const nameSimilarity = calculateTextSimilarity(product1.name, product2.name);
  
  // Description similarity (25% weight)
  const descSimilarity = product1.description && product2.description
    ? calculateTextSimilarity(product1.description, product2.description)
    : 0;
  
  // Category match (15% weight)
  const categoryMatch = product1.category && product2.category && 
    product1.category.toLowerCase() === product2.category.toLowerCase() ? 1 : 0;
  
  // Price proximity (10% weight) - within 20% is considered similar
  let priceSimilarity = 0;
  if (product1.price && product2.price) {
    const priceDiff = Math.abs(product1.price - product2.price);
    const avgPrice = (product1.price + product2.price) / 2;
    priceSimilarity = avgPrice > 0 ? Math.max(0, 1 - (priceDiff / avgPrice) / 0.2) : 0;
  }
  
  // Weighted average
  return (
    nameSimilarity * 0.5 +
    descSimilarity * 0.25 +
    categoryMatch * 0.15 +
    priceSimilarity * 0.1
  );
}

// Find potential duplicate templates for a new product
export interface DuplicateMatch {
  templateId: string;
  productCode: string;
  name: string;
  similarity: number;
  confidence: 'high' | 'medium' | 'low';
}

export function classifySimilarity(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

// Generate a unique product code (GM-XXXX format)
export function generateProductCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GM-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Extract key product info from sheet row data for comparison
export function extractProductInfo(sheetRow: {
  title?: string;
  name?: string;
  description?: string;
  category?: string;
  price?: number | string;
}): { name: string; description?: string; category?: string; price?: number } {
  return {
    name: sheetRow.title || sheetRow.name || '',
    description: sheetRow.description,
    category: sheetRow.category,
    price: typeof sheetRow.price === 'string' ? parseFloat(sheetRow.price) : sheetRow.price,
  };
}

// AI-based product matching - finds the best existing product match
export interface ProductMatch {
  productId: string;
  productCode: string;
  name: string;
  confidence: number;
  reason: string;
}

export async function findMatchingProductWithAI(
  newProduct: { name: string; description?: string; category?: string },
  existingProducts: { id: string; productCode: string | null; name: string; description?: string; category?: string; canonicalProductId?: string | null }[]
): Promise<ProductMatch | null> {
  // Only consider canonical products (not variants) and those with product codes
  const canonicalProducts = existingProducts.filter(p => !p.canonicalProductId && p.productCode);
  
  if (canonicalProducts.length === 0) {
    return null;
  }
  
  // First, do a quick text similarity check to find candidates
  const candidates = canonicalProducts
    .map(p => ({
      ...p,
      productCode: p.productCode as string, // Already filtered for non-null
      similarity: calculateTextSimilarity(newProduct.name, p.name)
    }))
    .filter(p => p.similarity > 0.3) // Only consider products with some name overlap
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 10); // Top 10 candidates
  
  if (candidates.length === 0) {
    return null;
  }
  
  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a product matching assistant. Given a new product and a list of existing products, determine if any existing product is the same item (just a different listing/variant). Consider brand, model, key specifications, and ignore color/size variations.

Respond with a JSON object: { "matchIndex": number | null, "confidence": number, "reason": string }
- matchIndex: index of the best match in the existing products list (0-based), or null if no match
- confidence: 0-1 score (0.8+ means high confidence match)
- reason: brief explanation

Only match if you're confident it's the same product. Different products that are similar should NOT match.`
        },
        {
          role: "user",
          content: `New product:
Name: ${newProduct.name}
${newProduct.description ? `Description: ${newProduct.description.slice(0, 500)}` : ''}
${newProduct.category ? `Category: ${newProduct.category}` : ''}

Existing products:
${candidates.map((p, i) => `${i}. ${p.name}`).join('\n')}`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 200,
      temperature: 0.1
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    
    const result = JSON.parse(content);
    
    if (result.matchIndex !== null && result.matchIndex >= 0 && result.matchIndex < candidates.length && result.confidence >= 0.75) {
      const matchedProduct = candidates[result.matchIndex];
      return {
        productId: matchedProduct.id,
        productCode: matchedProduct.productCode,
        name: matchedProduct.name,
        confidence: result.confidence,
        reason: result.reason
      };
    }
    
    return null;
  } catch (error) {
    console.error('AI product matching error:', error);
    return null;
  }
}
