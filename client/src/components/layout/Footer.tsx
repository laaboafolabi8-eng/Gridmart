import { MapPin, Clock, Mail, Phone } from 'lucide-react';
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
  const address = siteSettings?.storefrontAddress || '3176 Walker Rd, Windsor, ON N8W 3R5';
  const hours = siteSettings?.storefrontHours || 'Monday–Friday, 10:00 AM – 7:00 PM';
  const contactEmail = siteSettings?.contactEmail || 'admin@gridmart.ca';
  const contactPhone = siteSettings?.contactPhone || '';

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
              <li><a href="/shipping" className="hover:text-foreground transition-colors">Shipping Policy</a></li>
              <li><a href="/track-order" className="hover:text-foreground transition-colors">Track Your Order</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4">Contact Us</h4>
            <address className="not-italic space-y-3 text-sm">
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <div itemScope itemType="https://schema.org/LocalBusiness">
                  <p className="font-medium text-foreground" itemProp="name">GridMart</p>
                  <p className="text-xs opacity-75">GridMart is a registered trade name of BookBuy Express Inc.</p>
                  <p className="mt-1" itemProp="address">{address}</p>
                  <p itemProp="addressCountry">Canada</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="w-4 h-4 shrink-0 text-primary" />
                <a href={`mailto:${contactEmail}`} className="hover:text-foreground transition-colors" itemProp="email">
                  {contactEmail}
                </a>
              </div>

              {contactPhone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4 shrink-0 text-primary" />
                  <a href={`tel:${contactPhone.replace(/[^+\d]/g, '')}`} className="hover:text-foreground transition-colors" itemProp="telephone">
                    {contactPhone}
                  </a>
                </div>
              )}

              <div className="flex items-start gap-2 text-muted-foreground">
                <Clock className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <p itemProp="openingHours">{hours}</p>
              </div>
            </address>
          </div>
        </div>

        <div className="border-t mt-8 pt-8 space-y-4">
          {/* Payment logos */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Secure payments via</span>
            {/* Visa */}
            <svg viewBox="0 0 60 38" className="h-7 w-auto" aria-label="Visa" role="img">
              <rect width="60" height="38" rx="4" fill="#1A1F71"/>
              <text x="30" y="26" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold" fontStyle="italic" fontFamily="Arial, sans-serif">VISA</text>
            </svg>
            {/* Mastercard */}
            <svg viewBox="0 0 60 38" className="h-7 w-auto" aria-label="Mastercard" role="img">
              <rect width="60" height="38" rx="4" fill="#252525"/>
              <circle cx="23" cy="19" r="11" fill="#EB001B"/>
              <circle cx="37" cy="19" r="11" fill="#F79E1B"/>
              <path d="M30 10.5a11 11 0 0 1 0 17 11 11 0 0 1 0-17z" fill="#FF5F00"/>
            </svg>
            {/* Amex */}
            <svg viewBox="0 0 60 38" className="h-7 w-auto" aria-label="American Express" role="img">
              <rect width="60" height="38" rx="4" fill="#2E77BC"/>
              <text x="30" y="17" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif">AMERICAN</text>
              <text x="30" y="27" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif">EXPRESS</text>
            </svg>
            {/* Discover */}
            <svg viewBox="0 0 60 38" className="h-7 w-auto" aria-label="Discover" role="img">
              <rect width="60" height="38" rx="4" fill="white" stroke="#e5e7eb" strokeWidth="1"/>
              <circle cx="40" cy="19" r="12" fill="#F76F20"/>
              <text x="18" y="23" textAnchor="middle" fill="#231F20" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif">DISCOVER</text>
            </svg>
            {/* Apple Pay */}
            <svg viewBox="0 0 60 38" className="h-7 w-auto" aria-label="Apple Pay" role="img">
              <rect width="60" height="38" rx="4" fill="#000"/>
              <text x="30" y="17" textAnchor="middle" fill="white" fontSize="8" fontFamily="Arial, sans-serif"></text>
              <text x="30" y="25" textAnchor="middle" fill="white" fontSize="9" fontWeight="500" fontFamily="Arial, sans-serif">Pay</text>
              <text x="22" y="19" textAnchor="middle" fill="white" fontSize="13" fontFamily="-apple-system, Arial, sans-serif"></text>
            </svg>
            {/* Google Pay */}
            <svg viewBox="0 0 60 38" className="h-7 w-auto" aria-label="Google Pay" role="img">
              <rect width="60" height="38" rx="4" fill="white" stroke="#e5e7eb" strokeWidth="1"/>
              <text x="10" y="24" fill="#4285F4" fontSize="12" fontWeight="bold" fontFamily="Arial, sans-serif">G</text>
              <text x="20" y="24" fill="#555" fontSize="10" fontFamily="Arial, sans-serif">Pay</text>
            </svg>
          </div>
          <div className="text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} GridMart (BookBuy Express Inc.). All rights reserved.</p>
            <p className="text-xs mt-1 opacity-50">v1.1.0</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
