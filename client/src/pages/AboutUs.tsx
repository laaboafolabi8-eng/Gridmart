import { useQuery } from '@tanstack/react-query';
import { MapPin, Clock, Phone, Mail, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

function linkifyText(text: string): string {
  return text.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">$1</a>'
  );
}

export default function AboutUs() {
  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: aboutAgreement } = useQuery<{ content: string }>({
    queryKey: ['agreements', 'about'],
    queryFn: async () => {
      const res = await fetch('/api/agreements/about');
      if (!res.ok) throw new Error('Not found');
      return res.json();
    },
    staleTime: 60000,
  });

  const aboutUsText = aboutAgreement?.content || siteSettings.aboutUsText || '';
  const address = siteSettings.storefrontAddress || '3176 Walker Rd, Windsor, ON N8W 3R5';
  const hours = siteSettings.storefrontHours || '';
  const contactPhone = siteSettings.contactPhone || '(519) 919-7764';
  const contactEmail = siteSettings.contactEmail || 'admin@gridmart.ca';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-3xl font-bold mb-2" data-testid="text-about-title">About GridMart</h1>
          <p className="text-muted-foreground mb-10">Your local source for electronics, appliances, and everyday essentials.</p>

          {/* Store info cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
            <Card>
              <CardContent className="pt-5 flex gap-3">
                <MapPin className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm mb-1">Our Store</p>
                  <p className="text-sm text-muted-foreground leading-snug">{address}</p>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1.5"
                  >
                    Get directions <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 flex gap-3">
                <Mail className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm mb-1">Get in Touch</p>
                  <a href={`mailto:${contactEmail}`} className="text-sm text-muted-foreground hover:text-primary transition-colors block">
                    {contactEmail}
                  </a>
                  {contactPhone && (
                    <a href={`tel:${contactPhone.replace(/[^+\d]/g, '')}`} className="text-sm text-muted-foreground hover:text-primary transition-colors block mt-0.5">
                      {contactPhone}
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>

            {hours && (
              <Card className="sm:col-span-2">
                <CardContent className="pt-5 flex gap-3">
                  <Clock className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm mb-1">Store Hours</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{hours}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* About content */}
          {aboutUsText ? (
            <div
              className="prose prose-gray max-w-none text-foreground leading-relaxed whitespace-pre-wrap"
              data-testid="text-about-content"
              dangerouslySetInnerHTML={{ __html: linkifyText(aboutUsText) }}
            />
          ) : (
            <div className="space-y-4 text-muted-foreground leading-relaxed" data-testid="text-about-default">
              <p>
                GridMart is a retail store in Windsor, Ontario, carrying a wide selection of electronics,
                appliances, accessories, and everyday essentials — all under one roof.
              </p>
              <p>
                We stock products across major categories including home appliances, mobile accessories,
                audio equipment, cables and components, and more. Whether you're outfitting a home office,
                upgrading your kitchen, or just need a reliable everyday item, we likely have it in stock
                and ready to take home today.
              </p>
              <p>
                Stop by our store at {address} — we'd love to help you find what you're looking for.
              </p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
