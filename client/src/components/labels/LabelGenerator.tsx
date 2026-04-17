import { useState, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { Package, Printer, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Product } from '@/lib/mockData';

interface ProductWithQuantity {
  id: string;
  name: string;
  productCode?: string;
  quantity: number;
}

interface LabelGeneratorProps {
  products: Product[] | ProductWithQuantity[];
  isOpen: boolean;
  onClose: () => void;
}

const DYMO_LABEL_SIZES = {
  '30252': { name: 'Address (1-1/8" x 3-1/2")', width: 252, height: 81 },
  '30336': { name: 'Small Multipurpose (1" x 2-1/8")', width: 153, height: 72 },
  '30332': { name: 'Square (1" x 1")', width: 72, height: 72 },
  '30346': { name: 'Library Barcode (1/2" x 1-7/8")', width: 135, height: 36 },
  '30323': { name: 'Shipping (2-1/8" x 4")', width: 288, height: 153 },
  '30256': { name: 'Large Shipping (2-5/16" x 4")', width: 288, height: 166 },
} as const;

type LabelSize = keyof typeof DYMO_LABEL_SIZES;

export function LabelGenerator({ products, isOpen, onClose }: LabelGeneratorProps) {
  const [labelSize, setLabelSize] = useState<LabelSize>('30252');
  const [isGenerating, setIsGenerating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const selectedSize = DYMO_LABEL_SIZES[labelSize];

  const getProductQuantity = (product: Product | ProductWithQuantity): number => {
    if ('quantity' in product && typeof product.quantity === 'number') {
      return product.quantity;
    }
    if ('inventory' in product && Array.isArray(product.inventory)) {
      const invStock = product.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
      return invStock > 0 ? invStock : ((product as any).sheetQuantity || 1);
    }
    return 1;
  };

  const expandedLabels = products.flatMap((product) => {
    const qty = getProductQuantity(product);
    return Array.from({ length: qty }, () => ({
      name: product.name,
      productCode: product.productCode || 'GM-XXX',
    }));
  });

  const totalLabelCount = expandedLabels.length;

  const generateLabelHTML = () => {
    return expandedLabels.map((label) => `
      <div class="label">
        <div class="header">
          <div class="logo">
            <svg viewBox="0 0 24 24" fill="white"><path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18s-.41-.06-.57-.18l-7.9-4.44A.991.991 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18s.41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z"/></svg>
          </div>
          <span class="brand">Grid<span>Mart</span></span>
        </div>
        <div class="product-name">${label.name}</div>
        <div class="product-code">${label.productCode}</div>
      </div>
    `).join('');
  };

  const handlePrint = () => {
    if (products.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GridMart Product Labels</title>
          <style>
            @page {
              size: ${selectedSize.width}px ${selectedSize.height}px;
              margin: 0;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: Arial, sans-serif;
            }
            .label {
              width: ${selectedSize.width}px;
              height: ${selectedSize.height}px;
              padding: 8px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              page-break-after: always;
            }
            .label:last-child {
              page-break-after: auto;
            }
            .header {
              display: flex;
              align-items: flex-end;
              gap: 4px;
            }
            .brand {
              margin-bottom: 1px;
            }
            .logo {
              width: 16px;
              height: 16px;
              background: #000;
              border-radius: 3px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .logo svg {
              width: 10px;
              height: 10px;
              fill: white;
            }
            .brand {
              font-size: 10px;
              font-weight: bold;
            }
            .brand span {
              color: #666;
            }
            .product-name {
              font-size: ${labelSize === '30332' || labelSize === '30346' ? '9px' : '12px'};
              font-weight: bold;
              line-height: 1.2;
              overflow: hidden;
              text-overflow: ellipsis;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
            }
            .product-code {
              font-size: ${labelSize === '30332' || labelSize === '30346' ? '14px' : '18px'};
              font-weight: bold;
              font-family: monospace;
              letter-spacing: 1px;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          ${generateLabelHTML()}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handleDownloadPDF = () => {
    if (expandedLabels.length === 0) return;
    setIsGenerating(true);

    try {
      const widthPt = selectedSize.width * 0.75;
      const heightPt = selectedSize.height * 0.75;
      
      const doc = new jsPDF({
        orientation: widthPt > heightPt ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [widthPt, heightPt],
      });

      const isSmallLabel = labelSize === '30332' || labelSize === '30346';
      const padding = 6;
      const logoSize = 12;
      const brandFontSize = isSmallLabel ? 6 : 8;
      const nameFontSize = isSmallLabel ? 7 : 10;
      const codeFontSize = isSmallLabel ? 12 : 16;

      expandedLabels.forEach((label, index) => {
        if (index > 0) {
          doc.addPage([widthPt, heightPt]);
        }

        doc.setFillColor(32, 178, 170);
        doc.roundedRect(padding, padding, logoSize, logoSize, 2, 2, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.text('G', padding + logoSize / 2, padding + logoSize / 2 + 3, { align: 'center' });
        
        doc.setFontSize(brandFontSize);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(32, 178, 170);
        doc.text('Grid', padding + logoSize + 4, padding + logoSize / 2 + 2);
        const gridWidth = doc.getTextWidth('Grid');
        doc.setTextColor(29, 53, 87);
        doc.text('Mart', padding + logoSize + 4 + gridWidth, padding + logoSize / 2 + 2);

        const nameY = heightPt / 2;
        doc.setFontSize(nameFontSize);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        const maxWidth = widthPt - padding * 2;
        const lines = doc.splitTextToSize(label.name, maxWidth);
        doc.text(lines.slice(0, 2), padding, nameY);

        const codeY = heightPt - padding - 4;
        doc.setFontSize(codeFontSize);
        doc.setFont('courier', 'bold');
        doc.text(label.productCode, padding, codeY);
      });

      doc.save(`gridmart-labels-${Date.now()}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Printer className="w-5 h-5" />
            Generate Product Labels
          </DialogTitle>
          <DialogDescription>
            Create printable labels for {products.length} product{products.length !== 1 ? 's' : ''} ({totalLabelCount} total label{totalLabelCount !== 1 ? 's' : ''}) formatted for Dymo LabelWriter 450
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Label Size</Label>
            <Select value={labelSize} onValueChange={(val) => setLabelSize(val as LabelSize)}>
              <SelectTrigger data-testid="select-label-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DYMO_LABEL_SIZES).map(([key, size]) => (
                  <SelectItem key={key} value={key}>
                    {key} - {size.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg p-4 bg-muted/30">
            <Label className="mb-3 block">Preview ({totalLabelCount} label{totalLabelCount !== 1 ? 's' : ''} - {products.length} unique product{products.length !== 1 ? 's' : ''})</Label>
            {products.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Printer className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No products selected</p>
                <p className="text-sm">Select products to generate labels</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 max-h-64 overflow-y-auto" ref={printRef}>
                {products.map((product) => {
                  const qty = getProductQuantity(product);
                  return (
                    <div key={product.id} className="relative">
                      <div className="absolute -top-2 -left-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                        {qty}x
                      </div>
                      <div
                        className="label bg-white border-2 border-dashed border-muted-foreground/30 rounded shadow-sm flex flex-col justify-between"
                        style={{
                          width: `${selectedSize.width * 0.8}px`,
                          height: `${selectedSize.height * 0.8}px`,
                          padding: '6px',
                          fontSize: '80%',
                        }}
                      >
                        <div className="header flex items-end gap-1">
                          <div className="logo w-4 h-4 bg-primary rounded flex items-center justify-center">
                            <Package className="w-2.5 h-2.5 text-white" />
                          </div>
                          <span className="brand text-[8px] font-bold mb-px">
                            <span className="text-primary">Grid</span><span className="text-[#1D3557]">Mart</span>
                          </span>
                        </div>
                        <div
                          className="product-name font-bold leading-tight overflow-hidden"
                          style={{
                            fontSize: labelSize === '30332' || labelSize === '30346' ? '7px' : '10px',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {product.name}
                        </div>
                        <div
                          className="product-code font-mono font-bold"
                          style={{
                            fontSize: labelSize === '30332' || labelSize === '30346' ? '11px' : '14px',
                            letterSpacing: '0.5px',
                          }}
                        >
                          {product.productCode || 'GM-XXX'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handlePrint} 
              className="flex-1" 
              disabled={products.length === 0}
              data-testid="button-print-labels"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print Labels
            </Button>
            <Button
              onClick={handleDownloadPDF}
              variant="outline"
              className="flex-1"
              disabled={isGenerating || products.length === 0}
              data-testid="button-download-labels"
            >
              <Download className="w-4 h-4 mr-2" />
              {isGenerating ? 'Opening...' : 'Download PDF'}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Labels are formatted for Dymo LabelWriter 450. Select your label size above to match your label stock.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
