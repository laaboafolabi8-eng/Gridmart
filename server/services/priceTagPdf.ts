import puppeteer from 'puppeteer';
import JSZip from 'jszip';

interface PriceTagData {
  name: string;
  price: string;
  templateKey: string;
  imageUrl?: string;
}

interface PriceTagElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  visible: boolean;
  textAlign?: string;
}

interface PriceTagTemplate {
  key: string;
  widthPx: number;
  heightPx: number;
  elements: PriceTagElement[];
  customLogoUrl?: string;
}

function pxToMm(px: number): number {
  return px * 0.264583;
}

const DEFAULT_LOGO_SVG = `<svg viewBox="0 0 24 24" fill="white" style="width:70%;height:70%;"><path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18s-.41-.06-.57-.18l-7.9-4.44A.991.991 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18s.41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z"/></svg>`;

function generateTagHTML(tags: PriceTagData[], template: PriceTagTemplate): string {
  const elements = template.elements;
  const imgEl = elements.find(e => e.id === 'image');
  const logo = elements.find(e => e.id === 'logo');
  const name = elements.find(e => e.id === 'name');
  const price = elements.find(e => e.id === 'price');
  const logoUrl = template.customLogoUrl || '';
  const { widthPx, heightPx } = template;

  const tagsHtml = tags.map(tag => `
    <div class="tag" style="position:relative;width:${widthPx}px;height:${heightPx}px;page-break-after:always;background:white;overflow:hidden;">
      ${imgEl?.visible && tag.imageUrl ? `
        <div style="position:absolute;left:${imgEl.x}px;top:${imgEl.y}px;width:${imgEl.width}px;height:${imgEl.height}px;overflow:hidden;border-radius:2px;">
          <img src="${tag.imageUrl}" style="width:100%;height:100%;object-fit:cover;" crossorigin="anonymous">
        </div>` : ''}
      ${logo?.visible ? `
        <div style="position:absolute;left:${logo.x}px;top:${logo.y}px;width:${logo.width}px;height:${logo.height}px;${logoUrl ? '' : 'background:#20B2AA;'}border-radius:3px;display:flex;align-items:center;justify-content:center;">
          ${logoUrl ? `<img src="${logoUrl}" style="width:100%;height:100%;object-fit:contain;">` : DEFAULT_LOGO_SVG}
        </div>` : ''}
      ${name?.visible ? `
        <div style="position:absolute;left:${name.x}px;top:${name.y}px;width:${name.width}px;height:${name.height}px;font-size:${name.fontSize}px;font-weight:bold;font-family:Arial,sans-serif;line-height:1.2;overflow:hidden;display:flex;align-items:center;justify-content:${name.textAlign === 'center' ? 'center' : name.textAlign === 'right' ? 'flex-end' : 'flex-start'};">
          ${escapeHtml(tag.name)}
        </div>` : ''}
      ${price?.visible ? `
        <div style="position:absolute;left:${price.x}px;top:${price.y}px;width:${price.width}px;height:${price.height}px;font-size:${price.fontSize}px;font-weight:bold;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:${price.textAlign === 'center' ? 'center' : price.textAlign === 'right' ? 'flex-end' : 'flex-start'};color:#1a1a1a;">
          ${escapeHtml(tag.price)}
        </div>` : ''}
    </div>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;background:white;}.tag:last-child{page-break-after:auto;}@page{margin:0;}</style></head><body>${tagsHtml}</body></html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function generatePdfFromHtml(tags: PriceTagData[], template: PriceTagTemplate): Promise<Buffer> {
  const html = generateTagHTML(tags, template);
  const widthMm = pxToMm(template.widthPx);
  const heightMm = pxToMm(template.heightPx);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ],
    timeout: 30000,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
    const pdfBuffer = await page.pdf({
      width: `${widthMm}mm`,
      height: `${heightMm}mm`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

export async function generatePriceTagPdfs(
  tagsByProduct: Record<string, PriceTagData[]>,
  templates: Record<string, PriceTagTemplate>
): Promise<{ buffer: Buffer; type: 'pdf' | 'zip'; filename: string }> {
  const productIds = Object.keys(tagsByProduct);
  const pdfBuffers: { id: string; buffer: Buffer }[] = [];

  for (const [productId, tags] of Object.entries(tagsByProduct)) {
    const templateKey = tags[0]?.templateKey || 'standard';
    const template = templates[templateKey] || templates['standard'];
    if (!template) {
      console.error(`[priceTagPdf] No template found for key: ${templateKey}`);
      continue;
    }
    const buffer = await generatePdfFromHtml(tags, template);
    pdfBuffers.push({ id: productId, buffer });
  }

  if (pdfBuffers.length === 0) {
    throw new Error('No price tags generated');
  }

  if (productIds.length === 1) {
    return { buffer: pdfBuffers[0].buffer, type: 'pdf', filename: 'pricetag.pdf' };
  }

  const zip = new JSZip();
  for (const { id, buffer } of pdfBuffers) {
    zip.file(`pricetag-${id}.pdf`, buffer);
  }
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  return { buffer: zipBuffer, type: 'zip', filename: 'pricetags.zip' };
}
