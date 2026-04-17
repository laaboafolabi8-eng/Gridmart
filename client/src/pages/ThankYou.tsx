import { useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ThankYou() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const orderId = params.get('order');

  useEffect(() => {
    if (orderId) {
      const timer = setTimeout(() => {
        navigate(`/order/${orderId}?payment=success`);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [orderId, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2" data-testid="text-thank-you-title">Thank You for Your Purchase!</h1>
          <p className="text-muted-foreground mb-6" data-testid="text-thank-you-message">
            Your order has been placed successfully. You'll be redirected to your order details shortly.
          </p>
          {orderId && (
            <Button onClick={() => navigate(`/order/${orderId}?payment=success`)} data-testid="btn-view-order">
              View Order Details
            </Button>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
