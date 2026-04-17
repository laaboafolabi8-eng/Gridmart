import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface ImportedProduct {
  title: string;
  description: string;
  images: string[];
  videos: string[];
  price?: number;
  brand?: string;
  originalUrl: string;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getBrowserHeaders(url: string): Record<string, string> {
  const parsedUrl = new URL(url);
  return {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': `${parsedUrl.protocol}//${parsedUrl.host}/`,
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  maxRetries: number = 3
): Promise<Response> {
  const delays = [1000, 3000, 9000]; // exponential backoff with jitter
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const headers = getBrowserHeaders(url);
      const response = await fetch(url, {
        headers,
        redirect: 'follow',
      });
      
      // 4xx errors are hard fails (except 429 rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }
      
      // 5xx errors and 429 are retriable
      if (!response.ok) {
        if (attempt < maxRetries) {
          const delay = delays[attempt] + Math.random() * 1000;
          console.log(`Retry ${attempt + 1} for ${url} after ${delay}ms (status: ${response.status})`);
          await sleep(delay);
          continue;
        }
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }
      
      return response;
    } catch (error: any) {
      lastError = error;
      
      // Network errors are retriable
      if (error.name === 'FetchError' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        if (attempt < maxRetries) {
          const delay = delays[attempt] + Math.random() * 1000;
          console.log(`Retry ${attempt + 1} for ${url} after ${delay}ms (error: ${error.message})`);
          await sleep(delay);
          continue;
        }
      }
      
      throw error;
    }
  }
  
  throw lastError || new Error('Failed to fetch URL after retries');
}

// Bot detection patterns - if we see these, the site is blocking us
const BOT_DETECTION_PATTERNS = [
  'are you a robot',
  'are you human',
  'captcha',
  'verify you are human',
  'access denied',
  'please verify',
  'unusual traffic',
  'automated access',
  'bot detection',
  'security check',
  'verify yourself',
  'press and hold',
];

function detectBotBlock(html: string, $: cheerio.CheerioAPI): boolean {
  const lowerHtml = html.toLowerCase();
  const title = $('title').text().toLowerCase();
  const h1 = $('h1').first().text().toLowerCase();
  
  // Check for bot detection patterns in title, h1, or page content
  for (const pattern of BOT_DETECTION_PATTERNS) {
    if (title.includes(pattern) || h1.includes(pattern)) {
      return true;
    }
  }
  
  // Check if page has very little content (often a sign of bot block)
  const textContent = $('body').text().replace(/\s+/g, ' ').trim();
  if (textContent.length < 500) {
    for (const pattern of BOT_DETECTION_PATTERNS) {
      if (lowerHtml.includes(pattern)) {
        return true;
      }
    }
  }
  
  return false;
}

function isAliExpressUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('aliexpress.com') || 
           parsed.hostname.includes('aliexpress.ru') ||
           parsed.hostname.includes('aliexpress.us');
  } catch {
    return false;
  }
}

function isAlibabaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('alibaba.com');
  } catch {
    return false;
  }
}

function isTemuUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('temu.com');
  } catch {
    return false;
  }
}

