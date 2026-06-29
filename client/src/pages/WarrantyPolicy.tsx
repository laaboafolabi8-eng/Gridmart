import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useSiteInfo } from '@/lib/useSiteInfo';

export default function WarrantyPolicy() {
  const { email } = useSiteInfo();
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-3xl font-bold mb-6">Warranty Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: June 2026</p>

          <div className="prose prose-slate max-w-none space-y-6">
            <section>
              <p className="text-muted-foreground">
                GridMart does not provide additional product warranties. However, defective products
                may be eligible for a replacement or refund.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">In-Store Purchases</h2>
              <p className="text-muted-foreground">
                If you purchased a product in-store and believe it is defective, bring the product
                and proof of purchase to the store within <strong>30 days</strong> of purchase for inspection.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Shipped Orders</h2>
              <p className="text-muted-foreground">
                If you received a shipped product that is defective, contact{' '}
                <a href={`mailto:${email}`} className="text-primary hover:underline">
                  {email}
                </a>{' '}
                within <strong>30 days</strong> of delivery with your order number, a description of the issue, and photos where applicable.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Resolution</h2>
              <p className="text-muted-foreground">
                GridMart may request additional information to verify the defect. Once approved,
                GridMart may, at its sole discretion:
              </p>
              <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
                <li>Provide a replacement, if available; or</li>
                <li>Issue a refund to the original payment method.</li>
              </ul>
              <p className="text-muted-foreground mt-3">
                Products damaged through misuse, neglect, improper installation, modification, or
                normal wear and tear are not eligible.
              </p>
              <p className="text-muted-foreground mt-3">
                All warranty and defective product claims are handled directly by GridMart.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
