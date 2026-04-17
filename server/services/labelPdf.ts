import puppeteer from 'puppeteer';
import JSZip from 'jszip';

interface LabelData {
  name: string;
  productCode: string;
  templateSize: string;
}

interface LabelElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  visible: boolean;
  textAlign?: string;
  text?: string;
}

interface LabelTemplate {
  elements: LabelElement[];
  customLogoUrl?: string;
  customBrandUrl?: string;
  showLogo?: boolean;
  showBrand?: boolean;
}

const DYMO_LABEL_SIZES: Record<string, { width: number; height: number }> = {
  '30252': { width: 252, height: 81 },
  '30336': { width: 153, height: 72 },
  '30332': { width: 72, height: 72 },
  '30346': { width: 135, height: 36 },
  '30323': { width: 288, height: 153 },
  '30256': { width: 288, height: 166 },
};

function pxToMm(px: number): number {
  return px * 0.264583;
}

function generateLabelHTML(labels: LabelData[], template: LabelTemplate): string {
  const elements = template.elements;
  const logo = elements.find(e => e.id === 'logo');
  const brand = elements.find(e => e.id === 'brand');
  const name = elements.find(e => e.id === 'name');
  const code = elements.find(e => e.id === 'code');
  const website = elements.find(e => e.id === 'website');
  const labelLogoUrl = template.customLogoUrl || '';
  const labelBrandUrl = template.customBrandUrl || '';

  const labelsHtml = labels.map((label) => {
    const labelSize = DYMO_LABEL_SIZES[label.templateSize] || DYMO_LABEL_SIZES['30256'];
    
    return `
      <div class="label" style="position: relative; width: ${labelSize.width}px; height: ${labelSize.height}px; page-break-after: always; background: white;">
        ${logo?.visible ? `
          <div style="position: absolute; left: ${logo.x}px; top: ${logo.y}px; width: ${logo.width}px; height: ${logo.height}px; ${labelLogoUrl ? '' : 'background: #20B2AA;'} border-radius: 3px; display: flex; align-items: center; justify-content: center;">
            ${labelLogoUrl ? `<img src="${labelLogoUrl}" style="width: 100%; height: 100%; object-fit: contain;">` : `<svg viewBox="0 0 24 24" fill="white" style="width: 60%; height: 60%;"><path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18s-.41-.06-.57-.18l-7.9-4.44A.991.991 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18s.41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z"/></svg>`}
          </div>
        ` : ''}
        ${brand?.visible ? `
          <div style="position: absolute; left: ${brand.x}px; top: ${brand.y}px; width: ${brand.width}px; height: ${brand.height}px; font-size: ${brand.fontSize}px; font-weight: bold; display: flex; align-items: center; justify-content: ${brand.textAlign === 'center' ? 'center' : brand.textAlign === 'right' ? 'flex-end' : 'flex-start'}; text-align: ${brand.textAlign || 'left'};">
            ${labelBrandUrl ? `<img src="${labelBrandUrl}" style="width: 100%; height: 100%; object-fit: contain;">` : `<span style="color: #20B2AA;">Grid</span><span style="color: #1D3557;">Mart</span>`}
          </div>
        ` : ''}
        ${name?.visible ? `
          <div style="position: absolute; left: ${name.x}px; top: ${name.y}px; width: ${name.width}px; height: ${name.height}px; font-size: ${name.fontSize}px; font-weight: bold; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-align: ${name.textAlign || 'left'};">
            ${label.name}
          </div>
        ` : ''}
        ${code?.visible ? `
          <div style="position: absolute; left: ${code.x}px; top: ${code.y}px; width: ${code.width}px; font-size: ${code.fontSize}px; font-weight: bold; font-family: monospace; letter-spacing: 1px; text-align: ${code.textAlign || 'left'};">
            ${label.productCode}
          </div>
        ` : ''}
        ${website?.visible ? `
          <div style="position: absolute; left: ${website.x}px; top: ${website.y}px; width: ${website.width}px; height: ${website.height}px; font-size: ${website.fontSize}px; color: #666; font-family: Arial, sans-serif; text-align: ${website.textAlign || 'center'};">
            ${website.text || 'gridmart.ca'}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; background: white; }
          .label:last-child { page-break-after: auto; }
          @page { margin: 0; }
        </style>
      </head>
      <body>${labelsHtml}</body>
    </html>
  `;
}

async function generateLabelPdfFromHtml(labels: LabelData[], template: LabelTemplate): Promise<Buffer> {
  console.log('[labelPdf] Starting HTML-to-PDF generation for', labels.length, 'labels');
  
  const html = generateLabelHTML(labels, template);
  const firstLabel = labels[0];
  const labelSize = DYMO_LABEL_SIZES[firstLabel.templateSize] || DYMO_LABEL_SIZES['30256'];
  
  const widthMm = pxToMm(labelSize.width);
  const heightMm = pxToMm(labelSize.height);
  
  console.log('[labelPdf] Launching puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    console.log('[labelPdf] Generating PDF with dimensions', { widthMm, heightMm });
    const pdfBuffer = await page.pdf({
      width: `${widthMm}mm`,
      height: `${heightMm}mm`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    
    console.log('[labelPdf] PDF generated, size:', pdfBuffer.length);
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

export async function generateLabelPdfs(
  labelsByProduct: Record<string, LabelData[]>,
  templates: Record<string, LabelTemplate>,
  isCancelled?: () => boolean
): Promise<{ buffer: Buffer; type: 'pdf' | 'zip'; filename: string }> {
  console.log('[labelPdf] generateLabelPdfs called with', Object.keys(labelsByProduct).length, 'products');
  const productCodes = Object.keys(labelsByProduct);
  const pdfBuffers: { code: string; buffer: Buffer }[] = [];
  
  for (const [productCode, labels] of Object.entries(labelsByProduct)) {
    console.log('[labelPdf] Processing product:', productCode, 'with', labels.length, 'labels');
    if (isCancelled?.()) {
      throw new Error('PDF generation cancelled');
    }
    
    const templateSize = labels[0].templateSize;
    const template = templates[templateSize];
    console.log('[labelPdf] Using templateSize:', templateSize, 'found template:', !!template);
    
    const pdfBuffer = await generateLabelPdfFromHtml(labels, template);
    pdfBuffers.push({ code: productCode, buffer: pdfBuffer });
    console.log('[labelPdf] Completed product:', productCode);
  }
  
  if (productCodes.length === 1) {
    return {
      buffer: pdfBuffers[0].buffer,
      type: 'pdf',
      filename: `${productCodes[0]}.pdf`,
    };
  }
  
  console.log('[labelPdf] Creating zip with', pdfBuffers.length, 'PDFs');
  const zip = new JSZip();
  for (const { code, buffer } of pdfBuffers) {
    zip.file(`${code}.pdf`, buffer);
  }
  
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  console.log('[labelPdf] Zip created, size:', zipBuffer.length);
  
  return {
    buffer: zipBuffer,
    type: 'zip',
    filename: 'labels.zip',
  };
}
