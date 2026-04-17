import { useState } from 'react';
import { Link } from 'wouter';
import { Heart, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Product } from '@/lib/mockData';
import { formatCurrency } from '@/lib/mockData';
import { useWishlist } from '@/lib/store';
import { isYouTubeUrl, extractYouTubeVideoId, getYouTubeThumbnail } from '@/lib/youtube';
import { productUrl } from '../../../../shared/slugify';

const COLOR_MAP: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  purple: '#a855f7',
  pink: '#ec4899',
  gray: '#9ca3af',
  grey: '#9ca3af',
  brown: '#a16207',
  navy: '#1e3a5a',
  beige: '#d4c5a9',
  cream: '#fffdd0',
  gold: '#ffd700',
  silver: '#c0c0c0',
  teal: '#14b8a6',
  cyan: '#06b6d4',
};

function getColorHex(colorName: string): string {
  const lower = colorName.toLowerCase();
  return COLOR_MAP[lower] || '#9ca3af';
}

export interface StorefrontLayoutSettings {
  columnsDesktop?: string;
  columnsTablet?: string;
  columnsMobile?: string;
  cardSize?: string;
  gridGap?: string;
  showName?: boolean;
  showPrice?: boolean;
  showDescription?: boolean;
  showCondition?: boolean;
  showBrand?: boolean;
  showProductCode?: boolean;
  imageAspect?: string;
  imageFit?: string;
  nameMaxLines?: string;
  descMaxLines?: string;
  nameFontSize?: string;
  priceFontSize?: string;
  priceColor?: string;
  priceWeight?: string;
  cardRadius?: string;
  cardShadow?: string;
  cardBg?: string;
  hoverEffect?: string;
  quickAddVisibility?: string;
  defaultSort?: string;
  headingText?: string;
  headingFontSize?: string;
  headingWeight?: string;
  headingColor?: string;
  headingAlign?: string;
  showHeading?: boolean;
  subheadingText?: string;
  subheadingFontSize?: string;
  subheadingWeight?: string;
  subheadingColor?: string;
  subheadingAlign?: string;
  showSubheading?: boolean;
  categoryHeadingFontSize?: string;
  categoryHeadingWeight?: string;
  categoryHeadingColor?: string;
  subcategoryHeadingFontSize?: string;
  subcategoryHeadingWeight?: string;
  subcategoryHeadingColor?: string;
}

const FONT_SIZE_MAP: Record<string, string> = { tiny: '10px', small: '12px', medium: '14px', large: '16px' };
const FONT_WEIGHT_MAP: Record<string, number> = { normal: 400, medium: 500, semibold: 600, bold: 700 };
const RADIUS_MAP: Record<string, string> = { sharp: '0', slight: '4px', rounded: '8px', extra: '16px', pill: '24px' };
const SHADOW_MAP: Record<string, string> = { none: 'none', subtle: '0 1px 3px rgba(0,0,0,0.1)', medium: '0 2px 8px rgba(0,0,0,0.15)', pronounced: '0 4px 16px rgba(0,0,0,0.2)' };
const ASPECT_MAP: Record<string, string> = { square: '1/1', '4:3': '4/3', '3:4': '3/4', '16:9': '16/9', auto: 'auto' };
const PADDING_MAP: Record<string, string> = { compact: '8px 8px 8px', standard: '16px 16px 24px', large: '24px 24px 32px' };

interface ProductCardProps {
  product: Product;
  variants?: Product[];
  layout?: StorefrontLayoutSettings;
  hideImageNav?: boolean;
}