function extractAliExpressProductId(url: string): string | null {
  const patterns = [
    /\/item\/(\d+)\.html/,
    /\/item\/(\d+)/,
    /productId=(\d+)/,
    /\/(\d+)\.html/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function parseAliExpressHtml(html: string, url: string): ImportedProduct | null {
  const $ = cheerio.load(html);

  let title = '';
  let description = '';
  let images: string[] = [];
  let price: number | undefined;

  function fixImgUrl(img: string): string {
    if (img.startsWith('//')) return `https:${img}`;
    return img;
  }

  // Strategy 1: window.runParams (legacy format)
  const runParamsMatch = html.match(/window\.runParams\s*=\s*(\{[\s\S]*?\});?\s*(?:var|window|<\/script>)/);
  if (runParamsMatch) {
    try {
      const jsonStr = runParamsMatch[1].replace(/undefined/g, 'null');
      const runParams = JSON.parse(jsonStr);
      const d = runParams.data;
      if (d) {
        title = d.titleModule?.subject || '';
        description = d.pageModule?.description || '';
        if (d.imageModule?.imagePathList) {
          images = d.imageModule.imagePathList.map(fixImgUrl);
        }
        if (d.priceModule) {
          const ps = d.priceModule.minPrice || d.priceModule.maxPrice || d.priceModule.formattedPrice;
          if (ps) price = parseFloat(String(ps).replace(/[^0-9.]/g, ''));
        }
      }
    } catch (e) {
      console.log('[AliExpress] Failed to parse runParams JSON');
    }
  }

  // Strategy 1b: Direct imagePathList extraction from inline JSON
  if (images.length <= 2) {
    const imgListMatch = html.match(/"imagePathList"\s*:\s*(\[[^\]]+\])/);
    if (imgListMatch) {
      try {
        const imgList = JSON.parse(imgListMatch[1]);
        if (Array.isArray(imgList) && imgList.length > images.length) {
          images = imgList.map(fixImgUrl);
          console.log(`[AliExpress] Found ${images.length} images via direct imagePathList extraction`);
        }
      } catch (e) {}
    }
  }

  // Strategy 1c: Extract title/price from inline JSON patterns
  if (!title) {
    const subjectMatch = html.match(/"subject"\s*:\s*"([^"]{10,300})"/);
    if (subjectMatch) {
      title = subjectMatch[1];
    }
  }

  if (!price) {
    const priceMatch = html.match(/"formattedPrice"\s*:\s*"US\s*\$\s*([0-9.]+)"/);
    if (priceMatch) {
      price = parseFloat(priceMatch[1]);
    }
    if (!price) {
      const minPriceMatch = html.match(/"minPrice"\s*:\s*"?([0-9.]+)"?/);
      if (minPriceMatch) {
        price = parseFloat(minPriceMatch[1]);
      }
    }
  }

  // Strategy 2: window.__INIT_DATA__ (newer AliExpress format)
  if (!title) {
    const initDataMatch = html.match(/window\.__INIT_DATA__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    if (initDataMatch) {
      try {
        const initData = JSON.parse(initDataMatch[1].replace(/undefined/g, 'null'));
        const findProductData = (obj: any): any => {
          if (!obj || typeof obj !== 'object') return null;
          if (obj.productInfoComponent || obj.priceComponent || obj.imageComponent) return obj;
          for (const key of Object.keys(obj)) {
            const found = findProductData(obj[key]);
            if (found) return found;
          }
          return null;
        };
        const productData = findProductData(initData);
        if (productData) {
          title = productData.productInfoComponent?.subject ||
                  productData.titleComponent?.subject || '';
          description = productData.productInfoComponent?.productDescription ||
                        productData.descriptionComponent?.description || '';
          const imgComponent = productData.imageComponent;
          if (imgComponent?.imagePathList) {
            images = imgComponent.imagePathList.map(fixImgUrl);
          }
          const priceComponent = productData.priceComponent;
          if (priceComponent) {
            const ps = priceComponent.discountPrice?.minPrice ||
                       priceComponent.origPrice?.minPrice ||
                       priceComponent.formattedPrice;
            if (ps) price = parseFloat(String(ps).replace(/[^0-9.]/g, ''));
          }
        }
      } catch (e) {
        console.log('[AliExpress] Failed to parse __INIT_DATA__ JSON');
      }
    }
  }

  // Strategy 3: _dida_config_ / data-spm JSON blocks (newer format)
  if (!title) {
    const scriptBlocks = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
    for (const block of scriptBlocks) {
      if (block.includes('"subject"') && (block.includes('"imagePathList"') || block.includes('"imagePath"'))) {
        try {
          const jsonMatch = block.match(/(\{[\s\S]*"subject"[\s\S]*\})/);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[1].replace(/undefined/g, 'null'));
            if (data.subject && typeof data.subject === 'string') {
              title = data.subject;
            }
            if (data.imagePathList && Array.isArray(data.imagePathList)) {
              images = data.imagePathList.map(fixImgUrl);
            }
            if (data.description) {
              description = typeof data.description === 'string' ? data.description : '';
            }
          }
        } catch (e) {}
      }
    }
  }

  // Strategy 4: JSON-LD structured data
  if (!title) {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const ld = JSON.parse($(el).html() || '');
        const items = Array.isArray(ld) ? ld : [ld];
        for (const item of items) {
          if (item['@type'] === 'Product' || item['@type'] === 'product') {
            if (!title && item.name) title = item.name;
            if (!description && item.description) description = item.description;
            if (images.length === 0 && item.image) {
              const imgs = Array.isArray(item.image) ? item.image : [item.image];
              images = imgs.map((i: any) => typeof i === 'string' ? fixImgUrl(i) : fixImgUrl(i.url || ''));
            }
            if (!price && item.offers) {
              const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              if (offer?.price) price = parseFloat(String(offer.price));
            }
          }
        }
      } catch (e) {}
    });
  }

  // Strategy 5: embedded JSON blobs with product image URLs
  if (images.length === 0) {
    const imgMatches = html.match(/https?:\/\/[a-z0-9-]+\.alicdn\.com\/[^\s"'<>]+\.(jpg|jpeg|png|webp)/gi);
    if (imgMatches) {
      const uniqueImgs = [...new Set(imgMatches)]
        .filter(src => !src.includes('icon') && !src.includes('logo') && !src.includes('avatar') && !src.includes('32x32') && !src.includes('16x16'))
        .slice(0, 10);
      images = uniqueImgs;
    }
  }

  // Strategy 6: HTML fallbacks (meta tags, h1, img tags)
  if (!title) {
    title = $('h1').first().text().trim() ||
            $('meta[property="og:title"]').attr('content') ||
            $('title').text().trim() || '';
  }

  if (!description) {
    description = $('meta[property="og:description"]').attr('content') ||
                  $('meta[name="description"]').attr('content') || '';
  }

  if (images.length === 0) {
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) images.push(fixImgUrl(ogImage));

    $('img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && (src.includes('alicdn') || src.includes('ae0')) && !src.includes('icon')) {
        const fullSrc = fixImgUrl(src);
        if (!images.includes(fullSrc)) images.push(fullSrc);
      }
    });
  }

  // Strategy 7: price from HTML when not found in JSON
  if (!price) {
    const priceEl = $('[class*="price--current"] span, [class*="product-price"] span, [class*="uniform-banner-box-price"]').first().text();
    if (priceEl) {
      const parsed = parseFloat(priceEl.replace(/[^0-9.]/g, ''));
      if (!isNaN(parsed) && parsed > 0) price = parsed;
    }
  }

  if (!title && !description && images.length === 0) {
    return null;
  }

  return {
    title: title.replace(/\s+/g, ' ').trim(),
    description: description.replace(/\s+/g, ' ').trim(),
    images: Array.from(new Set(images)).slice(0, 10),
    videos: [],
    price,
    originalUrl: url,
  };
}

