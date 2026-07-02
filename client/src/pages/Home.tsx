import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearch } from 'wouter';
import { Search, MapPin, Package, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ShoppingBag, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ProductCard, type StorefrontLayoutSettings } from '@/components/products/ProductCard';
import { type Product } from '@/lib/mockData';
import { useQuery } from '@tanstack/react-query';
import { TextBlockSection } from '@/components/homepage/TextBlockSection';
import { PromoBannerSection } from '@/components/homepage/PromoBannerSection';
import { ImageBlockSection } from '@/components/homepage/ImageBlockSection';
import { SlideshowSection } from '@/components/homepage/SlideshowSection';
import { FeaturedProductsSection } from '@/components/homepage/FeaturedProductsSection';
import { CategoriesSection } from '@/components/homepage/CategoriesSection';
import { type HomepageSectionConfig, DEFAULT_HOMEPAGE_SECTIONS } from '@/lib/homepageSections';

function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

export default function Home() {
  const searchParams = useSearch();
  const urlCategory = new URLSearchParams(searchParams).get('category');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(urlCategory);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  // Single fetch for all site settings — derived values computed from this one query
  const cachedSettings = (() => {
    try { const s = localStorage.getItem('gm_site_settings'); return s ? JSON.parse(s) : undefined; } catch { return undefined; }
  })();
  const { data: siteSettings = {}, isSuccess: siteSettingsLoaded } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) return {};
      const data = await res.json();
      try { localStorage.setItem('gm_site_settings', JSON.stringify(data)); } catch {}
      return data;
    },
    staleTime: 60000,
    initialData: cachedSettings,
  });

  const storefrontLayout = useMemo((): StorefrontLayoutSettings => {
    if (!siteSettings.storefrontLayout) return {} as StorefrontLayoutSettings;
    try { return JSON.parse(siteSettings.storefrontLayout) as StorefrontLayoutSettings; }
    catch { return {} as StorefrontLayoutSettings; }
  }, [siteSettings.storefrontLayout]);

  const homepageSections = useMemo((): HomepageSectionConfig[] => {
    if (!siteSettings.homepageSections) return DEFAULT_HOMEPAGE_SECTIONS;
    try { return JSON.parse(siteSettings.homepageSections) as HomepageSectionConfig[]; }
    catch { return DEFAULT_HOMEPAGE_SECTIONS; }
  }, [siteSettings.homepageSections]);

  const persistedCategoryImages = useMemo((): Record<string, any> => {
    if (!siteSettings.categoryImages) return {};
    try { return JSON.parse(siteSettings.categoryImages); }
    catch { return {}; }
  }, [siteSettings.categoryImages]);

  const sectionEnabled = (type: string) =>
    homepageSections.some(s => s.type === type && s.enabled !== false);

  const gridGapValue = ({ tight: '4px', normal: '8px', relaxed: '16px', spacious: '24px' } as Record<string, string>)[storefrontLayout?.gridGap || 'normal'] || '8px';
  const gridColsDesktop = parseInt(storefrontLayout?.columnsDesktop || '7') || 7;
  const gridColsTablet = parseInt(storefrontLayout?.columnsTablet || '5') || 5;
  const gridColsMobile = parseInt(storefrontLayout?.columnsMobile || '4') || 4;

  const fontSizeMapHeading: Record<string, string> = { small: 'text-lg', medium: 'text-xl md:text-2xl', large: 'text-2xl md:text-3xl', xlarge: 'text-3xl md:text-4xl' };
  const fontWeightMap: Record<string, string> = { normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold' };
  const fontSizeMapSubcat: Record<string, string> = { tiny: 'text-[10px]', small: 'text-xs', medium: 'text-sm', large: 'text-base' };

  const sortProducts = (items: Product[]) => {
    const mode = storefrontLayout?.defaultSort || 'newest';
    return [...items].sort((a, b) => {
      if (mode === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (mode === 'price-asc') return parseFloat(a.price) - parseFloat(b.price);
      if (mode === 'price-desc') return parseFloat(b.price) - parseFloat(a.price);
      if (mode === 'alpha') return (a.name || '').localeCompare(b.name || '');
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  };

  const catHeadingClass = `${fontSizeMapHeading[storefrontLayout?.categoryHeadingFontSize || 'large'] || 'text-2xl md:text-3xl'} ${fontWeightMap[storefrontLayout?.categoryHeadingWeight || 'bold'] || 'font-bold'} font-display mb-6 text-foreground`;
  const catHeadingStyle = storefrontLayout?.categoryHeadingColor ? { color: storefrontLayout.categoryHeadingColor } : {};
  const subcatHeadingClass = `${fontSizeMapSubcat[storefrontLayout?.subcategoryHeadingFontSize || 'tiny'] || 'text-[10px]'} ${fontWeightMap[storefrontLayout?.subcategoryHeadingWeight || 'medium'] || 'font-medium'} uppercase tracking-widest mb-1.5 pl-2 border-l-2 border-primary/20`;
  const subcatHeadingStyle = storefrontLayout?.subcategoryHeadingColor ? { color: storefrontLayout.subcategoryHeadingColor } : {};

  useEffect(() => {
    if (urlCategory) setSelectedCategory(urlCategory);
  }, [urlCategory]);

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['products', 'live'],
    queryFn: async () => {
      const res = await fetch('/api/products?live=true');
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: categoriesFromApi = [] } = useQuery<{ id: string; name: string; parentId?: string | null; sortOrder: number }[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const productCategories = new Set(products.map(p => p.category));
  const topLevelCatsFromApi = categoriesFromApi.filter(c => !c.parentId);
  const categories = topLevelCatsFromApi.map(c => c.name).filter(name => productCategories.has(name));

  const selectedCategoryObj = categoriesFromApi.find(c => c.name === selectedCategory && !c.parentId);
  const subcategoriesForSelected = selectedCategoryObj
    ? categoriesFromApi.filter(c => c.parentId === selectedCategoryObj.id)
    : [];

  const getSubcategoriesForCategory = (catName: string) => {
    const catObj = categoriesFromApi.find(c => c.name === catName && !c.parentId);
    return catObj ? categoriesFromApi.filter(c => c.parentId === catObj.id) : [];
  };

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const carouselRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const getBaseCode = (product: Product): string => {
    if (!product.productCode) return '';
    if (product.variantSuffix && product.productCode.endsWith(`-${product.variantSuffix}`)) {
      return product.productCode.slice(0, -(product.variantSuffix.length + 1));
    }
    return product.productCode;
  };

  const variantGroups = products.reduce((groups, product) => {
    if (product.canonicalProductId) return groups;
    const baseCode = getBaseCode(product);
    if (!baseCode) return groups;
    if (!groups[baseCode]) groups[baseCode] = [];
    groups[baseCode].push(product);
    return groups;
  }, {} as Record<string, Product[]>);

  const childrenByParentId = products.reduce((map, product) => {
    if (product.parentProductId && product.relationshipType === 'variant') {
      if (!map[product.parentProductId]) map[product.parentProductId] = [];
      map[product.parentProductId].push(product);
    }
    return map;
  }, {} as Record<string, Product[]>);

  const filteredProducts = products.filter(product => {
    if (product.canonicalProductId) return false;
    if (product.parentProductId && product.relationshipType === 'variant') return false;
    if (product.variantSuffix) return false;

    const baseCode = getBaseCode(product);
    const codeGroup = baseCode ? (variantGroups[baseCode] || [product]) : [product];
    const pidChildren = childrenByParentId[product.id] || [];
    const allRelated = new Map<number, Product>();
    for (const p of codeGroup) allRelated.set(p.id, p);
    for (const p of pidChildren) allRelated.set(p.id, p);
    const groupProducts = Array.from(allRelated.values());

    const isInStore = groupProducts.some(p => (p as any).inStore);
    if (!isInStore) return false;

    const descText = Array.isArray(product.description)
      ? product.description.join(' ').toLowerCase()
      : (product.description || '').toLowerCase();
    const matchesSearch =
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      descText.includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    const matchesSubcategory = !selectedSubcategory || product.subcategory === selectedSubcategory;
    return matchesSearch && matchesCategory && matchesSubcategory;
  });

  const displayProducts = filteredProducts;

  const shuffledByCategory = useMemo(() => {
    const result: Record<string, Product[]> = {};
    categories.forEach(cat => {
      const arr = [...displayProducts.filter(p => p.category === cat)];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(cat + i + (arr[i]?.id || '')) * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      result[cat] = arr;
    });
    return result;
  }, [displayProducts, categories]);

  const BUILTIN_TYPES = ['hero', 'searchFilter', 'products'];

  const renderCustomSection = (section: HomepageSectionConfig) => {
    const p = section.props || {};
    if (section.type === 'textBlock') return <TextBlockSection key={section.id} {...p} />;
    if (section.type === 'promoBanner') return <PromoBannerSection key={section.id} {...p} />;
    if (section.type === 'imageBlock') return <ImageBlockSection key={section.id} {...p} />;
    if (section.type === 'slideshow') return <SlideshowSection key={section.id} {...p} />;
    if (section.type === 'featuredProducts') {
      const source = p.source || 'newest';
      const count = p.count || 4;
      let featured: Product[];
      if (source === 'manual' && Array.isArray(p.productIds) && p.productIds.length > 0) {
        const ids = p.productIds.map(String);
        featured = products.filter(prod => ids.includes(String(prod.id))).slice(0, count);
      } else if (source === 'sale') {
        featured = products.filter((prod: any) => prod.salePrice && parseFloat(prod.salePrice) < parseFloat(prod.price)).slice(0, count);
      } else {
        featured = [...products].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, count);
      }
      return <FeaturedProductsSection key={section.id} heading={p.heading} products={featured} count={count} imagePosition={p.featuredImagePosition} imageScale={p.featuredImageScale} />;
    }
    if (section.type === 'categoriesGrid') {
      return <CategoriesSection key={section.id} heading={p.heading} columns={p.columns} categoryImages={persistedCategoryImages} />;
    }
    return null;
  };

  const sectionsInSlot = (afterType: string, beforeType: string) => {
    // '__start__' is a sentinel meaning "from the beginning of the array"
    const after = afterType === '__start__' ? -1 : homepageSections.findIndex(s => s.type === afterType);
    const before = homepageSections.findIndex(s => s.type === beforeType);
    // If the "after" anchor doesn't exist (and it's not the special sentinel), skip this slot
    if (afterType !== '__start__' && after === -1) return [];
    // If the "before" anchor doesn't exist, skip this slot — postProductsSections will cover these
    if (before === -1) return [];
    const start = after === -1 ? 0 : after + 1;
    return homepageSections.slice(start, before).filter(s => !BUILTIN_TYPES.includes(s.type) && s.enabled !== false);
  };

  const postProductsSections = (() => {
    const productsIdx = homepageSections.reduce((acc, s, i) => s.type === 'products' ? i : acc, -1);
    if (productsIdx !== -1) {
      return homepageSections.slice(productsIdx + 1).filter(s => !BUILTIN_TYPES.includes(s.type) && s.enabled !== false);
    }
    // No 'products' builtin: render custom sections that come after the last builtin anchor
    const lastBuiltinIdx = homepageSections.reduce((acc, s, i) => BUILTIN_TYPES.includes(s.type) ? i : acc, -1);
    return homepageSections.slice(lastBuiltinIdx + 1).filter(s => !BUILTIN_TYPES.includes(s.type) && s.enabled !== false);
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* ── PRE-HERO CUSTOM SECTIONS ── */}
      {sectionsInSlot('__start__', 'hero').map(renderCustomSection)}

      {/* ── STOREFRONT HERO ── */}
      {sectionEnabled('hero') && (() => {
        const fgEnabled = siteSettings.storefrontHeroImageEnabled !== 'false';
        const bgEnabled = siteSettings.storefrontInteriorImageEnabled !== 'false';
        const showFg = fgEnabled && !!siteSettings.storefrontHeroImage;
        const showBg = bgEnabled && !!siteSettings.storefrontInteriorImage;
        const fgPosition = siteSettings.storefrontHeroImagePosition || 'center';
        const overlayRaw = parseInt(siteSettings.storefrontHeroImageOverlay || '55', 10);
        const overlayPct = Number.isFinite(overlayRaw) ? Math.max(0, Math.min(100, overlayRaw)) : 55;
        const bgAspect = siteSettings.storefrontInteriorImageAspect || '4/3';
        const bgSize = siteSettings.storefrontInteriorImageSize || 'md';
        const bgSizeClass = bgSize === 'sm' ? 'max-w-xs mx-auto' : bgSize === 'lg' ? 'max-w-none w-full' : 'max-w-md mx-auto';
        return (
          <section className="relative overflow-hidden flex items-center min-h-[500px] md:min-h-[560px]">
            {showFg ? (
              <>
                <img
                  src={siteSettings.storefrontHeroImage}
                  srcSet={siteSettings.storefrontHeroImage?.startsWith('/api/')
                    ? `${siteSettings.storefrontHeroImage}?w=480 480w, ${siteSettings.storefrontHeroImage}?w=800 800w, ${siteSettings.storefrontHeroImage}?w=1400 1400w`
                    : undefined}
                  sizes="100vw"
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ objectPosition: fgPosition }}
                  fetchPriority="high"
                  loading="eager"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-black" style={{ opacity: overlayPct / 100 }} />
              </>
            ) : (
              <>
                <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-primary/5" />
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[80px]" />
                  <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px]" />
                </div>
              </>
            )}
            <div className="container mx-auto px-4 py-10 md:py-16 lg:py-20 relative z-10 w-full">
              <div className={`grid grid-cols-1 gap-8 lg:gap-16 items-center ${!showFg ? 'lg:grid-cols-2' : ''}`}>

                {/* Left – store info */}
                <div className="space-y-5">
                  <h1
                    className={`font-display ${siteSettings.heroLine1FontSize || 'text-4xl md:text-5xl lg:text-6xl'} ${siteSettings.heroLine1Weight ? ({ normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold' } as Record<string, string>)[siteSettings.heroLine1Weight] || 'font-bold' : 'font-bold'} tracking-tight`}
                    style={{ transform: siteSettings.heroTitleOffset ? `translateY(${siteSettings.heroTitleOffset}px)` : undefined, color: siteSettings.heroLine1Color || (siteSettings.storefrontHeroImage ? '#ffffff' : undefined), textAlign: (siteSettings.heroAlign as any) || undefined, textShadow: siteSettings.storefrontHeroImage ? '0 2px 8px rgba(0,0,0,0.5)' : undefined }}
                  >
                    {siteSettings.heroLine1 || (siteSettingsLoaded ? 'Shop Local.' : ' ')}{' '}
                    <span
                      className={`${siteSettings.heroLine2Color ? '' : siteSettings.storefrontHeroImage ? '' : 'text-gradient'} ${siteSettings.heroLine2FontSize || ''} ${siteSettings.heroLine2Weight ? ({ normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold' } as Record<string, string>)[siteSettings.heroLine2Weight] || '' : ''}`}
                      style={{ color: siteSettings.heroLine2Color || (siteSettings.storefrontHeroImage ? 'rgba(255,255,255,0.85)' : undefined) }}
                    >
                      {siteSettings.heroLine2 || (siteSettingsLoaded ? 'In-Store & Online.' : '')}
                    </span>
                  </h1>

                  <p
                    className={`${siteSettings.heroSubtitleFontSize || 'text-lg md:text-xl'} ${siteSettings.heroSubtitleColor ? '' : 'text-muted-foreground'} ${siteSettings.heroSubtitleWeight ? ({ light: 'font-light', normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold' } as Record<string, string>)[siteSettings.heroSubtitleWeight] || '' : ''} max-w-lg`}
                    style={{ transform: siteSettings.heroSubtitleOffset ? `translateY(${siteSettings.heroSubtitleOffset}px)` : undefined, color: siteSettings.heroSubtitleColor || (siteSettings.storefrontHeroImage ? 'rgba(255,255,255,0.75)' : undefined), textAlign: (siteSettings.heroAlign as any) || undefined }}
                  >
                    {siteSettings.heroSubtitle || (siteSettingsLoaded ? 'Browse our curated selection in person, or order online for in-store pickup.' : ' ')}
                  </p>

                  <div className="space-y-2 pt-1">
                    <div className={`flex items-start gap-2 text-sm ${siteSettings.storefrontHeroImage ? 'text-white/80' : 'text-foreground/80'}`}>
                      <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${siteSettings.storefrontHeroImage ? 'text-white/70' : 'text-primary'}`} />
                      <span>{siteSettings.storefrontAddress || '3176 Walker Rd, Windsor'}</span>
                    </div>
                    {siteSettings.storefrontHours && (
                      <div className={`flex items-start gap-2 text-sm ${siteSettings.storefrontHeroImage ? 'text-white/80' : 'text-foreground/80'}`}>
                        <Clock className={`w-4 h-4 mt-0.5 shrink-0 ${siteSettings.storefrontHeroImage ? 'text-white/70' : 'text-primary'}`} />
                        <span>{siteSettings.storefrontHours}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button
                      size="lg"
                      className={siteSettings.storefrontHeroImage ? 'bg-white text-gray-900 hover:bg-white/90' : ''}
                      onClick={() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })}
                    >
                      <ShoppingBag className="w-4 h-4 mr-2" />
                      Browse Products
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className={siteSettings.storefrontHeroImage ? 'border-white/60 text-white hover:bg-white/10' : ''}
                      onClick={() => document.getElementById('store')?.scrollIntoView({ behavior: 'smooth' })}
                    >
                      <MapPin className="w-4 h-4 mr-2" />
                      Find Us
                    </Button>
                  </div>
                </div>

                {/* Right column — always rendered when not full-bleed to prevent CLS */}
                {!showFg && (
                  showBg ? (
                    <div className={`rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/20 ${bgSizeClass}`} style={{ aspectRatio: bgAspect }}>
                      <img
                        src={siteSettings.storefrontInteriorImage}
                        srcSet={siteSettings.storefrontInteriorImage?.startsWith('/api/')
                          ? `${siteSettings.storefrontInteriorImage}?w=400 400w, ${siteSettings.storefrontInteriorImage}?w=800 800w`
                          : undefined}
                        sizes="(max-width: 1024px) 100vw, 50vw"
                        alt="Store"
                        className="w-full h-full object-cover"
                        loading="eager"
                        decoding="async"
                      />
                    </div>
                  ) : (
                    <div className="rounded-2xl overflow-hidden shadow-xl bg-muted aspect-[4/3] flex flex-col items-center justify-center gap-3 p-8 text-center">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <ShoppingBag className="w-8 h-8 text-primary/30" />
                      </div>
                      <p className="text-sm text-muted-foreground">Set storefront photos in Admin → Site Settings</p>
                    </div>
                  )
                )}

              </div>
            </div>
          </section>
        );
      })()}

      {/* ── BETWEEN HERO AND SEARCH SECTIONS ── */}
      {sectionsInSlot('hero', 'searchFilter').map(renderCustomSection)}

      <main className="flex-1 py-12" id="products">
        <div className="container mx-auto px-4">

          {/* Search bar + Filters */}
          {sectionEnabled('searchFilter') && (<>
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 font-display"
                data-testid="input-search"
              />
            </div>
            <Button
              variant="default"
              className="gap-2 whitespace-nowrap font-display"
              data-testid="button-search"
            >
              <Search className="w-4 h-4" />
              Search
            </Button>
          </div>

          </>)}

          {/* ── BETWEEN SEARCH AND PRODUCTS SECTIONS ── */}
          {sectionsInSlot('searchFilter', 'products').map(renderCustomSection)}

          {/* Responsive grid style injection */}
          <style>{`
            .sf-product-grid {
              display: grid;
              gap: ${gridGapValue};
              grid-template-columns: repeat(${gridColsMobile}, minmax(0, 1fr));
            }
            @media (min-width: 640px) {
              .sf-product-grid { grid-template-columns: repeat(${gridColsTablet}, minmax(0, 1fr)); }
            }
            @media (min-width: 1024px) {
              .sf-product-grid { grid-template-columns: repeat(${gridColsDesktop}, minmax(0, 1fr)); }
            }
          `}</style>

          {/* Storefront Heading & Subheading */}
          {storefrontLayout?.showHeading && storefrontLayout?.headingText && (
            <div style={{ textAlign: (storefrontLayout.headingAlign || 'left') as any, marginBottom: storefrontLayout.showSubheading ? '2px' : '12px' }}>
              <h2
                className={`${fontSizeMapHeading[storefrontLayout.headingFontSize || 'large'] || 'text-2xl md:text-3xl'} ${fontWeightMap[storefrontLayout.headingWeight || 'bold'] || 'font-bold'} font-display text-foreground`}
                style={storefrontLayout.headingColor ? { color: storefrontLayout.headingColor } : {}}
              >
                {storefrontLayout.headingText}
              </h2>
            </div>
          )}
          {storefrontLayout?.showSubheading && storefrontLayout?.subheadingText && (
            <div style={{ textAlign: (storefrontLayout.subheadingAlign || 'left') as any, marginBottom: '12px' }}>
              <p
                className={`${fontSizeMapSubcat[storefrontLayout.subheadingFontSize || 'small'] || 'text-xs'} ${fontWeightMap[storefrontLayout.subheadingWeight || 'normal'] || 'font-normal'} text-muted-foreground`}
                style={storefrontLayout.subheadingColor ? { color: storefrontLayout.subheadingColor } : {}}
              >
                {storefrontLayout.subheadingText}
              </p>
            </div>
          )}

          {/* Products */}
          {sectionEnabled('products') && (productsLoading ? (
            <div className="mt-4 sf-product-grid">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-square bg-muted rounded-lg mb-2" />
                  <div className="h-3 bg-muted rounded w-3/4 mb-1" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : displayProducts.length > 0 ? (
            <div className="mt-4">
              {selectedCategory === null ? (
                // Category carousel rows
                <div className="space-y-8">
                  {categories.map(cat => {
                    const categoryProducts = sortProducts(displayProducts.filter(p => p.category === cat));
                    if (categoryProducts.length === 0) return null;
                    const isExpanded = expandedCategories.has(cat);
                    const subs = getSubcategoriesForCategory(cat);
                    const hasSubcategories = subs.length > 0 && categoryProducts.some(p => p.subcategory);
                    const carouselProducts = shuffledByCategory[cat] || categoryProducts;
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-3">
                          <h2 className={catHeadingClass} style={{ ...catHeadingStyle, marginBottom: 0 }}>{cat}</h2>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-foreground shrink-0 gap-1"
                            onClick={() => setExpandedCategories(prev => {
                              const next = new Set(prev);
                              if (next.has(cat)) next.delete(cat); else next.add(cat);
                              return next;
                            })}
                          >
                            {isExpanded
                              ? <><ChevronUp className="w-3.5 h-3.5" /> Collapse</>
                              : <><ChevronDown className="w-3.5 h-3.5" /> View All ({categoryProducts.length})</>}
                          </Button>
                        </div>

                        {isExpanded ? (
                          hasSubcategories ? (
                            <div className="space-y-6">
                              {(() => {
                                const uncategorized = categoryProducts.filter(p => !p.subcategory);
                                if (uncategorized.length === 0) return null;
                                return (
                                  <div className="sf-product-grid">
                                    {uncategorized.map((product) => {
                                      const baseCode = getBaseCode(product);
                                      const variants = baseCode ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix) : [];
                                      return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
                                    })}
                                  </div>
                                );
                              })()}
                              {subs.map(sub => {
                                const subProducts = categoryProducts.filter(p => p.subcategory === sub.name);
                                if (subProducts.length === 0) return null;
                                return (
                                  <div key={sub.id}>
                                    <h3 className={subcatHeadingClass} style={subcatHeadingStyle}>{sub.name}</h3>
                                    <div className="sf-product-grid">
                                      {subProducts.map((product) => {
                                        const baseCode = getBaseCode(product);
                                        const variants = baseCode ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix) : [];
                                        return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="sf-product-grid">
                              {categoryProducts.map((product) => {
                                const baseCode = getBaseCode(product);
                                const variants = baseCode ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix) : [];
                                return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
                              })}
                            </div>
                          )
                        ) : (
                          <div className="relative">
                            <Button
                              variant="outline"
                              size="icon"
                              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 h-8 w-8 rounded-full shadow-sm hidden sm:flex"
                              onClick={() => carouselRefs.current[cat]?.scrollBy({ left: -320, behavior: 'smooth' })}
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <div
                              ref={el => { carouselRefs.current[cat] = el; }}
                              className="flex gap-2 overflow-x-auto scrollbar-hide pb-2"
                              style={{ scrollSnapType: 'x mandatory' }}
                            >
                              {carouselProducts.map((product) => {
                                const baseCode = getBaseCode(product);
                                const variants = baseCode ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix) : [];
                                return (
                                  <div key={product.id} className="shrink-0 w-36 sm:w-40 lg:w-44" style={{ scrollSnapAlign: 'start' }}>
                                    <ProductCard product={product} variants={variants} layout={storefrontLayout} hideImageNav />
                                  </div>
                                );
                              })}
                            </div>
                            <Button
                              variant="outline"
                              size="icon"
                              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 h-8 w-8 rounded-full shadow-sm hidden sm:flex"
                              onClick={() => carouselRefs.current[cat]?.scrollBy({ left: 320, behavior: 'smooth' })}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Category selected view - group by subcategory if available
                (() => {
                  const sorted = sortProducts(displayProducts);
                  const subs = subcategoriesForSelected;
                  const hasSubGroups = !selectedSubcategory && subs.length > 0 && sorted.some(p => p.subcategory);

                  if (hasSubGroups) {
                    return (
                      <div className="space-y-6">
                        {(() => {
                          const uncategorized = sorted.filter(p => !p.subcategory);
                          if (uncategorized.length === 0) return null;
                          return (
                            <div className="sf-product-grid">
                              {uncategorized.map((product) => {
                                const baseCode = getBaseCode(product);
                                const variants = baseCode ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix) : [];
                                return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
                              })}
                            </div>
                          );
                        })()}
                        {subs.map(sub => {
                          const subProducts = sorted.filter(p => p.subcategory === sub.name);
                          if (subProducts.length === 0) return null;
                          return (
                            <div key={sub.id}>
                              <h3 className={subcatHeadingClass} style={subcatHeadingStyle}>{sub.name}</h3>
                              <div className="sf-product-grid">
                                {subProducts.map((product) => {
                                  const baseCode = getBaseCode(product);
                                  const variants = baseCode ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix) : [];
                                  return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  return (
                    <div className="sf-product-grid">
                      {sorted.map((product) => {
                        const baseCode = getBaseCode(product);
                        const variants = baseCode
                          ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix)
                          : [];
                        return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          ) : (
            <div className="text-center py-16">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-display text-lg font-semibold mb-2">No products found</h3>
              <p className="text-muted-foreground">Try adjusting your search or filters</p>
            </div>
          ))}
        </div>
      </main>

      {/* ── POST-PRODUCTS CUSTOM SECTIONS ── */}
      {postProductsSections.map(renderCustomSection)}

      <Footer />
    </div>
  );
}
