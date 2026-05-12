import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectProductMeta } from "./productMeta";
import { storage } from "./storage";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function linkifyInlineHtml(html: string): string {
  // Input is already HTML-escaped; safely inject anchor tags for emails and URLs
  const withEmails = html.replace(
    /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g,
    '<a href="mailto:$1" style="color:#0d9488">$1</a>'
  );
  return withEmails.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#0d9488">$1</a>'
  );
}

// Converts simple markdown-ish policy text to readable HTML paragraphs
function policyTextToHtml(text: string): string {
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('## ')) return `<h2 style="font-size:18px;font-weight:700;margin:20px 0 6px">${linkifyInlineHtml(escapeHtml(trimmed.slice(3)))}</h2>`;
      if (trimmed.startsWith('# ')) return `<h1 style="font-size:22px;font-weight:700;margin:0 0 12px">${linkifyInlineHtml(escapeHtml(trimmed.slice(2)))}</h1>`;
      if (trimmed.startsWith('• ') || trimmed.startsWith('- ')) return `<li style="margin:4px 0">${linkifyInlineHtml(escapeHtml(trimmed.slice(2)))}</li>`;
      return `<p style="margin:6px 0;line-height:1.6">${linkifyInlineHtml(escapeHtml(trimmed))}</p>`;
    })
    .join('\n');
}

// Inject server-rendered noscript fallback for policy/agreement pages
async function injectPolicyContent(html: string, agreementKey: string, pageTitle: string): Promise<string> {
  try {
    const agreement = await storage.getAgreement(agreementKey);
    if (!agreement?.content) return html;

    const bodyHtml = policyTextToHtml(agreement.content);
    const title = agreement.title || pageTitle;

    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)} | GridMart</title>`);

    const noscript = `<noscript>
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:32px 16px;color:#111">
  <nav style="font-size:13px;color:#6b7280;margin-bottom:20px">
    <a href="/" style="color:#6b7280;text-decoration:none">GridMart</a> &rsaquo; ${escapeHtml(title)}
  </nav>
  <h1 style="font-size:28px;font-weight:700;margin:0 0 16px">${escapeHtml(title)}</h1>
  <div style="font-size:15px;color:#374151">${bodyHtml}</div>
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb">
    <p style="font-size:13px;color:#6b7280;margin:0">
      GridMart &mdash; 3176 Walker Rd, Windsor, ON N8W 3R5, Canada
    </p>
  </div>
</div>
</noscript>`;

    html = html.replace('<div id="root">', `${noscript}\n<div id="root">`);
  } catch {
    // Non-critical — return html unchanged if agreement fetch fails
  }
  return html;
}

async function injectContactMeta(html: string): Promise<string> {
  try {
    const [emailSetting, phoneSetting, addressSetting, hoursSetting] = await Promise.all([
      storage.getSiteSetting('contactEmail'),
      storage.getSiteSetting('contactPhone'),
      storage.getSiteSetting('storefrontAddress'),
      storage.getSiteSetting('storefrontHours'),
    ]);

    const email = emailSetting || 'support@gridmart.ca';
    const phone = phoneSetting || '';
    const address = addressSetting || '3176 Walker Rd, Windsor, ON N8W 3R5';
    const hours = hoursSetting || '';

    html = html.replace(/<title>[^<]*<\/title>/, '<title>Contact Us | GridMart</title>');

    const phoneHtml = phone
      ? `<p style="margin:4px 0"><strong>Phone:</strong> <a href="tel:${escapeHtml(phone.replace(/[^+\d]/g, ''))}" style="color:#0d9488">${escapeHtml(phone)}</a></p>`
      : '';
    const hoursHtml = hours
      ? `<p style="margin:4px 0"><strong>Hours:</strong> ${escapeHtml(hours)}</p>`
      : '';

    const noscript = `<noscript>
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:700px;margin:0 auto;padding:32px 16px;color:#111">
  <nav style="font-size:13px;color:#6b7280;margin-bottom:20px">
    <a href="/" style="color:#6b7280;text-decoration:none">GridMart</a> &rsaquo; Contact Us
  </nav>
  <h1 style="font-size:28px;font-weight:700;margin:0 0 20px">Contact GridMart</h1>
  <div style="font-size:15px;color:#374151;line-height:1.7">
    <p style="margin:4px 0"><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}" style="color:#0d9488">${escapeHtml(email)}</a></p>
    ${phoneHtml}
    <p style="margin:12px 0 4px"><strong>Address:</strong></p>
    <address style="font-style:normal;margin:0 0 4px">${escapeHtml(address)}</address>
    ${hoursHtml}
  </div>
</div>
</noscript>`;

    html = html.replace('<div id="root">', `${noscript}\n<div id="root">`);
  } catch {
    // Non-critical — return html unchanged if settings fetch fails
  }
  return html;
}

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
      } else if (filePath.match(/\.(js|css|woff2?|ttf|otf)$/)) {
        res.setHeader('Vary', 'Accept-Encoding');
      }
    }
  }));

  app.use("*", async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');

    const host = req.get('host') || 'gridmart.ca';
    const baseUrl = `https://${host}`;
    let html = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");

    const url = req.originalUrl.split('?')[0];

    // Product pages — inject JSON-LD + noscript via productMeta
    html = injectProductMeta(html, res, baseUrl);

    // Policy / agreement pages — inject content as noscript for crawlers
    if (!res.locals?.productMeta) {
      const canonicalUrl = `${baseUrl}${url === '/' ? '/' : url}`;
      html = html.replace('</head>', `<link rel="canonical" href="${canonicalUrl}" />\n</head>`);

      const agreementMatch = url.match(/^\/agreement\/([^/]+)$/);
      if (agreementMatch) {
        html = await injectPolicyContent(html, agreementMatch[1], agreementMatch[1].replace(/_/g, ' '));
      } else if (url === '/privacy') {
        html = await injectPolicyContent(html, 'privacy', 'Privacy Policy');
      } else if (url === '/terms') {
        html = await injectPolicyContent(html, 'terms', 'Terms of Service');
      } else if (url === '/contact') {
        html = await injectContactMeta(html);
      }
    }

    res.send(html);
  });
}
