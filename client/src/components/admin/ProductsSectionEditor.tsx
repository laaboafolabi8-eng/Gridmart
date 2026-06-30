import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DEFAULT_LAYOUT = {
  columnsDesktop: '7',
  columnsTablet: '5',
  columnsMobile: '4',
  cardSize: 'standard',
  gridGap: 'normal',
  showName: true,
  showPrice: true,
  showDescription: false,
  showCondition: false,
  showBrand: false,
  showProductCode: false,
  imageAspect: 'square',
  imageFit: 'contain',
  nameMaxLines: '2',
  descMaxLines: '2',
  nameFontSize: 'small',
  priceFontSize: 'small',
  priceColor: '',
  priceWeight: 'bold',
  cardRadius: 'rounded',
  cardShadow: 'medium',
  cardBg: '',
  hoverEffect: 'scale',
  defaultSort: 'newest',
  headingText: '',
  headingFontSize: 'large',
  headingWeight: 'bold',
  headingColor: '',
  headingAlign: 'left',
  showHeading: true,
  subheadingText: '',
  subheadingFontSize: 'small',
  subheadingWeight: 'normal',
  subheadingColor: '',
  subheadingAlign: 'left',
  showSubheading: false,
  categoryHeadingFontSize: 'large',
  categoryHeadingWeight: 'bold',
  categoryHeadingColor: '',
  subcategoryHeadingFontSize: 'tiny',
  subcategoryHeadingWeight: 'medium',
  subcategoryHeadingColor: '',
};

type Layout = typeof DEFAULT_LAYOUT;

