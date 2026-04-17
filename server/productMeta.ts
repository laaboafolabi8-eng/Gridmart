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

  let description = '';
  if (product.description) {
    const lines = product.description.split('\n').filter((l: string) => l.trim());
    description = escapeHtml(truncate(lines[0] || '', 200));
  }
  if (!description) {
    description = `Shop ${escapeHtml(product.name)} on GridMart - Local pickup marketplace`;
  }

  const imageUrl = product.image
    ? `${baseUrl}${product.image}`
    : '';

  const productPageUrl = `${baseUrl}${productUrl(product)}`;

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

  return html;
}
