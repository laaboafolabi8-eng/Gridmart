import { useParams, Link, useLocation } from 'wouter';
import { ArrowLeft, Plus, Minus, Package, Loader2, Link2, ShoppingCart, ChevronLeft, ChevronRight, Truck, Store } from 'lucide-react';
import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MediaThumbnail } from '@/components/media/YouTubeThumbnail';
import { isYouTubeUrl } from '@/lib/youtube';
import { formatCurrency, getDescriptionPoints, type Product, type ContentSection, type SpecRow } from '@/lib/mockData';
import { useCart } from '@/lib/store';
import { ProductCard, type StorefrontLayoutSettings } from '@/components/products/ProductCard';
import { productUrl, extractProductIdPrefix, isUuid } from '../../../shared/slugify';

export default function ProductDetail() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const [quantity, setQuantity] = useState(1);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const { addToCart, cart } = useCart();

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

  // Canonical URL enforcement
  if (product) {
    const correctUrl = productUrl(product);
    const currentPath = `/product/${params.slug}`;
    if (currentPath !== correctUrl) {
      window.history.replaceState(null, '', correctUrl);
    }
  }

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
  });

  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60000,
  });

  const storefrontLayout: StorefrontLayoutSettings = useMemo(() => {
    if (!siteSettings.storefrontLayout) return {};
    try { return JSON.parse(siteSettings.storefrontLayout); } catch { return {}; }
  }, [siteSettings.storefrontLayout]);

  const flatRate = parseFloat(siteSettings.shippingFlatRate || '15.00');
  const freeThreshold = parseFloat(siteSettings.freeShippingThreshold || '99.00');
  const shippingText = `Flat rate $${flatRate.toFixed(2)} · Free on orders over $${freeThreshold.toFixed(0)}`;
  const handlingTime = siteSettings.shippingHandlingTime || '1–2 business days after payment';
  const transitTime = siteSettings.shippingTransitTime || '3–7 business days';
  const orderCutoff = siteSettings.shippingOrderCutoff || '2:00 PM EST, Monday–Friday';
  const contactEmail = siteSettings.contactEmail || 'admin@gridmart.ca';
  const storeAddress = siteSettings.storefrontAddress || '3176 Walker Rd, Windsor, ON N8W 3R5';

  const linkedVariants = useMemo(() => {
    if (!product) return [];
    let parentId: string | null = null;
    let parentProduct: Product | null = null;
    if (product.parentProductId && product.relationshipType === 'variant') {
      parentId = product.parentProductId;
      parentProduct = allProducts.find(p => p.id === parentId) || null;
    } else {
      parentId = product.id;
      parentProduct = product;
    }
    if (!parentId) return [product];
    const variantChildren = allProducts.filter(p =>
      p.parentProductId === parentId && p.relationshipType === 'variant'
    );
    const variantGroup: Product[] = [];
    if (parentProduct && parentProduct.id !== product.id) variantGroup.push(parentProduct);
    variantGroup.push(product);
    for (const variant of variantChildren) {
      if (variant.id !== product.id) variantGroup.push(variant);
    }
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
    const restOfCategory = allProducts.filter(p =>
      isRelated(p) && hasStock(p) && (!product.subcategory || p.subcategory !== product.subcategory)
    );
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
            <Link href="/"><Button>Back to Shop</Button></Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const inventoryStock = product.inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
  const totalStock = inventoryStock > 0 ? inventoryStock : (product.sheetQuantity || 0);
  const inStore = !!(product as any).inStore;

  if (!inStore && totalStock === 0 && !product.comingSoon) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold mb-2">Product not available</h1>
            <p className="text-muted-foreground mb-4">This product is currently out of stock.</p>
            <Link href="/"><Button>Back to Shop</Button></Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

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

          {/* Back + category nav */}
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
                  <Button variant="outline" size="icon" className="h-8 w-8"
                    onClick={() => navigate(productUrl(categoryNav.prev!))}
                    data-testid="button-prev-product" title={categoryNav.prev.name}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                )}
                {categoryNav.next && (
                  <Button variant="outline" size="icon" className="h-8 w-8"
                    onClick={() => navigate(productUrl(categoryNav.next!))}
                    data-testid="button-next-product" title={categoryNav.next.name}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

            {/* Images */}
            <div className="animate-fade-in">
              <div
                className="relative rounded-xl overflow-hidden bg-white flex items-center justify-center"
                style={{ minHeight: '300px', maxHeight: '500px' }}
                onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                onTouchEnd={(e) => {
                  if (touchStartX.current === null) return;
                  const diff = touchStartX.current - e.changedTouches[0].clientX;
                  const images = product?.images || [];
                  if (Math.abs(diff) > 50 && images.length > 1) {
                    setCurrentImageIndex(prev => diff > 0
                      ? (prev + 1) % images.length
                      : prev === 0 ? images.length - 1 : prev - 1
                    );
                  }
                  touchStartX.current = null;
                }}
              >
                {isYouTubeUrl(product.images[currentImageIndex] || product.images[0]) ? (
                  <MediaThumbnail url={product.images[currentImageIndex] || product.images[0]} alt={product.name} className="w-full h-full" />
                ) : (
                  <Zoom>
                    {(() => {
                      const src = product.images[currentImageIndex] || product.images[0];
                      return (
                        <img
                          src={src}
                          srcSet={src?.startsWith('/api/')
                            ? `${src}?w=400 400w, ${src}?w=800 800w, ${src}?w=1200 1200w`
                            : undefined}
                          sizes="(max-width: 1024px) 100vw, 50vw"
                          alt={product.name}
                          width={800}
                          height={800}
                          fetchPriority={currentImageIndex === 0 ? 'high' : 'auto'}
                          decoding="async"
                          className="w-full max-h-[500px] object-contain cursor-zoom-in"
                        />
                      );
                    })()}
                  </Zoom>
                )}
                {product.images.length > 1 && (
                  <>
                    <button onClick={() => setCurrentImageIndex(prev => prev === 0 ? product.images.length - 1 : prev - 1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow-md">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button onClick={() => setCurrentImageIndex(prev => (prev + 1) % product.images.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow-md">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {product.images.map((_, idx) => (
                        <button key={idx} onClick={() => setCurrentImageIndex(idx)}
                          className={`w-2 h-2 rounded-full transition-colors ${idx === currentImageIndex ? 'bg-primary' : 'bg-white/60'}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Thumbnail strip */}
              {product.images.length > 1 && (
                <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                  {product.images.map((img, idx) => (
                    <button key={idx} onClick={() => setCurrentImageIndex(idx)}
                      className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${idx === currentImageIndex ? 'border-primary' : 'border-transparent'}`}>
                      <img
                        src={img}
                        srcSet={img?.startsWith('/api/') ? `${img}?w=56 56w, ${img}?w=112 112w` : undefined}
                        sizes="56px"
                        alt=""
                        width={56}
                        height={56}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product info */}
            <div className="animate-fade-in">
              <div className="flex gap-2 mb-2">
                <Badge
                  className="bg-muted text-foreground cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => navigate(`/category/${encodeURIComponent(product.category)}`)}>
                  {product.category}
                </Badge>
                {product.condition && (
                  <Badge className={product.condition === 'New' ? 'bg-primary text-primary-foreground border-primary' : ''} variant={product.condition === 'New' ? 'default' : 'outline'}>
                    {product.condition}
                  </Badge>
                )}
              </div>

              <h1 className="font-display text-2xl font-bold mb-3" data-testid="text-product-name">{product.name}</h1>

              {/* Price + availability */}
              <div className="mb-4">
                <span className="font-display text-3xl font-bold" data-testid="text-product-price">
                  {formatCurrency(product.price)}
                </span>
                <div className="flex items-center gap-2 mt-1.5">
                  {totalStock > 0 ? (
                    <>
                      <span className="text-sm font-semibold text-green-600" data-testid="badge-in-stock">In Stock</span>
                      <span className="text-xs text-muted-foreground" data-testid="text-stock-count">· {totalStock} available</span>
                    </>
                  ) : product.comingSoon ? (
                    <Badge className="bg-amber-500 hover:bg-amber-500 text-white" data-testid="badge-coming-soon">Coming Soon</Badge>
                  ) : (
                    <span className="text-sm font-semibold text-destructive" data-testid="badge-out-of-stock">Out of Stock</span>
                  )}
                </div>
              </div>

              {/* Color selector */}
              {product.colors && product.colors.length > 0 && (
                <div className="mb-3">
                  <span className="text-sm font-medium mb-2 block">
                    Color: {selectedColor ? product.colors.find(c => c.hex === selectedColor)?.name : 'Select a color'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {product.colors.map((color) => (
                      <button key={color.hex}
                        className={`w-10 h-10 rounded-full border-2 transition-all ${selectedColor === color.hex ? 'border-primary ring-2 ring-primary ring-offset-2' : 'border-muted-foreground/30 hover:border-muted-foreground'}`}
                        style={{ backgroundColor: color.hex }}
                        onClick={() => setSelectedColor(color.hex)}
                        title={color.name}
                        data-testid={`color-${color.name.toLowerCase()}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Variant selector */}
              {linkedVariants.length > 1 && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Link2 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Available Variants</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {linkedVariants.map((variant) => {
                      const isCurrentProduct = variant.id === product.id;
                      const displayName = variant.variantName || variant.variantSuffix || variant.productCode?.split('-').pop() || 'Original';
                      return (
                        <button key={variant.id}
                          onClick={() => !isCurrentProduct && navigate(productUrl(variant))}
                          className={`px-3 py-2 rounded-lg border-2 transition-all ${isCurrentProduct ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary ring-offset-2 font-semibold' : 'border-muted-foreground/30 bg-muted/30 text-foreground hover:scale-105 cursor-pointer hover:border-muted-foreground'}`}
                          disabled={isCurrentProduct}
                          data-testid={`variant-${variant.id}`}>
                          <div className="text-sm font-medium truncate max-w-[120px]" title={variant.name}>{displayName}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quantity + Add to Cart */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="icon" className="h-9 w-9"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1} data-testid="button-quantity-minus">
                    <Minus className="w-3.5 h-3.5" />
                  </Button>
                  <Input type="number" min="1" value={quantity}
                    onChange={(e) => {
                      const newQty = parseInt(e.target.value) || 1;
                      if (newQty > totalStock) { toast.error('Maximum available quantity reached'); setQuantity(totalStock); }
                      else if (newQty >= 1) setQuantity(newQty);
                    }}
                    className="w-14 h-9 text-center text-sm" data-testid="input-quantity" />
                  <Button variant="outline" size="icon" className="h-9 w-9"
                    onClick={() => { if (quantity >= totalStock) toast.error('Maximum available quantity reached'); else setQuantity(quantity + 1); }}
                    data-testid="button-quantity-plus">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {(() => {
                  const inCart = cart.find(c => c.product.id === product.id);
                  return inCart ? (
                    <span className="text-xs text-green-600 font-medium" data-testid="text-in-cart-quantity">
                      {inCart.quantity} in <Link href="/cart" className="underline hover:text-green-700">cart</Link>
                    </span>
                  ) : null;
                })()}
              </div>

              <div className="flex gap-2 mb-4">
                <Button
                  className="flex-1 h-12 gap-2 text-base"
                  disabled={totalStock === 0 && !product.comingSoon}
                  onClick={() => { handleAddToCart(); navigate('/checkout'); }}
                  data-testid="button-buy-now">
                  {product.comingSoon && totalStock === 0 ? 'Coming Soon' : 'Buy Now'}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-12 gap-2 text-base"
                  disabled={totalStock === 0 && !product.comingSoon}
                  onClick={handleAddToCart}
                  data-testid="button-add-to-cart">
                  <ShoppingCart className="w-5 h-5" />
                  Add to Cart
                </Button>
              </div>

              {/* Fulfillment options — Home Depot style */}
              <div className="border rounded-xl overflow-hidden divide-y">
                <div className="p-4 flex items-center gap-3" data-testid="fulfillment-ship">
                  <Truck className="w-5 h-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">Home Delivery</p>
                    <p className="text-xs text-muted-foreground">{shippingText}</p>
                  </div>
                  <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50 shrink-0">Available</Badge>
                </div>
                <div className="p-4 flex items-center gap-3" data-testid="fulfillment-pickup">
                  <Store className="w-5 h-5 text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">Free In-Store Pickup</p>
                    <p className="text-xs text-muted-foreground">{storeAddress} · Ready when you arrive</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 ${inStore ? 'text-green-700 border-green-200 bg-green-50' : 'text-muted-foreground'}`}>
                    {inStore ? 'In Stock' : 'Check In Store'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Related products */}
          {relatedProducts.length > 0 && (
            <section className="mb-8" data-testid="related-products-section">
              <h2 className="font-display text-xl font-semibold mb-4">More {product.subcategory || product.category}</h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-full"
                  onClick={() => { const el = document.getElementById('related-scroll'); if (el) el.scrollBy({ left: -300, behavior: 'smooth' }); }}
                  data-testid="button-related-prev">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <div id="related-scroll" className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 flex-1" style={{ scrollSnapType: 'x mandatory' }}>
                  {relatedProducts.map(p => (
                    <div key={p.id} className="shrink-0 w-36 sm:w-40 lg:w-44" style={{ scrollSnapAlign: 'start' }}>
                      <ProductCard product={p} layout={storefrontLayout} hideImageNav />
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-full"
                  onClick={() => { const el = document.getElementById('related-scroll'); if (el) el.scrollBy({ left: 300, behavior: 'smooth' }); }}
                  data-testid="button-related-next">
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
            </section>
          )}

          {/* Policy tabs */}
          <div className="mb-10">
            <Tabs defaultValue="description">
              <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto gap-0">
                <TabsTrigger value="description" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2.5 text-sm font-medium">Description</TabsTrigger>
                <TabsTrigger value="shipping" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2.5 text-sm font-medium">Shipping</TabsTrigger>
                <TabsTrigger value="returns" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2.5 text-sm font-medium">Returns</TabsTrigger>
                <TabsTrigger value="payment" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2.5 text-sm font-medium">Payment</TabsTrigger>
              </TabsList>

              {/* Description / Structured Sections */}
              <TabsContent value="description" className="pt-5">
                {product.contentSections?.length ? (
                  <div className="space-y-7 max-w-2xl">
                    {(product.contentSections as ContentSection[]).map(section => (
                      <div key={section.id}>
                        <h3 className="text-sm font-semibold text-foreground mb-2">{section.name}</h3>
                        {section.type === 'text' && (section.content as string) && (
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{section.content as string}</p>
                        )}
                        {section.type === 'bullets' && (section.content as string[]).filter(Boolean).length > 0 && (
                          <ul className="space-y-1.5">
                            {(section.content as string[]).filter(Boolean).map((bullet, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                <span className="text-primary mt-0.5 shrink-0">•</span>
                                <span dangerouslySetInnerHTML={{ __html: bullet }} />
                              </li>
                            ))}
                          </ul>
                        )}
                        {section.type === 'specs' && (section.content as SpecRow[]).length > 0 && (
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <tbody>
                                {(section.content as SpecRow[]).map((row, i) => (
                                  <tr key={i} className={i % 2 === 0 ? 'bg-muted/30' : ''}>
                                    <td className="px-4 py-2 font-medium text-foreground w-2/5">{row.key}</td>
                                    <td className="px-4 py-2 text-muted-foreground">{row.value}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (() => {
                  const points = getDescriptionPoints(product.description);
                  if (!points.length || (points.length === 1 && !points[0])) {
                    return <p className="text-muted-foreground text-sm">No description available.</p>;
                  }
                  if (points.length === 1) {
                    return <p className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: points[0] }} />;
                  }
                  return (
                    <ul className="space-y-2">
                      {points.map((point, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="text-primary mt-0.5 shrink-0">•</span>
                          <span dangerouslySetInnerHTML={{ __html: point }} />
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </TabsContent>

              {/* Shipping */}
              <TabsContent value="shipping" className="pt-5">
                <div className="space-y-5 max-w-2xl text-sm text-muted-foreground">
                  <div>
                    <p className="font-semibold text-foreground mb-1">Shipped via UPS</p>
                    <ul className="space-y-1">
                      <li>Flat rate shipping: <strong>${flatRate.toFixed(2)} CAD</strong></li>
                      <li>Free shipping on orders over <strong>${freeThreshold.toFixed(0)}</strong></li>
                      <li>Handling time: {handlingTime}</li>
                      <li>Estimated transit: {transitTime}</li>
                      <li>Order cutoff: {orderCutoff}</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-1">Free In-Store Pickup</p>
                    <p>Pick up your order at no charge at <strong>{storeAddress}</strong>. Your order will be ready when you arrive during store hours (Monday–Friday, 10:00 AM – 7:00 PM).</p>
                  </div>
                  <p>
                    <Link href="/shipping" className="text-primary underline hover:no-underline">View full Shipping Policy →</Link>
                  </p>
                </div>
              </TabsContent>

              {/* Returns */}
              <TabsContent value="returns" className="pt-5">
                <div className="space-y-4 max-w-2xl text-sm text-muted-foreground">
                  <div>
                    <p className="font-semibold text-foreground mb-1">30-Day Return Window</p>
                    <p>Returns and refund requests must be submitted within 30 days of your order date. Items must be in their original condition and packaging.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-1">How to Request a Return</p>
                    <ul className="space-y-1">
                      <li><strong>In-store purchase:</strong> Bring the product and proof of purchase to {storeAddress}.</li>
                      <li><strong>Online order:</strong> Email <a href={`mailto:${contactEmail}`} className="text-primary underline">{contactEmail}</a> with your order number and reason for return.</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-1">Refund Processing</p>
                    <p>Approved refunds are returned to the original payment method within <strong>5–10 business days</strong>.</p>
                  </div>
                  <p>
                    <Link href="/agreement/refund" className="text-primary underline hover:no-underline">View full Refund Policy →</Link>
                  </p>
                </div>
              </TabsContent>

              {/* Payment */}
              <TabsContent value="payment" className="pt-5">
                <div className="space-y-4 max-w-2xl text-sm text-muted-foreground">
                  <p>All online payments are processed securely through <strong>Stripe</strong> (PCI DSS Level 1). We accept:</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <svg viewBox="0 0 60 38" className="h-7 w-auto" aria-label="Visa" role="img"><rect width="60" height="38" rx="4" fill="#1A1F71"/><text x="30" y="26" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold" fontStyle="italic" fontFamily="Arial, sans-serif">VISA</text></svg>
                    <svg viewBox="0 0 60 38" className="h-7 w-auto" aria-label="Mastercard" role="img"><rect width="60" height="38" rx="4" fill="#252525"/><circle cx="23" cy="19" r="11" fill="#EB001B"/><circle cx="37" cy="19" r="11" fill="#F79E1B"/><path d="M30 10.5a11 11 0 0 1 0 17 11 11 0 0 1 0-17z" fill="#FF5F00"/></svg>
                    <svg viewBox="0 0 60 38" className="h-7 w-auto" aria-label="American Express" role="img"><rect width="60" height="38" rx="4" fill="#2E77BC"/><text x="30" y="17" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif">AMERICAN</text><text x="30" y="27" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif">EXPRESS</text></svg>
                    <svg viewBox="0 0 60 38" className="h-7 w-auto" aria-label="Discover" role="img"><rect width="60" height="38" rx="4" fill="white" stroke="#e5e7eb" strokeWidth="1"/><circle cx="40" cy="19" r="12" fill="#F76F20"/><text x="18" y="23" textAnchor="middle" fill="#231F20" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif">DISCOVER</text></svg>
                    <svg viewBox="0 0 60 38" className="h-7 w-auto" aria-label="Apple Pay" role="img"><rect width="60" height="38" rx="4" fill="#000"/><text x="30" y="25" textAnchor="middle" fill="white" fontSize="9" fontWeight="500" fontFamily="Arial, sans-serif">Pay</text></svg>
                    <svg viewBox="0 0 60 38" className="h-7 w-auto" aria-label="Google Pay" role="img"><rect width="60" height="38" rx="4" fill="white" stroke="#e5e7eb" strokeWidth="1"/><text x="10" y="24" fill="#4285F4" fontSize="12" fontWeight="bold" fontFamily="Arial, sans-serif">G</text><text x="20" y="24" fill="#555" fontSize="10" fontFamily="Arial, sans-serif">Pay</text></svg>
                  </div>
                  <ul className="space-y-1">
                    <li>Visa, Mastercard, American Express, Discover</li>
                    <li>Apple Pay &amp; Google Pay</li>
                    <li>All prices in <strong>Canadian dollars (CAD)</strong></li>
                    <li>No additional payment surcharges</li>
                  </ul>
                  <p>
                    <Link href="/payment-policy" className="text-primary underline hover:no-underline">View full Payment Policy →</Link>
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
