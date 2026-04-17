import { useState } from 'react';
import { Search, MapPin, Filter, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import type { Node } from '@/lib/mockData';

export default function Nodes() {
  const [search, setSearch] = useState('');

  const { data: nodes = [] } = useQuery<Node[]>({
    queryKey: ['nodes'],
    queryFn: async () => {
      const res = await fetch('/api/nodes');
      if (!res.ok) throw new Error('Failed to fetch nodes');
      return res.json();
    },
  });

  const sortedNodes = [...nodes].sort((a, b) => Number(a.id) - Number(b.id));
  const filteredNodes = sortedNodes
    .filter(node =>
      node.status === 'active' && (
        node.city.toLowerCase().includes(search.toLowerCase())
      )
    )
    .map(node => ({
      ...node,
      zoneNumber: sortedNodes.findIndex(n => n.id === node.id) + 1
    }));

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <section className="py-12 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center animate-slide-up">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Pickup Zones
            </h1>
            <p className="text-muted-foreground">
              We have {filteredNodes.length} pickup zone{filteredNodes.length !== 1 ? 's' : ''} available in your area. 
              The exact pickup address will be provided after checkout.
            </p>
          </div>
        </div>
      </section>

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="flex gap-4 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search-nodes"
              />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              Filter
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredNodes.map((node, idx) => (
              <div 
                key={node.id} 
                className="animate-slide-up"
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <Card className="card-hover" data-testid={`card-zone-${node.zoneNumber}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="font-display font-bold text-lg text-primary">
                          {node.zoneNumber}
                        </span>
                      </div>
                      <Badge variant="secondary">
                        {node.city}
                      </Badge>
                    </div>
                    
                    <h3 className="font-display font-semibold text-lg mb-2">
                      Zone {node.zoneNumber}
                    </h3>
                    
                    <p className="text-sm text-muted-foreground mb-4">
                      Local pickup available in this area. Address revealed after checkout.
                    </p>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                      <Info className="w-4 h-4 shrink-0" />
                      <span>Pickup instructions provided with order confirmation</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>

          {filteredNodes.length === 0 && (
            <div className="text-center py-16">
              <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-display text-lg font-semibold mb-2">No zones found</h3>
              <p className="text-muted-foreground">Try adjusting your search</p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