export function ProductsSectionEditor() {
  const queryClient = useQueryClient();
  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      return res.ok ? res.json() : {};
    },
    staleTime: 60000,
  });

  const [layout, setLayout] = useState<Layout>({ ...DEFAULT_LAYOUT });
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initialized && siteSettings.storefrontLayout) {
      try {
        const parsed = JSON.parse(siteSettings.storefrontLayout);
        setLayout(prev => ({ ...prev, ...parsed }));
        setInitialized(true);
      } catch {}
    }
  }, [siteSettings.storefrontLayout, initialized]);

  const set = <K extends keyof Layout>(key: K, value: Layout[K]) =>
    setLayout(prev => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/site-settings/storefrontLayout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ value: JSON.stringify(layout) }),
      });
      if (!res.ok) throw new Error('Save failed');
      queryClient.invalidateQueries({ queryKey: ['site-settings'] });
      toast.success('Product grid settings saved');
    } catch {
      toast.error('Failed to save product grid settings');
    }
    setSaving(false);
  };

  const fontSizeMap: Record<string, string> = { tiny: '10px', small: '12px', medium: '14px', large: '16px', xlarge: '20px' };
  const fwMap: Record<string, number> = { normal: 400, medium: 500, semibold: 600, bold: 700 };
  const aspectMap: Record<string, string> = { square: '1/1', '4:3': '4/3', '3:4': '3/4', '16:9': '16/9', auto: 'auto' };
  const radiusMap: Record<string, string> = { sharp: '0', slight: '4px', rounded: '8px', extra: '16px', pill: '24px' };
  const shadowMap: Record<string, string> = { none: 'none', subtle: '0 1px 3px rgba(0,0,0,0.1)', medium: '0 2px 8px rgba(0,0,0,0.15)', pronounced: '0 4px 16px rgba(0,0,0,0.2)' };
  const gapMap: Record<string, string> = { tight: '4px', normal: '8px', relaxed: '16px', spacious: '24px' };
  const padMap: Record<string, string> = { compact: '8px', standard: '16px', large: '24px' };

  return (
    <div className="space-y-5 text-sm">

      {/* Grid */}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Grid & Layout</p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Desktop cols</Label>
            <Select value={layout.columnsDesktop} onValueChange={v => set('columnsDesktop', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{['2','3','4','5','6','7','8','9','10','11','12'].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tablet cols</Label>
            <Select value={layout.columnsTablet} onValueChange={v => set('columnsTablet', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{['2','3','4','5','6','7','8'].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mobile cols</Label>
            <Select value={layout.columnsMobile} onValueChange={v => set('columnsMobile', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{['1','2','3','4'].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Card Size</Label>
            <Select value={layout.cardSize} onValueChange={v => set('cardSize', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Grid Gap</Label>
            <Select value={layout.gridGap} onValueChange={v => set('gridGap', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tight">Tight</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="relaxed">Relaxed</SelectItem>
                <SelectItem value="spacious">Spacious</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Image Aspect</Label>
            <Select value={layout.imageAspect} onValueChange={v => set('imageAspect', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="square">Square (1:1)</SelectItem>
                <SelectItem value="4:3">Landscape (4:3)</SelectItem>
                <SelectItem value="3:4">Portrait (3:4)</SelectItem>
                <SelectItem value="16:9">Wide (16:9)</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Image Fit</Label>
            <Select value={layout.imageFit} onValueChange={v => set('imageFit', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cover">Cover</SelectItem>
                <SelectItem value="contain">Contain</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Default Sort</Label>
            <Select value={layout.defaultSort} onValueChange={v => set('defaultSort', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="price-asc">Price ↑</SelectItem>
                <SelectItem value="price-desc">Price ↓</SelectItem>
                <SelectItem value="alpha">Alphabetical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Hover Effect</Label>
            <Select value={layout.hoverEffect} onValueChange={v => set('hoverEffect', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="lift">Lift</SelectItem>
                <SelectItem value="scale">Scale</SelectItem>
                <SelectItem value="border">Border</SelectItem>
                <SelectItem value="glow">Glow</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Card Content */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Card Content</p>
        <div className="grid grid-cols-2 gap-1.5">
          {([
            ['showName', 'Product Name'],
            ['showPrice', 'Price'],
            ['showDescription', 'Description'],
            ['showCondition', 'Condition Badge'],
            ['showBrand', 'Brand'],
            ['showProductCode', 'Product Code'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={layout[key] as boolean} onChange={e => set(key, e.target.checked as any)} className="rounded accent-primary" />
              <span className="text-xs">{label}</span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Name Max Lines</Label>
            <Select value={layout.nameMaxLines} onValueChange={v => set('nameMaxLines', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{['1','2','3','4','none'].map(n => <SelectItem key={n} value={n}>{n === 'none' ? 'No limit' : `${n} line${n === '1' ? '' : 's'}`}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Desc Max Lines</Label>
            <Select value={layout.descMaxLines} onValueChange={v => set('descMaxLines', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{['1','2','3','4','none'].map(n => <SelectItem key={n} value={n}>{n === 'none' ? 'No limit' : `${n} line${n === '1' ? '' : 's'}`}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Typography */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Typography & Card Style</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Name Font Size</Label>
            <Select value={layout.nameFontSize} onValueChange={v => set('nameFontSize', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tiny">Tiny</SelectItem>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Price Font Size</Label>
            <Select value={layout.priceFontSize} onValueChange={v => set('priceFontSize', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tiny">Tiny</SelectItem>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Price Weight</Label>
            <Select value={layout.priceWeight} onValueChange={v => set('priceWeight', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="semibold">Semibold</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Price Color</Label>
            <div className="flex gap-1 items-center mt-1">
              <Input type="color" value={layout.priceColor || '#14b8a6'} onChange={e => set('priceColor', e.target.value)} className="w-8 h-7 p-0.5 cursor-pointer" />
              {layout.priceColor && <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={() => set('priceColor', '')}>Clear</Button>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Card Radius</Label>
            <Select value={layout.cardRadius} onValueChange={v => set('cardRadius', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sharp">Sharp</SelectItem>
                <SelectItem value="slight">Slight</SelectItem>
                <SelectItem value="rounded">Rounded</SelectItem>
                <SelectItem value="extra">Extra</SelectItem>
                <SelectItem value="pill">Pill</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Card Shadow</Label>
            <Select value={layout.cardShadow} onValueChange={v => set('cardShadow', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="subtle">Subtle</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="pronounced">Strong</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Card Background</Label>
            <div className="flex gap-1 items-center mt-1">
              <Input type="color" value={layout.cardBg || '#ffffff'} onChange={e => set('cardBg', e.target.value)} className="w-8 h-7 p-0.5 cursor-pointer" />
              {layout.cardBg && <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={() => set('cardBg', '')}>Clear</Button>}
            </div>
          </div>
        </div>
      </div>

      {/* Headings */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Storefront Heading</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={layout.showHeading} onChange={e => set('showHeading', e.target.checked)} className="rounded accent-primary" />
          <span className="text-xs">Show heading</span>
        </label>
        {layout.showHeading && (
          <div className="space-y-2">
            <Input value={layout.headingText} onChange={e => set('headingText', e.target.value)} className="h-7 text-xs" placeholder="e.g. Shop Our Products" />
            <div className="grid grid-cols-4 gap-1.5">
              {[
                ['headingFontSize', ['small','medium','large','xlarge'], ['Small','Medium','Large','XL']],
                ['headingWeight', ['normal','medium','semibold','bold'], ['Normal','Med','Semi','Bold']],
                ['headingAlign', ['left','center','right'], ['Left','Center','Right']],
              ].map(([key, vals, labels]: any) => (
                <Select key={key} value={(layout as any)[key]} onValueChange={v => set(key as any, v)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{(vals as string[]).map((v, i) => <SelectItem key={v} value={v}>{(labels as string[])[i]}</SelectItem>)}</SelectContent>
                </Select>
              ))}
              <div className="flex items-center gap-1">
                <Input type="color" value={layout.headingColor || '#000000'} onChange={e => set('headingColor', e.target.value)} className="w-8 h-7 p-0.5 cursor-pointer" />
                {layout.headingColor && <Button type="button" variant="ghost" size="sm" className="h-7 px-1 text-xs" onClick={() => set('headingColor', '')}>X</Button>}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={layout.showSubheading} onChange={e => set('showSubheading', e.target.checked)} className="rounded accent-primary" />
          <span className="text-xs">Show subheading</span>
        </label>
        {layout.showSubheading && (
          <div className="space-y-2">
            <Input value={layout.subheadingText} onChange={e => set('subheadingText', e.target.value)} className="h-7 text-xs" placeholder="e.g. Fresh deals from your neighbourhood" />
            <div className="grid grid-cols-4 gap-1.5">
              {[
                ['subheadingFontSize', ['tiny','small','medium','large'], ['Tiny','Small','Med','Large']],
                ['subheadingWeight', ['normal','medium','semibold','bold'], ['Normal','Med','Semi','Bold']],
                ['subheadingAlign', ['left','center','right'], ['Left','Center','Right']],
              ].map(([key, vals, labels]: any) => (
                <Select key={key} value={(layout as any)[key]} onValueChange={v => set(key as any, v)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{(vals as string[]).map((v, i) => <SelectItem key={v} value={v}>{(labels as string[])[i]}</SelectItem>)}</SelectContent>
                </Select>
              ))}
              <div className="flex items-center gap-1">
                <Input type="color" value={layout.subheadingColor || '#666666'} onChange={e => set('subheadingColor', e.target.value)} className="w-8 h-7 p-0.5 cursor-pointer" />
                {layout.subheadingColor && <Button type="button" variant="ghost" size="sm" className="h-7 px-1 text-xs" onClick={() => set('subheadingColor', '')}>X</Button>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Category headings */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Category Headings</p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Category size</Label>
            <Select value={layout.categoryHeadingFontSize} onValueChange={v => set('categoryHeadingFontSize', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
                <SelectItem value="xlarge">X-Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Weight</Label>
            <Select value={layout.categoryHeadingWeight} onValueChange={v => set('categoryHeadingWeight', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="semibold">Semibold</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Color</Label>
            <div className="flex gap-1 items-center mt-1">
              <Input type="color" value={layout.categoryHeadingColor || '#000000'} onChange={e => set('categoryHeadingColor', e.target.value)} className="w-8 h-7 p-0.5 cursor-pointer" />
              {layout.categoryHeadingColor && <Button type="button" variant="ghost" size="sm" className="h-7 px-1 text-xs" onClick={() => set('categoryHeadingColor', '')}>X</Button>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Subcategory size</Label>
            <Select value={layout.subcategoryHeadingFontSize} onValueChange={v => set('subcategoryHeadingFontSize', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tiny">Tiny</SelectItem>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Weight</Label>
            <Select value={layout.subcategoryHeadingWeight} onValueChange={v => set('subcategoryHeadingWeight', v)}>
              <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="semibold">Semibold</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Color</Label>
            <div className="flex gap-1 items-center mt-1">
              <Input type="color" value={layout.subcategoryHeadingColor || '#999999'} onChange={e => set('subcategoryHeadingColor', e.target.value)} className="w-8 h-7 p-0.5 cursor-pointer" />
              {layout.subcategoryHeadingColor && <Button type="button" variant="ghost" size="sm" className="h-7 px-1 text-xs" onClick={() => set('subcategoryHeadingColor', '')}>X</Button>}
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="border-t pt-4 space-y-2">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Preview</p>
        <div className="border rounded-lg p-3 bg-background overflow-hidden">
          {layout.showHeading && (
            <div style={{ textAlign: layout.headingAlign as any, fontSize: fontSizeMap[layout.headingFontSize] || '20px', fontWeight: fwMap[layout.headingWeight] || 700, color: layout.headingColor || undefined, marginBottom: layout.showSubheading ? '2px' : '10px' }}>
              {layout.headingText || 'Shop Our Products'}
            </div>
          )}
          {layout.showSubheading && (
            <div style={{ textAlign: layout.subheadingAlign as any, fontSize: fontSizeMap[layout.subheadingFontSize] || '12px', fontWeight: fwMap[layout.subheadingWeight] || 400, color: layout.subheadingColor || '#666', marginBottom: '10px' }}>
              {layout.subheadingText || 'Fresh deals from your neighbourhood'}
            </div>
          )}
          <div style={{ fontSize: fontSizeMap[layout.categoryHeadingFontSize] || '20px', fontWeight: fwMap[layout.categoryHeadingWeight] || 700, color: layout.categoryHeadingColor || undefined, marginBottom: '6px' }}>Sample Category</div>
          <div style={{ fontSize: fontSizeMap[layout.subcategoryHeadingFontSize] || '10px', fontWeight: fwMap[layout.subcategoryHeadingWeight] || 500, color: layout.subcategoryHeadingColor || '#999', marginBottom: '6px', paddingLeft: '2px' }}>Sample Subcategory</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(parseInt(layout.columnsDesktop) || 4, 5)}, 1fr)`, gap: gapMap[layout.gridGap] || '8px' }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ borderRadius: radiusMap[layout.cardRadius] || '8px', boxShadow: shadowMap[layout.cardShadow] || 'none', backgroundColor: layout.cardBg || undefined, overflow: 'hidden' }}>
                <div style={{ aspectRatio: aspectMap[layout.imageAspect] || '1/1', backgroundColor: '#e5e7eb' }} />
                <div style={{ padding: padMap[layout.cardSize] || '16px' }}>
                  {layout.showName && <div style={{ fontSize: fontSizeMap[layout.nameFontSize] || '12px', fontWeight: 500, marginBottom: '3px' }}>Product {i}</div>}
                  {layout.showPrice && <div style={{ fontSize: fontSizeMap[layout.priceFontSize] || '12px', fontWeight: fwMap[layout.priceWeight] || 700, color: layout.priceColor || '#14b8a6' }}>${(9.99 * i).toFixed(2)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={saving} className="flex-1">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Grid Settings
        </Button>
        <Button type="button" variant="outline" onClick={() => { setLayout({ ...DEFAULT_LAYOUT }); setInitialized(false); }}>
          Reset
        </Button>
      </div>
    </div>
  );
}
