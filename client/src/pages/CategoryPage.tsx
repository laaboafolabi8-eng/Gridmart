import { useMemo } from 'react';
import { useParams, Link } from 'wouter';
import { ChevronLeft, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ProductCard, type StorefrontLayoutSettings } from '@/components/products/ProductCard';
import type { Product } from '@/lib/mockData';

export default function CategoryPage() {
  const { name } = useParams<{ name: string }>();
  const categoryName = decodeURIComponent(name || '');

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products', 'live'],
    queryFn: async () => {
      const res = await fetch('/api/products?live=true');
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      return res.ok ? res.json() : {};
    },
    staleTime: 60000,
  });

  const { data: categoriesFromApi = [] } = useQuery<{ id: string; name: string; parentId?: string | null; sortOrder: number }[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      return res.ok ? res.json() : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const storefrontLayout = useMemo((): StorefrontLayoutSettings => {
    if (!siteSettings.storefrontLayout) return {} as StorefrontLayoutSettings;
    try { return JSON.parse(siteSettings.storefrontLayout) as StorefrontLayoutSettings; }
    catch { return {} as StorefrontLayoutSettings; }
  }, [siteSettings.storefrontLayout]);

  const gridGapValue = ({ tight: '4px', normal: '8px', relaxed: '16px', spacious: '24px' } as Record<string, string>)[storefrontLayout?.gridGap || 'normal'] || '8px';
  const gridColsDesktop = parseInt(storefrontLayout?.columnsDesktop || '7') || 7;
  const gridColsTablet = parseInt(storefrontLayout?.columnsTablet || '5') || 5;
  const gridColsMobile = parseInt(storefrontLayout?.columnsMobile || '4') || 4;

  const getBaseCode = (product: Product): string => {
    if (!product.productCode) return '';
    if (product.variantSuffix && product.productCode.endsWith(`-${product.variantSuffix}`)) {
      return product.productCode.slice(0, -(product.variantSuffix.length + 1));
    }
    return product.productCode;
  };

  const variantGroups = useMemo(() => products.reduce((groups, product) => {
    if (product.canonicalProductId) return groups;
    const baseCode = getBaseCode(product);
    if (!baseCode) return groups;
    if (!groups[baseCode]) groups[baseCode] = [];
    groups[baseCode].push(product);
    return groups;
  }, {} as Record<string, Product[]>), [products]);

  const childrenByParentId = useMemo(() => products.reduce((map, product) => {
    if (product.parentProductId && product.relationshipType === 'variant') {
      if (!map[product.parentProductId]) map[product.parentProductId] = [];
      map[product.parentProductId].push(product);
    }
    return map;
  }, {} as Record<string, Product[]>), [products]);

  const categoryProducts = useMemo(() => {
    return products.filter(product => {
      if (product.canonicalProductId) return false;
      if (product.parentProductId && product.relationshipType === 'variant') return false;
      if (product.variantSuffix) return false;
      if (product.category !== categoryName) return false;

      const baseCode = getBaseCode(product);
      const codeGroup = baseCode ? (variantGroups[baseCode] || [product]) : [product];
      const pidChildren = childrenByParentId[product.id] || [];
      const allRelated = new Map<number, Product>();
      for (const p of codeGroup) allRelated.set(p.id, p);
      for (const p of pidChildren) allRelated.set(p.id, p);
      return Array.from(allRelated.values()).some(p => (p as any).inStore);
    });
  }, [products, categoryName, variantGroups, childrenByParentId]);

  const subcategories = useMemo(() => {
    const catObj = categoriesFromApi.find(c => c.name === categoryName && !c.parentId);
    return catObj ? categoriesFromApi.filter(c => c.parentId === catObj.id) : [];
  }, [categoriesFromApi, categoryName]);

  const hasSubs = subcategories.length > 0 && categoryProducts.some(p => p.subcategory);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-10">
        <div className="container mx-auto px-4">

          <div className="mb-6">
            <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
              <ChevronLeft className="w-4 h-4" />
              All Products
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold font-display text-foreground">{categoryName}</h1>
            {!isLoading && (
              <p className="text-sm text-muted-foreground mt-1">{categoryProducts.length} item{categoryProducts.length !== 1 ? 's' : ''}</p>
            )}
          </div>

          <style>{`
            .cat-product-grid {
              display: grid;
              gap: ${gridGapValue};
              grid-template-columns: repeat(${gridColsMobile}, minmax(0, 1fr));
            }
            @media (min-width: 640px) {
              .cat-product-grid { grid-template-columns: repeat(${gridColsTablet}, minmax(0, 1fr)); }
            }
            @media (min-width: 1024px) {
              .cat-product-grid { grid-template-columns: repeat(${gridColsDesktop}, minmax(0, 1fr)); }
            }
          `}</style>

          {isLoading ? (
            <div className="cat-product-grid mt-4">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-square bg-muted rounded-lg mb-2" />
                  <div className="h-3 bg-muted rounded w-3/4 mb-1" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : categoryProducts.length === 0 ? (
            <div className="text-center py-20">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-display text-lg font-semibold mb-2">No products found</h3>
              <p className="text-muted-foreground">Check back soon or browse all products.</p>
            </div>
          ) : hasSubs ? (
            <div className="space-y-8">
              {(() => {
                const uncategorized = categoryProducts.filter(p => !p.subcategory);
                return uncategorized.length > 0 ? (
                  <div className="cat-product-grid">
                    {uncategorized.map(product => {
                      const baseCode = getBaseCode(product);
                      const variants = baseCode ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix) : [];
                      return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
                    })}
                  </div>
                ) : null;
              })()}
              {subcategories.map(sub => {
                const subProducts = categoryProducts.filter(p => p.subcategory === sub.name);
                if (!subProducts.length) return null;
                return (
                  <div key={sub.id}>
                    <h2 className="text-xs font-medium uppercase tracking-widest mb-2 pl-2 border-l-2 border-primary/20 text-muted-foreground">{sub.name}</h2>
                    <div className="cat-product-grid">
                      {subProducts.map(product => {
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
            <div className="cat-product-grid">
              {categoryProducts.map(product => {
                const baseCode = getBaseCode(product);
                const variants = baseCode ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix) : [];
                return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
              })}
            </div>
          )}

        </div>
      </main>

      <Footer />
    </div>
  );
}