async function scrapeAliExpressWithScrapFly(url: string): Promise<ImportedProduct | null> {
  const apiKey = process.env.SCRAPFLY_API_KEY;

  if (!apiKey) {
    console.log('[AliExpress] ScrapFly API key not configured');
    return null;
  }

  try {
    const productId = extractAliExpressProductId(url);
    console.log(`[AliExpress] Scraping product ID: ${productId || 'unknown'} via ScrapFly`);

    const params = new URLSearchParams({
      key: apiKey,
      url: url,
      asp: 'true',
      render_js: 'true',
      rendering_wait: '3000',
      country: 'us',
    });
    params.append('headers[cookie]', 'aep_usuc_f=site=glo&province=&city=&c_tp=USD&region=US&b_locale=en_US&ae_u_p_s=2');

    const response = await fetch(`https://api.scrapfly.io/scrape?${params.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AliExpress] ScrapFly error:', response.status, errorText.substring(0, 300));
      throw new Error(`ScrapFly failed: ${response.status}`);
    }

    const data = await response.json();
    const html = data.result?.content || '';
    console.log(`[AliExpress] Got ${html.length} bytes from ScrapFly`);

    if (html.length < 1000) {
      console.log('[AliExpress] ScrapFly returned too little content, likely blocked');
      return null;
    }

    const result = parseAliExpressHtml(html, url);
    if (result) {
      console.log(`[AliExpress] ScrapFly extracted: title="${result.title.substring(0, 50)}...", ${result.images.length} images, price=${result.price}`);
    } else {
      console.log('[AliExpress] ScrapFly: could not extract product data from HTML');
    }
    return result;
  } catch (error: any) {
    console.error('[AliExpress] ScrapFly scraping failed:', error.message);
    return null;
  }
}

async function scrapeAliExpressWithScrapingBee(url: string): Promise<ImportedProduct | null> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;

  if (!apiKey) {
    console.log('[AliExpress] ScrapingBee API key not configured');
    return null;
  }

  try {
    const productId = extractAliExpressProductId(url);
    console.log(`[AliExpress] Scraping product ID: ${productId || 'unknown'} via ScrapingBee`);

    const params = new URLSearchParams({
      api_key: apiKey,
      url: url,
      render_js: 'true',
      premium_proxy: 'true',
      country_code: 'us',
      wait: '3000',
    });

    const response = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'text/html' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AliExpress] ScrapingBee error:', response.status, errorText.substring(0, 300));
      return null;
    }

    const html = await response.text();
    console.log(`[AliExpress] Got ${html.length} bytes from ScrapingBee`);

    if (html.length < 1000) {
      console.log('[AliExpress] ScrapingBee returned too little content, likely blocked');
      return null;
    }

    const result = parseAliExpressHtml(html, url);
    if (result) {
      console.log(`[AliExpress] ScrapingBee extracted: title="${result.title.substring(0, 50)}...", ${result.images.length} images`);
    } else {
      console.log('[AliExpress] ScrapingBee: could not extract product data from HTML');
    }
    return result;
  } catch (error: any) {
    console.error('[AliExpress] ScrapingBee scraping failed:', error.message);
    return null;
  }
}

async function scrapeAliExpress(url: string): Promise<ImportedProduct | null> {
  // Try ScrapFly first (has ASP anti-bot bypass)
  console.log('[AliExpress] Trying ScrapFly...');
  const scrapFlyResult = await scrapeAliExpressWithScrapFly(url);
  if (scrapFlyResult) {
    console.log('[AliExpress] ScrapFly succeeded');
    return scrapFlyResult;
  }
  
  // Try ScrapingBee as fallback
  console.log('[AliExpress] ScrapFly failed, trying ScrapingBee...');
  const scrapingBeeResult = await scrapeAliExpressWithScrapingBee(url);
  if (scrapingBeeResult) {
    console.log('[AliExpress] ScrapingBee succeeded');
    return scrapingBeeResult;
  }
  
  // Check if any API keys are configured
  if (!process.env.SCRAPFLY_API_KEY && !process.env.SCRAPINGBEE_API_KEY) {
    throw new Error('AliExpress scraping requires either a ScrapFly or ScrapingBee API key.');
  }
  
  console.log('[AliExpress] Both scrapers failed');
  return null;
}

async function scrapeAlibabaWithScrapFly(url: string): Promise<ImportedProduct | null> {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  
  if (!apiKey) {
    console.log('[Alibaba] ScrapFly API key not configured');
    return null;
  }
  
  try {
    console.log('[Alibaba] Scraping via ScrapFly...');
    
    const params = new URLSearchParams({
      key: apiKey,
      url: url,
      asp: 'true',
      render_js: 'true',
      country: 'us',
    });
    
    const response = await fetch(`https://api.scrapfly.io/scrape?${params.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Alibaba] ScrapFly error:', response.status, errorText);
      return null;
    }
    
    const data = await response.json();
    const html = data.result?.content || '';
    const $ = cheerio.load(html);
    
    console.log(`[Alibaba] Got ${html.length} bytes from ScrapFly`);
    
    let title = '';
    let description = '';
    let images: string[] = [];
    let price: number | undefined;
    
    // Try JSON-LD first
    const jsonLdData = extractJsonLd($);
    if (jsonLdData) {
      title = jsonLdData.name || '';
      description = jsonLdData.description || '';
      if (jsonLdData.image) {
        const imageData = jsonLdData.image;
        if (typeof imageData === 'string') {
          images.push(imageData.startsWith('//') ? `https:${imageData}` : imageData);
        } else if (Array.isArray(imageData)) {
          imageData.forEach((img: any) => {
            const src = typeof img === 'string' ? img : (img.url || img.contentUrl);
            if (src) images.push(src.startsWith('//') ? `https:${src}` : src);
          });
        }
      }
      if (jsonLdData.offers) {
        const offers = Array.isArray(jsonLdData.offers) ? jsonLdData.offers[0] : jsonLdData.offers;
        if (offers?.price) price = parseFloat(String(offers.price).replace(/[^0-9.]/g, ''));
      }
    }
    
    // Fallback to HTML parsing
    if (!title) {
      title = $('h1').first().text().trim() ||
              $('meta[property="og:title"]').attr('content') ||
              $('title').text().trim() || '';
    }
    
    if (!description) {
      description = $('meta[property="og:description"]').attr('content') ||
                    $('meta[name="description"]').attr('content') ||
                    $('.product-description').text().trim() || '';
    }
    
    // Extract Alibaba images
    if (images.length === 0) {
      // Look for main product images
      $('img[src*="s.alicdn.com"], img[src*="sc04.alicdn.com"]').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && !src.includes('logo') && !src.includes('icon')) {
          const fullSrc = src.startsWith('//') ? `https:${src}` : src;
          if (!images.includes(fullSrc)) images.push(fullSrc);
        }
      });
      
      // Also try og:image
      const ogImage = $('meta[property="og:image"]').attr('content');
      if (ogImage) {
        const fullSrc = ogImage.startsWith('//') ? `https:${ogImage}` : ogImage;
        if (!images.includes(fullSrc)) images.unshift(fullSrc);
      }
    }
    
    if (!title && !description && images.length === 0) {
      console.log('[Alibaba] Could not extract product data');
      return null;
    }
    
    console.log(`[Alibaba] Extracted: title="${title.substring(0, 50)}...", ${images.length} images`);
    
    return {
      title: title.replace(/\s+/g, ' ').trim(),
      description: description.replace(/\s+/g, ' ').trim(),
      images: Array.from(new Set(images)).slice(0, 10),
      videos: [],
      price,
      originalUrl: url,
    };
  } catch (error: any) {
    console.error('[Alibaba] ScrapFly scraping failed:', error.message);
    return null;
  }
}

