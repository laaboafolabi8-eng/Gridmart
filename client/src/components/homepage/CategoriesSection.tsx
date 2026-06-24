import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';

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

interface Props {
  heading?: string;
  columns?: number;
}

const COL_CLASS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
};

export function CategoriesSection({ heading = 'Shop by Category', columns = 3 }: Props) {
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      return res.ok ? res.json() : [];
    },
    staleTime: 60000,
  });

  const { data: products = [] } = useQuery<Product[]>({
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
            const coverImg = productsByCategory[cat.name]?.find(p => p.images?.length)?.images?.[0];
            return (
              <Link key={cat.id} href={`/shop?category=${encodeURIComponent(cat.name)}`}>
                <div className="group relative rounded-xl overflow-hidden cursor-pointer bg-muted" style={{ aspectRatio: '4/3' }}>
                  {coverImg ? (
                    <img
                      src={coverImg}
                      alt={cat.name}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
