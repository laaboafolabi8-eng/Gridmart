import { Link } from 'wouter';

interface FeaturedProduct {
  id: string;
  name: string;
  price: string;
  image: string;
  salePrice?: string | null;
}

interface FeaturedProductsProps {
  heading?: string;
  products: FeaturedProduct[];
  count?: number;
}

export function FeaturedProductsSection({ heading = 'Featured This Week', products, count = 4 }: FeaturedProductsProps) {
  const items = products.slice(0, count);
  if (!items.length) return null;

  return (
    <section className="py-8 px-4 border-b">
      <div className="max-w-7xl mx-auto">
        {heading && <h2 className="text-xl font-bold mb-4 font-display">{heading}</h2>}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {items.map(p => {
            const onSale = p.salePrice && parseFloat(p.salePrice) < parseFloat(p.price);
            const displayPrice = parseFloat((onSale ? p.salePrice! : p.price) || '0').toFixed(2);
            return (
              <Link key={p.id} href={`/product/${p.id}`}>
                <div className="group cursor-pointer border rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-background">
                  <div className="aspect-square overflow-hidden bg-muted relative">
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {onSale && (
                      <span className="absolute top-1.5 left-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        SALE
                      </span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium line-clamp-2 mb-1 leading-snug">{p.name}</p>
                    <p className="text-sm font-bold text-primary">${displayPrice}</p>
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