async function scrapeTemuWithScrapFly(url: string): Promise<ImportedProduct | null> {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  
  if (!apiKey) {
    console.log('[Temu] ScrapFly API key not configured');
    return null;
  }
  
  try {
    console.log('[Temu] Scraping via ScrapFly...');
    
    const params = new URLSearchParams({
      key: apiKey,
      url: url,
      asp: 'true',
      render_js: 'true',
      country: 'ca', // Temu has regional sites
    });
    
    const response = await fetch(`https://api.scrapfly.io/scrape?${params.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Temu] ScrapFly error:', response.status, errorText);
      return null;
    }
    
    const data = await response.json();
    const html = data.result?.content || '';
    const $ = cheerio.load(html);
    
    console.log(`[Temu] Got ${html.length} bytes from ScrapFly`);
    
    let title = '';
    let description = '';
    let images: string[] = [];
    let price: number | undefined;
    
    // Try JSON-LD first
    const jsonLdData = extractJsonLd($);
    if (jsonLdData) {
      title = jsonLdData.name || '';
      description = jsonLdData.description || '';
      if (jsonLdData.image) {
        const imageData = jsonLdData.image;
        if (typeof imageData === 'string') {
          images.push(imageData.startsWith('//') ? `https:${imageData}` : imageData);
        } else if (Array.isArray(imageData)) {
          imageData.forEach((img: any) => {
            const src = typeof img === 'string' ? img : (img.url || img.contentUrl);
            if (src) images.push(src.startsWith('//') ? `https:${src}` : src);
          });
        }
      }
      if (jsonLdData.offers) {
        const offers = Array.isArray(jsonLdData.offers) ? jsonLdData.offers[0] : jsonLdData.offers;
        if (offers?.price) price = parseFloat(String(offers.price).replace(/[^0-9.]/g, ''));
      }
    }
    
    // Fallback to HTML parsing
    if (!title) {
      title = $('h1').first().text().trim() ||
              $('meta[property="og:title"]').attr('content') ||
              $('title').text().trim().replace(' - Temu Canada', '').replace(' - Temu', '') || '';
    }
    
    if (!description) {
      description = $('meta[property="og:description"]').attr('content') ||
                    $('meta[name="description"]').attr('content') || '';
    }
    
    // Extract Temu images - they're often embedded in JSON within the page
    if (images.length === 0) {
      // Look for Temu CDN images in JSON data (they use aimg.kwcdn.com)
      const jsonImageMatches = html.match(/"(https?:\/\/aimg\.kwcdn\.com\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi) || [];
      const productImages: string[] = [];
      
      jsonImageMatches.forEach(m => {
        const url = m.replace(/"/g, '').replace(/\\\//g, '/');
        // Filter out UI elements and keep product images
        if (url && !url.includes('tree-selector') && !url.includes('icon') && 
            !url.includes('logo') && !url.includes('avatar') && !url.includes('banner') &&
            url.includes('upload_aimg')) {
          if (!productImages.includes(url)) productImages.push(url);
        }
      });
      
      // Also look for images in any JSON-LD or script data
      $('script').each((_, el) => {
        const content = $(el).html() || '';
        const imgMatches = content.match(/"(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi) || [];
        imgMatches.forEach(m => {
          const url = m.replace(/"/g, '').replace(/\\\//g, '/');
          if (url && url.includes('kwcdn.com') && !productImages.includes(url)) {
            productImages.push(url);
          }
        });
      });
      
      images.push(...productImages);
      
      // Also try og:image
      const ogImage = $('meta[property="og:image"]').attr('content');
      if (ogImage) {
        const fullSrc = ogImage.startsWith('//') ? `https:${ogImage}` : ogImage;
        if (!images.includes(fullSrc)) images.unshift(fullSrc);
      }
    }
    
    if (!title && !description && images.length === 0) {
      console.log('[Temu] Could not extract product data');
      return null;
    }
    
    console.log(`[Temu] Extracted: title="${title.substring(0, 50)}...", ${images.length} images`);
    
    return {
      title: title.replace(/\s+/g, ' ').trim(),
      description: description.replace(/\s+/g, ' ').trim(),
      images: Array.from(new Set(images)).slice(0, 10),
      videos: [],
      price,
      originalUrl: url,
    };
  } catch (error: any) {
    console.error('[Temu] ScrapFly scraping failed:', error.message);
    return null;
  }
}

export async function scrapeProductFromUrl(url: string): Promise<ImportedProduct> {
  // Check for Alibaba
  if (isAlibabaUrl(url)) {
    const alibabaResult = await scrapeAlibabaWithScrapFly(url);
    if (alibabaResult) {
      return alibabaResult;
    }
    throw new Error('Could not extract Alibaba product data. The page may be blocked. Try copying the product details manually.');
  }
  
  // Check for Temu
  if (isTemuUrl(url)) {
    const temuResult = await scrapeTemuWithScrapFly(url);
    if (temuResult) {
      return temuResult;
    }
    throw new Error('Could not extract Temu product data. The page may be blocked. Try copying the product details manually.');
  }
  
  // Check for AliExpress
  if (isAliExpressUrl(url)) {
    const aliResult = await scrapeAliExpress(url);
    if (aliResult) {
      return aliResult;
    }
    throw new Error('Could not extract AliExpress product data. The page may be blocked or require login. Try copying the product details manually.');
  }
  const response = await fetchWithRetry(url);

  const html = await response.text();
  const $ = cheerio.load(html);
  
  // Check for bot detection/CAPTCHA pages
  if (detectBotBlock(html, $)) {
    throw new Error('This website has bot protection that blocks automated access. Try a different source URL for this product, or manually enter the product details.');
  }

  // Try JSON-LD structured data first (most reliable for modern sites)
  const jsonLdData = extractJsonLd($);
  
  let title = '';
  let description = '';
  let images: string[] = [];
  let price: number | undefined;
  let brand: string | undefined;

  if (jsonLdData) {
    title = jsonLdData.name || '';
    description = jsonLdData.description || '';
    
    // Extract brand from JSON-LD
    if (jsonLdData.brand) {
      if (typeof jsonLdData.brand === 'string') {
        brand = jsonLdData.brand;
      } else if (jsonLdData.brand.name) {
        brand = jsonLdData.brand.name;
      }
    }
    
    // Handle image field (can be string, array, or object)
    if (jsonLdData.image) {
      const imageData = jsonLdData.image;
      if (typeof imageData === 'string') {
        images.push(resolveUrl(imageData, url));
      } else if (Array.isArray(imageData)) {
        imageData.forEach((img: any) => {
          if (typeof img === 'string') {
            images.push(resolveUrl(img, url));
          } else if (img?.url) {
            images.push(resolveUrl(img.url, url));
          } else if (img?.contentUrl) {
            images.push(resolveUrl(img.contentUrl, url));
          }
        });
      } else if (imageData.url) {
        images.push(resolveUrl(imageData.url, url));
      }
    }
    
    // Extract price from offers
    if (jsonLdData.offers) {
      const offers = Array.isArray(jsonLdData.offers) ? jsonLdData.offers[0] : jsonLdData.offers;
      if (offers?.price) {
        price = parseFloat(String(offers.price).replace(/[^0-9.]/g, ''));
      } else if (offers?.lowPrice) {
        price = parseFloat(String(offers.lowPrice).replace(/[^0-9.]/g, ''));
      }
    }
  }

  // Fallback to HTML extraction if JSON-LD didn't provide data
  if (!title) {
    title = extractTitle($);
  }
  if (!description) {
    description = extractDescription($);
  }
  if (price === undefined) {
    price = extractPrice($);
  }
  
  // Try Shopify-specific JSON for additional images
  const shopifyImages = extractShopifyImages($, url);
  images.push(...shopifyImages);
  
  // Always try HTML extraction to get more images (merge with existing)
  const htmlImages = extractImages($, url);
  images.push(...htmlImages);
  
  // If still no images, try og:image as last resort
  if (images.length === 0) {
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      images.push(resolveUrl(ogImage, url));
    }
  }
  
  // Fallback brand extraction from HTML meta tags
  if (!brand) {
    const ogBrand = $('meta[property="og:brand"]').attr('content') ||
                    $('meta[property="product:brand"]').attr('content') ||
                    $('meta[name="brand"]').attr('content');
    if (ogBrand) {
      brand = ogBrand;
    }
  }

  // Deduplicate and filter out invalid/placeholder images
  const seen = new Set<string>();
  images = images.filter(img => {
    if (seen.has(img) || !isValidImageUrl(img)) return false;
    seen.add(img);
    return true;
  });

  // Extract videos from all sources
  const jsonLdVideos = extractVideosFromJsonLd($, url);
  const shopifyVideos = extractShopifyVideos($, url);
  const htmlVideos = extractVideosFromHtml($, url);
  
  // Combine and deduplicate videos
  const videosSeen = new Set<string>();
  const videos = [...jsonLdVideos, ...shopifyVideos, ...htmlVideos].filter(v => {
    if (videosSeen.has(v)) return false;
    videosSeen.add(v);
    return true;
  }).slice(0, 5); // Max 5 videos per product

  return {
    title,
    description,
    images: images.slice(0, 10), // Up to 10 images per product
    videos,
    price,
    brand,
    originalUrl: url,
  };
}

interface JsonLdProduct {
  name?: string;
  description?: string;
  image?: any;
  offers?: any;
  sku?: string;
  brand?: any;
}

function extractJsonLd($: cheerio.CheerioAPI): JsonLdProduct | null {
  const scripts = $('script[type="application/ld+json"]');
  
  for (let i = 0; i < scripts.length; i++) {
    try {
      const content = $(scripts[i]).html();
      if (!content) continue;
      
      const data = JSON.parse(content);
      
      // Handle @graph format (common in some sites)
      if (data['@graph']) {
        for (const item of data['@graph']) {
          if (item['@type'] === 'Product') {
            return item;
          }
        }
      }
      
      // Direct Product type
      if (data['@type'] === 'Product') {
        return data;
      }
      
      // Handle array of items
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item['@type'] === 'Product') {
            return item;
          }
        }
      }
      
      // Check for ItemList with products
      if (data['@type'] === 'ItemList' && data.itemListElement) {
        for (const item of data.itemListElement) {
          if (item['@type'] === 'Product' || item.item?.['@type'] === 'Product') {
            return item['@type'] === 'Product' ? item : item.item;
          }
        }
      }
    } catch (e) {
      // JSON parse error, continue to next script
      continue;
    }
  }
  
  return null;
}

function fixShopifyImageUrl(src: string): string {
  // Replace {width} placeholder with actual width (1000px is good quality)
  let fixed = src.replace(/\{width\}/g, '1000');
  // Also handle _{width}x pattern by replacing with nothing or a size
  fixed = fixed.replace(/_\{width\}x/g, '');
  // Handle {height} if present
  fixed = fixed.replace(/\{height\}/g, '1000');
  return fixed;
}

function extractShopifyImages($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const images: string[] = [];
  
  // Look for Shopify product JSON in various script tags
  const shopifySelectors = [
    'script[type="application/json"][data-product-json]',
    'script[type="application/json"][data-product]',
    'script#ProductJson',
    'script[id*="ProductJson"]',
    'script[data-section-type="product"]',
  ];
  
  for (const selector of shopifySelectors) {
    $(selector).each((_, el) => {
      try {
        const content = $(el).html();
        if (!content) return;
        
        const data = JSON.parse(content);
        
        // Handle direct product object with images array
        if (data.images && Array.isArray(data.images)) {
          data.images.forEach((img: any) => {
            const src = typeof img === 'string' ? img : (img.src || img.url);
            if (src) {
              // Fix Shopify template placeholders and resolve URL
              const fixed = fixShopifyImageUrl(src);
              const resolved = fixed.startsWith('//') ? `https:${fixed}` : resolveUrl(fixed, baseUrl);
              images.push(resolved);
            }
          });
        }
        
        // Handle media array (newer Shopify format)
        if (data.media && Array.isArray(data.media)) {
          data.media.forEach((m: any) => {
            const src = m.src || m.preview_image?.src;
            if (src) {
              const fixed = fixShopifyImageUrl(src);
              const resolved = fixed.startsWith('//') ? `https:${fixed}` : resolveUrl(fixed, baseUrl);
              images.push(resolved);
            }
          });
        }
        
        // Handle featured_image
        if (data.featured_image) {
          const src = typeof data.featured_image === 'string' ? data.featured_image : data.featured_image.src;
          if (src) {
            const fixed = fixShopifyImageUrl(src);
            const resolved = fixed.startsWith('//') ? `https:${fixed}` : resolveUrl(fixed, baseUrl);
            images.push(resolved);
          }
        }
      } catch (e) {
        // JSON parse error, continue
      }
    });
  }
  
  // Also look for images in data attributes commonly used by Shopify themes
  $('[data-media-id] img, [data-image-id] img').each((_, el) => {
    const src = $(el).attr('data-src') || $(el).attr('data-srcset')?.split(',')[0]?.trim()?.split(' ')[0] || $(el).attr('src');
    if (src) {
      const fixed = fixShopifyImageUrl(src);
      const resolved = fixed.startsWith('//') ? `https:${fixed}` : resolveUrl(fixed, baseUrl);
      images.push(resolved);
    }
  });
  
  return images;
}

function extractTitle($: cheerio.CheerioAPI): string {
  const selectors = [
    // Structured data
    'h1[itemprop="name"]',
    '[itemprop="name"]',
    // Best Buy
    '.sku-title h1',
    '.productName_2KoPa',
    '[data-testid="product-title"]',
    '.product-title',
    // AliExpress
    '.product-title-text',
    '.pdp-mod-product-title',
    '[data-pl="product-title"]',
    // Alibaba
    '.module-pdp-title',
    '.title-first-column h1',
    // Amazon
    '#productTitle',
    '#title',
    // eBay
    '.x-item-title__mainTitle',
    '#itemTitle',
    // Walmart
    '[data-testid="product-title"]',
    // Generic
    'h1.product-title',
    'h1.product-name',
    '.product-title h1',
    'h1',
    'meta[property="og:title"]',
  ];

  for (const selector of selectors) {
    if (selector.startsWith('meta')) {
      const content = $(selector).attr('content');
      if (content) return content.trim();
    } else {
      const text = $(selector).first().text().trim();
      if (text && text.length > 3 && text.length < 200) return text;
    }
  }

  return '';
}

function extractDescription($: cheerio.CheerioAPI): string {
  const selectors = [
    '[itemprop="description"]',
    // AliExpress
    '.product-description',
    '.pdp-product-description',
    '[data-pl="product-description"]',
    // Alibaba
    '.module-pdp-description',
    '.do-entry-list',
    // Amazon
    '#productDescription',
    '#feature-bullets',
    '.a-expander-content',
    // eBay
    '.x-about-this-item',
    '#desc_wrapper_ctr',
    // Walmart
    '[data-testid="product-description"]',
    // Generic
    '#product-description',
    '.description',
    'meta[property="og:description"]',
    'meta[name="description"]',
  ];

  for (const selector of selectors) {
    if (selector.startsWith('meta')) {
      const content = $(selector).attr('content');
      if (content && content.length > 20) return content.trim();
    } else {
      const text = $(selector).first().text().trim();
      if (text && text.length > 20) return text;
    }
  }

  const paragraphs = $('p').map((_, el) => $(el).text().trim()).get();
  const validParagraphs = paragraphs.filter(p => p.length > 50 && p.length < 1000);
  
  return validParagraphs.slice(0, 2).join('\n\n') || '';
}

function extractImages($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const images: string[] = [];
  const seen = new Set<string>();
  
  const addImage = (src: string | undefined) => {
    if (src && !seen.has(src) && isValidImageUrl(src)) {
      const resolved = resolveUrl(src, baseUrl);
      if (!seen.has(resolved)) {
        images.push(resolved);
        seen.add(resolved);
        seen.add(src);
      }
    }
  };

  // Site-specific selectors for major e-commerce platforms
  const selectors = [
    // Best Buy
    '.primary-image img',
    '.product-image img',
    '[data-testid="product-image"] img',
    '.gallery-image img',
    '.media-gallery img',
    // AliExpress - target larger product images (640x640)
    '.magnifier-image',
    '.image-viewer-item img',
    '.pdp-mod-mainImage img',
    '[data-pl="product-image"] img',
    '.slider--item--image img',
    // AliExpress landing page images - prefer 640x640 size
    'img[src*="640x640"]',
    'img[src*="aliexpress-media.com"]',
    // Alibaba
    '.main-image-container img',
    '.detail-gallery-img',
    '.offer-image img',
    '.main-image img',
    // Amazon
    '#imgTagWrapperId img',
    '.a-dynamic-image',
    '#landingImage',
    '#main-image-container img',
    '[data-a-dynamic-image] img',
    '.imgTagWrapper img',
    // Walmart
    '.prod-hero-image img',
    '[data-testid="hero-image"] img',
    '.prod-ProductHeroImage img',
    // eBay
    '#icImg',
    '.ux-image-carousel-item img',
    '.vi-main-img',
    '.s-item__image img',
    // Shopify
    '[data-media-id] img',
    '.product__media img',
    '.product-single__photo img',
    '.product-featured-media img',
    // Generic/Standard
    '[itemprop="image"]',
    '.product-image img',
    '.product-gallery img',
    '[data-testid="product-image"] img',
    '.gallery img',
    'img[src*="product"]',
    // Preload images
    'link[rel="preload"][as="image"]',
    // Meta tags
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
  ];

  for (const selector of selectors) {
    if (selector.startsWith('meta')) {
      const content = $(selector).attr('content');
      addImage(content);
    } else if (selector.includes('link[rel="preload"]')) {
      $(selector).each((_, el) => {
        addImage($(el).attr('href'));
      });
    } else {
      $(selector).each((_, el) => {
        // Try multiple source attributes
        const src = $(el).attr('src') 
          || $(el).attr('data-src') 
          || $(el).attr('data-lazy-src')
          || $(el).attr('data-old-hires')
          || $(el).attr('data-zoom-image')
          || $(el).attr('srcset')?.split(',')[0]?.trim()?.split(' ')[0];
        addImage(src);
      });
    }
  }

  // Fallback: look for any large images
  if (images.length === 0) {
    $('img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      const width = parseInt($(el).attr('width') || '0');
      const height = parseInt($(el).attr('height') || '0');
      
      if (src && !seen.has(src) && isValidImageUrl(src)) {
        // Accept images that are large or have no dimensions specified
        if (width > 200 || height > 200 || (!width && !height)) {
          addImage(src);
        }
      }
    });
  }

  return images;
}

// Video extraction functions
function normalizeVideoUrl(url: string, baseUrl: string): string | null {
  if (!url) return null;
  
  // Skip blob URLs and data URIs
  if (url.startsWith('blob:') || url.startsWith('data:')) return null;
  
  // Resolve relative URLs
  let resolved: string;
  try {
    resolved = new URL(url, baseUrl).href;
  } catch {
    return null;
  }
  
  // Convert YouTube embed URLs to watch URLs
  const ytEmbedMatch = resolved.match(/youtube\.com\/embed\/([^?&]+)/);
  if (ytEmbedMatch) {
    return `https://www.youtube.com/watch?v=${ytEmbedMatch[1]}`;
  }
  
  // Convert YouTube short URLs
  const ytShortMatch = resolved.match(/youtu\.be\/([^?&]+)/);
  if (ytShortMatch) {
    return `https://www.youtube.com/watch?v=${ytShortMatch[1]}`;
  }
  
  // Convert Vimeo embed URLs to player URLs
  const vimeoEmbedMatch = resolved.match(/player\.vimeo\.com\/video\/(\d+)/);
  if (vimeoEmbedMatch) {
    return `https://vimeo.com/${vimeoEmbedMatch[1]}`;
  }
  
  // Accept direct video file URLs
  if (/\.(mp4|webm|mov|m3u8|ogg)(\?|$)/i.test(resolved)) {
    return resolved;
  }
  
  // Accept YouTube watch URLs
  if (resolved.includes('youtube.com/watch') || resolved.includes('youtu.be/')) {
    return resolved;
  }
  
  // Accept Vimeo URLs
  if (resolved.includes('vimeo.com/')) {
    return resolved;
  }
  
  return null;
}

function extractVideosFromJsonLd($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const videos: string[] = [];
  const seen = new Set<string>();
  
  const addVideo = (url: string | undefined) => {
    const normalized = normalizeVideoUrl(url || '', baseUrl);
    if (normalized && !seen.has(normalized)) {
      videos.push(normalized);
      seen.add(normalized);
    }
  };
  
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).html();
      if (!content) return;
      
      const data = JSON.parse(content);
      
      // Helper to extract videos from an item
      const extractFromItem = (item: any) => {
        if (!item) return;
        
        // Direct VideoObject
        if (item['@type'] === 'VideoObject') {
          addVideo(item.contentUrl || item.embedUrl || item.url);
        }
        
        // Video property on Product
        if (item.video) {
          if (typeof item.video === 'string') {
            addVideo(item.video);
          } else if (Array.isArray(item.video)) {
            item.video.forEach((v: any) => {
              addVideo(typeof v === 'string' ? v : (v.contentUrl || v.embedUrl || v.url));
            });
          } else {
            addVideo(item.video.contentUrl || item.video.embedUrl || item.video.url);
          }
        }
      };
      
      // Handle @graph format
      if (data['@graph']) {
        data['@graph'].forEach(extractFromItem);
      }
      
      // Direct item
      extractFromItem(data);
      
      // Handle array
      if (Array.isArray(data)) {
        data.forEach(extractFromItem);
      }
    } catch {
      // JSON parse error, continue
    }
  });
  
  return videos;
}

