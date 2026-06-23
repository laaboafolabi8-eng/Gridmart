export type HomepageSectionType =
  | 'hero'
  | 'searchFilter'
  | 'products'
  | 'textBlock'
  | 'promoBanner'
  | 'slideshow'
  | 'featuredProducts';

export type SpeedRating = 'fast' | 'medium' | 'slow';

export interface HomepageSectionDef {
  type: HomepageSectionType;
  label: string;
  description: string;
  speedRating: SpeedRating;
  speedNote: string;
  emoji: string;
  maxCount: number;
  defaultProps: Record<string, any>;
}

export interface HomepageSectionConfig {
  id: string;
  type: HomepageSectionType;
  enabled: boolean;
  props: Record<string, any>;
}

export const SECTION_DEFS: Record<HomepageSectionType, HomepageSectionDef> = {
  hero: {
    type: 'hero',
    label: 'Hero Banner',
    description: 'Full-width hero image with headline, subtitle, and CTA buttons. Styled from Homepage Copy settings below.',
    speedRating: 'fast',
    speedNote: 'Uses images already loaded by the store — no extra network requests.',
    emoji: '🖼️',
    maxCount: 1,
    defaultProps: {},
  },
  searchFilter: {
    type: 'searchFilter',
    label: 'Search & Filters',
    description: 'Search bar with live filtering and category pill navigation. Client-side only.',
    speedRating: 'fast',
    speedNote: 'Filters the already-loaded product list — zero additional requests.',
    emoji: '🔍',
    maxCount: 1,
    defaultProps: {},
  },
  products: {
    type: 'products',
    label: 'Product Grid',
    description: 'Main product catalogue organized by category and subcategory. Required for shoppers to browse your store.',
    speedRating: 'medium',
    speedNote: 'Fetches all active products on load. Speed scales with product count and image sizes.',
    emoji: '📦',
    maxCount: 1,
    defaultProps: {},
  },
  textBlock: {
    type: 'textBlock',
    label: 'Text Block',
    description: 'Static heading and paragraph — ideal for announcements, brand messaging, or seasonal copy.',
    speedRating: 'fast',
    speedNote: 'Pure text, no images or network requests. Zero performance impact.',
    emoji: '📝',
    maxCount: 3,
    defaultProps: {
      heading: 'Welcome to GridMart',
      body: 'Your local source for electronics, tools, health and beauty, and more.',
      align: 'center',
      bg: '',
      textColor: '',
    },
  },
  promoBanner: {
    type: 'promoBanner',
    label: 'Promo Banner',
    description: 'Full-width image banner with optional headline and CTA button. Great for seasonal sales or campaigns.',
    speedRating: 'fast',
    speedNote: 'One additional image request. Use a compressed image (under 200 KB) for best results.',
    emoji: '🏷️',
    maxCount: 2,
    defaultProps: {
      imageUrl: '',
      heading: '',
      subtext: '',
      ctaLabel: 'Shop Now',
      ctaUrl: '',
      overlay: 40,
      textColor: '#ffffff',
    },
  },
  slideshow: {
    type: 'slideshow',
    label: 'Slideshow',
    description: 'Auto-advancing image carousel with optional captions. Best for showcasing multiple promotions.',
    speedRating: 'medium',
    speedNote: 'Loads all slide images upfront. Keep under 5 slides and use images under 150 KB each.',
    emoji: '🎠',
    maxCount: 1,
    defaultProps: {
      slides: [{ imageUrl: '', caption: '', ctaLabel: '', ctaUrl: '' }],
      autoplayMs: 4000,
      showDots: true,
      height: '400',
    },
  },
  featuredProducts: {
    type: 'featuredProducts',
    label: 'Featured Products',
    description: 'A spotlight row showing your newest or on-sale products. Picks automatically from your catalogue.',
    speedRating: 'fast',
    speedNote: 'Reuses product data already fetched for the main grid — no extra requests.',
    emoji: '⭐',
    maxCount: 1,
    defaultProps: {
      heading: 'Featured This Week',
      count: 4,
      source: 'newest',
    },
  },
};

export const DEFAULT_HOMEPAGE_SECTIONS: HomepageSectionConfig[] = [
  { id: 'hero', type: 'hero', enabled: true, props: {} },
  { id: 'searchFilter', type: 'searchFilter', enabled: true, props: {} },
  { id: 'products', type: 'products', enabled: true, props: {} },
];

// Named curated templates — ordered to be sensible, not random
const LAYOUT_TEMPLATES: Array<{ name: string; sequence: HomepageSectionType[] }> = [
  { name: 'Classic',     sequence: ['hero', 'searchFilter', 'products'] },
  { name: 'Marketing',   sequence: ['hero', 'promoBanner', 'searchFilter', 'products'] },
  { name: 'Showcase',    sequence: ['hero', 'featuredProducts', 'searchFilter', 'products'] },
  { name: 'Rich',        sequence: ['hero', 'slideshow', 'searchFilter', 'featuredProducts', 'products'] },
  { name: 'Editorial',   sequence: ['hero', 'textBlock', 'searchFilter', 'products', 'promoBanner'] },
  { name: 'Minimal',     sequence: ['searchFilter', 'products'] },
  { name: 'Content-Led', sequence: ['hero', 'textBlock', 'featuredProducts', 'searchFilter', 'products'] },
  { name: 'Dynamic',     sequence: ['hero', 'slideshow', 'searchFilter', 'products', 'textBlock'] },
  { name: 'Campaign',    sequence: ['hero', 'promoBanner', 'featuredProducts', 'searchFilter', 'products'] },
  { name: 'Discovery',   sequence: ['hero', 'slideshow', 'searchFilter', 'products', 'promoBanner'] },
  { name: 'Soft Focus',  sequence: ['hero', 'featuredProducts', 'textBlock', 'searchFilter', 'products'] },
  { name: 'Bold Start',  sequence: ['hero', 'promoBanner', 'searchFilter', 'products'] },
];

export const LAYOUT_TEMPLATE_COUNT = LAYOUT_TEMPLATES.length;

let lastTemplateIndex = -1;

export function generateRandomLayout(): { name: string; sections: HomepageSectionConfig[] } {
  let idx: number;
  do {
    idx = Math.floor(Math.random() * LAYOUT_TEMPLATES.length);
  } while (idx === lastTemplateIndex && LAYOUT_TEMPLATES.length > 1);
  lastTemplateIndex = idx;

  const template = LAYOUT_TEMPLATES[idx];
  const sections: HomepageSectionConfig[] = template.sequence.map((type, i) => ({
    id: `${type}-${Date.now()}-${i}`,
    type,
    enabled: true,
    props: { ...SECTION_DEFS[type].defaultProps },
  }));

  return { name: template.name, sections };
}
