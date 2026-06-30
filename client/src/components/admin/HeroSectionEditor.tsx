import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ImageDropZone } from './ImageDropZone';

const HERO_KEYS = [
  'heroLine1', 'heroLine1FontSize', 'heroLine1Weight', 'heroLine1Color',
  'heroLine2', 'heroLine2FontSize', 'heroLine2Weight', 'heroLine2Color',
  'heroSubtitle', 'heroSubtitleFontSize', 'heroSubtitleWeight', 'heroSubtitleColor',
  'heroAlign', 'heroTitleOffset', 'heroSubtitleOffset',
  'mapLabel', 'mapHint', 'nodeCircleSize',
  'feature1Title', 'feature1Desc', 'feature2Title', 'feature2Desc', 'feature3Title', 'feature3Desc',
  'storefrontHeroImage', 'storefrontHeroImageEnabled', 'storefrontHeroImagePosition', 'storefrontHeroImageOverlay',
  'storefrontInteriorImage', 'storefrontInteriorImageEnabled', 'storefrontInteriorImageAspect', 'storefrontInteriorImageSize',
  'storefrontAddress', 'storefrontHours', 'pickupSectionTitle', 'pickupSectionSubtitle',
  'footerTagline', 'aboutUsText',
];

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

export function HeroSectionEditor() {
  const queryClient = useQueryClient();
  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      return res.ok ? res.json() : {};
    },
    staleTime: 60000,
  });

  const [fields, setFields] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initialized && Object.keys(siteSettings).length > 0) {
      const loaded: Record<string, string> = {};
      HERO_KEYS.forEach(k => { loaded[k] = siteSettings[k] ?? ''; });
      setFields(loaded);
      setInitialized(true);
    }
  }, [siteSettings, initialized]);

  const set = (key: string, value: string) => setFields(prev => ({ ...prev, [key]: value }));
  const get = (key: string, def = '') => fields[key] ?? def;

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all(
        HERO_KEYS.map(async key => {
          const res = await fetch(`/api/site-settings/${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ value: fields[key] ?? '' }),
          });
          if (!res.ok) throw new Error(`Failed to save ${key}`);
        })
      );
      queryClient.invalidateQueries({ queryKey: ['site-settings'] });
      toast.success('Hero settings saved');
    } catch {
      toast.error('Failed to save hero settings');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-5 text-sm">

      {/* Hero Text */}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Hero Text</p>

        <div>
          <Label className="text-xs">Line 1</Label>
          <Input value={get('heroLine1')} onChange={e => set('heroLine1', e.target.value)} className="h-8 text-sm mt-1" placeholder="Shop Local." />
          <div className="flex gap-2 mt-1 flex-wrap">
            <Select value={get('heroLine1FontSize')} onValueChange={v => set('heroLine1FontSize', v)}>
              <SelectTrigger className="w-24 h-7 text-xs"><SelectValue placeholder="Size" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text-2xl">Small</SelectItem>
                <SelectItem value="text-3xl">Medium</SelectItem>
                <SelectItem value="text-4xl md:text-5xl lg:text-6xl">Large</SelectItem>
                <SelectItem value="text-5xl md:text-6xl lg:text-7xl">X-Large</SelectItem>
              </SelectContent>
            </Select>
            <Select value={get('heroLine1Weight')} onValueChange={v => set('heroLine1Weight', v)}>
              <SelectTrigger className="w-24 h-7 text-xs"><SelectValue placeholder="Weight" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="semibold">Semibold</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Input type="color" value={get('heroLine1Color') || '#000000'} onChange={e => set('heroLine1Color', e.target.value)} className="w-8 h-7 p-0.5 cursor-pointer" />
              {get('heroLine1Color') && <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={() => set('heroLine1Color', '')}>X</Button>}
            </div>
          </div>
        </div>

        <div>
          <Label className="text-xs">Line 2 (highlighted)</Label>
          <Input value={get('heroLine2')} onChange={e => set('heroLine2', e.target.value)} className="h-8 text-sm mt-1" placeholder="In-Store & Online." />
          <div className="flex gap-2 mt-1 flex-wrap">
            <Select value={get('heroLine2FontSize')} onValueChange={v => set('heroLine2FontSize', v)}>
              <SelectTrigger className="w-24 h-7 text-xs"><SelectValue placeholder="Size" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text-2xl">Small</SelectItem>
                <SelectItem value="text-3xl">Medium</SelectItem>
                <SelectItem value="text-4xl md:text-5xl lg:text-6xl">Large</SelectItem>
                <SelectItem value="text-5xl md:text-6xl lg:text-7xl">X-Large</SelectItem>
              </SelectContent>
            </Select>
            <Select value={get('heroLine2Weight')} onValueChange={v => set('heroLine2Weight', v)}>
              <SelectTrigger className="w-24 h-7 text-xs"><SelectValue placeholder="Weight" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="semibold">Semibold</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Input type="color" value={get('heroLine2Color') || '#14b8a6'} onChange={e => set('heroLine2Color', e.target.value)} className="w-8 h-7 p-0.5 cursor-pointer" />
              {get('heroLine2Color') && <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={() => set('heroLine2Color', '')}>X</Button>}
            </div>
          </div>
        </div>

        <div>
          <Label className="text-xs">Subtitle</Label>
          <Textarea value={get('heroSubtitle')} onChange={e => set('heroSubtitle', e.target.value)} className="text-sm mt-1 min-h-[48px]" placeholder="Browse our curated selection in person, or order online for local pickup." rows={2} />
          <div className="flex gap-2 mt-1 flex-wrap">
            <Select value={get('heroSubtitleFontSize')} onValueChange={v => set('heroSubtitleFontSize', v)}>
              <SelectTrigger className="w-24 h-7 text-xs"><SelectValue placeholder="Size" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text-sm">Small</SelectItem>
                <SelectItem value="text-base">Medium</SelectItem>
                <SelectItem value="text-lg md:text-xl">Large</SelectItem>
                <SelectItem value="text-xl md:text-2xl">X-Large</SelectItem>
              </SelectContent>
            </Select>
            <Select value={get('heroSubtitleWeight')} onValueChange={v => set('heroSubtitleWeight', v)}>
              <SelectTrigger className="w-24 h-7 text-xs"><SelectValue placeholder="Weight" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="semibold">Semibold</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Input type="color" value={get('heroSubtitleColor') || '#666666'} onChange={e => set('heroSubtitleColor', e.target.value)} className="w-8 h-7 p-0.5 cursor-pointer" />
              {get('heroSubtitleColor') && <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={() => set('heroSubtitleColor', '')}>X</Button>}
            </div>
          </div>
        </div>

        <div>
          <Label className="text-xs">Alignment</Label>
          <Select value={get('heroAlign')} onValueChange={v => set('heroAlign', v)}>
            <SelectTrigger className="w-32 h-7 text-xs mt-1"><SelectValue placeholder="Alignment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Title position — {get('heroTitleOffset', '0')}px</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="range" min="-100" max="100" step="1" value={get('heroTitleOffset', '0')} onChange={e => set('heroTitleOffset', e.target.value)} className="flex-1 accent-primary" />
              <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs shrink-0" onClick={() => set('heroTitleOffset', '0')}>Reset</Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Subtitle position — {get('heroSubtitleOffset', '0')}px</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="range" min="-100" max="100" step="1" value={get('heroSubtitleOffset', '0')} onChange={e => set('heroSubtitleOffset', e.target.value)} className="flex-1 accent-primary" />
              <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs shrink-0" onClick={() => set('heroSubtitleOffset', '0')}>Reset</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Photos */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Hero Photos</p>

        <div className="border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Foreground Photo</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Show</span>
              <Switch checked={get('storefrontHeroImageEnabled') !== 'false'} onCheckedChange={c => set('storefrontHeroImageEnabled', c ? 'true' : 'false')} />
            </div>
          </div>
          <ImageDropZone label="" value={get('storefrontHeroImage')} onChange={url => set('storefrontHeroImage', url)} onUpload={uploadImageFile} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Position</Label>
              <Select value={get('storefrontHeroImagePosition', 'center')} onValueChange={v => set('storefrontHeroImagePosition', v)}>
                <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="center top">Top</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="center bottom">Bottom</SelectItem>
                  <SelectItem value="left center">Left</SelectItem>
                  <SelectItem value="right center">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Overlay %</Label>
              <Input type="number" min={0} max={100} className="h-7 text-xs mt-1" placeholder="55" value={get('storefrontHeroImageOverlay')} onChange={e => set('storefrontHeroImageOverlay', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Background / Interior Photo</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Show</span>
              <Switch checked={get('storefrontInteriorImageEnabled') !== 'false'} onCheckedChange={c => set('storefrontInteriorImageEnabled', c ? 'true' : 'false')} />
            </div>
          </div>
          <ImageDropZone label="" hint="Optional — shown as a card alongside the foreground." value={get('storefrontInteriorImage')} onChange={url => set('storefrontInteriorImage', url)} onUpload={uploadImageFile} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Aspect Ratio</Label>
              <Select value={get('storefrontInteriorImageAspect', '4/3')} onValueChange={v => set('storefrontInteriorImageAspect', v)}>
                <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="4/3">Landscape (4:3)</SelectItem>
                  <SelectItem value="16/9">Wide (16:9)</SelectItem>
                  <SelectItem value="1/1">Square</SelectItem>
                  <SelectItem value="3/4">Portrait (3:4)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Size</Label>
              <Select value={get('storefrontInteriorImageSize', 'md')} onValueChange={v => set('storefrontInteriorImageSize', v)}>
                <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">Small</SelectItem>
                  <SelectItem value="md">Medium</SelectItem>
                  <SelectItem value="lg">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Store Info */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Store Info</p>
        <div>
          <Label className="text-xs">Store Address</Label>
          <Input value={get('storefrontAddress')} onChange={e => set('storefrontAddress', e.target.value)} className="h-8 text-sm mt-1" placeholder="3176 Walker Rd, Windsor, ON" />
        </div>
        <div>
          <Label className="text-xs">Store Hours</Label>
          <Input value={get('storefrontHours')} onChange={e => set('storefrontHours', e.target.value)} className="h-8 text-sm mt-1" placeholder="Mon–Fri 10am–6pm, Sat 10am–4pm" />
        </div>
        <div>
          <Label className="text-xs">Pickup Section Title</Label>
          <Input value={get('pickupSectionTitle')} onChange={e => set('pickupSectionTitle', e.target.value)} className="h-8 text-sm mt-1" placeholder="Community Pickup Locations" />
        </div>
        <div>
          <Label className="text-xs">Pickup Section Subtitle</Label>
          <Input value={get('pickupSectionSubtitle')} onChange={e => set('pickupSectionSubtitle', e.target.value)} className="h-8 text-sm mt-1" placeholder="Order online and pick up at a community location near you." />
        </div>
      </div>

      {/* Feature Cards */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Feature Cards</p>
        <div className="grid grid-cols-1 gap-3">
          {([1, 2, 3] as const).map(n => (
            <div key={n} className="border rounded-md p-2.5 space-y-1.5 bg-muted/10">
              <p className="text-[10px] text-muted-foreground font-medium">Card {n}</p>
              <Input value={get(`feature${n}Title`)} onChange={e => set(`feature${n}Title`, e.target.value)} className="h-7 text-xs" placeholder={['Same-Day Pickup', 'Neighbourhood Nodes', 'Free In-Store Pickup'][n - 1]} />
              <Textarea value={get(`feature${n}Desc`)} onChange={e => set(`feature${n}Desc`, e.target.value)} className="text-xs min-h-[40px]" rows={2} placeholder="Description..." />
            </div>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Map & Nodes</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Map Label</Label>
            <Input value={get('mapLabel')} onChange={e => set('mapLabel', e.target.value)} className="h-8 text-sm mt-1" placeholder="Pickup Zones" />
          </div>
          <div>
            <Label className="text-xs">Node Circle Size (m) — {get('nodeCircleSize', '500')}m</Label>
            <input type="range" min="100" max="2000" step="50" value={get('nodeCircleSize', '500')} onChange={e => set('nodeCircleSize', e.target.value)} className="w-full mt-1 accent-primary" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Map Hint</Label>
          <Input value={get('mapHint')} onChange={e => set('mapHint', e.target.value)} className="h-8 text-sm mt-1" placeholder="Each circle contains a pickup node. Click one to view available pickup times." />
        </div>
      </div>

      {/* Footer & About */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Footer & About</p>
        <div>
          <Label className="text-xs">Footer Tagline</Label>
          <Input value={get('footerTagline')} onChange={e => set('footerTagline', e.target.value)} className="h-8 text-sm mt-1" placeholder="Community-powered local pickup..." />
        </div>
        <div>
          <Label className="text-xs">About Us Page</Label>
          <Textarea value={get('aboutUsText')} onChange={e => set('aboutUsText', e.target.value)} className="text-sm mt-1 min-h-[80px]" rows={4} placeholder="Tell your story..." />
        </div>
      </div>

      <Button type="button" onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Save Hero Settings
      </Button>
    </div>
  );
}
