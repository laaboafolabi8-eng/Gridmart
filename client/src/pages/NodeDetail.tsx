import { useParams, Link } from 'wouter';
import { ArrowLeft, MapPin, Clock, Package, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ProductCard } from '@/components/products/ProductCard';
import { formatDate, formatTime, products, nodes } from '@/lib/mockData';

export default function NodeDetail() {
  const params = useParams<{ id: string }>();
  const node = nodes.find((n) => n.id === params.id);

  if (!node) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MapPin className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold mb-2">Node not found</h1>
            <Link href="/nodes">
              <Button>View All Nodes</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const productsAtNode = products.filter(p => 
    p.inventory.some(inv => inv.nodeId === node.id && inv.quantity > 0)
  );
  const availableSlots = node.availability.filter(slot => slot.available);

  const groupedSlots = availableSlots.reduce((acc, slot) => {
    if (!acc[slot.date]) {
      acc[slot.date] = [];
    }
    acc[slot.date].push(slot);
    return acc;
  }, {} as Record<string, typeof availableSlots>);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <Link href="/nodes">
            <Button variant="ghost" className="mb-6 gap-2" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
              Back to Nodes
            </Button>
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
            <div className="lg:col-span-2 animate-slide-up">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="font-display text-3xl font-bold mb-2" data-testid="text-node-name">
                    {node.name}
                  </h1>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    <span>{node.address}, {node.city}</span>
                  </div>
                </div>
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {node.distance}
                </Badge>
              </div>

              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Pickup Instructions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{node.pickupInstructions}</p>
                </CardContent>
              </Card>
            </div>

            <div className="animate-fade-in">
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Available Times
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(groupedSlots).slice(0, 3).map(([date, slots]) => (
                    <div key={date}>
                      <h4 className="text-sm font-medium mb-2">{formatDate(date)}</h4>
                      <div className="flex flex-wrap gap-2">
                        {slots.slice(0, 4).map((slot) => (
                          <Badge key={slot.id} variant="outline" className="text-xs">
                            {formatTime(slot.startTime)}
                          </Badge>
                        ))}
                        {slots.length > 4 && (
                          <Badge variant="secondary" className="text-xs">
                            +{slots.length - 4} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}

                  <Link href="/">
                    <Button className="w-full gap-2">
                      Shop & Select This Node
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>

          <section>
            <h2 className="font-display text-xl font-semibold mb-6">
              Products Available Here ({productsAtNode.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {productsAtNode.map((product, idx) => (
                <div 
                  key={product.id} 
                  className="animate-slide-up"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
