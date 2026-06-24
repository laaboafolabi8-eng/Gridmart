import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronUp, ChevronDown, Trash2, Plus, Shuffle, Zap, Gauge, AlertTriangle, Check, Upload, Loader2 } from 'lucide-react';
import {
  type HomepageSectionConfig,
  type HomepageSectionType,
  type SpeedRating,
  SECTION_DEFS,
  DEFAULT_HOMEPAGE_SECTIONS,
  generateRandomLayout,
  LAYOUT_TEMPLATE_COUNT,
} from '@/lib/homepageSections';
import { HeroSectionEditor } from './HeroSectionEditor';
import { ProductsSectionEditor } from './ProductsSectionEditor';

interface Props {
  value: HomepageSectionConfig[] | null | undefined;
  onChange: (sections: HomepageSectionConfig[]) => void;
}

async function uploadImageFile(file: File): Promise<string | null> {
  try {
    const urlRes = await fetch('/api/uploads/request-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    });
    if (!urlRes.ok) return null;
    const { uploadURL, objectPath } = await urlRes.json();
    const uploadRes = await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    if (!uploadRes.ok) return null;
    return `/api${objectPath}`;
  } catch {
    return null;
  }
}

function SpeedBadge({ rating, note }: { rating: SpeedRating; note: string }) {
  const cfg = {
    fast:   { label: 'Fast',   cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',  Icon: Zap },
    medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',  Icon: Gauge },
    slow:   { label: 'Slow',   cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',          Icon: AlertTriangle },
  }[rating];
  const { Icon } = cfg;
  return (
    <span title={note} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-help shrink-0 ${cfg.cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function genId() { return Math.random().toString(36).slice(2, 9); }

// Built-in sections that have their own editors even though defaultProps is empty
const SECTIONS_WITH_SETTINGS = new Set<HomepageSectionType>(['hero', 'products']);

export function HomepageBuilder({ value, onChange }: Props) {
  const sections: HomepageSectionConfig[] = value?.length ? value : DEFAULT_HOMEPAGE_SECTIONS;
  const [lastGeneratedName, setLastGeneratedName] = useState<string | null>(null);
  const [generateCount, setGenerateCount] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const move = (id: string, dir: -1 | 1) => {
    const idx = sections.findIndex(s => s.id === id);
    if (idx + dir < 0 || idx + dir >= sections.length) return;
    const copy = [...sections];
    [copy[idx], copy[idx + dir]] = [copy[idx + dir], copy[idx]];
    onChange(copy);
  };

  const remove = (id: string) => onChange(sections.filter(s => s.id !== id));

  const updateProps = (id: string, patch: Record<string, any>) =>
    onChange(sections.map(s => s.id === id ? { ...s, props: { ...s.props, ...patch } } : s));

  const addSection = (type: HomepageSectionType) => {
    const def = SECTION_DEFS[type];
    const newSec: HomepageSectionConfig = { id: genId(), type, enabled: true, props: { ...def.defaultProps } };
    onChange([...sections, newSec]);
    setExpandedId(newSec.id);
  };

  const handleGenerate = () => {
    const { name, sections: generated } = generateRandomLayout();
    setLastGeneratedName(name);
    setGenerateCount(c => c + 1);
    onChange(generated);
    setExpandedId(null);
  };

  const typeCounts: Partial<Record<HomepageSectionType, number>> = {};
  for (const s of sections) typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;

  const availableToAdd = (Object.keys(SECTION_DEFS) as HomepageSectionType[]).filter(
    type => (typeCounts[type] || 0) < SECTION_DEFS[type].maxCount
  );

  return (
    <div className="space-y-6">
      {/* Layout Generator */}
      <div className="border rounded-lg p-4 bg-gradient-to-br from-primary/5 to-primary/10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm flex items-center gap-1.5 mb-1">
              <Shuffle className="w-4 h-4 text-primary" />
              Layout Generator
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cycles through {LAYOUT_TEMPLATE_COUNT} curated layout patterns. Each follows structure rules — products always present,
              hero always first, no two heavy sections adjacent — so every result is sensible.
            </p>
            {lastGeneratedName && (
              <p className="text-xs mt-2 font-medium">
                <span className="text-muted-foreground">Generated: </span>
                <span className="text-primary font-bold">{lastGeneratedName}</span>
                {generateCount > 1 && (
                  <span className="text-muted-foreground font-normal"> · {generateCount} generated this session</span>
                )}
              </p>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={handleGenerate}>
            <Shuffle className="w-3.5 h-3.5" />
            {generateCount === 0 ? 'Generate Layout' : 'Try Another'}
          </Button>
        </div>
      </div>

      {/* Active Sections */}
      <div>
        <h4 className="text-sm font-semibold mb-2">
          Active Sections
          <span className="text-muted-foreground font-normal ml-1">— reorder with arrows, expand to configure</span>
        </h4>
        <div className="space-y-1.5">
          {sections.map((section, idx) => {
            const def = SECTION_DEFS[section.type];
            const isExpanded = expandedId === section.id;
            const hasSettings = Object.keys(def.defaultProps).length > 0 || SECTIONS_WITH_SETTINGS.has(section.type);
            return (
              <div key={section.id} className="border rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/20">
                  <span className="text-base leading-none select-none">{def.emoji}</span>
                  <span className="flex-1 text-sm font-medium">{def.label}</span>
                  <SpeedBadge rating={def.speedRating} note={def.speedNote} />
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 p-0" onClick={() => move(section.id, -1)} disabled={idx === 0}>
                      <ChevronUp className="w-3 h-3" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 p-0" onClick={() => move(section.id, 1)} disabled={idx === sections.length - 1}>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                    {hasSettings && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-muted-foreground"
                        onClick={() => setExpandedId(isExpanded ? null : section.id)}
                      >
                        {isExpanded ? 'Close' : 'Settings'}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(section.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                {isExpanded && hasSettings && (
                  <div className="p-3 border-t bg-background">
                    <SectionPropsEditor section={section} onChange={patch => updateProps(section.id, patch)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section Library */}
      {availableToAdd.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Add Sections</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {availableToAdd.map(type => {
              const def = SECTION_DEFS[type];
              return (
                <div key={type} className="border rounded-lg p-3 flex gap-3 items-start hover:bg-muted/30 transition-colors group">
                  <span className="text-2xl leading-none mt-0.5 select-none">{def.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-semibold">{def.label}</span>
                      <SpeedBadge rating={def.speedRating} note={def.speedNote} />
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug mb-1">{def.description}</p>
                    <p className="text-[10px] text-muted-foreground/60 italic leading-snug">{def.speedNote}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs shrink-0 gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
                    onClick={() => addSection(type)}
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionPropsEditor({
  section,
  onChange,
}: {
  section: HomepageSectionConfig;
  onChange: (patch: Record<string, any>) => void;
}) {
  const p = section.props;

  if (section.type === 'hero') {
    return <HeroSectionEditor />;
  }

  if (section.type === 'products') {
    return <ProductsSectionEditor />;
  }

  if (section.type === 'textBlock') {
    return (
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Heading</Label>
          <Input value={p.heading || ''} onChange={e => onChange({ heading: e.target.value })} className="h-8 text-sm mt-1" placeholder="Welcome to GridMart" />
        </div>
        <div>
          <Label className="text-xs">Body Text</Label>
          <Textarea value={p.body || ''} onChange={e => onChange({ body: e.target.value })} className="text-sm mt-1 min-h-[60px]" placeholder="Your store tagline or announcement..." />
        </div>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <Label className="text-xs">Alignment</Label>
            <Select value={p.align || 'center'} onValueChange={v => onChange({ align: v })}>
              <SelectTrigger className="h-8 w-28 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Centre</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Background</Label>
            <div className="flex items-center gap-1.5 mt-1">
              <Input type="color" value={p.bg || '#ffffff'} onChange={e => onChange({ bg: e.target.value })} className="h-8 w-10 p-1 cursor-pointer" />
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs px-2 text-muted-foreground" onClick={() => onChange({ bg: '' })}>Clear</Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Text colour</Label>
            <div className="flex items-center gap-1.5 mt-1">
              <Input type="color" value={p.textColor || '#000000'} onChange={e => onChange({ textColor: e.target.value })} className="h-8 w-10 p-1 cursor-pointer" />
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs px-2 text-muted-foreground" onClick={() => onChange({ textColor: '' })}>Clear</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (section.type === 'promoBanner') {
    return (
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Banner Image</Label>
          <div className="flex gap-2 mt-1">
            <Input value={p.imageUrl || ''} onChange={e => onChange({ imageUrl: e.target.value })} className="h-8 text-sm" placeholder="https://... or upload below" />
          </div>
          <ImageUploadButton currentUrl={p.imageUrl || ''} onUploaded={url => onChange({ imageUrl: url })} />
        </div>
        {p.imageUrl && (
          <div className="rounded-md overflow-hidden border h-20">
            <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Heading (optional)</Label>
            <Input value={p.heading || ''} onChange={e => onChange({ heading: e.target.value })} className="h-8 text-sm mt-1" placeholder="Summer Sale" />
          </div>
          <div>
            <Label className="text-xs">Subtext (optional)</Label>
            <Input value={p.subtext || ''} onChange={e => onChange({ subtext: e.target.value })} className="h-8 text-sm mt-1" placeholder="Up to 40% off" />
          </div>
          <div>
            <Label className="text-xs">Button label</Label>
            <Input value={p.ctaLabel || ''} onChange={e => onChange({ ctaLabel: e.target.value })} className="h-8 text-sm mt-1" placeholder="Shop Now" />
          </div>
          <div>
            <Label className="text-xs">Button URL</Label>
            <Input value={p.ctaUrl || ''} onChange={e => onChange({ ctaUrl: e.target.value })} className="h-8 text-sm mt-1" placeholder="/products" />
          </div>
        </div>
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <Label className="text-xs">Overlay darkness — {p.overlay ?? 40}%</Label>
            <input
              type="range"
              min="0"
              max="80"
              value={p.overlay ?? 40}
              onChange={e => onChange({ overlay: parseInt(e.target.value) })}
              className="block mt-1.5 w-36 accent-primary"
            />
          </div>
          <div>
            <Label className="text-xs">Text colour</Label>
            <Input type="color" value={p.textColor || '#ffffff'} onChange={e => onChange({ textColor: e.target.value })} className="h-8 w-10 mt-1 p-1 cursor-pointer" />
          </div>
        </div>
      </div>
    );
  }

  if (section.type === 'slideshow') {
    const slides: Array<{ imageUrl: string; caption?: string; ctaLabel?: string; ctaUrl?: string }> =
      Array.isArray(p.slides) ? p.slides : [{ imageUrl: '', caption: '', ctaLabel: '', ctaUrl: '' }];

    const updateSlide = (i: number, patch: Record<string, string>) =>
      onChange({ slides: slides.map((s, idx) => idx === i ? { ...s, ...patch } : s) });
    const addSlide = () => onChange({ slides: [...slides, { imageUrl: '', caption: '', ctaLabel: '', ctaUrl: '' }] });
    const removeSlide = (i: number) => onChange({ slides: slides.filter((_, idx) => idx !== i) });

    return (
      <div className="space-y-3">
        <div className="flex gap-3 flex-wrap">
          <div>
            <Label className="text-xs">Height (px)</Label>
            <Input type="number" value={p.height || '400'} onChange={e => onChange({ height: e.target.value })} className="h-8 w-24 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Autoplay (ms, 0 = off)</Label>
            <Input type="number" value={p.autoplayMs ?? 4000} onChange={e => onChange({ autoplayMs: parseInt(e.target.value) || 0 })} className="h-8 w-28 text-sm mt-1" />
          </div>
        </div>
        <div className="space-y-2">
          {slides.map((slide, i) => (
            <div key={i} className="border rounded-md p-2.5 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Slide {i + 1}</span>
                {slides.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeSlide(i)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                <Input value={slide.imageUrl} onChange={e => updateSlide(i, { imageUrl: e.target.value })} className="h-8 text-xs" placeholder="Image URL (https://...)" />
                <ImageUploadButton currentUrl={slide.imageUrl} onUploaded={url => updateSlide(i, { imageUrl: url })} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input value={slide.caption || ''} onChange={e => updateSlide(i, { caption: e.target.value })} className="h-8 text-xs" placeholder="Caption" />
                <Input value={slide.ctaLabel || ''} onChange={e => updateSlide(i, { ctaLabel: e.target.value })} className="h-8 text-xs" placeholder="Button text" />
                <Input value={slide.ctaUrl || ''} onChange={e => updateSlide(i, { ctaUrl: e.target.value })} className="h-8 text-xs" placeholder="Button URL" />
              </div>
            </div>
          ))}
          {slides.length < 8 && (
            <Button type="button" variant="outline" size="sm" className="w-full h-7 text-xs border-dashed gap-1" onClick={addSlide}>
              <Plus className="w-3 h-3" /> Add Slide
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (section.type === 'featuredProducts') {
    const source = p.source || 'newest';
    return (
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Section Heading</Label>
          <Input value={p.heading || ''} onChange={e => onChange({ heading: e.target.value })} className="h-8 text-sm mt-1" placeholder="Featured This Week" />
        </div>
        <div className="flex gap-3 flex-wrap">
          <div>
            <Label className="text-xs">Source</Label>
            <Select value={source} onValueChange={v => onChange({ source: v, productIds: v !== 'manual' ? [] : (p.productIds || []) })}>
              <SelectTrigger className="h-8 w-44 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest Products</SelectItem>
                <SelectItem value="sale">On Sale</SelectItem>
                <SelectItem value="manual">Hand-pick Products</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Max shown</Label>
            <Input type="number" min="1" max="8" value={p.count || 4} onChange={e => onChange({ count: parseInt(e.target.value) || 1 })} className="h-8 w-20 text-sm mt-1" />
          </div>
        </div>
        {source === 'manual' && (
          <div>
            <Label className="text-xs mb-1 block">Select Products</Label>
            <ManualProductPicker
              selected={Array.isArray(p.productIds) ? p.productIds : []}
              onChange={ids => onChange({ productIds: ids })}
            />
          </div>
        )}
        {source === 'manual' && Array.isArray(p.productIds) && p.productIds.length === 1 && (
          <FeaturedSingleCropEditor
            productId={String(p.productIds[0])}
            position={p.featuredImagePosition || '50% 50%'}
            scale={p.featuredImageScale || 1}
            onPositionChange={pos => onChange({ featuredImagePosition: pos })}
            onScaleChange={s => onChange({ featuredImageScale: s })}
          />
        )}
      </div>
    );
  }

  if (section.type === 'categoriesGrid') {
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-xs">Section Heading</Label>
          <Input value={p.heading || ''} onChange={e => onChange({ heading: e.target.value })} className="h-8 text-sm mt-1" placeholder="Shop by Category" />
        </div>
        <div>
          <Label className="text-xs">Columns</Label>
          <Select value={String(p.columns || 3)} onValueChange={v => onChange({ columns: parseInt(v) })}>
            <SelectTrigger className="h-8 w-28 text-xs mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 columns</SelectItem>
              <SelectItem value="3">3 columns</SelectItem>
              <SelectItem value="4">4 columns</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-2 block">Category Images</Label>
          <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
            Upload a custom image or pick a product from that category. Leave blank to use the first product image automatically.
          </p>
          <CategoryImageEditor
            categoryImages={p.categoryImages || {}}
            onChange={imgs => onChange({ categoryImages: imgs })}
          />
        </div>
      </div>
    );
  }

  return null;
}

// ── Category image types ──────────────────────────────────────────────────────

type CatImgData = { url: string; position?: string; scale?: number };

function normCatImg(val: string | CatImgData | undefined): CatImgData {
  if (!val) return { url: '' };
  if (typeof val === 'string') return { url: val };
  return val;
}

// ── Image upload inline button ────────────────────────────────────────────────

function ImageUploadButton({ currentUrl, onUploaded }: { currentUrl: string; onUploaded: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    setUploading(true);
    const url = await uploadImageFile(file);
    if (url) {
      onUploaded(url);
      toast.success('Image uploaded');
    } else {
      toast.error('Upload failed');
    }
    setUploading(false);
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1.5 mt-1"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
        {uploading ? 'Uploading...' : currentUrl ? 'Replace Image' : 'Upload Image'}
      </Button>
    </>
  );
}

// ── Focal point picker ────────────────────────────────────────────────────────

function FocalPointPicker({
  imageUrl,
  position,
  scale,
  onPositionChange,
  onScaleChange,
}: {
  imageUrl: string;
  position: string;
  scale: number;
  onPositionChange: (pos: string) => void;
  onScaleChange: (s: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const onUp = () => setIsDragging(false);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  const parts = (position || '50% 50%').split(' ');
  const px = parseFloat(parts[0]) || 50;
  const py = parseFloat(parts[1]) || 50;

  const updatePos = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, Math.round(((clientX - rect.left) / rect.width) * 100)));
    const y = Math.max(0, Math.min(100, Math.round(((clientY - rect.top) / rect.height) * 100)));
    onPositionChange(`${x}% ${y}%`);
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground">Click or drag to set the focal point — the image will be cropped around this spot</p>
      <div
        ref={containerRef}
        className="relative rounded-lg overflow-hidden border cursor-crosshair select-none"
        style={{ aspectRatio: '1/1' }}
        onMouseDown={e => { setIsDragging(true); updatePos(e.clientX, e.clientY); }}
        onMouseMove={e => { if (isDragging) updatePos(e.clientX, e.clientY); }}
        onMouseUp={() => setIsDragging(false)}
      >
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{
            objectPosition: position || '50% 50%',
            transform: `scale(${scale || 1})`,
            transformOrigin: position || '50% 50%',
          }}
        />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 bottom-0 w-px bg-white/50" style={{ left: `${px}%` }} />
          <div className="absolute left-0 right-0 h-px bg-white/50" style={{ top: `${py}%` }} />
          <div
            className="absolute w-4 h-4 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${px}%`, top: `${py}%`, boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4)' }}
          />
        </div>
        <div className="absolute bottom-1.5 left-1.5 text-[9px] text-white bg-black/40 rounded px-1.5 py-0.5 pointer-events-none">
          {px}% · {py}%
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-[10px] text-muted-foreground shrink-0">Zoom — {Math.round((scale || 1) * 100)}%</Label>
        <input
          type="range"
          min="100"
          max="200"
          step="5"
          value={Math.round((scale || 1) * 100)}
          onChange={e => onScaleChange(parseInt(e.target.value) / 100)}
          className="flex-1 accent-primary"
        />
        {(scale || 1) > 1 && (
          <button type="button" className="text-[10px] text-primary shrink-0" onClick={() => onScaleChange(1)}>Reset</button>
        )}
      </div>
    </div>
  );
}

// ── Category image editor ─────────────────────────────────────────────────────

function CategoryImageEditor({
  onChange,
}: {
  categoryImages: Record<string, string | CatImgData>;
  onChange: (imgs: Record<string, string | CatImgData>) => void;
}) {
  const queryClient = useQueryClient();
  const [catSearch, setCatSearch] = useState<Record<string, string>>({});
  const [editingFocal, setEditingFocal] = useState<string | null>(null);

  // Read category images from site-settings so they survive section deletion
  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      return res.ok ? res.json() : {};
    },
    staleTime: 60000,
  });

  const categoryImages: Record<string, string | CatImgData> = (() => {
    if (!siteSettings.categoryImages) return {};
    try { return JSON.parse(siteSettings.categoryImages); }
    catch { return {}; }
  })();

  const { data: categories = [] } = useQuery<Array<{ id: string; name: string; parentId?: string | null; sortOrder: number }>>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      return res.ok ? res.json() : [];
    },
    staleTime: 60000,
  });

  const { data: products = [] } = useQuery<Array<{ id: string; name: string; category: string; images?: string[] }>>({
    queryKey: ['products', 'live'],
    queryFn: async () => {
      const res = await fetch('/api/products?live=true');
      return res.ok ? res.json() : [];
    },
    staleTime: 60000,
  });

  const topLevel = categories.filter(c => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);

  const productsByCategory = products.reduce((map, p) => {
    if (!map[p.category]) map[p.category] = [];
    map[p.category].push(p);
    return map;
  }, {} as Record<string, typeof products>);

  const activeCategories = topLevel.filter(c => (productsByCategory[c.name]?.length ?? 0) > 0);

  const getCatImg = (catName: string): CatImgData => normCatImg(categoryImages[catName]);

  const setImg = async (catName: string, patch: Partial<CatImgData>) => {
    const next = { ...getCatImg(catName), ...patch };
    let updated: Record<string, string | CatImgData>;
    if (!next.url) {
      updated = { ...categoryImages };
      delete updated[catName];
    } else {
      updated = { ...categoryImages, [catName]: next };
    }
    onChange(updated); // keep section props in sync
    // Persist to site-settings independently so images survive section deletion
    const res = await fetch('/api/site-settings/categoryImages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(updated) }),
    });
    if (res.ok) queryClient.invalidateQueries({ queryKey: ['site-settings'] });
  };

  if (!activeCategories.length) {
    return <p className="text-xs text-muted-foreground">No active categories found.</p>;
  }

  return (
    <div className="space-y-2">
      {activeCategories.map(cat => {
        const data = getCatImg(cat.name);
        const autoImg = productsByCategory[cat.name]?.find(p => p.images?.length)?.images?.[0] || '';
        const displayUrl = data.url || autoImg;
        const catProds = productsByCategory[cat.name] || [];
        const search = catSearch[cat.name] || '';
        const filteredProds = catProds.filter(p =>
          p.images?.length && p.name.toLowerCase().includes(search.toLowerCase())
        );
        const isFocalOpen = editingFocal === cat.name;

        return (
          <div key={cat.id} className="border rounded-md p-2.5 space-y-2 bg-muted/10">
            {/* Header */}
            <div className="flex items-center gap-2">
              {displayUrl && (
                <div className="w-10 h-10 rounded overflow-hidden border shrink-0">
                  <img
                    src={displayUrl}
                    alt={cat.name}
                    className="w-full h-full object-cover"
                    style={{
                      objectPosition: data.position || '50% 50%',
                      transform: `scale(${data.scale || 1})`,
                      transformOrigin: data.position || '50% 50%',
                    }}
                  />
                </div>
              )}
              <span className="text-xs font-semibold flex-1">{cat.name}</span>
              <div className="flex items-center gap-1">
                {displayUrl && (
                  <Button
                    type="button"
                    variant={isFocalOpen ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 px-1.5 text-[10px]"
                    onClick={() => setEditingFocal(isFocalOpen ? null : cat.name)}
                  >
                    {isFocalOpen ? 'Done' : 'Adjust'}
                  </Button>
                )}
                {data.url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] text-muted-foreground"
                    onClick={() => { setImg(cat.name, { url: '' }); setEditingFocal(null); }}
                  >
                    Auto
                  </Button>
                )}
              </div>
            </div>

            {/* Focal point / crop editor */}
            {isFocalOpen && displayUrl && (
              <FocalPointPicker
                imageUrl={displayUrl}
                position={data.position || '50% 50%'}
                scale={data.scale || 1}
                onPositionChange={pos => setImg(cat.name, { position: pos })}
                onScaleChange={s => setImg(cat.name, { scale: s })}
              />
            )}

            {/* Searchable product picker */}
            <div className="space-y-1">
              <Input
                value={search}
                onChange={e => setCatSearch(prev => ({ ...prev, [cat.name]: e.target.value }))}
                className="h-7 text-xs"
                placeholder={`Search ${cat.name} products…`}
              />
              <div className="border rounded-md max-h-40 overflow-y-auto divide-y divide-border/30">
                <button
                  type="button"
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors ${!data.url ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                  onClick={() => { setImg(cat.name, { url: '' }); setEditingFocal(null); }}
                >
                  <div className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${!data.url ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                    {!data.url && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  <span className={!data.url ? 'font-medium' : 'text-muted-foreground italic'}>Auto (first product image)</span>
                  {autoImg && (
                    <div className="ml-auto w-7 h-7 rounded overflow-hidden shrink-0">
                      <img src={autoImg} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                </button>
                {filteredProds.map(p => {
                  const isSelected = data.url === p.images![0];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                      onClick={() => { setImg(cat.name, { url: p.images![0] }); setEditingFocal(cat.name); }}
                    >
                      <div className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </div>
                      <div className="w-7 h-7 rounded overflow-hidden shrink-0">
                        <img src={p.images![0]} alt="" className="w-full h-full object-cover" />
                      </div>
                      <span className="flex-1 truncate">{p.name}</span>
                    </button>
                  );
                })}
                {filteredProds.length === 0 && (
                  <p className="p-2 text-[10px] text-muted-foreground text-center">
                    {search ? `No products match "${search}"` : 'No products with images'}
                  </p>
                )}
              </div>
            </div>

            {/* Custom URL + upload */}
            <div className="flex gap-1.5">
              <Input
                value={data.url}
                onChange={e => setImg(cat.name, { url: e.target.value })}
                className="h-7 text-xs flex-1"
                placeholder="Or paste custom image URL…"
              />
              <ImageUploadButton
                currentUrl={data.url}
                onUploaded={url => { setImg(cat.name, { url }); setEditingFocal(cat.name); }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Featured single-product crop editor ──────────────────────────────────────

function FeaturedSingleCropEditor({
  productId,
  position,
  scale,
  onPositionChange,
  onScaleChange,
}: {
  productId: string;
  position: string;
  scale: number;
  onPositionChange: (pos: string) => void;
  onScaleChange: (s: number) => void;
}) {
  const { data: product } = useQuery<{ id: string; name: string; images?: string[] }>({
    queryKey: ['product-picker', productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}`);
      return res.ok ? res.json() : null;
    },
    enabled: !!productId,
    staleTime: 300000,
  });

  const imageUrl = product?.images?.[0] || '';
  if (!imageUrl) return null;

  return (
    <div className="space-y-1.5 border-t pt-3">
      <Label className="text-xs font-medium">Banner Image Crop</Label>
      <p className="text-[10px] text-muted-foreground">Adjust focal point and zoom for the single-product banner layout</p>
      <FocalPointPicker
        imageUrl={imageUrl}
        position={position}
        scale={scale}
        onPositionChange={onPositionChange}
        onScaleChange={onScaleChange}
      />
    </div>
  );
}

// ── Manual product picker ─────────────────────────────────────────────────────

function ManualProductPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');

  const { data: allProducts = [] } = useQuery<Array<{ id: string; name: string; category?: string }>>({
    queryKey: ['products', 'admin-picker'],
    queryFn: async () => {
      const res = await fetch('/api/products');
      return res.ok ? res.json() : [];
    },
    staleTime: 300000,
  });

  const selectedStrs = selected.map(String);

  const filtered = allProducts
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 60);

  const toggle = (id: string) => {
    if (selectedStrs.includes(id)) {
      onChange(selected.filter(s => String(s) !== id));
    } else if (selected.length < 8) {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground">{selected.length} selected · max 8</p>
      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search products..."
        className="h-7 text-xs"
      />
      <div className="border rounded-md max-h-52 overflow-y-auto divide-y divide-border/50">
        {filtered.map(prod => {
          const isSelected = selectedStrs.includes(String(prod.id));
          return (
            <button
              key={prod.id}
              type="button"
              onClick={() => toggle(String(prod.id))}
              disabled={!isSelected && selected.length >= 8}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'} disabled:opacity-40`}
            >
              <div className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
              </div>
              <span className="flex-1 truncate">{prod.name}</span>
              {prod.category && <span className="text-muted-foreground/60 shrink-0 text-[10px]">{prod.category}</span>}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground text-center">No products found</p>
        )}
      </div>
    </div>
  );
}
