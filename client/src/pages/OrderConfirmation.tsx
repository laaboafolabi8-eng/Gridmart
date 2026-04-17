import { useParams, Link } from 'wouter';
import { CheckCircle, MapPin, Clock, Copy, Package, ArrowRight, Loader2, Star, Heart, XCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { formatCurrency, formatDate, Node } from '@/lib/mockData';
import { toast } from 'sonner';

const statusConfig: Record<string, { label: string; class: string; description: string; icon: any }> = {
  pending_payment: {
    label: 'Pending Payment',
    class: 'bg-yellow-100 text-yellow-800',
    description: 'Waiting for payment to complete.',
    icon: Clock,
  },
  confirmed: { 
    label: 'Order Confirmed', 
    class: 'bg-blue-100 text-blue-800',
    description: 'Your order is confirmed and being prepared. We\'ll notify you when it\'s ready!',
    icon: CheckCircle,
  },
  paid: { 
    label: 'Order Received', 
    class: 'status-paid',
    description: 'Your order will be ready within your selected pickup window. We\'ll notify you when it\'s ready!',
    icon: CheckCircle,
  },
  ready: { 
    label: 'Ready for Pickup', 
    class: 'bg-green-100 text-green-800',
    description: 'Your order is ready! Head to the Node for pickup.',
    icon: Package,
  },
  picked_up: { 
    label: 'Picked Up', 
    class: 'status-picked-up',
    description: 'Order completed. Thank you for using GridMart!',
    icon: CheckCircle,
  },
  canceled: { 
    label: 'Canceled', 
    class: 'status-canceled',
    description: 'This order has been canceled.',
    icon: XCircle,
  },
  cancelled: { 
    label: 'Cancelled', 
    class: 'bg-red-100 text-red-800',
    description: 'This order has been cancelled and refunded.',
    icon: XCircle,
  },
  refunded: { 
    label: 'Refunded', 
    class: 'bg-orange-100 text-orange-800',
    description: 'This order has been refunded.',
    icon: XCircle,
  },
  expired: { 
    label: 'Expired', 
    class: 'bg-gray-100 text-gray-800',
    description: 'This order has expired.',
    icon: Clock,
  },
};

function StarRating({ rating, onRate, label }: { rating: number; onRate: (r: number) => void; label: string }) {
  const [hovered, setHovered] = useState(0);
  
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2">{label}</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onRate(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className="p-1 transition-transform hover:scale-110"
            data-testid={`star-${label.toLowerCase().replace(/\s/g, '-')}-${star}`}
          >
            <Star
              className={`w-8 h-8 ${
                (hovered || rating) >= star
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-gray-300'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function OrderConfirmation() {
  const params = useParams<{ id: string }>();
  const [copied, setCopied] = useState(false);
  const [hostRating, setHostRating] = useState(0);
  const [overallRating, setOverallRating] = useState(0);
  const [comment, setComment] = useState('');
  const queryClient = useQueryClient();
  
  // Fetch order from database
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['order', params.id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${params.id}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!params.id,
  });
  
  const { data: allNodes = [] } = useQuery<Node[]>({
    queryKey: ['nodes'],
    queryFn: async () => {
      const res = await fetch('/api/nodes');
      if (!res.ok) throw new Error('Failed to fetch nodes');
      return res.json();
    },
  });
  
  // Fetch existing feedback for this order
  const { data: existingFeedback } = useQuery({
    queryKey: ['feedback', params.id],
    queryFn: async () => {
      const res = await fetch(`/api/feedback/order/${params.id}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!params.id && order?.status === 'picked_up',
  });
  
  // Submit feedback mutation
  const submitFeedback = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: params.id,
          hostRating,
          overallRating,
          comment: comment.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit feedback');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Thank you for your feedback!');
      queryClient.invalidateQueries({ queryKey: ['feedback', params.id] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
  
  // Cancel order mutation
  const cancelOrder = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/orders/${params.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to cancel order');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.refunded 
        ? `Order cancelled. $${data.refundAmount.toFixed(2)} will be refunded.`
        : 'Order cancelled successfully.');
      queryClient.invalidateQueries({ queryKey: ['order', params.id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
  
  // Check if order can be cancelled
  const canCancelOrder = order && !['picked_up', 'completed', 'cancelled', 'canceled', 'refunded', 'expired'].includes(order.status);
  
  const zoneNumber = order ? allNodes.findIndex((n: Node) => n.id === order.nodeId) + 1 : 0;
  const nodeName = order?.nodeName || allNodes.find((n: Node) => n.id === order?.nodeId)?.name || 'Pickup Location';

  if (orderLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold mb-2">Order not found</h1>
            <Link href="/orders">
              <Button>View All Orders</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const status = statusConfig[order.status] || { label: order.status, class: 'bg-gray-100 text-gray-800', description: '', icon: Package };
  const StatusIcon = status.icon;

  const copyPickupCode = () => {
    navigator.clipboard.writeText(order.pickupCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-8 animate-slide-up">
            {order.status === 'paid' || order.status === 'ready' ? (
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-primary" />
              </div>
            ) : null}
            <h1 className="font-display text-3xl font-bold mb-2" data-testid="text-order-title">
              {order.status === 'paid' ? 'Order Received!' : 
               order.status === 'ready' ? 'Ready for Pickup!' : 
               `Order ${order.pickupCode}`}
            </h1>
            <p className="text-muted-foreground">{status.description}</p>
          </div>

          <Card className="mb-6 animate-fade-in">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-end">
                <Badge className={status.class} data-testid="badge-order-status">
                  {status.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center mb-6">
                <p className="text-sm text-muted-foreground mb-2">Your Order Number</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="font-display text-3xl font-bold tracking-wider" data-testid="text-pickup-code">
                    {order.pickupCode}
                  </span>
                  <Button variant="ghost" size="icon" onClick={copyPickupCode}>
                    <Copy className="w-5 h-5" />
                  </Button>
                </div>
                {copied && (
                  <p className="text-sm text-primary mt-2">Copied to clipboard!</p>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  Show this code when you arrive at the Node
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <MapPin className="w-4 h-4" />
                    Pickup Location
                  </div>
                  <div className="font-display font-semibold">{nodeName}</div>
                  {(() => {
                    const node = allNodes.find((n: Node) => n.id === order.nodeId);
                    if (node?.latitude && node?.longitude) {
                      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${node.latitude},${node.longitude}`;
                      return (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-1"
                          data-testid="link-google-maps-directions"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Get Directions
                        </a>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Clock className="w-4 h-4" />
                    Pickup Time
                  </div>
                  {order.pickupDate && (
                    <div className="font-display font-semibold">
                      {formatDate(order.pickupDate)}
                    </div>
                  )}
                  {order.pickupTime && (
                    <div className="text-sm text-muted-foreground">
                      {order.pickupTime}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <CardHeader>
              <CardTitle className="font-display">Order Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(order.items || []).map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-4">
                    <img
                      src={item.product?.images?.[0] || '/placeholder-product.jpg'}
                      alt={item.product?.name || 'Product'}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{item.product?.name || 'Product'}</div>
                      <div className="text-sm text-muted-foreground">
                        Qty: {item.quantity}
                      </div>
                    </div>
                    <div className="font-display font-semibold">
                      {formatCurrency((item.product?.price || item.price) * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              <div className="flex justify-between font-display font-bold text-lg">
                <span>Total Paid</span>
                <span data-testid="text-order-total">{formatCurrency(parseFloat(order.total))}</span>
              </div>
            </CardContent>
          </Card>

          {/* Cancel Order Section */}
          {canCancelOrder && (
            <Card className="mb-6 border-destructive/30 bg-destructive/5 animate-fade-in" style={{ animationDelay: '0.15s' }}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    <div>
                      <p className="font-medium">Need to cancel this order?</p>
                      <p className="text-sm text-muted-foreground">
                        You'll receive a full refund within 5-10 business days.
                      </p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        disabled={cancelOrder.isPending}
                        data-testid="button-cancel-order"
                      >
                        {cancelOrder.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Cancelling...
                          </>
                        ) : (
                          'Cancel Order'
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will cancel your order and issue a full refund of {formatCurrency(parseFloat(order.total))}. 
                          The refund will be returned to your original payment method within 5-10 business days.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep Order</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => cancelOrder.mutate()}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Yes, Cancel Order
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          )}

          {order.status === 'picked_up' && (
            <Card className="mb-6 animate-fade-in" style={{ animationDelay: '0.15s' }}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Heart className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="font-display">Thank You!</CardTitle>
                    <p className="text-sm text-muted-foreground">Your order has been completed</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {existingFeedback ? (
                  <div className="text-center py-4">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                    <p className="font-medium mb-2">Feedback Submitted</p>
                    <p className="text-sm text-muted-foreground">
                      Thanks for sharing your experience!
                    </p>
                    <div className="flex items-center justify-center gap-4 mt-4">
                      <div className="text-center">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-4 h-4 ${
                                existingFeedback.hostRating >= star
                                  ? 'fill-yellow-400 text-yellow-400'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Host</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-4 h-4 ${
                                existingFeedback.overallRating >= star
                                  ? 'fill-yellow-400 text-yellow-400'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Overall</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-muted-foreground mb-4">
                      We'd love to hear about your experience. Your feedback helps us improve!
                    </p>
                    
                    <StarRating
                      rating={hostRating}
                      onRate={setHostRating}
                      label="How was the pickup host?"
                    />
                    
                    <StarRating
                      rating={overallRating}
                      onRate={setOverallRating}
                      label="Overall experience"
                    />
                    
                    <div className="mb-4">
                      <label className="block text-sm font-medium mb-2">
                        Comments (optional)
                      </label>
                      <Textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Tell us more about your experience..."
                        className="resize-none"
                        rows={3}
                        data-testid="input-feedback-comment"
                      />
                    </div>
                    
                    <Button
                      onClick={() => submitFeedback.mutate()}
                      disabled={!hostRating || !overallRating || submitFeedback.isPending}
                      className="w-full"
                      data-testid="button-submit-feedback"
                    >
                      {submitFeedback.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        'Submit Feedback'
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <Link href="/orders">
              <Button variant="outline" className="gap-2">
                View All Orders
              </Button>
            </Link>
            <Link href="/">
              <Button className="gap-2">
                Continue Shopping
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
