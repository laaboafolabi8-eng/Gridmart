import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Cookie } from 'lucide-react';
import { getConsentStatus, applyConsent } from '@/lib/cookieConsent';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsentStatus() === null) setVisible(true);
  }, []);

  if (!visible) return null;

  const handle = (status: 'accepted' | 'declined') => {
    applyConsent(status);
    setVisible(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] border-t bg-background shadow-lg">
      <div className="container mx-auto max-w-5xl px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Cookie className="w-5 h-5 text-primary shrink-0 mt-0.5 hidden sm:block" />
        <p className="text-sm text-muted-foreground flex-1 leading-snug">
          We use cookies and similar tracking technologies to improve your experience and analyze site traffic.
          By accepting, you consent to our use of analytics and advertising cookies.{' '}
          <Link href="/privacy" className="text-primary underline hover:no-underline whitespace-nowrap">
            Privacy Policy
          </Link>
        </p>
        <div className="flex gap-2 shrink-0 self-end sm:self-auto">
          <Button size="sm" variant="outline" onClick={() => handle('declined')}>
            Decline
          </Button>
          <Button size="sm" onClick={() => handle('accepted')}>
            Accept All
          </Button>
        </div>
      </div>
    </div>
  );
}
