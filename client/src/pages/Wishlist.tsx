import { Link } from 'wouter';
import { Heart, ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useWishlist } from '@/lib/store';
import { useCart } from '@/lib/store';
import { formatCurrency } from '@/lib/mockData';
import { productUrl } from '../../../shared/slugify';

export default function Wishlist() {
  const { wishlist, removeFromWishlist, clearWishlist } = useWishlist();
  const { addToCart } = useCart();

  const handleAddToCart = (product: any) => {
    addToCart(product);
    removeFromWishlist(product.id);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Heart className="w-6 h-6 text-primary" />
              <h1 className="font-display text-2xl font-bold">My Wishlist</h1>
              <span className="text-muted-foreground">({wishlist.length} items)</span>
            </div>
            {wishlist.length > 0 && (
              <Button variant="outline" size="sm" onClick={clearWishlist} data-testid="button-clear-wishlist">
                Clear All
              </Button>
            )}
          </div>

          {wishlist.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Heart className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="font-display text-xl font-semibold mb-2">Your wishlist is empty</h2>
                <p className="text-muted-foreground mb-6">Save items you love to buy them later</p>
                <Link href="/">
                  <Button data-testid="button-start-shopping">Start Shopping</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {wishlist.map((product) => (
                <Card key={product.id} className="overflow-hidden group" data-testid={`card-wishlist-${product.id}`}>
                  <Link href={productUrl(product)}>
                    <div className="aspect-square overflow-hidden">
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                  </Link>
                  <CardContent className="p-4">
                    <Link href={productUrl(product)}>
                      <h3 className="font-semibold truncate hover:text-primary">{product.name}</h3>
                    </Link>
                    <p className="font-display text-lg font-bold text-primary mt-1">
                      {formatCurrency(product.price)}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleAddToCart(product)}
                        data-testid={`button-add-to-cart-${product.id}`}
                      >
                        <ShoppingCart className="w-4 h-4 mr-1" />
                        Add to Cart
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeFromWishlist(product.id)}
                        data-testid={`button-remove-wishlist-${product.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
