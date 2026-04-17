import { useParams, Link, useLocation } from 'wouter';
import { ArrowLeft, Plus, Minus, MapPin, Package, Loader2, Map, Link2, ShoppingCart, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadGoogleMaps, GRIDMART_MAP_STYLES } from '@/lib/googleMaps';
import { toast } from 'sonner';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ZoneMapDialog } from '@/components/map/ZoneMapDialog';
import { MediaThumbnail } from '@/components/media/YouTubeThumbnail';
import { isYouTubeUrl, extractYouTubeVideoId, getYouTubeThumbnail } from '@/lib/youtube';
import { formatCurrency, getDescriptionPoints, type Product, type Node } from '@/lib/mockData';
import { useCart, useServingCities } from '@/lib/store';
import { ProductCard, type StorefrontLayoutSettings } from '@/components/products/ProductCard';
import { productUrl, extractProductIdPrefix, isUuid } from '../../../shared/slugify';

const ZONE_COLORS = ['#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#22c55e'];

function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs((Math.sin(hash) * 10000) % 1);
}

function generateOffsetCenter(lat: number, lng: number, nodeId: string | number): [number, number] {
  const maxOffsetKm = 0.4;
  const id = String(nodeId);
  const angle = seededRandom(id + 'angle') * 2 * Math.PI;
  const distance = seededRandom(id + 'dist') * maxOffsetKm;
  const latOffset = (distance * Math.cos(angle)) / 111;
  const lngOffset = (distance * Math.sin(angle)) / (111 * Math.cos(lat * Math.PI / 180));
  return [lat + latOffset, lng + lngOffset];
}

function formatSlotDay(dateStr: string): { label: string; subLabel: string } {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (date.getTime() === today.getTime()) return { label: 'Today', subLabel: monthDay };
  if (date.getTime() === tomorrow.getTime()) return { label: 'Tomorrow', subLabel: monthDay };
  return { label: dayOfWeek, subLabel: monthDay };
}

