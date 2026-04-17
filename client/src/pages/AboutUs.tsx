import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

function linkifyText(text: string): string {
  return text.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">$1</a>'
  );
}

export default function AboutUs() {
  const { data: siteSettings } = useQuery<Record<string, string>>({
    queryKey: ['/api/site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60000,
  });

  const aboutUsText = siteSettings?.aboutUsText || '';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-3xl font-display font-bold mb-8" data-testid="text-about-title">About Us</h1>
        {aboutUsText ? (
          <div
            className="prose prose-gray max-w-none text-foreground leading-relaxed whitespace-pre-wrap"
            data-testid="text-about-content"
            dangerouslySetInnerHTML={{ __html: linkifyText(aboutUsText) }}
          />
        ) : (
          <p className="text-muted-foreground" data-testid="text-about-empty">
            Content coming soon.
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
