import { Link } from 'wouter';
import { MapPin, Clock, ChevronRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Node } from '@/lib/mockData';

interface NodeCardProps {
  node: Node;
  stockQuantity?: number;
  showStock?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

export function NodeCard({ 
  node, 
  stockQuantity, 
  showStock = false,
  selectable = false,
  selected = false,
  onSelect,
}: NodeCardProps) {
  const availableSlots = node.availability?.filter(slot => slot.available).length ?? 0;

  const content = (
    <Card 
      className={`card-hover cursor-pointer transition-all ${
        selected ? 'ring-2 ring-primary border-primary' : ''
      } ${selectable ? 'hover:border-primary/50' : ''}`}
      onClick={selectable ? onSelect : undefined}
      data-testid={`card-node-${node.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-display font-semibold text-lg">{node.name}</h3>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <MapPin className="w-4 h-4" />
              <span>{node.address}, {node.city} {node.postalCode}</span>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {node.distance}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {availableSlots} time slot{availableSlots !== 1 ? 's' : ''} available
            </span>
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${node.address}, ${node.city} ${node.postalCode}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-primary hover:underline flex items-center gap-1"
            data-testid={`link-map-${node.id}`}
          >
            <ExternalLink className="w-3 h-3" />
            View on Map
          </a>
        </div>

        {showStock && stockQuantity !== undefined && (
          <div className="mt-3 pt-3 border-t">
            <Badge 
              variant={stockQuantity > 5 ? 'default' : stockQuantity > 0 ? 'secondary' : 'destructive'}
              className="bg-primary/10 text-primary border-0"
            >
              {stockQuantity > 5 ? '5+' : stockQuantity} in stock here
            </Badge>
          </div>
        )}

        {!selectable && (
          <div className="flex items-center justify-end mt-3 pt-3 border-t">
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        )}

        {selectable && selected && (
          <div className="mt-3 pt-3 border-t">
            <Badge className="bg-primary text-primary-foreground">
              Selected for pickup
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (selectable) {
    return content;
  }

  return (
    <Link href={`/node/${node.id}`}>
      {content}
    </Link>
  );
}
