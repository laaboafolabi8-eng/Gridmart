import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronUp, ChevronDown, Trash2, Plus, Shuffle, Zap, Gauge, AlertTriangle } from 'lucide-react';
import {
  type HomepageSectionConfig,
  type HomepageSectionType,
  type SpeedRating,
  SECTION_DEFS,
  DEFAULT_HOMEPAGE_SECTIONS,
  generateRandomLayout,
  LAYOUT_TEMPLATE_COUNT,
} from '@/lib/homepageSections';

interface Props {
  value: HomepageSectionConfig[] | null | undefined;
  onChange: (sections: HomepageSectionConfig[]) => void;
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
            if (!def) return null;
            const isExpanded = expandedId === section.id;
            const hasProps = Object.keys(def.defaultProps).length > 0;
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
                    {hasProps && (
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
                {isExpanded && hasProps && (
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
          <Label className="text-xs">Image URL</Label>
          <Input value={p.imageUrl || ''} onChange={e => onChange({ imageUrl: e.target.value })} className="h-8 text-sm mt-1" placeholder="https://..." />
        </div>
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
              <Input value={slide.imageUrl} onChange={e => updateSlide(i, { imageUrl: e.target.value })} className="h-8 text-xs" placeholder="Image URL (https://...)" />
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
    return (
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Section Heading</Label>
          <Input value={p.heading || ''} onChange={e => onChange({ heading: e.target.value })} className="h-8 text-sm mt-1" placeholder="Featured This Week" />
        </div>
        <div className="flex gap-3 flex-wrap">
          <div>
            <Label className="text-xs">Source</Label>
            <Select value={p.source || 'newest'} onValueChange={v => onChange({ source: v })}>
              <SelectTrigger className="h-8 w-40 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest Products</SelectItem>
                <SelectItem value="sale">On Sale</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Max products shown</Label>
            <Input type="number" min="2" max="8" value={p.count || 4} onChange={e => onChange({ count: parseInt(e.target.value) || 4 })} className="h-8 w-20 text-sm mt-1" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <p className="text-xs text-muted-foreground">
      This section is configured via the Homepage Copy and Storefront Layout settings below.
    </p>
  );
}
