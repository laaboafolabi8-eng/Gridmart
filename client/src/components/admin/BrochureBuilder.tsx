import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Printer, Search, Check, BookOpen, GripVertical, X } from 'lucide-react';
import type { Product } from '@shared/schema';

type TemplateId = 'grid' | 'feature' | 'catalog' | 'promo' | 'minimal';
type FormatType = 'flyer' | 'brochure' | 'poster';
type PageSize = 'letter' | 'legal' | 'a4' | 'tabloid' | 'a3';
type Orientation = 'portrait' | 'landscape';

const FORMATS: { id: FormatType; label: string; desc: string; pageSize: PageSize; orientation: Orientation }[] = [
  { id: 'flyer',    label: 'Flyer',    desc: 'Letter · single page · distribute',    pageSize: 'letter',  orientation: 'portrait'  },
  { id: 'brochure', label: 'Brochure', desc: 'Letter · product showcase · info-rich', pageSize: 'letter',  orientation: 'portrait'  },
  { id: 'poster',   label: 'Poster',   desc: 'Tabloid 11×17 · large display format',  pageSize: 'tabloid', orientation: 'portrait'  },
];

const PAGE_SIZES: { value: PageSize; label: string }[] = [
  { value: 'letter',  label: 'Letter (8.5×11″)' },
  { value: 'legal',   label: 'Legal (8.5×14″)'  },
  { value: 'tabloid', label: 'Tabloid (11×17″)'  },
  { value: 'a4',      label: 'A4 (210×297mm)'   },
  { value: 'a3',      label: 'A3 (297×420mm)'   },
];

interface Settings {
  title: string;
  tagline: string;
  accentColor: string;
  columns: number;
  showPrices: boolean;
  showDescriptions: boolean;
  showCategory: boolean;
  footerText: string;
  pageSize: PageSize;
  orientation: Orientation;
}

const TEMPLATES: { id: TemplateId; name: string; desc: string }[] = [
  { id: 'grid',    name: 'Grid',        desc: 'Product cards in a clean column grid' },
  { id: 'feature', name: 'Feature',     desc: 'Hero product + supporting grid below' },
  { id: 'catalog', name: 'Catalog',     desc: 'Dense list, great for many products'  },
  { id: 'promo',   name: 'Promo Flyer', desc: 'Bold header with prominent pricing'   },
  { id: 'minimal', name: 'Minimal',     desc: 'Clean editorial with strong typography'},
];

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function price(p: string | number) { return `$${Number(p).toFixed(2)}`; }
function imgTag(src: string, style: string) {
  return `<img src="${esc(src)}" style="${style}" onerror="this.style.display='none'" />`;
}

