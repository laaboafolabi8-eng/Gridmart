import { useState, useEffect, useRef, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Clock, ChevronRight, ShoppingBag, Loader2, Package, Star, ArrowRight, Check, Navigation } from 'lucide-react';
import { ProductCard, type StorefrontLayoutSettings } from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { formatCurrency, type Product, type Node } from '@/lib/mockData';
import { useCart, useSelectedNode } from '@/lib/store';
import { loadGoogleMaps } from '@/lib/googleMaps';
import { productUrl } from '../../../shared/slugify';

function linkifyHtml(html: string): string {
  return html.replace(
    /(<a\s[^>]*>.*?<\/a>)|(https?:\/\/[^\s<]+)/gi,
    (match, anchor) => {
      if (anchor) return anchor;
      return `<a href="${match}" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">${match}</a>`;
    }
  );
}

type ProductWithExtras = Product & { brand?: string; condition?: string; inventory?: { nodeId: string; quantity: number }[] };

interface LandingPageData {
  page: {
    id: string;
    slug: string;
    productId: string;
    mode?: string;
    productIds?: string[];
    nodeId?: string;
    status: string;
    headline: string | null;
    subheadline: string | null;
    showPrice: boolean | null;
    showDescription: boolean | null;
    showCondition: boolean | null;
    showBrand: boolean | null;
    promoCodes: string[] | null;
    shopMoreMode: string | null;
    shopMoreProductIds: number[] | null;
    gradientFrom: string | null;
    gradientTo: string | null;
    ctaText: string | null;
    ctaColor: string | null;
    layoutOrder: string[] | null;
    postSearchLayoutOrder?: string[] | null;
    carouselVisibleCount?: number | null;
    carouselProductIds?: string[];
    shopMoreText?: string | null;
    shopMoreLink?: string | null;
    showMapCircle?: boolean | null;
    mapCircleSize?: number | null;
    headlineFontSize?: number | null;
    subheadlineFontSize?: number | null;
    priceFontSize?: number | null;
    groupByCategory?: boolean | null;
    showSubcategories?: boolean | null;
    textboxContent?: string | null;
  };
  product: ProductWithExtras;
  products?: ProductWithExtras[];
  nodes: Node[];
  promoDetails: { code: string; name: string; discountType: string; discountValue: string; description: string | null }[];
  shopMoreProducts: Product[];
  locationNode?: Node & { soonestSlot: string | null; soonestDate: string | null };
}

interface NodeWithStock {
  node: Node;
  stock: number;
  soonestSlot: string | null;
  soonestDate: string | null;
}

