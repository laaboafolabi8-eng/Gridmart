import { MapPin } from 'lucide-react';
import logoIcon from '@/assets/gridmart-logo-icon.png';
import logoText from '@/assets/gridmart-logo-text.png';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';

export function Footer() {
  const { isAuthenticated } = useAuth();

  const { data: siteSettings } = useQuery<Record<string, string>>({
    queryKey: ['/api/site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60000,
  });

  const footerTagline = siteSettings?.footerTagline || 'Community-powered local pickup. Shop from local producers and pick up from neighborhood Nodes. Fresh, fast, and friendly.';
  
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
              <li><a href="/apply" className="hover:text-foreground transition-colors">Become a Node Host</a></li>
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
              <li><a href="/return-policy" className="hover:text-foreground transition-colors">Return Policy</a></li>
              <li><a href="/agreement/host_handoff" className="hover:text-foreground transition-colors">Host Handoff Responsibilities</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4">Service Areas</h4>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                <span className="font-medium text-foreground">Windsor, ON</span>
              </li>
              <li className="text-sm text-muted-foreground italic">More coming soon</li>
            </ul>
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
