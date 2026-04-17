import { useRoute, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

interface Agreement {
  id: string;
  key: string;
  title: string;
  content: string;
  updatedAt: string;
}

export default function Agreement() {
  const [, params] = useRoute('/agreement/:key');
  const agreementKey = params?.key || '';

  const { data: agreement, isLoading, error } = useQuery<Agreement>({
    queryKey: ['agreements', agreementKey],
    queryFn: async () => {
      const res = await fetch(`/api/agreements/${agreementKey}`);
      if (!res.ok) throw new Error('Agreement not found');
      return res.json();
    },
    enabled: !!agreementKey,
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-3xl">
          <Link href="/">
            <Button variant="ghost" className="mb-6 gap-2" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </Link>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h2 className="text-xl font-display font-semibold mb-2">Agreement Not Found</h2>
                <p className="text-muted-foreground">The requested agreement could not be found.</p>
              </CardContent>
            </Card>
          )}

          {agreement && (
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-2xl">{agreement.title}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Last updated: {new Date(agreement.updatedAt).toLocaleDateString()}
                </p>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap" data-testid="text-agreement-content">
                  {agreement.content}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
