import { useState } from 'react';
import { useSiteInfo } from '@/lib/useSiteInfo';
import { Package, Truck, Store, Search, ExternalLink, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Link } from 'wouter';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Awaiting Payment', color: 'secondary' },
  processing: { label: 'Processing', color: 'outline' },
  confirmed: { label: 'Confirmed', color: 'outline' },
  ready: { label: 'Ready for Pickup', color: 'secondary' },
  shipped: { label: 'Shipped', color: 'default' },
  completed: { label: 'Delivered / Picked Up', color: 'default' },
  cancelled: { label: 'Cancelled', color: 'destructive' },
  expired: { label: 'Expired', color: 'destructive' },
};

function statusBadge(status: string) {
  const s = STATUS_LABELS[status] || { label: status, color: 'secondary' };
  return <Badge variant={s.color as any}>{s.label}</Badge>;
}

export default function TrackOrder() {
  const { email: contactEmail, address: storeAddress } = useSiteInfo();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/orders/track?code=${encodeURIComponent(code.trim().toUpperCase())}&email=${encodeURIComponent(email.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Order not found.');
      } else {
        setResult(data);
      }
    } catch {
      setError('Connection error. Please try again.');
    }
    setLoading(false);
  };

  const upsTrackUrl = result?.trackingNumber
    ? `https://www.ups.com/track?tracknum=${encodeURIComponent(result.trackingNumber)}`
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="mb-8 text-center">
            <Package className="w-10 h-10 text-primary mx-auto mb-3" />
            <h1 className="font-display text-3xl font-bold mb-2">Track Your Order</h1>
            <p className="text-muted-foreground">Enter the order code from your confirmation email to see the latest status.</p>
          </div>

          {/* Lookup form */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <form onSubmit={handleTrack} className="space-y-4">
                <div>
                  <Label htmlFor="track-code">Order Code</Label>
                  <Input
                    id="track-code"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ABC123"
                    maxLength={10}
                    required
                    className="font-mono uppercase mt-1"
                    data-testid="input-track-code"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Found in your order confirmation email</p>
                </div>
                <div>
                  <Label htmlFor="track-email">Email Address</Label>
                  <Input
                    id="track-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="The email you used at checkout"
                    required
                    className="mt-1"
                    data-testid="input-track-email"
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}
                <Button type="submit" disabled={loading} className="w-full" data-testid="button-track-submit">
                  {loading ? (
                    <span className="flex items-center gap-2"><Search className="w-4 h-4 animate-pulse" /> Looking up…</span>
                  ) : (
                    <span className="flex items-center gap-2"><Search className="w-4 h-4" /> Track Order</span>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Result */}
          {result && (
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Order {result.pickupCode}</CardTitle>
                  {statusBadge(result.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  {result.fulfillmentType === 'ship' ? (
                    <Truck className="w-5 h-5 text-primary shrink-0" />
                  ) : (
                    <Store className="w-5 h-5 text-primary shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">{result.fulfillmentType === 'ship' ? 'Shipping to' : 'In-Store Pickup'}</p>
                    {result.fulfillmentType === 'ship' && result.shippingCity && (
                      <p className="text-muted-foreground text-xs">{result.shippingCity}, {result.shippingProvince}</p>
                    )}
                    {result.fulfillmentType === 'pickup' && (
                      <p className="text-muted-foreground text-xs">{storeAddress}</p>
                    )}
                  </div>
                </div>

                {result.fulfillmentType === 'ship' && (
                  <div>
                    {result.trackingNumber ? (
                      <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-medium text-green-800">UPS Tracking Number</p>
                          <p className="font-mono text-sm text-green-700 mt-0.5">{result.trackingNumber}</p>
                          <a
                            href={upsTrackUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary underline mt-2"
                          >
                            Track on UPS.com <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                        <Clock className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="font-medium">Tracking number not yet assigned</p>
                          <p className="text-muted-foreground text-xs mt-0.5">You will receive an email with your UPS tracking number once your order ships (1–2 business days).</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Order placed {new Date(result.createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </CardContent>
            </Card>
          )}

          {/* FAQ */}
          <div className="space-y-4 mb-8">
            <h2 className="font-display font-semibold text-lg">Frequently Asked Questions</h2>

            {[
              {
                q: 'Where do I find my order code?',
                a: 'Your order code is in the confirmation email sent to you after checkout. It is a 6-character alphanumeric code (e.g. "AB12CD").',
              },
              {
                q: 'What if tracking shows no updates?',
                a: 'UPS tracking can take 24–48 hours to update after pickup. If your tracking number shows no movement after 3 business days, contact us.',
              },
              {
                q: "My package shows delivered but I haven't received it.",
                a: (<>Check around your door, mailbox, and with neighbours. Allow 24 hours. If still missing, contact us at <a href={`mailto:${contactEmail}`} className="text-primary underline">{contactEmail}</a> and we will open a UPS claim.</>),
              },
              {
                q: 'How do I change my delivery address?',
                a: (<>Address changes must be requested before your order ships. Contact us immediately at <a href={`mailto:${contactEmail}`} className="text-primary underline">{contactEmail}</a> with your order code.</>),
              },
              {
                q: 'What if my package is delayed?',
                a: 'Delays can occur during peak seasons or in remote areas. If your estimated delivery window has passed, contact us and we will follow up with UPS.',
              },
            ].map(({ q, a }) => (
              <div key={q} className="border rounded-lg p-4">
                <p className="font-medium text-sm mb-1">{q}</p>
                <p className="text-sm text-muted-foreground">{a}</p>
              </div>
            ))}
          </div>

          {/* Contact + policy links */}
          <Card>
            <CardContent className="pt-5 text-sm space-y-2">
              <p className="font-medium">Need help?</p>
              <p className="text-muted-foreground">
                Email <a href={`mailto:${contactEmail}`} className="text-primary underline">{contactEmail}</a> — we respond within 24 hours (Monday–Friday, 10:00 AM – 7:00 PM).
              </p>
              <div className="flex flex-wrap gap-4 pt-2 text-xs text-muted-foreground border-t">
                <Link href="/shipping" className="text-primary hover:underline">Shipping Policy</Link>
                <Link href="/agreement/refund" className="text-primary hover:underline">Refund Policy</Link>
                <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                <Link href="/contact" className="text-primary hover:underline">Contact Us</Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