function extractShopifyVideos($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const videos: string[] = [];
  const seen = new Set<string>();
  
  const addVideo = (url: string | undefined) => {
    const normalized = normalizeVideoUrl(url || '', baseUrl);
    if (normalized && !seen.has(normalized)) {
      videos.push(normalized);
      seen.add(normalized);
    }
  };
  
  // Look for Shopify product JSON
  const shopifySelectors = [
    'script[type="application/json"][data-product-json]',
    'script[type="application/json"][data-product]',
    'script#ProductJson',
    'script[id*="ProductJson"]',
    'script[data-section-type="product"]',
  ];
  
  for (const selector of shopifySelectors) {
    $(selector).each((_, el) => {
      try {
        const content = $(el).html();
        if (!content) return;
        
        const data = JSON.parse(content);
        
        // Handle media array (newer Shopify format)
        if (data.media && Array.isArray(data.media)) {
          data.media.forEach((m: any) => {
            if (m.media_type === 'video' || m.media_type === 'external_video') {
              // External video (YouTube/Vimeo)
              if (m.external_id) {
                if (m.host === 'youtube') {
                  addVideo(`https://www.youtube.com/watch?v=${m.external_id}`);
                } else if (m.host === 'vimeo') {
                  addVideo(`https://vimeo.com/${m.external_id}`);
                }
              }
              // Direct video sources
              if (m.sources && Array.isArray(m.sources)) {
                m.sources.forEach((src: any) => {
                  addVideo(src.url);
                });
              }
            }
          });
        }
      } catch {
        // JSON parse error, continue
      }
    });
  }
  
  return videos;
}