function to12h(t: string) {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

const filterNext48h = (slots: any[]) => {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const todayDate = now.toISOString().split('T')[0];
  const cutoffDate = cutoff.toISOString().split('T')[0];
  return slots.filter((s: any) => s.date >= todayDate && s.date < cutoffDate);
};

// Color palette for variant highlighting
const VARIANT_COLORS = [
  { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-700', ring: 'ring-blue-400' },
  { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700', ring: 'ring-emerald-400' },
  { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-700', ring: 'ring-purple-400' },
  { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700', ring: 'ring-amber-400' },
  { bg: 'bg-rose-100', border: 'border-rose-400', text: 'text-rose-700', ring: 'ring-rose-400' },
  { bg: 'bg-cyan-100', border: 'border-cyan-400', text: 'text-cyan-700', ring: 'ring-cyan-400' },
];

export default function ProductDetail() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const [quantity, setQuantity] = useState(1);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [highlightedZone, setHighlightedZone] = useState<number | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const { addToCart, cart } = useCart();
  const { selectedCityId } = useServingCities();

  const [mapsReady, setMapsReady] = useState(false);
  const productMapRef = useRef<HTMLDivElement>(null);
  const productMapCirclesRef = useRef<google.maps.Circle[]>([]);
  const productMapInstanceRef = useRef<google.maps.Map | null>(null);
  const [mapSelectedNode, setMapSelectedNode] = useState<{ id: string; name: string } | null>(null);
  const [mapSlots, setMapSlots] = useState<any[]>([]);
  const [mapSlotsLoading, setMapSlotsLoading] = useState(false);

  useEffect(() => {
    loadGoogleMaps().then(() => setMapsReady(true)).catch(console.error);
  }, []);

  const productId = useMemo(() => {
    const slug = params.slug || '';
    if (isUuid(slug)) return slug;
    const prefix = extractProductIdPrefix(slug);
    return prefix || slug;
  }, [params.slug]);

  const { data: product, isLoading: productLoading } = useQuery<Product>({
    queryKey: ['product', productId],
    queryFn: async () => {
      const lookupId = isUuid(productId) ? productId : `prefix:${productId}`;
      const res = await fetch(`/api/products/${encodeURIComponent(lookupId)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!productId,
  });
  
  useEffect(() => {
    if (product) {
      const correctUrl = productUrl(product);
      const currentPath = `/product/${params.slug}`;
      if (currentPath !== correctUrl) {
        window.history.replaceState(null, '', correctUrl);
      }
    }
  }, [product, params.slug]);

  const { data: nodes = [] } = useQuery<Node[]>({
    queryKey: ['nodes'],
    queryFn: async () => {
      const res = await fetch('/api/nodes');
      if (!res.ok) throw new Error('Failed to fetch nodes');
      return res.json();
    },
  });
  
  // Fetch all products to find linked variants
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
  });
  
  const { data: storefrontLayout } = useQuery<StorefrontLayoutSettings>({
    queryKey: ['storefrontLayout'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) return {};
      const settings = await res.json();
      if (settings.storefrontLayout) {
        try { return JSON.parse(settings.storefrontLayout); } catch { return {}; }
      }
      return {};
    },
  });

  const { data: siteSettings = {}, isSuccess: siteSettingsLoaded } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) return {};
      return res.json();
    },
  });

  const nodeColors = useMemo(() => {
    try { return siteSettings.nodeColors ? JSON.parse(siteSettings.nodeColors) as Record<string, string> : {}; } catch { return {}; }
  }, [siteSettings.nodeColors]);

  const nodeBorderColors = useMemo(() => {
    try { return siteSettings.nodeBorderColors ? JSON.parse(siteSettings.nodeBorderColors) as Record<string, string> : {}; } catch { return {}; }
  }, [siteSettings.nodeBorderColors]);

  const nodeOpacities = useMemo(() => {
    try { return siteSettings.nodeOpacities ? JSON.parse(siteSettings.nodeOpacities) as Record<string, number> : {}; } catch { return {}; }
  }, [siteSettings.nodeOpacities]);

  const nodeStrokeOpacities = useMemo(() => {
    try { return siteSettings.nodeStrokeOpacities ? JSON.parse(siteSettings.nodeStrokeOpacities) as Record<string, number> : {}; } catch { return {}; }
  }, [siteSettings.nodeStrokeOpacities]);

  const fetchProductMapSlots = useCallback(async (nodeId: string) => {
    setMapSlotsLoading(true);
    setMapSlots([]);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/pickup-slots`);
      const data = await res.json();
      setMapSlots(filterNext48h(data.slots || []));
    } catch {
      setMapSlots([]);
    } finally {
      setMapSlotsLoading(false);
    }
  }, []);

  // Find linked variants using parent-child relationships
  const linkedVariants = useMemo(() => {
    if (!product) return [];
    
    // Find the parent product (either this product is the parent, or we need to find the parent)
    let parentId: string | null = null;
    let parentProduct: Product | null = null;
    
    // If this product is a variant child, find the parent
    if (product.parentProductId && product.relationshipType === 'variant') {
      parentId = product.parentProductId;
      parentProduct = allProducts.find(p => p.id === parentId) || null;
    } else {
      // This product might be a parent
      parentId = product.id;
      parentProduct = product;
    }
    
    if (!parentId) return [product];
    
    // Find all variant children of the parent
    const variantChildren = allProducts.filter(p => 
      p.parentProductId === parentId && p.relationshipType === 'variant'
    );
    
    // Build the variant group: parent (if exists and not already included) + all variants
    const variantGroup: Product[] = [];
    
    if (parentProduct && parentProduct.id !== product.id) {
      variantGroup.push(parentProduct);
    }
    
    // Add the current product first
    variantGroup.push(product);
    
    // Add other variants
    for (const variant of variantChildren) {
      if (variant.id !== product.id) {
        variantGroup.push(variant);
      }
    }
    
    // Sort by variant name or name
    return variantGroup.sort((a, b) => {
      const aName = a.variantName || a.name || '';
      const bName = b.variantName || b.name || '';
      return aName.localeCompare(bName);
    });
  }, [product, allProducts]);

  const relatedProducts = useMemo(() => {
    if (!product || !product.category) return [];
    const variantIds = new Set(linkedVariants.map(v => v.id));
    const parentId = product.parentProductId || product.id;
    const isRelated = (p: Product) =>
      p.category === product.category &&
      p.id !== product.id &&
      !variantIds.has(p.id) &&
      p.id !== parentId &&
      p.parentProductId !== parentId &&
      !p.parentProductId;
    const hasStock = (p: Product) => {
      const totalStock = p.inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
      return totalStock > 0 || !!p.comingSoon;
    };
    const sameSubcategory = product.subcategory
      ? allProducts.filter(p => isRelated(p) && hasStock(p) && p.subcategory === product.subcategory)
      : [];
    const restOfCategory = allProducts.filter(p => isRelated(p) && hasStock(p) && (!product.subcategory || p.subcategory !== product.subcategory));
    return [...sameSubcategory, ...restOfCategory];
  }, [product, allProducts, linkedVariants]);

  const categoryNav = useMemo(() => {
    if (!product || !allProducts.length) return { prev: null, next: null };
    const sameCategory = allProducts
      .filter(p => p.category === product.category && p.inventory?.some(inv => inv.quantity > 0) && !p.parentProductId)
      .sort((a, b) => a.name.localeCompare(b.name));
    const currentIdx = sameCategory.findIndex(p => p.id === product.id);
    if (currentIdx === -1) return { prev: null, next: null };
    return {
      prev: sameCategory[(currentIdx - 1 + sameCategory.length) % sameCategory.length],
      next: sameCategory[(currentIdx + 1) % sameCategory.length],
    };
  }, [product, allProducts]);

  const nearestPickupLabel = useMemo(() => {
    if (!mapSlots.length) return null;
    const sorted = [...mapSlots].sort((a, b) => {
      const da = `${a.date}T${a.startTime}`;
      const db = `${b.date}T${b.startTime}`;
      return da.localeCompare(db);
    });
    const slot = sorted[0];
    if (!slot) return null;
    const startDate = new Date(slot.date + 'T' + slot.startTime);
    const fmt = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      const period = h >= 12 ? 'PM' : 'AM';
      const dh = h % 12 || 12;
      return `${dh}:${m.toString().padStart(2, '0')} ${period}`;
    };
    const now = new Date();
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const slotDay = new Date(slot.date + 'T00:00:00');
    let dayLabel: string;
    if (slotDay.getTime() === today.getTime()) dayLabel = 'Today';
    else if (slotDay.getTime() === tomorrow.getTime()) dayLabel = 'Tomorrow';
    else dayLabel = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return `Earliest pickup: ${dayLabel}, ${fmt(slot.startTime)} – ${fmt(slot.endTime)}`;
  }, [mapSlots]);

  const nodesWithStockForMap = useMemo(() => {
    if (!product || !nodes.length) return [];
    return nodes
      .filter(n => n.status === 'active' && n.latitude && n.longitude && product.inventory?.some(inv => inv.nodeId === n.id && inv.quantity > 0) && (!selectedCityId || n.servingCityId === selectedCityId))
      .map((n, idx) => ({ ...n, zoneNumber: idx + 1 }));
  }, [product, nodes, selectedCityId]);

  const nodesWithStockIds = nodesWithStockForMap.map(n => n.id).sort().join(',');

  useEffect(() => {
    if (!productMapRef.current || nodesWithStockForMap.length === 0 || !mapsReady || !siteSettingsLoaded) return;

    productMapCirclesRef.current.forEach(c => c.setMap(null));
    productMapCirclesRef.current = [];

    const validNodes = nodesWithStockForMap.filter(n => n.latitude && n.longitude);
    if (validNodes.length === 0) return;

    const mapCenter = { lat: parseFloat(siteSettings.mapLat || String(Number(validNodes[0].latitude))), lng: parseFloat(siteSettings.mapLng || String(Number(validNodes[0].longitude))) };
    const mapZoom = parseInt(siteSettings.mapZoom || '11', 10);

    const map = new google.maps.Map(productMapRef.current, {
      center: mapCenter,
      zoom: mapZoom,
      styles: GRIDMART_MAP_STYLES,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'cooperative',
    });

    validNodes.forEach((node, idx) => {
      const lat = Number(node.latitude);
      const lng = Number(node.longitude);
      const color = nodeColors[String(node.id)] || ZONE_COLORS[idx % ZONE_COLORS.length];
      const [circleLat, circleLng] = generateOffsetCenter(lat, lng, node.id);
      const borderColor = nodeBorderColors[String(node.id)] || color;
      const fillOp = nodeOpacities[String(node.id)] ?? 0.2;
      const strokeOp = nodeStrokeOpacities[String(node.id)] ?? 1;

      const circle = new google.maps.Circle({
        center: { lat: circleLat, lng: circleLng },
        radius: parseInt(siteSettings.nodeCircleSize || '500', 10),
        strokeColor: borderColor,
        fillColor: color,
        fillOpacity: fillOp,
        strokeOpacity: strokeOp,
        strokeWeight: 2,
        map,
        clickable: true,
      });

      (circle as any)._nodeId = String(node.id);
      (circle as any)._baseStyle = { fillColor: color, strokeColor: borderColor, fillOpacity: fillOp, strokeOpacity: strokeOp, strokeWeight: 2 };
      (circle as any)._selectedStyle = { fillColor: '#f59e0b', strokeColor: '#f59e0b', fillOpacity: 0.4, strokeOpacity: 1, strokeWeight: 4 };

      circle.addListener('click', () => {
        productMapCirclesRef.current.forEach(c => {
          const base = (c as any)._baseStyle;
          if (base) c.setOptions(base);
        });
        circle.setOptions((circle as any)._selectedStyle);
        setMapSelectedNode({ id: String(node.id), name: node.name });
        fetchProductMapSlots(String(node.id));
      });

      productMapCirclesRef.current.push(circle);
    });

    if (validNodes.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      validNodes.forEach(n => {
        const [oLat, oLng] = generateOffsetCenter(Number(n.latitude), Number(n.longitude), n.id);
        bounds.extend({ lat: oLat, lng: oLng });
      });
      map.fitBounds(bounds, 50);
    }

    productMapInstanceRef.current = map;

    if (mapSelectedNode) {
      const target = productMapCirclesRef.current.find(c => (c as any)._nodeId === mapSelectedNode.id);
      if (target) target.setOptions((target as any)._selectedStyle);
    }

    return () => {
      productMapCirclesRef.current.forEach(c => c.setMap(null));
      productMapCirclesRef.current = [];
      productMapInstanceRef.current = null;
    };
  }, [nodesWithStockIds, mapsReady, siteSettingsLoaded, nodeColors, nodeBorderColors, nodeOpacities, nodeStrokeOpacities, siteSettings.mapLat, siteSettings.mapLng, siteSettings.mapZoom, siteSettings.nodeCircleSize]);

  useEffect(() => {
    if (nodesWithStockForMap.length === 0 || mapSelectedNode) return;

    const findFirstAvailable = async () => {
      setMapSlotsLoading(true);
      for (const node of nodesWithStockForMap) {
        try {
          const res = await fetch(`/api/nodes/${node.id}/pickup-slots`);
          const data = await res.json();
          const slots = filterNext48h(data.slots || []);
          if (slots.length > 0) {
            setMapSelectedNode({ id: String(node.id), name: node.name });
            setMapSlots(slots);
            setMapSlotsLoading(false);
            productMapCirclesRef.current.forEach(c => {
              if ((c as any)._nodeId === String(node.id)) {
                c.setOptions((c as any)._selectedStyle);
              }
            });
            return;
          }
        } catch {}
      }
      const first = nodesWithStockForMap[0];
      setMapSelectedNode({ id: String(first.id), name: first.name });
      fetchProductMapSlots(String(first.id));
    };

    findFirstAvailable();
  }, [nodesWithStockIds]);

  if (productLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold mb-2">Product not found</h1>
            <Link href="/">
              <Button>Back to Shop</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Check if product is available at any node (allow coming soon products through)
  const hasNodeInventory = product.inventory?.some(inv => inv.quantity > 0);
  if (!hasNodeInventory && !product.comingSoon) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold mb-2">Product not available</h1>
            <p className="text-muted-foreground mb-4">This product is currently not available for pickup.</p>
            <Link href="/">
              <Button>Back to Shop</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const productInventory = product.inventory || [];
  const nodesWithStock = nodes
    .filter(n => n.status === 'active' && productInventory.some(inv => inv.nodeId === n.id && inv.quantity > 0) && (!selectedCityId || n.servingCityId === selectedCityId))
    .map((n, idx) => ({
      ...n,
      stockQuantity: productInventory.find(inv => inv.nodeId === n.id)?.quantity || 0,
      zoneNumber: idx + 1
    }));
  const inventoryStock = productInventory.reduce((sum, inv) => sum + inv.quantity, 0);
  const totalStock = inventoryStock > 0 ? inventoryStock : (product.sheetQuantity || 0);

  const handleAddToCart = () => {
    const colorObj = selectedColor ? product.colors?.find(c => c.hex === selectedColor) : undefined;
    addToCart(product, quantity, colorObj);
    setQuantity(1);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-4">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-3">
            <Link href="/">
              <Button variant="ghost" className="gap-2" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
                Back to Shop
              </Button>
            </Link>
            {(categoryNav.prev || categoryNav.next) && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground mr-1 hidden sm:inline">{product.category}</span>
                {categoryNav.prev && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => navigate(productUrl(categoryNav.prev!))}
                    data-testid="button-prev-product"
                    title={categoryNav.prev.name}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                )}
                {categoryNav.next && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => navigate(productUrl(categoryNav.next!))}
                    data-testid="button-next-product"
                    title={categoryNav.next.name}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="animate-fade-in">
              <div 
                className="relative rounded-xl overflow-hidden bg-white flex items-center justify-center"
                style={{ minHeight: '300px', maxHeight: '500px' }}
                onTouchStart={(e) => {
                  touchStartX.current = e.touches[0].clientX;
                }}
                onTouchEnd={(e) => {
                  if (touchStartX.current === null) return;
                  const touchEndX = e.changedTouches[0].clientX;
                  const diff = touchStartX.current - touchEndX;
                  const images = product?.images || [];
                  if (Math.abs(diff) > 50 && images.length > 1) {
                    if (diff > 0) {
                      setCurrentImageIndex(prev => (prev + 1) % images.length);
                    } else {
                      setCurrentImageIndex(prev => prev === 0 ? images.length - 1 : prev - 1);
                    }
                  }
                  touchStartX.current = null;
                }}
              >
                {isYouTubeUrl(product.images[currentImageIndex] || product.images[0]) ? (
                  <MediaThumbnail
                    url={product.images[currentImageIndex] || product.images[0]}
                    alt={product.name}
                    className="w-full h-full"
                  />
                ) : (
                  <Zoom>
                    <img
                      src={product.images[currentImageIndex] || product.images[0]}
                      alt={product.name}
                      className="w-full max-h-[500px] object-contain cursor-zoom-in"
                    />
                  </Zoom>
                )}
                {product.images.length > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentImageIndex(prev => prev === 0 ? product.images.length - 1 : prev - 1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow-md"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setCurrentImageIndex(prev => (prev + 1) % product.images.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow-md"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {product.images.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentImageIndex(idx)}
                          className={`w-2 h-2 rounded-full transition-colors ${
                            idx === currentImageIndex ? 'bg-primary' : 'bg-white/60'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="animate-fade-in">
              <div className="flex gap-2 mb-2">
                <Badge 
                  className="bg-muted text-foreground cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => navigate(`/?category=${encodeURIComponent(product.category)}`)}
                >
                  {product.category}
                </Badge>
                {product.condition && (
                  <Badge className={product.condition === 'New' ? 'bg-primary text-primary-foreground border-primary' : ''} variant={product.condition === 'New' ? 'default' : 'outline'}>
                    {product.condition}
                  </Badge>
                )}
              </div>
              <h1 className="font-display text-2xl font-bold mb-3" data-testid="text-product-name">
                {product.name}
              </h1>
              <div className="text-sm text-muted-foreground mb-4">
                {(() => {
                  const points = getDescriptionPoints(product.description);
                  if (points.length <= 1) {
                    return <p dangerouslySetInnerHTML={{ __html: points[0] || '' }} />;
                  }
                  const visiblePoints = descriptionExpanded ? points : points.slice(0, 3);
                  return (
                    <>
                      <ul className="space-y-1">
                        {visiblePoints.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            <span className="text-sm" dangerouslySetInnerHTML={{ __html: point }} />
                          </li>
                        ))}
                      </ul>
                      {points.length > 3 && (
                        <button
                          onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                          className="text-primary text-sm font-medium mt-1 hover:underline"
                          data-testid="button-read-more"
                        >
                          {descriptionExpanded ? 'Show less' : 'Read more'}
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="flex items-center gap-3 mb-2">
                <span className="font-display text-3xl font-bold" data-testid="text-product-price">
                  {formatCurrency(product.price)}
                </span>
                {totalStock === 0 && product.comingSoon && (
                  <Badge className="bg-amber-500 hover:bg-amber-500 text-white" data-testid="badge-coming-soon">
                    Coming Soon
                  </Badge>
                )}
                {totalStock === 0 && !product.comingSoon && (
                  <Badge variant="destructive">
                    Out of stock
                  </Badge>
                )}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    data-testid="button-quantity-minus"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </Button>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => {
                      const newQty = parseInt(e.target.value) || 1;
                      if (newQty > totalStock) {
                        toast.error('Maximum available quantity reached');
                        setQuantity(totalStock);
                      } else if (newQty >= 1) {
                        setQuantity(newQty);
                      }
                    }}
                    className="w-12 h-8 text-center text-sm"
                    data-testid="input-quantity"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      if (quantity >= totalStock) {
                        toast.error('Maximum available quantity reached');
                      } else {
                        setQuantity(quantity + 1);
                      }
                    }}
                    data-testid="button-quantity-plus"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                  {(() => {
                    const inCart = cart.find(c => c.product.id === product.id);
                    return inCart ? (
                      <span className="text-xs text-green-600 font-medium ml-1" data-testid="text-in-cart-quantity">
                        {inCart.quantity} in <Link href="/cart" className="underline hover:text-green-700">cart</Link>
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
              <div className="flex gap-2 mb-3">
                <Button 
                  className="flex-1 h-auto py-3 gap-1.5 px-4 text-sm" 
                  disabled={totalStock === 0}
                  onClick={handleAddToCart}
                  data-testid="button-add-to-cart"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Add to Cart
                </Button>
                <Button 
                  variant="outline"
                  className="flex-1 h-auto py-3 gap-1.5 px-4 text-sm" 
                  onClick={() => {
                    if (!cart.some(c => c.product.id === product.id)) {
                      toast.warning('Please add something to your cart first before arranging a pickup.');
                      return;
                    }
                    navigate('/checkout');
                  }}
                  disabled={totalStock === 0}
                  data-testid="button-proceed-to-checkout"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <div className="flex flex-col items-start leading-tight">
                    <span>Arrange a Pickup</span>
                    {nearestPickupLabel && (
                      <span className="text-[11px] font-normal opacity-90">{nearestPickupLabel}</span>
                    )}
                  </div>
                </Button>
              </div>

              {product.colors && product.colors.length > 0 && (
                <div className="mb-3">
                  <span className="text-sm font-medium mb-2 block">
                    Color: {selectedColor ? product.colors.find(c => c.hex === selectedColor)?.name : 'Select a color'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {product.colors.map((color) => (
                      <button
                        key={color.hex}
                        className={`w-10 h-10 rounded-full border-2 transition-all ${
                          selectedColor === color.hex
                            ? 'border-primary ring-2 ring-primary ring-offset-2'
                            : 'border-muted-foreground/30 hover:border-muted-foreground'
                        }`}
                        style={{ backgroundColor: color.hex }}
                        onClick={() => setSelectedColor(color.hex)}
                        title={color.name}
                        data-testid={`color-${color.name.toLowerCase()}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {linkedVariants.length > 1 && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Link2 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Available Variants</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {linkedVariants.map((variant, idx) => {
                      const isCurrentProduct = variant.id === product.id;
                      const displayName = variant.variantName || variant.variantSuffix || variant.productCode?.split('-').pop() || 'Original';
                      
                      return (
                        <button
                          key={variant.id}
                          onClick={() => !isCurrentProduct && navigate(productUrl(variant))}
                          className={`px-3 py-2 rounded-lg border-2 transition-all ${
                            isCurrentProduct 
                              ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary ring-offset-2 font-semibold' 
                              : 'border-muted-foreground/30 bg-muted/30 text-foreground hover:scale-105 cursor-pointer hover:border-muted-foreground'
                          }`}
                          disabled={isCurrentProduct}
                          data-testid={`variant-${variant.id}`}
                        >
                          <div className="text-sm font-medium truncate max-w-[120px]" title={variant.name}>
                            {displayName}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {nodesWithStockForMap.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <MapPin className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm">
                      Available for pickup at {nodesWithStock.length} location{nodesWithStock.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex flex-wrap gap-1.5" style={{ opacity: siteSettingsLoaded ? 1 : 0, transition: 'opacity 0.15s ease-in' }}>
                      {nodesWithStockForMap.map((node, idx) => {
                        const isSelected = mapSelectedNode?.id === String(node.id);
                        return (
                          <Badge
                            key={node.id}
                            variant="outline"
                            className="text-xs cursor-pointer transition-all hover:scale-105"
                            style={{
                              borderColor: isSelected ? '#f59e0b' : (nodeColors[String(node.id)] || ZONE_COLORS[idx % ZONE_COLORS.length]),
                              color: isSelected ? '#f59e0b' : (nodeColors[String(node.id)] || ZONE_COLORS[idx % ZONE_COLORS.length]),
                              backgroundColor: isSelected ? '#f59e0b15' : 'rgba(255,255,255,0.8)',
                            }}
                            onClick={() => {
                              productMapCirclesRef.current.forEach(c => {
                                const base = (c as any)._baseStyle;
                                if (base) c.setOptions(base);
                              });
                              const target = productMapCirclesRef.current.find(c => (c as any)._nodeId === String(node.id));
                              if (target) target.setOptions((target as any)._selectedStyle);
                              if (node.latitude && node.longitude && productMapInstanceRef.current) {
                                productMapInstanceRef.current.panTo({ lat: Number(node.latitude), lng: Number(node.longitude) });
                                productMapInstanceRef.current.setZoom(Math.max(productMapInstanceRef.current.getZoom() || 12, 13));
                              }
                              setMapSelectedNode({ id: String(node.id), name: node.name });
                              fetchProductMapSlots(String(node.id));
                            }}
                            data-testid={`badge-zone-${node.id}`}
                          >
                            {node.name} · {(() => { const qty = product.inventory?.find(inv => inv.nodeId === node.id)?.quantity || 0; return qty > 5 ? '5+' : qty; })()} in stock
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  <div
                    ref={productMapRef}
                    className="h-[180px] rounded-xl overflow-hidden border border-primary shadow-sm"
                    data-testid="product-map"
                  />

                </div>
              )}
            </div>
          </div>

          {relatedProducts.length > 0 && (
            <section data-testid="related-products-section">
              <h2 className="font-display text-xl font-semibold mb-4">More {product.subcategory || product.category}</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full"
                  onClick={() => {
                    const el = document.getElementById('related-scroll');
                    if (el) el.scrollBy({ left: -300, behavior: 'smooth' });
                  }}
                  data-testid="button-related-prev"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <div
                  id="related-scroll"
                  className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 flex-1"
                  style={{ scrollSnapType: 'x mandatory' }}
                >
                  {relatedProducts.map(p => (
                    <div key={p.id} className="shrink-0 w-36 sm:w-40 lg:w-44" style={{ scrollSnapAlign: 'start' }}>
                      <ProductCard product={p} layout={storefrontLayout} hideImageNav />
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full"
                  onClick={() => {
                    const el = document.getElementById('related-scroll');
                    if (el) el.scrollBy({ left: 300, behavior: 'smooth' });
                  }}
                  data-testid="button-related-next"
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
