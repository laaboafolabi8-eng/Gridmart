import { Link } from 'wouter';
import { Package, ShoppingBag, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { OrderCard } from '@/components/orders/OrderCard';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';

export default function Orders() {
  const { user } = useAuth();
  
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/orders?buyerId=${user.id}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    enabled: !!user?.id,
  });

  const activeOrders = orders.filter((o: any) => o.status === 'confirmed' || o.status === 'ready' || o.status === 'paid');
  const completedOrders = orders.filter((o: any) => ['picked_up', 'canceled', 'cancelled', 'refunded', 'expired'].includes(o.status));

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <div className="text-center animate-fade-in">
            <ShoppingBag className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold mb-2">No orders yet</h1>
            <p className="text-muted-foreground mb-6">Start shopping to place your first order</p>
            <Link href="/">
              <Button>Browse Products</Button>
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
          <h1 className="font-display text-3xl font-bold mb-8" data-testid="text-orders-title">
            My Orders
          </h1>

          <Tabs defaultValue="active" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="active" data-testid="tab-active">
                Active ({activeOrders.length})
              </TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed">
                Completed ({completedOrders.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-5">
              {activeOrders.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-display text-lg font-semibold mb-2">No active orders</h3>
                  <p className="text-muted-foreground">Your active orders will appear here</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeOrders.map((order: any, idx: number) => (
                    <div 
                      key={order.id} 
                      className="animate-slide-up"
                      style={{ animationDelay: `${idx * 0.05}s` }}
                    >
                      <OrderCard order={order} />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="completed" className="mt-5">
              {completedOrders.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-display text-lg font-semibold mb-2">No completed orders</h3>
                  <p className="text-muted-foreground">Your order history will appear here</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {completedOrders.map((order: any, idx: number) => (
                    <div 
                      key={order.id} 
                      className="animate-slide-up"
                      style={{ animationDelay: `${idx * 0.05}s` }}
                    >
                      <OrderCard order={order} />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
}
