import puppeteer from 'puppeteer';

interface CustomBox {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  textAlign: 'left' | 'center' | 'right';
  bold: boolean;
  color: string;
}

interface PriceTagData {
  name: string;
  price: string;
  templateKey: string;
  imageUrl?: string;
  customBoxes?: CustomBox[];
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

const SHEET_W_PX = 816;  // 8.5in @ 96dpi
const SHEET_H_PX = 1056; // 11in @ 96dpi

const DEFAULT_LOGO_SVG = `<svg viewBox="0 0 24 24" fill="white" style="width:70%;height:70%;"><path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18s-.41-.06-.57-.18l-7.9-4.44A.991.991 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18s.41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z"/></svg>`;

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderTagCell(tag: PriceTagData, tmpl: PriceTagTemplate): string {
  const { widthPx, heightPx, elements, customLogoUrl } = tmpl;
  const imgEl = elements.find(e => e.id === 'image');
  const logo = elements.find(e => e.id === 'logo');
  const name = elements.find(e => e.id === 'name');
  const price = elements.find(e => e.id === 'price');
  const logoUrl = customLogoUrl || '';
  const justify = (el: PriceTagElement | undefined) =>
    el?.textAlign === 'center' ? 'center' : el?.textAlign === 'right' ? 'flex-end' : 'flex-start';

  return `<div style="position:relative;width:${widthPx}px;height:${heightPx}px;background:white;overflow:hidden;outline:1px dashed rgba(0,0,0,0.25);outline-offset:-1px;">
    ${imgEl?.visible && tag.imageUrl ? `<div style="position:absolute;left:${imgEl.x}px;top:${imgEl.y}px;width:${imgEl.width}px;height:${imgEl.height}px;"><img src="${escapeHtml(tag.imageUrl)}" style="width:100%;height:100%;object-fit:contain;" crossorigin="anonymous"></div>` : ''}
    ${logo?.visible ? `<div style="position:absolute;left:${logo.x}px;top:${logo.y}px;width:${logo.width}px;height:${logo.height}px;${logoUrl ? '' : 'background:#20B2AA;'}border-radius:3px;display:flex;align-items:center;justify-content:center;">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" style="width:100%;height:100%;object-fit:contain;">` : DEFAULT_LOGO_SVG}</div>` : ''}
    ${name?.visible ? `<div style="position:absolute;left:${name.x}px;top:${name.y}px;width:${name.width}px;height:${name.height}px;font-size:${name.fontSize}px;font-weight:bold;font-family:Arial,sans-serif;line-height:1.2;display:flex;align-items:center;justify-content:${justify(name)};">${escapeHtml(tag.name)}</div>` : ''}
    ${price?.visible ? `<div style="position:absolute;left:${price.x}px;top:${price.y}px;width:${price.width}px;height:${price.height}px;font-size:${price.fontSize}px;font-weight:bold;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:${justify(price)};color:#1a1a1a;">${escapeHtml(tag.price)}</div>` : ''}
    ${(tag.customBoxes || []).map(box => `<div style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;font-size:${box.fontSize}px;font-weight:${box.bold ? 'bold' : 'normal'};font-family:Arial,sans-serif;color:${box.color};display:flex;align-items:center;justify-content:${box.textAlign === 'center' ? 'center' : box.textAlign === 'right' ? 'flex-end' : 'flex-start'};line-height:1.2;">${escapeHtml(box.text)}</div>`).join('')}
  </div>`;
}

function generateTiledHTML(entries: { tag: PriceTagData; tmpl: PriceTagTemplate }[]): string {
  if (!entries.length) return `<!DOCTYPE html><html><body></body></html>`;

  const { widthPx, heightPx } = entries[0].tmpl;
  const COLS = Math.max(1, Math.floor(SHEET_W_PX / widthPx));
  const ROWS = Math.max(1, Math.floor(SHEET_H_PX / heightPx));
  const PER_SHEET = COLS * ROWS;
  const offsetX = Math.floor((SHEET_W_PX - COLS * widthPx) / 2);
  const offsetY = Math.floor((SHEET_H_PX - ROWS * heightPx) / 2);

  const padded: (typeof entries[0] | null)[] = [...entries];
  while (padded.length % PER_SHEET !== 0) padded.push(null);

  const sheetGroups: (typeof entries[0] | null)[][] = [];
  for (let i = 0; i < padded.length; i += PER_SHEET) {
    sheetGroups.push(padded.slice(i, i + PER_SHEET));
  }

  const sheetsHtml = sheetGroups.map((group, si) => {
    const cells = group
      .map(e => e ? renderTagCell(e.tag, e.tmpl) : `<div style="width:${widthPx}px;height:${heightPx}px;outline:1px dashed rgba(0,0,0,0.15);outline-offset:-1px;"></div>`)
      .join('');
    const pageBreak = si < sheetGroups.length - 1 ? 'page-break-after:always;' : '';
    return `<div style="position:relative;width:${SHEET_W_PX}px;height:${SHEET_H_PX}px;background:white;${pageBreak}">
      <div style="position:absolute;left:${offsetX}px;top:${offsetY}px;display:grid;grid-template-columns:repeat(${COLS},${widthPx}px);grid-template-rows:repeat(${ROWS},${heightPx}px);">
        ${cells}
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;background:white;}@page{size:8.5in 11in;margin:0;}</style></head><body>${sheetsHtml}</body></html>`;
}

async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
    timeout: 30000,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const pdfBuffer = await page.pdf({
      width: '8.5in',
      height: '11in',
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
): Promise<{ buffer: Buffer; type: 'pdf'; filename: string }> {
  const entries: { tag: PriceTagData; tmpl: PriceTagTemplate }[] = [];

  for (const tags of Object.values(tagsByProduct)) {
    for (const tag of tags) {
      const tmpl = templates[tag.templateKey] || templates['standard'];
      if (!tmpl) {
        console.error(`[priceTagPdf] No template found for key: ${tag.templateKey}`);
        continue;
      }
      entries.push({ tag, tmpl });
    }
  }

  if (!entries.length) throw new Error('No price tags to generate');

  const html = generateTiledHTML(entries);
  const buffer = await generatePdfFromHtml(html);
  return { buffer, type: 'pdf', filename: 'pricetags.pdf' };
}