export function ProductCard({ product, variants = [], layout, hideImageNav }: ProductCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const allProducts = [product, ...variants];
  const inventoryStock = allProducts.reduce((sum, p) => 
    sum + (p.inventory?.reduce((invSum, inv) => invSum + inv.quantity, 0) || 0), 0
  );
  const totalStock = inventoryStock > 0 ? inventoryStock : (product.sheetQuantity || 0);
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();
  const isWishlisted = isInWishlist(product.id);
  
  const images = product.images?.length ? product.images : ((product as any).image ? [(product as any).image] : []);
  const hasMultipleImages = images.length > 1;
  const currentImage = images[currentImageIndex] || '';
  
  const handlePrevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };
  
  const handleNextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };
  
  const variantColors = allProducts
    .filter(p => p.variantName || p.colors?.length)
    .map(p => ({
      id: p.id,
      name: p.variantName || p.colors?.[0]?.name || 'Default',
      hex: p.colors?.[0]?.hex || getColorHex(p.variantName || 'gray')
    }));

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isWishlisted) {
      removeFromWishlist(product.id);
    } else {
      addToWishlist(product);
    }
  };

  const showName = layout?.showName !== false;
  const showPrice = layout?.showPrice !== false;
  const showDescription = layout?.showDescription === true;
  const showCondition = layout?.showCondition === true;
  const showBrand = layout?.showBrand === true;
  const showProductCode = layout?.showProductCode === true;
  const imageFit = layout?.imageFit || 'contain';
  const imageAspect = layout?.imageAspect || 'square';
  const nameFontSize = FONT_SIZE_MAP[layout?.nameFontSize || 'small'] || '12px';
  const nameMaxLines = layout?.nameMaxLines === 'none' ? undefined : (parseInt(layout?.nameMaxLines || '2') || 2);
  const priceFontSize = FONT_SIZE_MAP[layout?.priceFontSize || 'small'] || '12px';
  const priceColor = layout?.priceColor || undefined;
  const priceWeight = FONT_WEIGHT_MAP[layout?.priceWeight || 'bold'] || 700;
  const cardRadius = RADIUS_MAP[layout?.cardRadius || 'rounded'] || '8px';
  const cardShadow = SHADOW_MAP[layout?.cardShadow || 'medium'] || SHADOW_MAP.medium;
  const cardBg = layout?.cardBg || undefined;
  const cardPadding = PADDING_MAP[layout?.cardSize || 'standard'] || PADDING_MAP.standard;
  const hoverEffect = layout?.hoverEffect || 'scale';

  const hoverClass = {
    none: '',
    lift: 'hover:-translate-y-1 hover:shadow-lg',
    scale: 'hover:scale-[1.02]',
    border: 'hover:ring-2 hover:ring-primary',
    glow: 'hover:shadow-[0_0_15px_rgba(20,184,166,0.3)]',
  }[hoverEffect] || '';

  return (
    <Link href={productUrl(product)}>
      <div
        className={`group cursor-pointer overflow-hidden transition-all duration-200 ${hoverClass}`}
        style={{
          borderRadius: cardRadius,
          boxShadow: cardShadow,
          backgroundColor: cardBg,
        }}
        data-testid={`card-product-${product.id}`}
      >
        <div className="relative overflow-hidden" style={{
          aspectRatio: ASPECT_MAP[imageAspect] || '1/1',
          borderRadius: cardRadius,
        }}>
          {currentImage ? (
            isYouTubeUrl(currentImage) ? (
              <div className="w-full h-full relative">
                <img
                  src={getYouTubeThumbnail(extractYouTubeVideoId(currentImage) || '', 'hq')}
                  alt={product.name}
                  loading="lazy"
                  decoding="async"
                  className={`w-full h-full object-cover transition-transform duration-300 ${hoverEffect === 'scale' || hoverEffect === 'lift' ? 'group-hover:scale-105' : ''}`}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  </div>
                </div>
              </div>
            ) : (
              <img
                src={currentImage}
                alt={product.name}
                loading="lazy"
                decoding="async"
                className={`w-full h-full transition-transform duration-300 ${hoverEffect === 'scale' || hoverEffect === 'lift' ? 'group-hover:scale-105' : ''}`}
                style={{ objectFit: imageFit as any }}
              />
            )
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <span className="text-muted-foreground text-xs">No image</span>
            </div>
          )}
          {hasMultipleImages && !hideImageNav && (
            <>
              <button
                onClick={handlePrevImage}
                className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 bg-background/80 hover:bg-background rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`button-prev-image-${product.id}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextImage}
                className="absolute right-8 top-1/2 -translate-y-1/2 w-6 h-6 bg-background/80 hover:bg-background rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`button-next-image-${product.id}`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
                {images.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === currentImageIndex ? 'bg-primary' : 'bg-white/60'}`}
                  />
                ))}
              </div>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 w-7 h-7 bg-background/80 hover:bg-background rounded-full"
            onClick={handleWishlistClick}
            data-testid={`button-wishlist-${product.id}`}
          >
            <Heart 
              className={`w-4 h-4 ${isWishlisted ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} 
            />
          </Button>
          {totalStock === 0 && product.comingSoon && (
            <div className="absolute bottom-2 left-2 bg-amber-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow" data-testid={`badge-coming-soon-${product.id}`}>
              Coming Soon
            </div>
          )}
          {totalStock === 0 && !product.comingSoon && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <span className="text-muted-foreground text-sm font-medium">Out of Stock</span>
            </div>
          )}
        </div>

        <div style={{ padding: cardPadding }}>
          {showName && (
            <h3
              className="font-medium group-hover:text-primary transition-colors"
              style={{
                fontSize: nameFontSize,
                ...(nameMaxLines ? {
                  display: '-webkit-box',
                  WebkitLineClamp: nameMaxLines,
                  WebkitBoxOrient: 'vertical' as const,
                  overflow: 'hidden',
                } : {}),
                marginBottom: '4px',
              }}
            >
              {product.name}
            </h3>
          )}
          {showDescription && product.description && (
            <p
              className="text-muted-foreground"
              style={{
                fontSize: '11px',
                ...(layout?.descMaxLines !== 'none' ? {
                  display: '-webkit-box',
                  WebkitLineClamp: parseInt(layout?.descMaxLines || '2') || 2,
                  WebkitBoxOrient: 'vertical' as const,
                  overflow: 'hidden',
                } : {}),
                marginBottom: '4px',
              }}
            >
              {product.description}
            </p>
          )}
          {showBrand && product.brand && (
            <span style={{ fontSize: '10px', color: '#888', display: 'block', marginBottom: '2px' }}>{product.brand}</span>
          )}
          {showProductCode && product.productCode && (
            <span style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '2px' }}>{product.productCode}</span>
          )}
          {showCondition && product.condition && product.condition !== 'New' && (
            <span style={{ fontSize: '9px', backgroundColor: '#f0f0f0', padding: '1px 6px', borderRadius: '4px', display: 'inline-block', marginBottom: '4px' }}>{product.condition}</span>
          )}
          <div className="flex items-center justify-between gap-1">
            {showPrice && (
              <span
                data-testid={`text-price-${product.id}`}
                style={{
                  fontSize: priceFontSize,
                  fontWeight: priceWeight,
                  color: priceColor,
                }}
                className={priceColor ? '' : 'text-primary'}
              >
                {formatCurrency(product.price)}
              </span>
            )}
            {variantColors.length > 1 && (
              <div className="flex gap-0.5" title={variantColors.map(v => v.name).join(', ')}>
                {variantColors.slice(0, 4).map((v) => (
                  <div
                    key={v.id}
                    className="w-3 h-3 rounded-full border border-muted-foreground/30"
                    style={{ backgroundColor: v.hex }}
                  />
                ))}
                {variantColors.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">+{variantColors.length - 4}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
