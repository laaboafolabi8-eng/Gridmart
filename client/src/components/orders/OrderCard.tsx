import { Link } from 'wouter';
import { Package, MapPin, Clock, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ChatDialog } from '@/components/chat/ChatDialog';
import { formatCurrency, formatDate } from '@/lib/mockData';

interface OrderCardProps {
  order: any;
  showActions?: boolean;
}

const statusConfig: Record<string, { label: string; class: string }> = {
  pending_payment: { label: 'Pending Payment', class: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmed', class: 'bg-blue-100 text-blue-800' },
  paid: { label: 'Paid', class: 'status-paid' },
  ready: { label: 'Ready for Pickup', class: 'bg-green-100 text-green-800' },
  picked_up: { label: 'Picked Up', class: 'status-picked-up' },
  canceled: { label: 'Canceled', class: 'status-canceled' },
  cancelled: { label: 'Cancelled', class: 'bg-red-100 text-red-800' },
  refunded: { label: 'Refunded', class: 'bg-orange-100 text-orange-800' },
  expired: { label: 'Expired', class: 'bg-gray-100 text-gray-800' },
};

export function OrderCard({ order, showActions = true }: OrderCardProps) {
  const status = statusConfig[order.status] || { label: order.status, class: 'bg-gray-100 text-gray-800' };
  const items = order.items || [];
  const nodeName = order.node?.name || order.nodeName || 'Pickup Location';
  const pickupTime = order.pickupTime || order.timeSlot?.startTime;

  return (
    <Link href={`/order/${order.id}`}>
      <Card className="card-hover cursor-pointer" data-testid={`card-order-${order.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold" data-testid={`text-order-id-${order.id}`}>
                  {order.pickupCode || order.id}
                </span>
                <Badge className={status.class} data-testid={`badge-status-${order.id}`}>
                  {status.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {formatDate(order.createdAt)}
              </p>
            </div>
            <span className="font-display font-bold text-lg">
              {formatCurrency(parseFloat(order.total))}
            </span>
          </div>

          {items.length > 0 && (
            <div className="space-y-2 mb-3">
              {items.slice(0, 2).map((item: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3">
                  <img 
                    src={item.product?.images?.[0] || '/placeholder-product.jpg'} 
                    alt={item.product?.name || 'Product'}
                    className="w-10 h-10 rounded object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.product?.name || 'Product'}</p>
                    <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                  </div>
                </div>
              ))}
              {items.length > 2 && (
                <p className="text-sm text-muted-foreground">
                  +{items.length - 2} more item{items.length - 2 > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground border-t pt-3">
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>{nodeName}</span>
            </div>
            {pickupTime && (
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{pickupTime}</span>
              </div>
            )}
          </div>

          {showActions && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <div onClick={(e) => e.preventDefault()}>
                <ChatDialog
                  orderId={order.id}
                  orderLabel={order.pickupCode || order.id}
                  currentUserType="buyer"
                  currentUserName={order.buyerName}
                  otherPartyName={nodeName}
                  triggerSize="sm"
                />
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
