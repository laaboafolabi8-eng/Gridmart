import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { imgSrc, imgSrcSet } from '@/lib/imgSrc';

interface Category {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder: number;
}

interface Product {
  id: string;
  name: string;
  category: string;
  images: string[];
}

type CatImgData = { url: string; position?: string; scale?: number };

interface Props {
  heading?: string;
  columns?: number;
  categoryImages?: Record<string, string | CatImgData>;
}

const COL_CLASS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
};

function resolveCatImg(val: string | CatImgData | undefined): CatImgData {
  if (!val) return { url: '' };
  if (typeof val === 'string') return { url: val };
  return val;
}

export function CategoriesSection({ heading = 'Shop by Category', columns = 3, categoryImages = {} }: Props) {
  const { data: categories = [], isLoading: catsLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      return res.ok ? res.json() : [];
    },
    staleTime: 60000,
  });

  const { data: products = [], isLoading: prodsLoading } = useQuery<Product[]>({
    queryKey: ['products', 'live'],
    queryFn: async () => {
      const res = await fetch('/api/products?live=true');
      return res.ok ? res.json() : [];
    },
    staleTime: 60000,
  });

  const topLevel = categories
    .filter(c => !c.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const productsByCategory = products.reduce((map, p) => {
    if (!map[p.category]) map[p.category] = [];
    map[p.category].push(p);
    return map;
  }, {} as Record<string, Product[]>);

  const activeCategories = topLevel.filter(c => (productsByCategory[c.name]?.length ?? 0) > 0);

  if (catsLoading || prodsLoading) {
    return (
      <section className="py-10 px-4 border-b">
        <div className="max-w-7xl mx-auto">
          <div className="h-8 w-48 bg-muted rounded animate-pulse mb-6" />
          <div className={`grid ${COL_CLASS[columns] ?? COL_CLASS[3]} gap-4`}>
            {Array.from({ length: columns }).map((_, i) => (
              <div key={i} className="aspect-square bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!activeCategories.length) return null;

  const colClass = COL_CLASS[columns] ?? COL_CLASS[3];

  return (
    <section className="py-10 px-4 border-b">
      <div className="max-w-7xl mx-auto">
        {heading && (
          <h2 className="text-2xl font-bold mb-6 font-display">{heading}</h2>
        )}
        <div className={`grid ${colClass} gap-4`}>
          {activeCategories.map(cat => {
            const imgData = resolveCatImg(categoryImages[cat.name]);
            const autoImg = productsByCategory[cat.name]?.find(p => p.images?.length)?.images?.[0] || '';
            const coverUrl = imgData.url || autoImg;
            const coverPosition = imgData.position || '50% 50%';
            const coverScale = imgData.scale || 1;
            return (
              <Link key={cat.id} href={`/category/${encodeURIComponent(cat.name)}`}>
                <div className="group relative rounded-xl overflow-hidden cursor-pointer bg-muted" style={{ aspectRatio: '1/1' }}>
                  {coverUrl ? (
                    <img
                      src={imgSrc(coverUrl, 800)}
                      srcSet={imgSrcSet(coverUrl, [200, 400, 800])}
                      sizes="(max-width: 640px) calc(50vw - 24px), calc(33vw - 24px)"
                      alt={cat.name}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500"
                      style={{
                        objectPosition: coverPosition,
                        transform: `scale(${coverScale})`,
                        transformOrigin: coverPosition,
                      }}
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent group-hover:from-black/70 transition-colors" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="text-white font-bold text-base sm:text-lg md:text-xl font-display leading-tight">
                      {cat.name}
                    </p>
                    <p className="text-white/70 text-xs mt-0.5">
                      {productsByCategory[cat.name]?.length ?? 0} item{(productsByCategory[cat.name]?.length ?? 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