function renderGrid(products: Product[], s: Settings, accent: string): string {
  const colW = `calc(${Math.floor(100 / s.columns)}% - ${Math.ceil((s.columns - 1) * 14 / s.columns)}px)`;
  const cards = products.map(p => `
    <div style="width:${colW};border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;page-break-inside:avoid;">
      ${imgTag(p.image, 'width:100%;height:160px;object-fit:cover;display:block;')}
      <div style="padding:10px 12px;">
        ${s.showCategory ? `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${accent};margin-bottom:2px;">${esc(p.category)}</div>` : ''}
        <div style="font-size:13px;font-weight:700;margin-bottom:${s.showDescriptions ? '4px' : '6px'};line-height:1.3;">${esc(p.name)}</div>
        ${s.showDescriptions && p.description ? `<div style="font-size:10px;color:#666;margin-bottom:6px;line-height:1.4;">${esc(p.description.substring(0, 90))}${p.description.length > 90 ? '…' : ''}</div>` : ''}
        ${s.showPrices ? `<div style="font-size:17px;font-weight:800;color:${accent};">${price(p.price)}</div>` : ''}
      </div>
    </div>`).join('');
  return `<div style="font-family:Arial,sans-serif;color:#1a1a1a;background:#fff;padding:28px 32px;">
    <div style="text-align:center;margin-bottom:28px;border-bottom:3px solid ${accent};padding-bottom:18px;">
      <h1 style="font-size:28px;font-weight:800;margin:0 0 6px;color:${accent};">${esc(s.title)}</h1>
      ${s.tagline ? `<p style="font-size:14px;color:#666;margin:0;">${esc(s.tagline)}</p>` : ''}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:14px;">${cards}</div>
    ${s.footerText ? `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;font-size:10px;color:#999;">${esc(s.footerText)}</div>` : ''}
  </div>`;
}

function renderFeature(products: Product[], s: Settings, accent: string): string {
  const [hero, ...rest] = products;
  if (!hero) return '<div style="padding:40px;text-align:center;color:#aaa;font-family:Arial,sans-serif;">Select products to preview</div>';
  const colW = `calc(${Math.floor(100 / Math.min(s.columns, 3))}% - 10px)`;
  const restCards = rest.map(p => `
    <div style="width:${colW};border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;page-break-inside:avoid;">
      ${imgTag(p.image, 'width:100%;height:130px;object-fit:cover;display:block;')}
      <div style="padding:10px;">
        <div style="font-size:12px;font-weight:700;margin-bottom:3px;line-height:1.3;">${esc(p.name)}</div>
        ${s.showPrices ? `<div style="font-size:14px;font-weight:800;color:${accent};">${price(p.price)}</div>` : ''}
      </div>
    </div>`).join('');
  return `<div style="font-family:Arial,sans-serif;color:#1a1a1a;background:#fff;">
    <div style="background:${accent};color:#fff;padding:20px 28px;">
      <h1 style="font-size:26px;font-weight:800;margin:0 0 4px;">${esc(s.title)}</h1>
      ${s.tagline ? `<p style="font-size:13px;opacity:.85;margin:0;">${esc(s.tagline)}</p>` : ''}
    </div>
    <div style="padding:20px 28px;">
      <div style="display:flex;gap:20px;margin-bottom:24px;border:2px solid ${accent};border-radius:10px;overflow:hidden;">
        ${imgTag(hero.image, 'width:40%;object-fit:cover;max-height:240px;flex-shrink:0;')}
        <div style="flex:1;padding:20px;display:flex;flex-direction:column;justify-content:center;">
          ${s.showCategory ? `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${accent};">${esc(hero.category)}</div>` : ''}
          <h2 style="font-size:22px;font-weight:800;margin:6px 0 10px;line-height:1.2;">${esc(hero.name)}</h2>
          ${s.showDescriptions && hero.description ? `<p style="font-size:12px;color:#555;line-height:1.5;margin:0 0 12px;">${esc(hero.description.substring(0, 200))}${hero.description.length > 200 ? '…' : ''}</p>` : ''}
          ${s.showPrices ? `<div style="font-size:26px;font-weight:800;color:${accent};">${price(hero.price)}</div>` : ''}
        </div>
      </div>
      ${rest.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:12px;">${restCards}</div>` : ''}
      ${s.footerText ? `<div style="margin-top:20px;padding-top:10px;border-top:1px solid #e5e7eb;text-align:center;font-size:10px;color:#999;">${esc(s.footerText)}</div>` : ''}
    </div>
  </div>`;
}

function renderCatalog(products: Product[], s: Settings, accent: string): string {
  const rows = products.map(p => `
    <div style="break-inside:avoid;display:flex;gap:10px;padding:9px 0;border-bottom:1px solid #f0f0f0;">
      ${imgTag(p.image, 'width:56px;height:56px;object-fit:cover;border-radius:5px;flex-shrink:0;')}
      <div style="flex:1;min-width:0;">
        ${s.showCategory ? `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${accent};">${esc(p.category)}</div>` : ''}
        <div style="font-size:12px;font-weight:700;margin:1px 0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(p.name)}</div>
        ${s.showDescriptions && p.description ? `<div style="font-size:9px;color:#666;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${esc(p.description)}</div>` : ''}
        ${s.showPrices ? `<div style="font-size:12px;font-weight:800;color:${accent};margin-top:1px;">${price(p.price)}</div>` : ''}
      </div>
    </div>`).join('');
  return `<div style="font-family:Arial,sans-serif;color:#1a1a1a;background:#fff;padding:24px 28px;">
    <div style="border-left:4px solid ${accent};padding-left:14px;margin-bottom:20px;">
      <h1 style="font-size:24px;font-weight:800;margin:0 0 3px;">${esc(s.title)}</h1>
      ${s.tagline ? `<p style="font-size:12px;color:#666;margin:0;">${esc(s.tagline)}</p>` : ''}
    </div>
    <div style="columns:${Math.min(s.columns, 3)};column-gap:22px;">${rows}</div>
    ${s.footerText ? `<div style="margin-top:18px;padding-top:10px;border-top:1px solid #e5e7eb;text-align:center;font-size:10px;color:#999;">${esc(s.footerText)}</div>` : ''}
  </div>`;
}

function renderPromo(products: Product[], s: Settings, accent: string): string {
  const colW = `calc(${Math.floor(100 / s.columns)}% - ${Math.ceil((s.columns - 1) * 12 / s.columns)}px)`;
  const cards = products.map(p => `
    <div style="width:${colW};border:2px solid ${accent};border-radius:8px;overflow:hidden;page-break-inside:avoid;">
      ${imgTag(p.image, 'width:100%;height:170px;object-fit:cover;display:block;')}
      <div style="padding:10px;text-align:center;">
        <div style="font-size:13px;font-family:Arial Black,sans-serif;font-weight:800;text-transform:uppercase;margin-bottom:3px;">${esc(p.name)}</div>
        ${s.showDescriptions && p.description ? `<div style="font-size:10px;font-family:Arial,sans-serif;color:#555;margin-bottom:5px;font-weight:400;">${esc(p.description.substring(0, 55))}${p.description.length > 55 ? '…' : ''}</div>` : ''}
        ${s.showPrices ? `<div style="font-size:26px;color:${accent};font-weight:900;font-family:Arial Black,sans-serif;">${price(p.price)}</div>` : ''}
      </div>
    </div>`).join('');
  return `<div style="font-family:Arial Black,sans-serif;color:#1a1a1a;background:#fff;">
    <div style="background:${accent};padding:28px;text-align:center;">
      <h1 style="font-size:44px;color:#fff;margin:0;line-height:1;text-transform:uppercase;letter-spacing:-1px;">${esc(s.title || 'SHOP NOW')}</h1>
      ${s.tagline ? `<p style="font-size:16px;color:rgba(255,255,255,.85);margin:6px 0 0;font-family:Arial,sans-serif;font-weight:400;">${esc(s.tagline)}</p>` : ''}
    </div>
    <div style="padding:20px 24px;">
      <div style="display:flex;flex-wrap:wrap;gap:12px;">${cards}</div>
    </div>
    ${s.footerText ? `<div style="background:${accent};color:#fff;padding:10px;text-align:center;font-family:Arial,sans-serif;font-size:12px;font-weight:400;">${esc(s.footerText)}</div>` : ''}
  </div>`;
}

function renderMinimal(products: Product[], s: Settings, accent: string): string {
  const rows = products.map((p, i) => `
    <div style="display:flex;gap:22px;padding:18px 0;${i < products.length - 1 ? 'border-bottom:1px solid #e5e7eb;' : ''}page-break-inside:avoid;">
      ${imgTag(p.image, 'width:90px;height:90px;object-fit:cover;border-radius:4px;flex-shrink:0;')}
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:3px;">
        ${s.showCategory ? `<div style="font-size:9px;font-family:Arial,sans-serif;letter-spacing:.15em;text-transform:uppercase;color:${accent};font-weight:700;">${esc(p.category)}</div>` : ''}
        <div style="font-size:17px;font-weight:400;line-height:1.2;">${esc(p.name)}</div>
        ${s.showDescriptions && p.description ? `<div style="font-size:11px;font-family:Arial,sans-serif;color:#666;line-height:1.5;">${esc(p.description.substring(0, 140))}${p.description.length > 140 ? '…' : ''}</div>` : ''}
        ${s.showPrices ? `<div style="font-size:18px;font-family:Arial,sans-serif;font-weight:700;color:${accent};margin-top:2px;">${price(p.price)}</div>` : ''}
      </div>
    </div>`).join('');
  return `<div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;background:#fff;padding:36px 40px;">
    <div style="margin-bottom:30px;">
      <h1 style="font-size:32px;font-weight:400;margin:0 0 6px;letter-spacing:-.5px;">${esc(s.title)}</h1>
      ${s.tagline ? `<p style="font-size:13px;color:#888;margin:0;font-style:italic;font-family:Arial,sans-serif;">${esc(s.tagline)}</p>` : ''}
      <div style="width:44px;height:3px;background:${accent};margin-top:10px;"></div>
    </div>
    ${rows}
    ${s.footerText ? `<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;text-align:center;font-size:10px;color:#aaa;font-style:italic;">${esc(s.footerText)}</div>` : ''}
  </div>`;
}

const RENDERERS: Record<TemplateId, (p: Product[], s: Settings, a: string) => string> = {
  grid: renderGrid, feature: renderFeature, catalog: renderCatalog, promo: renderPromo, minimal: renderMinimal,
};

export default function BrochureBuilder({ productList }: { productList: Product[] }) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [format, setFormat] = useState<FormatType>('flyer');
  const [template, setTemplate] = useState<TemplateId>('promo');
  const [settings, setSettings] = useState<Settings>({
    title: 'GridMart Products',
    tagline: 'Fresh, local, and always in season.',
    accentColor: '#0d9488',
    columns: 2,
    showPrices: true,
    showDescriptions: true,
    showCategory: true,
    footerText: '3176 Walker Rd, Windsor | gridmart.ca',
    pageSize: 'letter',
    orientation: 'portrait',
  });

  // Drag-to-reorder state
  const dragIndex = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const setSetting = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings(s => ({ ...s, [k]: v }));

  const handleFormatChange = (f: FormatType) => {
    setFormat(f);
    const cfg = FORMATS.find(x => x.id === f)!;
    setSetting('pageSize', cfg.pageSize);
    setSetting('orientation', cfg.orientation);
    if (f === 'poster')   { setSetting('columns', 2); setTemplate('promo'); }
    if (f === 'flyer')    { setSetting('columns', 2); setTemplate('promo'); }
    if (f === 'brochure') { setSetting('columns', 3); setTemplate('grid');  }
  };

  const toggleProduct = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const onDragStart = (i: number) => { dragIndex.current = i; };
  const onDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    setDragOver(i);
    if (dragIndex.current === null || dragIndex.current === i) return;
    setSelectedIds(prev => {
      const arr = [...prev];
      const [removed] = arr.splice(dragIndex.current!, 1);
      arr.splice(i, 0, removed);
      dragIndex.current = i;
      return arr;
    });
  };
  const onDragEnd = () => { dragIndex.current = null; setDragOver(null); };

  const selectedProducts = selectedIds
    .map(id => productList.find(p => p.id === id))
    .filter(Boolean) as Product[];

  const filteredProducts = productList.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const brochureHtml = RENDERERS[template](selectedProducts, settings, settings.accentColor);

  const printBrochure = useCallback(() => {
    const html = RENDERERS[template](selectedProducts, settings, settings.accentColor);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(settings.title || 'Brochure')}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: ${settings.pageSize} ${settings.orientation}; margin: 0.4in; }
    @media print { body { margin: 0; } }
    body { margin: 0; padding: 0; }
    img { max-width: 100%; }
  </style>
</head>
<body>${html}</body>
</html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 350);
  }, [template, selectedProducts, settings]);

  return (
    <div className="space-y-4">
      {/* Format selector */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Format</p>
        <div className="flex gap-2">
          {FORMATS.map(f => (
            <button key={f.id} type="button" onClick={() => handleFormatChange(f.id)}
              className={`flex-1 text-left px-4 py-3 rounded-xl border text-sm transition-all ${format === f.id ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:bg-muted/40'}`}
            >
              <div className="font-semibold text-sm">{f.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{f.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-5" style={{ minHeight: '600px' }}>
        {/* Left: Controls */}
        <div className="w-72 flex-shrink-0 space-y-3 overflow-y-auto" style={{ maxHeight: '82vh' }}>

          {/* Template picker */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Template</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-1.5">
              {TEMPLATES.map(t => (
                <button key={t.id} type="button" onClick={() => setTemplate(t.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${template === t.id ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:bg-muted/50'}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="font-semibold text-xs">{t.name}</div>
                      <div className="text-xs text-muted-foreground leading-tight">{t.desc}</div>
                    </div>
                    {template === t.id && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Product picker */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Products</CardTitle>
                {selectedIds.length > 0 && <Badge variant="secondary" className="text-xs">{selectedIds.length}</Badge>}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
              </div>
              <div className="border rounded-md overflow-y-auto space-y-px p-1" style={{ maxHeight: '220px' }}>
                {filteredProducts.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4">No products found</div>
                )}
                {filteredProducts.map(p => {
                  const sel = selectedIds.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => toggleProduct(p.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${sel ? 'bg-primary/8' : 'hover:bg-muted/40'}`}
                    >
                      <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${sel ? 'bg-primary border-primary' : 'border-input'}`}>
                        {sel && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </div>
                      <img src={p.image} className="w-7 h-7 object-cover rounded flex-shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-muted-foreground">${Number(p.price).toFixed(2)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedIds.length > 0 && (
                <button type="button" onClick={() => setSelectedIds([])}
                  className="text-xs text-muted-foreground hover:text-foreground w-full text-center underline"
                >
                  Clear all
                </button>
              )}
            </CardContent>
          </Card>

          {/* Drag-to-reorder selected products */}
          {selectedIds.length > 1 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1">
                <p className="text-xs text-muted-foreground mb-2">Drag to reorder</p>
                {selectedIds.map((id, i) => {
                  const p = productList.find(x => x.id === id);
                  if (!p) return null;
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={() => onDragStart(i)}
                      onDragOver={e => onDragOver(e, i)}
                      onDragEnd={onDragEnd}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs cursor-grab active:cursor-grabbing transition-colors select-none ${dragOver === i ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/40'}`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="w-4 text-center font-mono text-muted-foreground">{i + 1}</span>
                      <img src={p.image} className="w-6 h-6 object-cover rounded flex-shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
                      <span className="flex-1 truncate font-medium">{p.name}</span>
                      <button type="button" onClick={() => toggleProduct(id)}
                        className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Customization */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customize</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div>
                <Label className="text-xs">Title</Label>
                <Input value={settings.title} onChange={e => setSetting('title', e.target.value)} className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-xs">Tagline</Label>
                <Input value={settings.tagline} onChange={e => setSetting('tagline', e.target.value)} className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-xs">Footer Text</Label>
                <Input value={settings.footerText} onChange={e => setSetting('footerText', e.target.value)} className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-xs">Accent Color</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="color" value={settings.accentColor} onChange={e => setSetting('accentColor', e.target.value)} className="w-9 h-8 p-0.5 flex-shrink-0" />
                  <Input value={settings.accentColor} onChange={e => setSetting('accentColor', e.target.value)} className="h-8 text-xs flex-1 font-mono" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Columns</Label>
                <Select value={String(settings.columns)} onValueChange={v => setSetting('columns', Number(v))}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 columns</SelectItem>
                    <SelectItem value="3">3 columns</SelectItem>
                    <SelectItem value="4">4 columns</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Paper Size</Label>
                <Select value={settings.pageSize} onValueChange={v => setSetting('pageSize', v as PageSize)}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map(ps => (
                      <SelectItem key={ps.value} value={ps.value}>{ps.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Orientation</Label>
                <div className="flex gap-2 mt-1">
                  {(['portrait', 'landscape'] as const).map(o => (
                    <button key={o} type="button" onClick={() => setSetting('orientation', o)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-medium capitalize transition-all ${settings.orientation === o ? 'border-primary bg-primary/5 ring-1 ring-primary/20 text-primary' : 'border-border hover:bg-muted/40'}`}
                    >
                      {o === 'portrait' ? '↕ Portrait' : '↔ Landscape'}
                    </button>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                {([
                  ['showPrices', 'Show Prices'],
                  ['showDescriptions', 'Show Descriptions'],
                  ['showCategory', 'Show Categories'],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-xs font-normal cursor-pointer">{label}</Label>
                    <Switch checked={settings[key] as boolean} onCheckedChange={v => setSetting(key, v)} className="scale-[0.7] origin-right" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Preview */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedIds.length === 0
                ? 'Select products to preview your brochure'
                : `${selectedIds.length} product${selectedIds.length !== 1 ? 's' : ''} · ${PAGE_SIZES.find(p => p.value === settings.pageSize)?.label} · ${settings.orientation}`}
            </p>
            <Button onClick={printBrochure} disabled={selectedIds.length === 0} size="sm" className="gap-1.5">
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </Button>
          </div>

          <div className="flex-1 border rounded-xl bg-muted/20 overflow-auto">
            {selectedIds.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
                <BookOpen className="w-10 h-10 opacity-20" />
                <p className="text-sm">Your brochure preview will appear here</p>
              </div>
            ) : (
              <div className="bg-white shadow-sm" dangerouslySetInnerHTML={{ __html: brochureHtml }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
