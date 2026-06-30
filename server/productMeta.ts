import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { slugify, productUrl, extractProductIdPrefix, isUuid } from "../shared/slugify";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.substring(0, max - 3) + '...';
}

function extractDescription(raw: unknown): string {
  if (!raw) return '';
  if (Array.isArray(raw)) {
    return raw.filter(Boolean).join(' ').trim();
  }
  if (typeof raw === 'string') return raw;
  return '';
}

export function setupProductMetaRoutes(app: Express) {
  app.get("/product/:slug", async (req: Request, res: Response, next: NextFunction) => {
    const slug = req.params.slug;

    if (isUuid(slug)) {
      const product = await storage.getProduct(slug);
      if (product) {
        const newUrl = productUrl(product);
        return res.redirect(301, newUrl);
      }
    }

    const idPrefix = extractProductIdPrefix(slug);
    if (!idPrefix) {
      return next();
    }

    const product = await storage.getProductByIdPrefix(idPrefix);
    if (!product) {
      return next();
    }

    const expectedSlug = `${slugify(product.name)}-${product.id.split('-')[0]}`;
    if (slug !== expectedSlug) {
      return res.redirect(301, `/product/${expectedSlug}`);
    }

    res.locals.productMeta = product;
    next();
  });
}

export function injectProductMeta(html: string, res: Response, baseUrl: string): string {
  const product = res.locals?.productMeta;
  if (!product) return html;

  const title = escapeHtml(product.name);
  const price = product.price ? ` - $${parseFloat(product.price).toFixed(2)}` : '';
  const ogTitle = `${title}${price} | GridMart`;

  const rawDesc = extractDescription(product.description);
  const description = escapeHtml(truncate(rawDesc, 200)) ||
    `Shop ${escapeHtml(product.name)} at GridMart — 3176 Walker Rd, Windsor, ON`;

  const imageUrl = product.image ? `${baseUrl}${product.image}` : '';
  const productPageUrl = `${baseUrl}${productUrl(product)}`;

  // ── OG / Twitter meta ────────────────────────────────────────────────────

  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${ogTitle}" />`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${description}" />`
  );
  html = html.replace(
    /<meta property="og:type" content="[^"]*"\s*\/?>/,
    `<meta property="og:type" content="product" />`
  );
  if (imageUrl) {
    html = html.replace(
      /<meta property="og:image" content="[^"]*"\s*\/?>/,
      `<meta property="og:image" content="${imageUrl}" />`
    );
    html = html.replace(
      /<meta name="twitter:image" content="[^"]*"\s*\/?>/,
      `<meta name="twitter:image" content="${imageUrl}" />`
    );
  }
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${ogTitle}" />`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${description}" />`
  );

  html = html.replace(
    '</head>',
    `<meta property="og:url" content="${productPageUrl}" />\n<link rel="canonical" href="${productPageUrl}" />\n</head>`
  );

  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${title} | GridMart</title>`
  );

  // ── JSON-LD Product schema (read by Google without JS execution) ──────────

  const priceFormatted = product.price ? parseFloat(product.price).toFixed(2) : null;
  const totalStock = (product.sheetQuantity || 0);
  const availability = product.comingSoon
    ? 'https://schema.org/PreOrder'
    : totalStock > 0
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock';

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url: productPageUrl,
    description: rawDesc || `${product.name} available at GridMart`,
    sku: product.productCode || product.id,
    brand: {
      '@type': 'Brand',
      name: 'GridMart',
    },
  };

  if (imageUrl) schema.image = imageUrl;

  if (priceFormatted) {
    schema.offers = {
      '@type': 'Offer',
      price: priceFormatted,
      priceCurrency: 'CAD',
      availability,
      url: productPageUrl,
      seller: {
        '@type': 'Organization',
        name: 'GridMart',
        url: baseUrl,
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'CA',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnInStore',
      },
    };
  }

  const jsonLd = JSON.stringify(schema);
  html = html.replace(
    '</head>',
    `<script type="application/ld+json">${jsonLd}</script>\n</head>`
  );

  // ── noscript fallback (for feed validators that skip JS) ─────────────────
  // Rendered as plain readable HTML; only shown when JavaScript is disabled.
  // Googlebot indexes noscript content and this ensures the product price,
  // title, and availability are always present in the raw HTML response.

  const priceHtml = priceFormatted
    ? `<p style="font-size:22px;font-weight:700;color:#0d9488;margin:0 0 6px">$${priceFormatted} CAD</p>`
    : '';

  const availText = totalStock > 0
    ? '✓ In Stock'
    : product.comingSoon
      ? 'Coming Soon'
      : 'Out of Stock';
  const availColor = totalStock > 0 ? '#16a34a' : product.comingSoon ? '#d97706' : '#dc2626';

  const imageHtml = imageUrl
    ? `<img src="${imageUrl}" alt="${title}" style="max-width:280px;float:left;margin:0 20px 16px 0;border-radius:8px" />`
    : '';

  const descHtml = rawDesc
    ? `<p style="color:#374151;font-size:15px;line-height:1.65;margin:12px 0 0;clear:both">${escapeHtml(truncate(rawDesc, 500))}</p>`
    : '';

  const noscript = `<noscript>
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:900px;margin:0 auto;padding:32px 16px;color:#111">
  <nav style="font-size:13px;color:#6b7280;margin-bottom:20px">
    <a href="/" style="color:#6b7280;text-decoration:none">GridMart</a> &rsaquo; ${title}
  </nav>
  <h1 style="font-size:26px;font-weight:700;margin:0 0 10px;line-height:1.3">${title}</h1>
  ${priceHtml}
  <p style="font-size:14px;font-weight:600;color:${availColor};margin:0 0 16px">${availText}</p>
  ${imageHtml}
  ${descHtml}
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;clear:both">
    <p style="font-size:13px;color:#6b7280;margin:0">
      <strong style="color:#374151">GridMart Store</strong> &mdash;
      3176 Walker Rd, Windsor, ON N8W 3R5, Canada
    </p>
  </div>
</div>
</noscript>`;

  html = html.replace('<div id="root">', `${noscript}\n<div id="root">`);

  return html;
}