function formatTime12h(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function formatSlotLabel(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [year, month, day] = dateStr.split('-').map(Number);
  const slotDate = new Date(year, month - 1, day);
  slotDate.setHours(0, 0, 0, 0);
  if (slotDate.getTime() === today.getTime()) return 'Today';
  if (slotDate.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return slotDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function LandingPage() {
  const [, params] = useRoute('/lp/:slug');
  const [, navigate] = useLocation();
  const slug = params?.slug || '';
  const { addToCart } = useCart();
  const { setSelectedNode: setGlobalSelectedNode } = useSelectedNode();

  const [postalCode, setPostalCode] = useState('');
  const [searchState, setSearchState] = useState<'idle' | 'searching' | 'found' | 'not-found'>('idle');
  const [nodesWithStock, setNodesWithStock] = useState<NodeWithStock[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const lpMapRef = useRef<HTMLDivElement>(null);
  const lpMapInstanceRef = useRef<google.maps.Map | null>(null);

  const [pcPostalCode, setPcPostalCode] = useState('');
  const [pcSearchState, setPcSearchState] = useState<'idle' | 'searching' | 'found' | 'not-found'>('idle');
  const [pcNearestNode, setPcNearestNode] = useState<Node | null>(null);
  const [pcNodeProducts, setPcNodeProducts] = useState<ProductWithExtras[]>([]);
  const pcResultsRef = useRef<HTMLDivElement>(null);
  const [nodeAvailabilities, setNodeAvailabilities] = useState<Record<string, { dayOfWeek: string; startTime: string; endTime: string; enabled: boolean }[]>>({});

  const { data, isLoading, error } = useQuery<LandingPageData>({
    queryKey: ['landing-page', slug],
    queryFn: async () => {
      const res = await fetch(`/api/landing-pages/${slug}`);
      if (!res.ok) throw new Error('Landing page not found');
      return res.json();
    },
    enabled: !!slug,
  });

  const page = data?.page;
  const product = data?.product;
  const allNodes = data?.nodes || [];
  const promoDetails = data?.promoDetails || [];
  const promoTitle = page?.promoTitle || '';
  const carouselProductIds = page?.carouselProductIds || [];
  const isLocation = page?.mode === 'location';
  const isProductLocation = page?.mode === 'product-location';
  const locationNode = data?.locationNode;
  const shopMoreProductsRaw = data?.shopMoreProducts || [];
  const shopMoreProducts = carouselProductIds.length > 0 && !isLocation
    ? (() => {
        const ordered = carouselProductIds
          .map(id => shopMoreProductsRaw.find(p => String(p.id) === id))
          .filter(Boolean) as typeof shopMoreProductsRaw;
        const remaining = shopMoreProductsRaw.filter(p => !carouselProductIds.includes(String(p.id)));
        return [...ordered, ...remaining];
      })()
    : shopMoreProductsRaw;
  const locationProductsRaw = isLocation && data?.products ? data.products : [];
  const locationProducts = carouselProductIds.length > 0 && isLocation
    ? (() => {
        const ordered = carouselProductIds
          .map(id => locationProductsRaw.find(p => String(p.id) === id))
          .filter(Boolean) as typeof locationProductsRaw;
        const remaining = locationProductsRaw.filter(p => !carouselProductIds.includes(String(p.id)));
        return [...ordered, ...remaining];
      })()
    : locationProductsRaw;
  const isMulti = page?.mode === 'multi' && data?.products && data.products.length > 0;
  const plProducts: ProductWithExtras[] = isProductLocation && data?.products ? data.products : [];
  const heroProducts: ProductWithExtras[] = isMulti ? data!.products! : isProductLocation ? plProducts : (product ? [product] : []);

  const gradientFrom = page?.gradientFrom || '#0d9488';
  const gradientTo = page?.gradientTo || '#1e3a5f';
  const ctaColor = page?.ctaColor || '#14b8a6';
  const ctaText = page?.ctaText || 'Find My Pickup Spot';
  const headlineFontSize = page?.headlineFontSize ?? 48;
  const subheadlineFontSize = page?.subheadlineFontSize ?? 20;
  const priceFontSize = page?.priceFontSize ?? 36;
  const { data: storefrontLayout } = useQuery<StorefrontLayoutSettings>({
    queryKey: ['storefrontLayout'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      const settings = await res.json();
      if (settings.storefrontLayout) {
        try { return JSON.parse(settings.storefrontLayout); } catch { return {}; }
      }
      return {};
    },
    staleTime: 60000,
  });

  const selectedNodeData = nodesWithStock.find(n => n.node.id === selectedNodeId);

  const siteSettingsQuery = useQuery<Record<string, string>>({
    queryKey: ['site-settings-lp'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      return res.json();
    },
    staleTime: 60000,
  });
  const siteSettings = siteSettingsQuery.data || {};

  const layoutOrder = page?.layoutOrder || [];
  const postSearchLayoutOrder = page?.postSearchLayoutOrder || [];
  const hasTextbox = page?.textboxContent;

  const { data: categoriesFromApi = [] } = useQuery<{ id: string; name: string; parentId?: string | null; sortOrder: number }[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    },
    staleTime: 60000,
  });

  const sortCategoriesByApiOrder = (cats: string[]) => {
    const topLevel = categoriesFromApi.filter(c => !c.parentId);
    const orderMap = new Map(topLevel.map(c => [c.name, c.sortOrder]));
    return [...cats].sort((a, b) => {
      const aOrder = orderMap.get(a) ?? 9999;
      const bOrder = orderMap.get(b) ?? 9999;
      return aOrder - bOrder;
    });
  };

  const renderLayoutSections = (sections?: string[]) => {
    const order = sections || layoutOrder;
    if (!page || !order.length) return null;
    return order.map((section) => {
      if (section === 'textbox' && hasTextbox) {
        return (
          <div key="textbox" className="py-8 md:py-12 bg-white" data-testid="section-textbox">
            <div className="max-w-4xl mx-auto px-4">
              <div className="prose prose-lg max-w-none" dangerouslySetInnerHTML={{ __html: linkifyHtml(page.textboxContent!) }} />
            </div>
          </div>
        );
      }
      if (section === 'promoCodes' && promoDetails.length > 0) {
        return (
          <div key="promoCodes" className="py-6 bg-gradient-to-r from-amber-50 to-orange-50 border-y border-amber-100" data-testid="section-promoCodes">
            <div className="max-w-4xl mx-auto px-4 text-center">
              {promoTitle && <p className="text-sm font-semibold text-amber-900 mb-2">{promoTitle}</p>}
              <div className="flex flex-wrap gap-2 justify-center">
                {promoDetails.map((promo) => (
                  <Badge key={promo.code} className="bg-white border border-amber-200 text-amber-800 text-sm px-3 py-1">
                    {promo.discountType === 'percentage' ? `${promo.discountValue}% OFF` : promo.discountType === 'fixed' ? `$${promo.discountValue} OFF` : promo.name}
                    {' — Use code '}<span className="font-bold">{promo.code}</span>
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        );
      }
      if (section === 'shopMore' && shopMoreProducts.length > 0) {
        return (
          <div key="shopMore" className="py-8 md:py-12 bg-white" data-testid="section-shopMore">
            <div className="max-w-6xl mx-auto px-4">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <ShoppingBag className="w-6 h-6" style={{ color: gradientFrom }} />
                {page.shopMoreText || 'Shop More'}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {shopMoreProducts.slice(0, 8).map(p => (
                  <ProductCard key={p.id} product={p} layout={storefrontLayout} />
                ))}
              </div>
              {page.shopMoreLink && (
                <div className="text-center mt-6">
                  <Button variant="outline" onClick={() => navigate(page.shopMoreLink!)}>
                    View All <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      }
      if (section === 'productCarousel') {
        const carouselProducts = carouselProductIds.length > 0
          ? carouselProductIds.map(id => shopMoreProducts.find(p => String(p.id) === id)).filter(Boolean) as Product[]
          : shopMoreProducts.slice(0, 8);
        if (carouselProducts.length === 0) return null;
        const visCount = page.carouselVisibleCount ?? 3;
        return (
          <div key="productCarousel" className="py-8 md:py-12 bg-gray-50" data-testid="section-productCarousel">
            <div className="max-w-6xl mx-auto px-4">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <ShoppingBag className="w-6 h-6" style={{ color: gradientFrom }} />
                Featured Products
              </h2>
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(visCount, 4)}, minmax(0, 1fr))` }}>
                {carouselProducts.slice(0, visCount * 2).map(p => (
                  <ProductCard key={p.id} product={p} layout={storefrontLayout} />
                ))}
              </div>
            </div>
          </div>
        );
      }
      if (section === 'hero') {
        return (
          <div key="hero" className="py-12 md:py-16 text-white text-center" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }} data-testid="section-hero">
            <div className="max-w-4xl mx-auto px-4">
              <h1 className="font-bold mb-4" style={{ fontSize: `${headlineFontSize}px` }}>{page.headline || 'Featured Products'}</h1>
              {page.subheadline && <p className="opacity-80 mb-6" style={{ fontSize: `${subheadlineFontSize}px` }}>{page.subheadline}</p>}
              {heroProducts.length > 0 && (
                <div className="flex gap-4 justify-center flex-wrap mt-6">
                  {heroProducts.slice(0, 6).map(p => (
                    <div key={p.id} className="w-32 bg-white/10 rounded-lg p-3">
                      {p.images?.[0] && <img src={p.images[0]} alt={p.name} className="w-full aspect-square object-cover rounded" />}
                      <p className="text-sm mt-2 line-clamp-2">{p.name}</p>
                      {page.showPrice && <p className="text-sm font-bold mt-1">{formatCurrency(typeof p.price === 'string' ? parseFloat(p.price) : p.price)}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      }
      if (section === 'locationHero' && (locationNode || pcNearestNode)) {
        const node = locationNode || pcNearestNode;
        return (
          <div key="locationHero" className="py-12 md:py-16 text-white text-center" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }} data-testid="section-locationHero">
            <div className="max-w-4xl mx-auto px-4">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/20 flex items-center justify-center">
                <MapPin className="w-10 h-10 text-white" />
              </div>
              <h1 className="font-bold mb-2" style={{ fontSize: `${headlineFontSize}px` }}>{page.headline || `Pickup at ${node!.name}`}</h1>
              {page.subheadline && <p className="opacity-80 mb-4" style={{ fontSize: `${subheadlineFontSize}px` }}>{page.subheadline}</p>}
              {node && (
                <div className="flex items-center justify-center gap-2 text-white/70 mt-4">
                  <MapPin className="w-4 h-4" />
                  <span>{node.address}{node.city ? `, ${node.city}` : ''}</span>
                </div>
              )}
              {node?.latitude && node?.longitude && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${node.latitude},${node.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 px-6 py-3 rounded-full text-white font-medium"
                  style={{ backgroundColor: ctaColor }}
                  data-testid="link-hero-directions"
                >
                  <Navigation className="w-4 h-4" />
                  Get Directions
                </a>
              )}
            </div>
          </div>
        );
      }
      if (section === 'map' && (locationNode || pcNearestNode)) {
        const node = locationNode || pcNearestNode;
        return (
          <div key="map" className="py-8 md:py-12" data-testid="section-map">
            <div className="max-w-4xl mx-auto px-4">
              <div className="relative bg-gray-200 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                    <p className="text-sm text-gray-500 font-medium">{node?.name || 'Location Map'}</p>
                    {node?.address && <p className="text-xs text-gray-400 mt-1">{node.address}</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }
      if (section === 'allLocationsLink') {
        return (
          <div key="allLocationsLink" className="py-6 bg-gray-50 text-center" data-testid="section-allLocationsLink">
            <Button variant="outline" onClick={() => navigate('/')} className="gap-2">
              <MapPin className="w-4 h-4" />
              View All Pickup Locations
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        );
      }
      if (section === 'search') {
        return (
          <div key="search" className="py-8 md:py-12 bg-gray-50" data-testid="section-search">
            <div className="max-w-md mx-auto px-4 text-center">
              <p className="text-sm text-muted-foreground mb-3">Find a pickup spot near you</p>
              <div className="flex gap-3">
                <Input
                  type="text"
                  placeholder="e.g. N9B 1K3"
                  value={pcPostalCode || postalCode}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    if (pcPostalCode !== undefined) setPcPostalCode(val);
                    else setPostalCode(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (typeof handlePostalCodeSearch === 'function') handlePostalCodeSearch();
                    }
                  }}
                  className="h-12 text-lg"
                />
                <Button
                  onClick={() => { if (typeof handlePostalCodeSearch === 'function') handlePostalCodeSearch(); }}
                  className="h-12 px-6 shrink-0"
                  style={{ backgroundColor: ctaColor, color: 'white' }}
                >
                  <Navigation className="w-4 h-4 mr-2" />
                  {ctaText}
                </Button>
              </div>
            </div>
          </div>
        );
      }
      return null;
    }).filter(Boolean);
  };

  useEffect(() => {
    if (!locationNode || !lpMapRef.current) return;
    const lat = Number(locationNode.latitude);
    const lng = Number(locationNode.longitude);
    if (!lat || !lng) return;

    const showCircle = page?.showMapCircle ?? true;
    const circleSize = page?.mapCircleSize ?? 500;

    loadGoogleMaps().then(() => {
      if (!lpMapRef.current) return;
      const map = new google.maps.Map(lpMapRef.current, {
        center: { lat, lng },
        zoom: 14,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        ],
      });
      lpMapInstanceRef.current = map;

      new google.maps.Marker({
        position: { lat, lng },
        map,
        title: locationNode.name,
      });

      if (showCircle) {
        const nodeId = String(locationNode.id);
        const nodeColors = siteSettings.nodeColors ? (() => { try { return JSON.parse(siteSettings.nodeColors); } catch { return {}; } })() : {};
        const nodeBorderColors = siteSettings.nodeBorderColors ? (() => { try { return JSON.parse(siteSettings.nodeBorderColors); } catch { return {}; } })() : {};
        const nodeOpacities = siteSettings.nodeOpacities ? (() => { try { return JSON.parse(siteSettings.nodeOpacities); } catch { return {}; } })() : {};
        const nodeStrokeOpacities = siteSettings.nodeStrokeOpacities ? (() => { try { return JSON.parse(siteSettings.nodeStrokeOpacities); } catch { return {}; } })() : {};

        const fillColor = nodeColors[nodeId] || '#14b8a6';
        const strokeColor = nodeBorderColors[nodeId] || fillColor;
        const fillOpacity = nodeOpacities[nodeId] ?? 0.2;
        const strokeOpacity = nodeStrokeOpacities[nodeId] ?? 1;

        new google.maps.Circle({
          center: { lat, lng },
          radius: circleSize,
          strokeColor,
          fillColor,
          fillOpacity,
          strokeOpacity,
          strokeWeight: 2,
          map,
          clickable: false,
        });
      }
    }).catch(() => {});
  }, [locationNode?.id, page?.showMapCircle, page?.mapCircleSize, siteSettings.nodeColors, siteSettings.nodeBorderColors, siteSettings.nodeOpacities, siteSettings.nodeStrokeOpacities]);

  useEffect(() => {
    const nodeIds: string[] = [];
    if (locationNode?.id) nodeIds.push(String(locationNode.id));
    if (pcNearestNode?.id) nodeIds.push(String(pcNearestNode.id));
    nodesWithStock.forEach(nws => { if (nws.node?.id) nodeIds.push(String(nws.node.id)); });
    const unique = [...new Set(nodeIds)].filter(id => !nodeAvailabilities[id]);
    if (unique.length === 0) return;
    unique.forEach(nodeId => {
      fetch(`/api/nodes/${nodeId}`)
        .then(r => r.json())
        .then(d => {
          if (d.availability) {
            setNodeAvailabilities(prev => ({ ...prev, [nodeId]: d.availability }));
          }
        })
        .catch(() => {});
    });
  }, [locationNode?.id, pcNearestNode?.id, nodesWithStock]);

  const getNodeHoursDisplay = useCallback((nodeId: string) => {
    const avail = nodeAvailabilities[nodeId];
    if (!avail || avail.length === 0) return null;

    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const enabled = avail.filter(a => a.enabled !== false).sort((a, b) => dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek));
    if (enabled.length === 0) return null;

    const now = new Date();
    const etFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
    const parts = etFormatter.formatToParts(now);
    const currentDay = parts.find(p => p.type === 'weekday')?.value || '';
    const currentHour = parts.find(p => p.type === 'hour')?.value || '00';
    const currentMin = parts.find(p => p.type === 'minute')?.value || '00';
    const currentTime = `${currentHour}:${currentMin}`;

    const isOpen = enabled.some(a => {
      if (a.dayOfWeek !== currentDay) return false;
      const end = a.endTime === '24:00' ? '23:59' : a.endTime;
      return currentTime >= a.startTime && currentTime <= end;
    });

    const grouped: { days: string; hours: string }[] = [];
    let i = 0;
    while (i < enabled.length) {
      const hours = `${formatTime12h(enabled[i].startTime)} – ${formatTime12h(enabled[i].endTime)}`;
      let j = i + 1;
      while (j < enabled.length) {
        const jHours = `${formatTime12h(enabled[j].startTime)} – ${formatTime12h(enabled[j].endTime)}`;
        if (jHours !== hours) break;
        j++;
      }
      const dayNames = enabled.slice(i, j).map(a => a.dayOfWeek.slice(0, 3));
      const days = j - i >= 3
        ? `${dayNames[0]}–${dayNames[dayNames.length - 1]}`
        : dayNames.join(', ');
      grouped.push({ days, hours });
      i = j;
    }

    return { isOpen, grouped };
  }, [nodeAvailabilities]);

  const handleSearch = async () => {
    if (!postalCode.trim() || heroProducts.length === 0) return;
    setSearchState('searching');
    setNodesWithStock([]);
    setSelectedNodeId(null);
    setShowCelebration(false);

    await new Promise(r => setTimeout(r, 1800));

    const nodeStockMap = new Map<string, number>();
    for (const hp of heroProducts) {
      const inventory = hp.inventory || [];
      for (const inv of inventory) {
        if (inv.quantity <= 0) continue;
        nodeStockMap.set(inv.nodeId, (nodeStockMap.get(inv.nodeId) || 0) + inv.quantity);
      }
    }

    const nodesInStock: NodeWithStock[] = [];
    for (const [nodeId, totalStock] of nodeStockMap) {
      const node = allNodes.find(n => n.id === nodeId && n.status === 'active');
      if (!node) continue;

      let soonestSlot: string | null = null;
      let soonestDate: string | null = null;
      try {
        const res = await fetch(`/api/nodes/${node.id}/pickup-slots`);
        const slotsData = await res.json();
        const now = new Date();
        const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        const todayDate = now.toISOString().split('T')[0];
        const cutoffDate = cutoff.toISOString().split('T')[0];
        const slots = (slotsData.slots || []).filter((s: any) => s.date >= todayDate && s.date < cutoffDate);
        if (slots.length > 0) {
          soonestDate = slots[0].date;
          soonestSlot = slots[0].startTime;
        }
      } catch {}

      nodesInStock.push({ node, stock: totalStock, soonestSlot, soonestDate });
    }

    if (nodesInStock.length > 0) {
      setNodesWithStock(nodesInStock);
      setSelectedNodeId(nodesInStock[0].node.id);
      setSearchState('found');
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 3000);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } else {
      setSearchState('not-found');
    }
  };

  const handleProceedToCheckout = () => {
    if (heroProducts.length === 0 || !selectedNodeId) return;
    const productsToAdd = isMulti ? heroProducts : [product!];
    for (const hp of productsToAdd) {
      const hasStockAtNode = (hp.inventory || []).some(inv => inv.nodeId === selectedNodeId && inv.quantity > 0);
      if (!hasStockAtNode) continue;
      const cartProduct: Product = {
        id: String(hp.id),
        name: hp.name,
        description: Array.isArray(hp.description) ? hp.description : [hp.description],
        price: typeof hp.price === 'string' ? parseFloat(hp.price) : hp.price,
        images: hp.images || [(hp as any).image],
        category: hp.category,
        inventory: hp.inventory || [],
        createdAt: hp.createdAt,
        productCode: hp.productCode || undefined,
      };
      addToCart(cartProduct, 1);
    }
    setGlobalSelectedNode(selectedNodeId);
    navigate('/checkout');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}>
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent" />
      </div>
    );
  }

  const isPostalCode = page?.mode === 'postal-code';

  if (error || !data || !page || (!isLocation && !isProductLocation && !isPostalCode && !product)) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <div className="text-center">
            <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2" data-testid="text-not-found">Page Not Found</h1>
            <p className="text-muted-foreground mb-6">This landing page doesn't exist or has been deactivated.</p>
            <Button onClick={() => navigate('/')} data-testid="button-go-home">Go to Store</Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const handlePostalCodeSearch = async () => {
    const code = pcPostalCode.replace(/\s+/g, '').trim();
    if (!code) return;
    setPcSearchState('searching');
    setPcNearestNode(null);
    setPcNodeProducts([]);

    try {
      const res = await fetch('/api/nearest-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postalCode: code }),
      });

      if (!res.ok) {
        setPcSearchState('not-found');
        return;
      }

      const result = await res.json();
      if (!result.node) {
        setPcSearchState('not-found');
        return;
      }

      setPcNearestNode(result.node);
      setPcNodeProducts(result.products || []);
      setPcSearchState('found');
      setTimeout(() => {
        pcResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } catch {
      setPcSearchState('not-found');
    }
  };

  if (isPostalCode) {
    const pcHeadline = page.headline || 'Find Products Near You';
    const pcSubheadline = page.subheadline || 'Enter your postal code to discover the nearest pickup location and browse available products.';

    const maxTilesPerRow = page.carouselVisibleCount ?? 4;
    const gridColsMobile = Math.min(maxTilesPerRow, 2);
    const gridColsTablet = Math.min(maxTilesPerRow, 3);
    const gridColsDesktop = maxTilesPerRow;
    const gridGap = storefrontLayout?.gridGap ?? 16;

    return (
      <div className="min-h-screen flex flex-col" data-testid="landing-page-postal-code">
        <Header />

        <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}>
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full opacity-10"
                style={{
                  width: `${60 + i * 30}px`, height: `${60 + i * 30}px`, background: 'white',
                  top: `${10 + (i * 13) % 80}%`, left: `${5 + (i * 17) % 90}%`,
                }}
              />
            ))}
          </div>

          <div className="relative z-10 max-w-4xl mx-auto px-4 py-16 md:py-24 text-center text-white">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Navigation className="w-10 h-10 text-white" />
            </div>

            {promoDetails.length > 0 && (
              <div className="mb-6">
                {promoTitle && (
                  <p className="text-sm font-semibold text-white/90 mb-2" data-testid="text-promo-title">{promoTitle}</p>
                )}
                <div className="flex flex-wrap justify-center gap-2">
                  {promoDetails.map((promo) => (
                    <Badge
                      key={promo.code}
                      className="bg-white/20 text-white border-white/30 backdrop-blur-sm text-sm px-3 py-1"
                      data-testid={`badge-promo-${promo.code}`}
                    >
                      {promo.discountType === 'percentage'
                        ? `${promo.discountValue}% OFF`
                        : promo.discountType === 'fixed'
                        ? `$${promo.discountValue} OFF`
                        : promo.name}
                      {' '} — Use code <span className="font-bold">{promo.code}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <h1 className="font-bold mb-4 leading-tight" style={{ fontSize: `${headlineFontSize}px` }} data-testid="text-headline">
              {pcHeadline}
            </h1>
            {pcSubheadline && (
              <p className="text-white/80 mb-8" style={{ fontSize: `${subheadlineFontSize}px` }} data-testid="text-subheadline">{pcSubheadline}</p>
            )}

            <div className="max-w-md mx-auto">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-white/90">
                    Enter your postal code
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white/80 hover:text-white hover:bg-white/10 text-xs gap-1.5 h-7 px-2"
                    onClick={() => navigate('/')}
                    data-testid="button-view-map"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    View Map
                  </Button>
                </div>
                <div className="flex gap-3">
                  <Input
                    type="text"
                    placeholder="e.g. N9B 1K3"
                    value={pcPostalCode}
                    onChange={(e) => setPcPostalCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handlePostalCodeSearch()}
                    className="bg-white/90 text-gray-900 border-0 placeholder:text-gray-400 h-12 text-lg"
                    data-testid="input-postal-code"
                  />
                  <Button
                    onClick={handlePostalCodeSearch}
                    disabled={pcSearchState === 'searching' || !pcPostalCode.trim()}
                    className="h-12 px-6 text-base font-semibold shrink-0"
                    style={{ backgroundColor: ctaColor, color: 'white' }}
                    data-testid="button-find-pickup"
                  >
                    {pcSearchState === 'searching' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Navigation className="w-4 h-4 mr-2" />
                        {ctaText}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {pcSearchState === 'not-found' && (
          <div className="py-16 bg-white">
            <div className="max-w-md mx-auto px-4 text-center">
              <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2" data-testid="text-no-locations">No Locations Found</h2>
              <p className="text-muted-foreground mb-6">We couldn't find any pickup locations near that postal code. Try a different one or browse our store directly.</p>
              <Button onClick={() => navigate('/')} variant="outline" data-testid="button-browse-store">
                Browse Store
              </Button>
            </div>
          </div>
        )}

        {pcSearchState === 'found' && pcNearestNode && (
          <div ref={pcResultsRef}>
            <div className="py-8 bg-gradient-to-b from-gray-50 to-white">
              <div className="max-w-4xl mx-auto px-4">
                <Card className="overflow-hidden shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${gradientFrom}20` }}>
                        <MapPin className="w-6 h-6" style={{ color: gradientFrom }} />
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                          <div>
                            <h2 className="text-xl font-bold mb-1" data-testid="text-nearest-node-name">{pcNearestNode.name}</h2>
                            <p className="text-muted-foreground text-sm">
                              {pcNearestNode.address}{pcNearestNode.city ? `, ${pcNearestNode.city}` : ''}
                            </p>
                            {pcNearestNode.latitude && pcNearestNode.longitude && (
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${pcNearestNode.latitude},${pcNearestNode.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm font-medium mt-2 hover:underline"
                                style={{ color: gradientFrom }}
                                data-testid="link-get-directions"
                              >
                                <Navigation className="w-3 h-3" />
                                Get Directions
                              </a>
                            )}
                          </div>
                          {(() => {
                            const hours = getNodeHoursDisplay(String(pcNearestNode.id));
                            if (!hours) return null;
                            return (
                              <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-100 text-left space-y-1.5 min-w-[170px]" data-testid="node-hours-pc">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-gray-400" />
                                  <span className="text-sm font-bold text-gray-700">Hours</span>
                                  {hours.isOpen && (
                                    <Badge className="bg-green-500 text-white text-xs px-2 py-0.5 font-semibold animate-pulse">NOW OPEN</Badge>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500 space-y-0.5">
                                  {hours.grouped.map((g, i) => (
                                    <div key={i}><span className="font-semibold text-gray-700">{g.days}:</span> {g.hours}</div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {pcNodeProducts.length > 0 && (
              <div className="py-12 md:py-16 bg-white">
                <div className="max-w-6xl mx-auto px-4">
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3 mb-8" data-testid="text-products-heading">
                    <ShoppingBag className="w-7 h-7" style={{ color: gradientFrom }} />
                    Available at {pcNearestNode.name}
                  </h2>

                  <style>{`
                    .pc-product-grid {
                      display: grid;
                      grid-template-columns: repeat(${gridColsMobile}, minmax(0, 1fr));
                      gap: ${gridGap}px;
                    }
                    @media (min-width: 640px) {
                      .pc-product-grid { grid-template-columns: repeat(${gridColsTablet}, minmax(0, 1fr)); }
                    }
                    @media (min-width: 1024px) {
                      .pc-product-grid { grid-template-columns: repeat(${gridColsDesktop}, minmax(0, 1fr)); }
                    }
                  `}</style>

                  {(() => {
                    const toCard = (p: ProductWithExtras) => ({
                      id: String(p.id),
                      name: p.name,
                      description: Array.isArray(p.description) ? p.description : [String(p.description || '')],
                      price: typeof p.price === 'string' ? parseFloat(p.price) : p.price,
                      images: p.images || [],
                      category: p.category,
                      inventory: p.inventory || [],
                      createdAt: p.createdAt,
                      productCode: p.productCode || undefined,
                    } as Product);

                    if (page.groupByCategory !== false) {
                      const rawCats = Array.from(new Set(pcNodeProducts.map(p => p.category || 'Other')));
                      const cats = sortCategoriesByApiOrder(rawCats);
                      return (
                        <div className="space-y-8">
                          {cats.map(cat => {
                            const catProds = pcNodeProducts.filter(p => (p.category || 'Other') === cat);
                            if (page.showSubcategories) {
                              const subcats = Array.from(new Set(catProds.map(p => (p as any).subcategory).filter(Boolean))) as string[];
                              const uncategorized = catProds.filter(p => !(p as any).subcategory);
                              return (
                                <div key={cat}>
                                  <h3 className="text-xl md:text-2xl font-bold font-display mb-4">{cat}</h3>
                                  {uncategorized.length > 0 && (
                                    <div className="pc-product-grid mb-6">{uncategorized.map(p => <ProductCard key={p.id} product={toCard(p)} layout={storefrontLayout} />)}</div>
                                  )}
                                  {subcats.map(sub => (
                                    <div key={sub} className="mb-6">
                                      <h4 className="text-sm font-semibold uppercase tracking-widest mb-2 pl-2 border-l-2 border-primary/20 text-muted-foreground">{sub}</h4>
                                      <div className="pc-product-grid">{catProds.filter(p => (p as any).subcategory === sub).map(p => <ProductCard key={p.id} product={toCard(p)} layout={storefrontLayout} />)}</div>
                                    </div>
                                  ))}
                                </div>
                              );
                            }
                            return (
                              <div key={cat}>
                                <h3 className="text-xl md:text-2xl font-bold font-display mb-4">{cat}</h3>
                                <div className="pc-product-grid">{catProds.map(p => <ProductCard key={p.id} product={toCard(p)} layout={storefrontLayout} />)}</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }

                    return (
                      <div className="pc-product-grid">
                        {pcNodeProducts.map(p => <ProductCard key={p.id} product={toCard(p)} layout={storefrontLayout} />)}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {pcNodeProducts.length === 0 && (
              <div className="py-12 bg-white text-center">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No products currently available at this location.</p>
              </div>
            )}
          </div>
        )}

        {pcSearchState === 'idle' && renderLayoutSections(layoutOrder)}
        {pcSearchState === 'found' && postSearchLayoutOrder.length > 0 && renderLayoutSections(postSearchLayoutOrder)}
        {pcSearchState === 'found' && postSearchLayoutOrder.length === 0 && renderLayoutSections(layoutOrder)}
        <Footer />
      </div>
    );
  }

  if (isProductLocation && locationNode && plProducts.length > 0) {
    const plHeadline = page.headline || 'Featured Products';
    const plSubheadline = page.subheadline || '';
    const shopMoreText = page.shopMoreText || 'Shop More';
    const shopMoreLink = page.shopMoreLink || '/';

    const handlePlCheckout = () => {
      for (const hp of plProducts) {
        const hasStockAtNode = (hp.inventory || []).some(inv => inv.nodeId === locationNode.id && inv.quantity > 0);
        if (!hasStockAtNode) continue;
        const cartProduct: Product = {
          id: String(hp.id),
          name: hp.name,
          description: Array.isArray(hp.description) ? hp.description : [hp.description],
          price: typeof hp.price === 'string' ? parseFloat(hp.price) : hp.price,
          images: hp.images || [(hp as any).image],
          category: hp.category,
          inventory: hp.inventory || [],
          createdAt: hp.createdAt,
          productCode: hp.productCode || undefined,
        };
        addToCart(cartProduct, 1);
      }
      setGlobalSelectedNode(locationNode.id);
      navigate('/checkout');
    };

    return (
      <div className="min-h-screen flex flex-col" data-testid="landing-page-product-location">
        <Header />

        <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}>
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full opacity-10"
                style={{
                  width: `${60 + i * 30}px`, height: `${60 + i * 30}px`, background: 'white',
                  top: `${10 + (i * 13) % 80}%`, left: `${5 + (i * 17) % 90}%`,
                }}
              />
            ))}
          </div>

          <div className="relative z-10 max-w-6xl mx-auto px-4 py-12 md:py-20">
            <div className="text-center text-white mb-10">
              {promoDetails.length > 0 && (
                <div className="mb-4">
                  {promoTitle && (
                    <p className="text-sm font-semibold text-white/90 mb-2" data-testid="text-promo-title">{promoTitle}</p>
                  )}
                  <div className="flex flex-wrap justify-center gap-2">
                    {promoDetails.map((promo) => (
                      <Badge
                        key={promo.code}
                        className="bg-white/20 text-white border-white/30 backdrop-blur-sm text-sm px-3 py-1"
                        data-testid={`badge-promo-${promo.code}`}
                      >
                        {promo.discountType === 'percentage'
                          ? `${promo.discountValue}% OFF`
                          : promo.discountType === 'fixed'
                          ? `$${promo.discountValue} OFF`
                          : promo.name}
                        {' '} — Use code <span className="font-bold">{promo.code}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <h1 className="font-bold mb-4 leading-tight" style={{ fontSize: `${headlineFontSize}px` }} data-testid="text-headline">
                {plHeadline}
              </h1>
              {plSubheadline && (
                <p className="text-white/80 mb-6" style={{ fontSize: `${subheadlineFontSize}px` }} data-testid="text-subheadline">{plSubheadline}</p>
              )}
            </div>

            <div className={`grid gap-6 mb-10 ${plProducts.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : plProducts.length === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
              {plProducts.map((hp) => {
                const hpPrice = typeof hp.price === 'string' ? parseFloat(hp.price) : hp.price;
                const hpImage = hp.images?.[0] || (hp as any).image || '';
                return (
                  <div
                    key={hp.id}
                    className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 overflow-hidden hover:bg-white/15 transition-colors"
                    data-testid={`card-hero-product-${hp.id}`}
                  >
                    <div className="aspect-square overflow-hidden">
                      {hpImage && (
                        <img src={hpImage} alt={hp.name} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="p-4 text-white">
                      <h3 className="font-semibold text-lg mb-1 line-clamp-2">{hp.name}</h3>
                      {page.showPrice !== false && (
                        <p className="text-2xl font-bold mb-2">{formatCurrency(hpPrice)}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {page.showCondition && hp.condition && (
                          <Badge className="bg-white/20 text-white border-white/30 text-xs">{hp.condition}</Badge>
                        )}
                        {page.showBrand && hp.brand && (
                          <Badge className="bg-white/20 text-white border-white/30 text-xs">{hp.brand}</Badge>
                        )}
                      </div>
                      {page.showDescription !== false && hp.description && (
                        <div className="text-white/60 text-sm mt-2 line-clamp-3">
                          {Array.isArray(hp.description) ? hp.description[0] : String(hp.description).slice(0, 120)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 max-w-2xl mx-auto">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-5">
                <div className="flex-1 text-center md:text-left space-y-3">
                  <div className="flex items-center justify-center md:justify-start gap-2 text-white/90">
                    <MapPin className="w-5 h-5" />
                    <span className="font-medium">{locationNode.name}</span>
                    <span className="text-white/60">— {locationNode.address}{locationNode.city ? `, ${locationNode.city}` : ''}</span>
                  </div>
                  {(locationNode as any).soonestSlot && (locationNode as any).soonestDate && (
                    <div className="flex items-center justify-center md:justify-start gap-2 text-white/70 text-sm">
                      <Clock className="w-4 h-4" />
                      <span>Next available: {formatSlotLabel((locationNode as any).soonestDate)} at {formatTime12h((locationNode as any).soonestSlot)}</span>
                    </div>
                  )}
                  <div className="pt-1">
                    <Button
                      size="lg"
                      className="h-14 px-10 text-lg font-semibold shadow-lg hover:shadow-xl transition-all"
                      style={{ backgroundColor: ctaColor, color: 'white' }}
                      onClick={handlePlCheckout}
                      data-testid="button-proceed-checkout"
                    >
                      <ShoppingBag className="w-5 h-5 mr-2" />
                      {ctaText}
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </div>
                </div>
                {(() => {
                  const hours = getNodeHoursDisplay(String(locationNode.id));
                  if (!hours) return null;
                  return (
                    <div className="bg-white/10 rounded-xl px-5 py-4 border border-white/20 text-left space-y-2 min-w-[180px]" data-testid="node-hours-pl">
                      <div className="flex items-center gap-2 text-white">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm font-bold">Hours</span>
                        {hours.isOpen && (
                          <Badge className="bg-green-500 text-white text-xs px-2 py-0.5 font-semibold animate-pulse">NOW OPEN</Badge>
                        )}
                      </div>
                      <div className="text-sm text-white/80 space-y-1">
                        {hours.grouped.map((g, i) => (
                          <div key={i}><span className="font-semibold text-white">{g.days}:</span> {g.hours}</div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {shopMoreLink && (
          <div className="py-12 md:py-16 bg-white">
            <div className="max-w-4xl mx-auto px-4 text-center">
              <a
                href={shopMoreLink}
                className="inline-flex items-center gap-2 text-lg font-semibold hover:underline"
                style={{ color: gradientFrom }}
                data-testid="link-shop-more"
              >
                {shopMoreText}
                <ChevronRight className="w-5 h-5" />
              </a>
            </div>
          </div>
        )}

        {renderLayoutSections()}
        <Footer />
      </div>
    );
  }

  if (isLocation && locationNode) {
    const locHeadline = page.headline || `Pickup at ${locationNode.name}`;
    const locSubheadline = page.subheadline || '';

    const locationCategories = Array.from(new Set(locationProducts.map(p => p.category).filter(Boolean))) as string[];

    const maxTilesPerRow = page.carouselVisibleCount ?? 4;
    const gridColsMobile = Math.min(maxTilesPerRow, 2);
    const gridColsTablet = Math.min(maxTilesPerRow, 3);
    const gridColsDesktop = maxTilesPerRow;
    const gridGap = storefrontLayout?.gridGap ?? 16;

    const fontWeightMap: Record<string, string> = { light: 'font-light', normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold' };
    const fontSizeMapHeading: Record<string, string> = { small: 'text-lg md:text-xl', medium: 'text-xl md:text-2xl', large: 'text-2xl md:text-3xl', xlarge: 'text-3xl md:text-4xl' };
    const fontSizeMapSubcat: Record<string, string> = { tiny: 'text-[10px]', small: 'text-xs', medium: 'text-sm', large: 'text-base' };
    const catHeadingClass = `${fontSizeMapHeading[storefrontLayout?.categoryHeadingFontSize || 'large'] || 'text-2xl md:text-3xl'} ${fontWeightMap[storefrontLayout?.categoryHeadingWeight || 'bold'] || 'font-bold'} font-display mb-6 text-foreground`;
    const catHeadingStyle = storefrontLayout?.categoryHeadingColor ? { color: storefrontLayout.categoryHeadingColor } : {};
    const subcatHeadingClass = `${fontSizeMapSubcat[storefrontLayout?.subcategoryHeadingFontSize || 'tiny'] || 'text-[10px]'} ${fontWeightMap[storefrontLayout?.subcategoryHeadingWeight || 'medium'] || 'font-medium'} uppercase tracking-widest mb-1.5 pl-2 border-l-2 border-primary/20`;
    const subcatHeadingStyle = storefrontLayout?.subcategoryHeadingColor ? { color: storefrontLayout.subcategoryHeadingColor } : {};

    return (
      <div className="min-h-screen flex flex-col" data-testid="landing-page-location">
        <Header />

        <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}>
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="absolute rounded-full opacity-10" style={{
                width: `${80 + i * 40}px`, height: `${80 + i * 40}px`, background: 'white',
                top: `${10 + (i * 15) % 80}%`, left: `${5 + (i * 20) % 90}%`,
              }} />
            ))}
          </div>

          <div className="relative z-10 max-w-4xl mx-auto px-4 py-16 md:py-24 text-center text-white">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <MapPin className="w-10 h-10 text-white" />
            </div>
            <h1 className="font-bold mb-4 leading-tight" style={{ fontSize: `${headlineFontSize}px` }} data-testid="text-headline">
              {locHeadline}
            </h1>
            {locSubheadline && (
              <p className="text-white/80 mb-6" style={{ fontSize: `${subheadlineFontSize}px` }} data-testid="text-subheadline">{locSubheadline}</p>
            )}

            <div className="flex flex-col md:flex-row items-center md:items-start justify-center gap-6 md:gap-10 mt-6">
              <div className="flex flex-col items-center md:items-start gap-3 text-white/80 text-sm md:text-base">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{locationNode.address}{locationNode.city ? `, ${locationNode.city}` : ''}</span>
                </div>
                {(locationNode as any).soonestSlot && (locationNode as any).soonestDate && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>Next available: {formatSlotLabel((locationNode as any).soonestDate)} at {formatTime12h((locationNode as any).soonestSlot)}</span>
                  </div>
                )}
                {locationNode.latitude && locationNode.longitude && (
                  <div className="mt-2">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${locationNode.latitude},${locationNode.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white font-semibold text-base shadow-lg hover:shadow-xl transition-all"
                      style={{ backgroundColor: ctaColor }}
                      data-testid="button-get-directions"
                    >
                      <Navigation className="w-5 h-5" />
                      Get Directions
                    </a>
                  </div>
                )}
              </div>

              {(() => {
                const hours = getNodeHoursDisplay(String(locationNode.id));
                if (!hours) return null;
                return (
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl px-5 py-4 border border-white/20 text-left space-y-2 min-w-[180px]" data-testid="node-hours-location">
                    <div className="flex items-center gap-2 text-white">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm font-bold">Hours</span>
                      {hours.isOpen && (
                        <Badge className="bg-green-500 text-white text-xs px-2 py-0.5 font-semibold animate-pulse">NOW OPEN</Badge>
                      )}
                    </div>
                    <div className="text-sm text-white/80 space-y-1">
                      {hours.grouped.map((g, i) => (
                        <div key={i}><span className="font-semibold text-white">{g.days}:</span> {g.hours}</div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {promoDetails.length > 0 && (
          <div className="py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
            <div className="max-w-4xl mx-auto px-4">
              {promoTitle && (
                <p className="text-center text-sm font-semibold text-amber-900 mb-2" data-testid="text-promo-title">{promoTitle}</p>
              )}
              <div className="flex flex-wrap justify-center gap-3">
              {promoDetails.map((promo) => (
                <Badge
                  key={promo.code}
                  className="bg-white border-amber-200 text-amber-800 shadow-sm text-sm px-4 py-1.5"
                  variant="outline"
                  data-testid={`badge-promo-${promo.code}`}
                >
                  {promo.discountType === 'percentage'
                    ? `${promo.discountValue}% OFF`
                    : promo.discountType === 'fixed'
                    ? `$${promo.discountValue} OFF`
                    : promo.name}
                  {' — Use code '}<span className="font-bold">{promo.code}</span>
                </Badge>
              ))}
              </div>
            </div>
          </div>
        )}

        {locationNode && Number(locationNode.latitude) && Number(locationNode.longitude) && (
          <div className="py-8 md:py-12 bg-white">
            <div className="max-w-4xl mx-auto px-4">
              <div className="rounded-xl overflow-hidden shadow-lg border">
                <div ref={lpMapRef} style={{ width: '100%', height: '350px' }} data-testid="landing-page-map" />
                <div className="px-4 py-3 bg-gray-50 flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 shrink-0" style={{ color: gradientFrom }} />
                  <span className="font-medium">{locationNode.name}</span>
                  <span className="text-muted-foreground">— {locationNode.address}{locationNode.city ? `, ${locationNode.city}` : ''}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {locationProducts.length > 0 && (
          <div className="py-12 md:py-16 bg-white">
            <div className="max-w-6xl mx-auto px-4">
              <div className="flex items-center gap-4 mb-8 flex-wrap">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3" data-testid="text-products-at-location">
                  <ShoppingBag className="w-7 h-7" style={{ color: gradientFrom }} />
                  Available at this Location
                </h2>
                <a
                  href="/"
                  className="text-sm font-semibold hover:underline whitespace-nowrap"
                  style={{ color: gradientFrom }}
                  data-testid="link-view-all"
                >
                  View All Locations and Products
                </a>
              </div>

              <style>{`
                .lp-product-grid {
                  display: grid;
                  grid-template-columns: repeat(${gridColsMobile}, minmax(0, 1fr));
                  gap: ${gridGap}px;
                }
                @media (min-width: 640px) {
                  .lp-product-grid { grid-template-columns: repeat(${gridColsTablet}, minmax(0, 1fr)); }
                }
                @media (min-width: 1024px) {
                  .lp-product-grid { grid-template-columns: repeat(${gridColsDesktop}, minmax(0, 1fr)); }
                }
              `}</style>

              {locationCategories.length > 1 ? (
                <div className="space-y-8">
                  {locationCategories.map(cat => {
                    const catProducts = locationProducts.filter(p => p.category === cat);
                    if (catProducts.length === 0) return null;
                    const subcategories = Array.from(new Set(catProducts.map(p => (p as any).subcategory).filter(Boolean))) as string[];
                    const hasSubcategories = subcategories.length > 0;
                    return (
                      <div key={cat}>
                        <h3 className={catHeadingClass} style={catHeadingStyle}>{cat}</h3>
                        {hasSubcategories ? (
                          <div className="space-y-6">
                            {(() => {
                              const uncategorized = catProducts.filter(p => !(p as any).subcategory);
                              if (uncategorized.length === 0) return null;
                              return (
                                <div className="lp-product-grid">
                                  {uncategorized.map((lp) => (
                                    <ProductCard key={lp.id} product={lp as any} layout={storefrontLayout} />
                                  ))}
                                </div>
                              );
                            })()}
                            {subcategories.map(sub => {
                              const subProducts = catProducts.filter(p => (p as any).subcategory === sub);
                              if (subProducts.length === 0) return null;
                              return (
                                <div key={sub}>
                                  <h4 className={subcatHeadingClass} style={subcatHeadingStyle}>{sub}</h4>
                                  <div className="lp-product-grid">
                                    {subProducts.map((lp) => (
                                      <ProductCard key={lp.id} product={lp as any} layout={storefrontLayout} />
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="lp-product-grid">
                            {catProducts.map((lp) => (
                              <ProductCard key={lp.id} product={lp as any} layout={storefrontLayout} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                (() => {
                  const subcategories = Array.from(new Set(locationProducts.map(p => (p as any).subcategory).filter(Boolean))) as string[];
                  const hasSubcategories = subcategories.length > 0;
                  if (!hasSubcategories) {
                    return (
                      <div className="lp-product-grid">
                        {locationProducts.map((lp) => (
                          <ProductCard key={lp.id} product={lp as any} layout={storefrontLayout} />
                        ))}
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-6">
                      {(() => {
                        const uncategorized = locationProducts.filter(p => !(p as any).subcategory);
                        if (uncategorized.length === 0) return null;
                        return (
                          <div className="lp-product-grid">
                            {uncategorized.map((lp) => (
                              <ProductCard key={lp.id} product={lp as any} layout={storefrontLayout} />
                            ))}
                          </div>
                        );
                      })()}
                      {subcategories.map(sub => {
                        const subProducts = locationProducts.filter(p => (p as any).subcategory === sub);
                        if (subProducts.length === 0) return null;
                        return (
                          <div key={sub}>
                            <h4 className={subcatHeadingClass} style={subcatHeadingStyle}>{sub}</h4>
                            <div className="lp-product-grid">
                              {subProducts.map((lp) => (
                                <ProductCard key={lp.id} product={lp as any} layout={storefrontLayout} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {renderLayoutSections()}
        <Footer />
      </div>
    );
  }

  const productPrice = typeof product!.price === 'string' ? parseFloat(product!.price) : product!.price;
  const mainImage = product!.images?.[0] || product!.image || '';
  const headline = page.headline || (isMulti ? 'Featured Products' : product!.name);
  const subheadline = page.subheadline || '';

  return (
    <div className="min-h-screen flex flex-col">
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes scan-line {
          0% { top: 0%; }
          50% { top: 90%; }
          100% { top: 0%; }
        }
        @keyframes confetti-fall {
          0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes reveal-zoom {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes float-dot {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        .celebration-confetti {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 50;
          overflow: hidden;
        }
        .confetti-piece {
          position: absolute;
          width: 10px;
          height: 10px;
          animation: confetti-fall 3s ease-in-out forwards;
        }
      `}</style>

      {showCelebration && (
        <div className="celebration-confetti">
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                backgroundColor: ['#14b8a6', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e'][i % 6],
                borderRadius: i % 3 === 0 ? '50%' : '0',
                animationDelay: `${Math.random() * 1.5}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

      <div
        className="relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full opacity-10"
              style={{
                width: `${60 + i * 30}px`,
                height: `${60 + i * 30}px`,
                background: 'white',
                top: `${10 + (i * 13) % 80}%`,
                left: `${5 + (i * 17) % 90}%`,
                animation: `float-dot ${3 + i * 0.5}s ease-in-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 py-12 md:py-20">
          {isMulti ? (
            <>
              <div className="text-center text-white mb-10">
                {promoDetails.length > 0 && (
                  <div className="mb-4">
                    {promoTitle && (
                      <p className="text-sm font-semibold text-white/90 mb-2" data-testid="text-promo-title">{promoTitle}</p>
                    )}
                    <div className="flex flex-wrap justify-center gap-2">
                    {promoDetails.map((promo) => (
                      <Badge
                        key={promo.code}
                        className="bg-white/20 text-white border-white/30 backdrop-blur-sm text-sm px-3 py-1"
                        data-testid={`badge-promo-${promo.code}`}
                      >
                        {promo.discountType === 'percentage'
                          ? `${promo.discountValue}% OFF`
                          : promo.discountType === 'fixed'
                          ? `$${promo.discountValue} OFF`
                          : promo.name}
                        {' '} — Use code <span className="font-bold">{promo.code}</span>
                      </Badge>
                    ))}
                    </div>
                  </div>
                )}
                <h1 className="font-bold mb-4 leading-tight" style={{ fontSize: `${headlineFontSize}px` }} data-testid="text-headline">
                  {headline}
                </h1>
                {subheadline && (
                  <p className="text-white/80 mb-6" style={{ fontSize: `${subheadlineFontSize}px` }} data-testid="text-subheadline">{subheadline}</p>
                )}
              </div>

              {(() => {
                const gridClass = `grid gap-6 ${heroProducts.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : heroProducts.length === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`;
                const renderCard = (hp: ProductWithExtras) => {
                  const hpPrice = typeof hp.price === 'string' ? parseFloat(hp.price) : hp.price;
                  const hpImage = hp.images?.[0] || (hp as any).image || '';
                  return (
                    <div
                      key={hp.id}
                      className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 overflow-hidden hover:bg-white/15 transition-colors"
                      data-testid={`card-hero-product-${hp.id}`}
                    >
                      <div className="aspect-square overflow-hidden">
                        {hpImage && (
                          <img src={hpImage} alt={hp.name} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="p-4 text-white">
                        <h3 className="font-semibold text-lg mb-1 line-clamp-2">{hp.name}</h3>
                        {page.showPrice !== false && (
                          <p className="text-2xl font-bold mb-2">{formatCurrency(hpPrice)}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {page.showCondition && hp.condition && (
                            <Badge className="bg-white/20 text-white border-white/30 text-xs">{hp.condition}</Badge>
                          )}
                          {page.showBrand && hp.brand && (
                            <Badge className="bg-white/20 text-white border-white/30 text-xs">{hp.brand}</Badge>
                          )}
                        </div>
                        {page.showDescription !== false && hp.description && (
                          <div className="text-white/60 text-sm mt-2 line-clamp-3">
                            {Array.isArray(hp.description) ? hp.description[0] : String(hp.description).slice(0, 120)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                };

                if (page.groupByCategory !== false) {
                  const rawCategories = Array.from(new Set(heroProducts.map(p => p.category || 'Other')));
                  const categories = sortCategoriesByApiOrder(rawCategories);
                  return (
                    <div className="space-y-8 mb-10">
                      {categories.map(cat => {
                        const catProducts = heroProducts.filter(p => (p.category || 'Other') === cat);
                        if (page.showSubcategories) {
                          const subcats = Array.from(new Set(catProducts.map(p => (p as any).subcategory).filter(Boolean))) as string[];
                          const uncategorized = catProducts.filter(p => !(p as any).subcategory);
                          return (
                            <div key={cat}>
                              <h2 className="text-2xl font-bold font-display text-white mb-4">{cat}</h2>
                              {uncategorized.length > 0 && (
                                <div className={`${gridClass} mb-6`}>{uncategorized.map(renderCard)}</div>
                              )}
                              {subcats.map(sub => {
                                const subProducts = catProducts.filter(p => (p as any).subcategory === sub);
                                return (
                                  <div key={sub} className="mb-6">
                                    <h3 className="text-lg font-semibold text-white/80 mb-3 pl-2 border-l-2 border-white/30">{sub}</h3>
                                    <div className={gridClass}>{subProducts.map(renderCard)}</div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                        return (
                          <div key={cat}>
                            <h2 className="text-2xl font-bold font-display text-white mb-4">{cat}</h2>
                            <div className={gridClass}>{catProducts.map(renderCard)}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                return <div className={`${gridClass} mb-10`}>{heroProducts.map(renderCard)}</div>;
              })()}

              <div className="max-w-xl mx-auto">
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                  <label className="block text-sm font-medium text-white/90 mb-2 text-center">
                    Enter your postal code to find nearby pickup spots
                  </label>
                  <div className="flex gap-3">
                    <Input
                      type="text"
                      placeholder="e.g. N9B 1K3"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="bg-white/90 text-gray-900 border-0 placeholder:text-gray-400 h-12 text-lg"
                      data-testid="input-postal-code"
                    />
                    <Button
                      onClick={handleSearch}
                      disabled={searchState === 'searching' || !postalCode.trim()}
                      className="h-12 px-6 text-base font-semibold shrink-0"
                      style={{ backgroundColor: ctaColor, color: 'white' }}
                      data-testid="button-find-pickup"
                    >
                      {searchState === 'searching' ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Navigation className="w-4 h-4 mr-2" />
                          {ctaText}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div className="order-2 md:order-1 text-white">
              {promoDetails.length > 0 && (
                <div className="mb-4">
                  {promoTitle && (
                    <p className="text-sm font-semibold text-white/90 mb-2" data-testid="text-promo-title">{promoTitle}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                  {promoDetails.map((promo) => (
                    <Badge
                      key={promo.code}
                      className="bg-white/20 text-white border-white/30 backdrop-blur-sm text-sm px-3 py-1"
                      data-testid={`badge-promo-${promo.code}`}
                    >
                      {promo.discountType === 'percentage'
                        ? `${promo.discountValue}% OFF`
                        : promo.discountType === 'fixed'
                        ? `$${promo.discountValue} OFF`
                        : promo.name}
                      {' '} — Use code <span className="font-bold">{promo.code}</span>
                    </Badge>
                  ))}
                  </div>
                </div>
              )}

              <h1
                className="font-bold mb-4 leading-tight"
                style={{ fontSize: `${headlineFontSize}px` }}
                data-testid="text-headline"
              >
                {headline}
              </h1>

              {subheadline && (
                <p className="text-white/80 mb-6" style={{ fontSize: `${subheadlineFontSize}px` }} data-testid="text-subheadline">
                  {subheadline}
                </p>
              )}

              {page.showPrice !== false && (
                <div className="font-bold mb-6" style={{ fontSize: `${priceFontSize}px` }} data-testid="text-price">
                  {formatCurrency(productPrice)}
                </div>
              )}

              <div className="flex flex-wrap gap-3 mb-6">
                {page.showCondition && product.condition && (
                  <Badge variant="secondary" className="bg-white/20 text-white border-white/30" data-testid="badge-condition">
                    {product.condition}
                  </Badge>
                )}
                {page.showBrand && product.brand && (
                  <Badge variant="secondary" className="bg-white/20 text-white border-white/30" data-testid="badge-brand">
                    {product.brand}
                  </Badge>
                )}
              </div>

              {page.showDescription !== false && product.description && (
                <div className="text-white/70 mb-8 max-w-lg" data-testid="text-description">
                  {Array.isArray(product.description) ? (
                    <ul className="space-y-1">
                      {product.description.slice(0, 5).map((point, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-white/90" />
                          <span dangerouslySetInnerHTML={{ __html: point }} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p dangerouslySetInnerHTML={{ __html: String(product.description).slice(0, 300) }} />
                  )}
                </div>
              )}

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Enter your postal code to find nearby pickup spots
                </label>
                <div className="flex gap-3">
                  <Input
                    type="text"
                    placeholder="e.g. N9B 1K3"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="bg-white/90 text-gray-900 border-0 placeholder:text-gray-400 h-12 text-lg"
                    data-testid="input-postal-code"
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={searchState === 'searching' || !postalCode.trim()}
                    className="h-12 px-6 text-base font-semibold shrink-0"
                    style={{ backgroundColor: ctaColor, color: 'white' }}
                    data-testid="button-find-pickup"
                  >
                    {searchState === 'searching' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Navigation className="w-4 h-4 mr-2" />
                        {ctaText}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="order-1 md:order-2 flex justify-center">
              <div className="relative">
                <div
                  className="absolute inset-0 rounded-3xl blur-3xl opacity-30"
                  style={{ background: `radial-gradient(circle, ${gradientFrom}, transparent)` }}
                />
                {mainImage && (
                  <img
                    src={mainImage}
                    alt={product.name}
                    className="relative z-10 w-full max-w-md rounded-2xl shadow-2xl object-cover"
                    data-testid="img-product-hero"
                  />
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {searchState === 'searching' && (
        <div className="py-20 flex flex-col items-center justify-center bg-gray-50">
          <div className="relative w-32 h-32 mb-8">
            <div
              className="absolute inset-0 rounded-full border-4 opacity-60"
              style={{ borderColor: ctaColor, animation: 'pulse-ring 1.5s ease-out infinite' }}
            />
            <div
              className="absolute inset-4 rounded-full border-4 opacity-40"
              style={{ borderColor: ctaColor, animation: 'pulse-ring 1.5s ease-out infinite 0.3s' }}
            />
            <div
              className="absolute inset-8 rounded-full border-4 opacity-20"
              style={{ borderColor: ctaColor, animation: 'pulse-ring 1.5s ease-out infinite 0.6s' }}
            />
            <div
              className="absolute inset-0 flex items-center justify-center"
            >
              <MapPin className="w-10 h-10" style={{ color: ctaColor }} />
            </div>
          </div>
          <p className="text-lg font-medium text-gray-700 animate-pulse" data-testid="text-searching">
            Scanning nearby pickup spots...
          </p>
          <div className="relative w-64 h-1 mt-4 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="absolute h-full rounded-full"
              style={{
                backgroundColor: ctaColor,
                animation: 'scan-line 2s ease-in-out infinite',
                width: '40%',
              }}
            />
          </div>
        </div>
      )}

      {searchState === 'found' && (
        <div ref={resultsRef} className="py-12 md:py-16 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4">
            <div
              className="text-center mb-10"
              style={{ animation: 'reveal-zoom 0.6s ease-out' }}
            >
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
                style={{ backgroundColor: `${ctaColor}20` }}
              >
                <Check className="w-8 h-8" style={{ color: ctaColor }} />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2" data-testid="text-found-title">
                Pickup Spots Found!
              </h2>
              <p className="text-gray-500">
                {nodesWithStock.length} location{nodesWithStock.length !== 1 ? 's' : ''} near you {nodesWithStock.length === 1 ? 'has' : 'have'} {isMulti ? 'these products' : 'this product'} in stock
              </p>
            </div>

            <div className="space-y-4">
              {nodesWithStock.map((nws, idx) => {
                const isSelected = selectedNodeId === nws.node.id;
                return (
                  <Card
                    key={nws.node.id}
                    className={`cursor-pointer transition-all duration-300 ${
                      isSelected
                        ? 'ring-2 shadow-lg scale-[1.01]'
                        : 'hover:shadow-md'
                    }`}
                    style={isSelected ? { ringColor: ctaColor, borderColor: ctaColor } : {}}
                    onClick={() => setSelectedNodeId(nws.node.id)}
                    data-testid={`card-node-${nws.node.id}`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                              style={{ backgroundColor: ctaColor }}
                            >
                              {idx + 1}
                            </div>
                            <div>
                              <h3 className="font-semibold text-lg" data-testid={`text-node-name-${nws.node.id}`}>
                                {nws.node.name}
                              </h3>
                              <p className="text-sm text-gray-500 flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" />
                                {nws.node.city || nws.node.address}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-4 mt-3 text-sm">
                            {nws.soonestSlot && nws.soonestDate && (
                              <div className="flex items-center gap-1.5 text-gray-600">
                                <Clock className="w-4 h-4" style={{ color: ctaColor }} />
                                <span>
                                  Earliest: <span className="font-medium text-gray-900">
                                    {formatSlotLabel(nws.soonestDate)} at {formatTime12h(nws.soonestSlot)}
                                  </span>
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 text-gray-600">
                              <Package className="w-4 h-4" style={{ color: ctaColor }} />
                              <span>{nws.stock > 5 ? '5+' : nws.stock} in stock</span>
                            </div>
                            {nws.node.rating && (
                              <div className="flex items-center gap-1 text-gray-600">
                                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                <span>{nws.node.rating}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {isSelected && (
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0"
                              style={{ backgroundColor: ctaColor }}
                            >
                              <Check className="w-4 h-4" />
                            </div>
                          )}
                          {(() => {
                            const hours = getNodeHoursDisplay(String(nws.node.id));
                            if (!hours) return null;
                            return (
                              <div className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100 text-left space-y-1 min-w-[160px]" data-testid={`node-hours-${nws.node.id}`}>
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                                  <span className="text-xs font-bold text-gray-600">Hours</span>
                                  {hours.isOpen && (
                                    <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0 font-semibold animate-pulse">NOW OPEN</Badge>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 space-y-0.5">
                                  {hours.grouped.map((g, gi) => (
                                    <div key={gi}><span className="font-semibold text-gray-700">{g.days}:</span> {g.hours}</div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {selectedNodeData && (
              <div className="mt-8 text-center" style={{ animation: 'reveal-zoom 0.4s ease-out' }}>
                <Button
                  size="lg"
                  className="h-14 px-10 text-lg font-semibold shadow-lg hover:shadow-xl transition-all"
                  style={{ backgroundColor: ctaColor, color: 'white' }}
                  onClick={handleProceedToCheckout}
                  data-testid="button-proceed-checkout"
                >
                  <ShoppingBag className="w-5 h-5 mr-2" />
                  Proceed to Checkout
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <p className="text-sm text-gray-500 mt-3">
                  Picking up at <span className="font-medium">{selectedNodeData.node.name}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {searchState === 'not-found' && (
        <div className="py-16 flex flex-col items-center justify-center bg-gray-50">
          <MapPin className="w-12 h-12 text-gray-300 mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2" data-testid="text-not-found-nodes">
            No Pickup Spots Available
          </h2>
          <p className="text-gray-500 text-center max-w-md mb-6">
            Unfortunately, this product isn't available for pickup near your area right now. Try a different postal code or check back later.
          </p>
          <Button
            variant="outline"
            onClick={() => { setSearchState('idle'); setPostalCode(''); }}
            data-testid="button-try-again"
          >
            Try Another Code
          </Button>
        </div>
      )}

      {shopMoreProducts.length > 0 && (
        <div className="py-12 md:py-16 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8" data-testid="text-shop-more">
              Shop More
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {shopMoreProducts.map((sp) => {
                const spPrice = typeof sp.price === 'string' ? parseFloat(sp.price) : sp.price;
                const spImage = sp.images?.[0] || (sp as any).image || '';
                const spUrl = productUrl({ id: String(sp.id), name: sp.name });
                return (
                  <a
                    key={sp.id}
                    href={spUrl}
                    className="group block rounded-xl overflow-hidden border hover:shadow-lg transition-shadow"
                    data-testid={`card-shop-more-${sp.id}`}
                  >
                    <div className="aspect-square bg-gray-100 overflow-hidden">
                      {spImage && (
                        <img
                          src={spImage}
                          alt={sp.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">{sp.name}</p>
                      <p className="text-sm font-bold" style={{ color: gradientFrom }}>
                        {formatCurrency(spPrice)}
                      </p>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {renderLayoutSections()}
      <Footer />
    </div>
  );
}