function extractVideosFromHtml($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const videos: string[] = [];
  const seen = new Set<string>();
  
  const addVideo = (url: string | undefined) => {
    const normalized = normalizeVideoUrl(url || '', baseUrl);
    if (normalized && !seen.has(normalized)) {
      videos.push(normalized);
      seen.add(normalized);
    }
  };
  
  // Extract from <video> tags
  $('video').each((_, el) => {
    addVideo($(el).attr('src'));
    // Also check <source> children
    $(el).find('source').each((_, src) => {
      addVideo($(src).attr('src'));
    });
  });
  
  // Extract from standalone <source> tags
  $('source[type^="video"]').each((_, el) => {
    addVideo($(el).attr('src'));
  });
  
  // Extract from iframes (YouTube, Vimeo embeds)
  $('iframe').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && (src.includes('youtube') || src.includes('vimeo') || src.includes('player'))) {
      addVideo(src);
    }
  });
  
  // Extract from og:video meta tag
  const ogVideo = $('meta[property="og:video"]').attr('content') ||
                  $('meta[property="og:video:url"]').attr('content');
  addVideo(ogVideo);
  
  return videos;
}

function extractPrice($: cheerio.CheerioAPI): number | undefined {
  const selectors = [
    '[itemprop="price"]',
    '.price',
    '.product-price',
    '[data-testid="price"]',
    '.current-price',
  ];

  for (const selector of selectors) {
    const text = $(selector).first().text() || $(selector).first().attr('content') || '';
    const match = text.match(/[\$£€]?\s*(\d+(?:[.,]\d{2})?)/);
    if (match) {
      return parseFloat(match[1].replace(',', '.'));
    }
  }

  return undefined;
}

function resolveUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

function isValidImageUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.includes('logo') || lower.includes('icon') || lower.includes('sprite')) return false;
  if (lower.includes('placeholder') || lower.includes('loading')) return false;
  
  // Filter out tiny images by checking ALL dimension patterns in URL
  // AliExpress URLs often have multiple size tokens: jpg_50x50.jpg_640x640q75.jpg
  // We should accept if ANY dimension is >= 150x150
  const dimPattern = /[_\/](\d+)x(\d+)/gi;
  let match;
  let maxWidth = 0;
  let maxHeight = 0;
  
  while ((match = dimPattern.exec(lower)) !== null) {
    const w = parseInt(match[1]);
    const h = parseInt(match[2]);
    if (w > maxWidth) maxWidth = w;
    if (h > maxHeight) maxHeight = h;
  }
  
  // If we found dimension patterns, reject only if ALL are tiny
  if (maxWidth > 0 || maxHeight > 0) {
    if (maxWidth < 150 && maxHeight < 150) {
      return false;
    }
  }
  
  return /\.(jpg|jpeg|png|gif|webp|avif)/i.test(url) || url.includes('/images/') || url.includes('/img/');
}

export async function rewordContent(
  title: string,
  description: string
): Promise<{ title: string; description: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a product copywriter. Rewrite the given product title and description in fresh, original language. 
Keep the same meaning and key product details, but use different words and sentence structure.
Make it sound natural and appealing for an online marketplace.
IMPORTANT: Always write in English, even if the original text is in another language.
Respond in JSON format with "title" and "description" fields.`,
        },
        {
          role: 'user',
          content: `Original Title: ${title}\n\nOriginal Description: ${description}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return {
        title: parsed.title || title,
        description: parsed.description || description,
      };
    }
  } catch (error) {
    console.error('Failed to reword content:', error);
  }

  return { title, description };
}

