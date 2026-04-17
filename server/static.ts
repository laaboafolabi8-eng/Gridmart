import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectProductMeta } from "./productMeta";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));

  app.use("*", (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');

    let html = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");
    const host = req.get('host') || 'gridmart.ca';
    const baseUrl = `https://${host}`;
    html = injectProductMeta(html, res, baseUrl);

    if (!res.locals?.productMeta) {
      const canonicalUrl = `${baseUrl}${req.originalUrl === '/' ? '/' : req.originalUrl.split('?')[0]}`;
      html = html.replace('</head>', `<link rel="canonical" href="${canonicalUrl}" />\n</head>`);
    }

    res.send(html);
  });
}
