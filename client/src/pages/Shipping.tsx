import { useQuery } from '@tanstack/react-query';
import { Truck, MapPin, Clock, Package, AlertCircle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Link } from 'wouter';

const CA_PROVINCES_TERRITORIES = [
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick',
  'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia',
  'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec',
  'Saskatchewan', 'Yukon',
];

export default function Shipping() {
  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60000,
  });

  const flatRate = parseFloat(siteSettings.shippingFlatRate || '15.00');
  const freeThreshold = parseFloat(siteSettings.freeShippingThreshold || '99.00');
  const contactEmail = siteSettings.contactEmail || 'admin@gridmart.ca';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold mb-2">Shipping Policy</h1>
            <p className="text-muted-foreground">Everything you need to know about how we ship your order.</p>
          </div>

          <div className="space-y-6">
            {/* Carrier */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="w-4 h-4" /> Shipping Carrier
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <p>All orders are shipped via <strong className="text-foreground">UPS (United Parcel Service)</strong>.</p>
                <p>A UPS tracking number will be emailed to you once your order has shipped.</p>
              </CardContent>
            </Card>

            {/* Where we ship */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Where We Ship
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-3">
                <div>
                  <p className="font-medium text-foreground mb-2">We ship to all Canadian provinces and territories:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CA_PROVINCES_TERRITORIES.map(p => (
                      <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                    ))}
                  </div>
                </div>
                <div className="border-t pt-3">
                  <p className="font-medium text-foreground mb-1">We do not ship to:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>United States</li>
                    <li>International destinations outside Canada</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Pricing */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="w-4 h-4" /> Shipping Costs
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <span className="font-medium text-green-800">Free Shipping</span>
                  <span className="text-green-700">Orders ${freeThreshold.toFixed(0)}+</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="font-medium text-foreground">Flat Rate</span>
                  <span>${flatRate.toFixed(2)} CAD</span>
                </div>
                <p className="text-xs pt-1">Shipping costs are calculated and displayed at checkout before payment.</p>
                <p className="text-xs">No customs duties, import taxes, or brokerage fees apply to Canadian orders.</p>
              </CardContent>
            </Card>

            {/* Handling + Transit times */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Processing & Delivery Times
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border rounded-lg">
                    <p className="font-semibold text-foreground text-xs uppercase tracking-wide mb-1">Handling Time</p>
                    <p className="text-base font-bold text-foreground">1–2 business days</p>
                    <p className="text-xs mt-1">Time to pick, pack, and hand off to UPS</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="font-semibold text-foreground text-xs uppercase tracking-wide mb-1">Transit Time</p>
                    <p className="text-base font-bold text-foreground">3–7 business days</p>
                    <p className="text-xs mt-1">After handoff to UPS (varies by destination)</p>
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium text-foreground mb-1">Order Cutoff Time</p>
                  <p>Orders placed by <strong>2:00 PM EST, Monday–Friday</strong> begin processing the same day.</p>
                  <p className="text-xs mt-1">Orders placed after 2:00 PM or on weekends begin processing the next business day.</p>
                </div>
                <p className="text-xs">Remote areas (Northern territories, rural communities) may experience longer transit times.</p>
              </CardContent>
            </Card>

            {/* Tracking */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" /> Tracking Your Order
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>Once your order ships, you will receive a confirmation email containing your UPS tracking number.</p>
                <p>You can track your package in two ways:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Visit our <Link href="/track-order" className="text-primary underline hover:no-underline">Track Your Order</Link> page and enter your order code + email</li>
                  <li>Go directly to <a href="https://www.ups.com/track" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">ups.com/track <ExternalLink className="w-3 h-3 inline" /></a> and enter your UPS tracking number</li>
                </ul>
              </CardContent>
            </Card>

            {/* Non-delivery */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Package Not Received?
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>If your tracking shows "Delivered" but you have not received your package:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Check around your door, with neighbours, and in your mailbox</li>
                  <li>Allow 24 hours — packages are sometimes marked delivered early</li>
                  <li>Contact us at <a href={`mailto:${contactEmail}`} className="text-primary underline">{contactEmail}</a></li>
                </ul>
                <p className="pt-1">If your package has not arrived within the estimated delivery window, please <Link href="/contact" className="text-primary underline hover:no-underline">contact us</Link> within <strong>30 days of your order date</strong>. We will open a UPS claim on your behalf.</p>
              </CardContent>
            </Card>

            {/* Policy links */}
            <div className="text-sm text-muted-foreground pt-2 border-t flex flex-wrap gap-4">
              <Link href="/agreement/refund" className="text-primary hover:underline">Refund Policy</Link>
              <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
              <Link href="/contact" className="text-primary hover:underline">Contact Us</Link>
              <Link href="/track-order" className="text-primary hover:underline">Track Your Order</Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