function isImageUrl(url: string): boolean {
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|tiff|svg)(\?.*)?$/i;
  return imageExtensions.test(url);
}

async function generateTitleFromImage(imageUrl: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What is this product? Respond with just a concise product title suitable for an e-commerce listing (10 words or less). Do not include quotes.',
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 50,
    });

    return response.choices[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error('Failed to generate title from image:', error);
    return '';
  }
}

export async function importProductFromUrl(url: string): Promise<ImportedProduct> {
  // Check if URL is a direct image link
  if (isImageUrl(url)) {
    const title = await generateTitleFromImage(url);
    return {
      title,
      description: '', // Leave description blank for image-only imports
      images: [url],
      videos: [], // No videos for direct image imports
      originalUrl: url,
    };
  }

  const scraped = await scrapeProductFromUrl(url);
  
  if (!scraped.title && !scraped.description && !scraped.images.length) {
    throw new Error('Could not extract product information from URL');
  }

  // If we have images but no title, try to generate from first image
  if (!scraped.title && scraped.images.length > 0) {
    const generatedTitle = await generateTitleFromImage(scraped.images[0]);
    return {
      ...scraped,
      title: generatedTitle,
      description: '', // Leave description blank when AI generates title
    };
  }

  const reworded = await rewordContent(scraped.title, scraped.description);

  return {
    ...scraped,
    title: reworded.title,
    description: reworded.description,
  };
}
