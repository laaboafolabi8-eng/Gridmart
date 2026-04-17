import { Link } from 'wouter';
import { Trash2, Plus, Minus, ShoppingBag, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useCart } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/mockData';

export default function Cart() {
  const { cart, removeFromCart, updateQuantity, cartTotal } = useCart();
  const { user } = useAuth();
  
  const isNodeUser = user?.type === 'node';

  if (cart.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <div className="text-center animate-fade-in">
            <ShoppingBag className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold mb-2">Your cart is empty</h1>
            <p className="text-muted-foreground mb-6">Add some products to get started</p>
            <Link href="/">
              <Button data-testid="button-continue-shopping">Continue Shopping</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <h1 className="font-display text-3xl font-bold mb-6" data-testid="text-cart-title">
            Your Cart ({cart.length} item{cart.length !== 1 ? 's' : ''})
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
            <div className="lg:col-span-2 space-y-4 order-2 lg:order-1">
              {cart.map((item, idx) => (
                <Card 
                  key={`${item.product.id}-${item.selectedColor?.hex || 'no-color'}`} 
                  className="overflow-hidden"
                  data-testid={`card-cart-item-${item.product.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <div className="relative flex-shrink-0 overflow-hidden rounded-lg">
                        <img
                          src={item.product.images[0]}
                          alt={item.product.name}
                          className="w-24 h-24 rounded-lg object-contain bg-muted"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-display font-semibold">
                              {item.product.name}
                            </h3>
                            {item.selectedColor && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <span 
                                    className="w-3 h-3 rounded-full border"
                                    style={{ backgroundColor: item.selectedColor.hex }}
                                  />
                                  {item.selectedColor.name}
                                </span>
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFromCart(item.product.id, item.selectedColor?.hex)}
                            data-testid={`button-remove-${item.product.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>

                        <div className="flex items-center justify-between mt-4">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.selectedColor?.hex)}
                              data-testid={`button-minus-${item.product.id}`}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const newQty = parseInt(e.target.value) || 1;
                                const invStock = item.product.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
                                const maxStock = invStock > 0 ? invStock : (item.product.sheetQuantity || 0);
                                if (newQty > maxStock) {
                                  toast.error('Maximum available quantity reached');
                                  updateQuantity(item.product.id, maxStock, item.selectedColor?.hex);
                                } else if (newQty >= 1) {
                                  updateQuantity(item.product.id, newQty, item.selectedColor?.hex);
                                }
                              }}
                              className="w-16 h-8 text-center"
                              data-testid={`input-quantity-${item.product.id}`}
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                const invStock = item.product.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
                                const maxStock = invStock > 0 ? invStock : (item.product.sheetQuantity || 0);
                                if (item.quantity >= maxStock) {
                                  toast.error('Maximum available quantity reached');
                                } else {
                                  updateQuantity(item.product.id, item.quantity + 1, item.selectedColor?.hex);
                                }
                              }}
                              data-testid={`button-plus-${item.product.id}`}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          <span className="font-display font-bold">
                            {formatCurrency(item.product.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="order-1 lg:order-2">
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle className="font-display">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {cart.map(item => (
                      <div key={`${item.product.id}-${item.selectedColor?.hex || 'no-color'}`} className="flex items-center text-sm gap-0">
                        <span className="text-muted-foreground truncate min-w-0 flex-1 flex items-center gap-1">
                          <span className="truncate">{item.product.name}</span>
                          {item.selectedColor && (
                            <span 
                              className="w-2 h-2 rounded-full border inline-block shrink-0"
                              style={{ backgroundColor: item.selectedColor.hex }}
                            />
                          )}
                        </span>
                        <span className="shrink-0 text-muted-foreground w-10 text-right">× <span className="font-bold">{item.quantity}</span></span>
                        <span className="shrink-0 w-16 text-right">{formatCurrency(item.product.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div className="flex justify-between font-display font-bold text-lg">
                    <span>Total</span>
                    <span data-testid="text-cart-total">{formatCurrency(cartTotal)}</span>
                  </div>

                  {isNodeUser ? (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Node Account</AlertTitle>
                      <AlertDescription>
                        Node host accounts cannot make purchases. Please create a separate buyer account to shop.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <Link href="/checkout">
                        <Button className="w-full" size="lg" data-testid="button-checkout">
                          Choose Pickup Location
                        </Button>
                      </Link>

                      <p className="text-xs text-center text-muted-foreground">
                        Select your pickup node and time slot on the next page
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
