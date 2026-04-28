import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

function linkifyText(text: string): string {
  return text.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">$1</a>'
  );
}

export default function ReturnPolicy() {
  const { data: siteSettings } = useQuery<Record<string, string>>({
    queryKey: ['/api/site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60000,
  });

  const title        = siteSettings?.returnPolicyTitle       || 'Return Policy';
  const content      = siteSettings?.returnPolicyContent     || '';
  const layout       = siteSettings?.returnPolicyLayout      || 'centered';
  const bgColor      = siteSettings?.returnPolicyBgColor     || '';
  const accentColor  = siteSettings?.returnPolicyAccentColor || '';
  const bannerImage  = siteSettings?.returnPolicyBannerImage || '';
  const bannerTitle  = siteSettings?.returnPolicyBannerTitle || title;

  const maxWidthClass =
    layout === 'full' ? 'max-w-none' :
    layout === 'wide' ? 'max-w-5xl'  : 'max-w-3xl';

  return (
    <div className="min-h-screen flex flex-col" style={bgColor ? { backgroundColor: bgColor } : undefined}>
      <Header />
      <main className="flex-1">

        {/* Optional banner */}
        {bannerImage && (
          <div
            className="relative w-full h-48 md:h-64 bg-cover bg-center flex items-center justify-center"
            style={{ backgroundImage: `url(${bannerImage})` }}
          >
            <div className="absolute inset-0 bg-black/50" />
            <h1 className="relative z-10 text-3xl md:text-4xl font-display font-bold text-white text-center px-4">
              {bannerTitle}
            </h1>
          </div>
        )}

        <div className={`container mx-auto px-4 py-12 ${maxWidthClass}`}>

          {/* Page title (when no banner, or banner uses bannerTitle so show title below) */}
          {!bannerImage && (
            <h1
              className="text-3xl font-display font-bold mb-8"
              style={accentColor ? { color: accentColor } : undefined}
            >
              {title}
            </h1>
          )}
          {bannerImage && title !== bannerTitle && (
            <h2
              className="text-2xl font-display font-semibold mb-6"
              style={accentColor ? { color: accentColor } : undefined}
            >
              {title}
            </h2>
          )}

          {/* Content */}
          {content ? (
            <div
              className="prose prose-gray max-w-none text-foreground leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: linkifyText(content) }}
            />
          ) : (
            <div className="text-muted-foreground space-y-4">
              <p>Our return policy is being updated. Please <a href="/contact" className="text-primary underline hover:text-primary/80">contact us</a> with any return inquiries.</p>
            </div>
          )}

        </div>
      </main>
      <Footer />
    </div>
  );
}
