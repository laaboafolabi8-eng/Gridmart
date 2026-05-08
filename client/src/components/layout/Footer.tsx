import { MapPin, Clock } from 'lucide-react';
import logoIcon from '@/assets/gridmart-logo-icon.png';
import logoText from '@/assets/gridmart-logo-text.png';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';

export function Footer() {
  const { isAuthenticated } = useAuth();

  const { data: siteSettings } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60000,
  });

  const footerTagline = siteSettings?.footerTagline || 'Local products, in-store shopping in Windsor, ON. Browse online and pick up at 3176 Walker Rd.';
  const address = siteSettings?.storefrontAddress || '3176 Walker Rd';
  const hours = siteSettings?.storefrontHours;

  return (
    <footer className="border-t bg-muted/30 mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-end gap-2 mb-4">
              <img src={logoIcon} alt="GridMart" className="w-8 h-8 object-contain" />
              <img src={logoText} alt="GridMart" className="h-5 object-contain mb-0.5" />
            </div>
            <p className="text-muted-foreground max-w-md" data-testid="text-footer-tagline">
              {footerTagline}
            </p>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-muted-foreground">
              <li><a href="/" className="hover:text-foreground transition-colors">Shop Products</a></li>
              <li><a href="/about" className="hover:text-foreground transition-colors">About Us</a></li>
              {isAuthenticated && (
                <li><a href="/orders" className="hover:text-foreground transition-colors">Track Orders</a></li>
              )}
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-muted-foreground">
              <li><a href="/contact" className="hover:text-foreground transition-colors">Contact Us</a></li>
              <li><a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
              <li><a href="/agreement/terms" className="hover:text-foreground transition-colors">Terms of Service</a></li>
              <li><a href="/agreement/refund" className="hover:text-foreground transition-colors">Refund Policy</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4">Visit Us</h4>
            <address className="not-italic space-y-2 text-sm">
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-foreground" itemProp="name">GridMart</p>
                  <p itemProp="streetAddress">{address}</p>
                  <p>
                    <span itemProp="addressLocality">Windsor</span>,{' '}
                    <span itemProp="addressRegion">ON</span>{' '}
                    <span itemProp="postalCode">N8W 3R5</span>
                  </p>
                  <p itemProp="addressCountry">Canada</p>
                </div>
              </div>
              {hours && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                  <p itemProp="openingHours">{hours}</p>
                </div>
              )}
            </address>
          </div>
        </div>

        <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} GridMart. All rights reserved.</p>
          <p className="text-xs mt-1 opacity-50">v1.1.0</p>
        </div>
      </div>
    </footer>
  );
}
