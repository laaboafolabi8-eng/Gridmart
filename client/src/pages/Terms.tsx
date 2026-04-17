import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function Terms() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-3xl font-bold mb-6">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last updated: January 2026</p>
          
          <div className="prose prose-slate max-w-none space-y-6">
            <section>
              <h2 className="font-display text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground">
                By accessing and using GridMart, you agree to be bound by these Terms of Service. 
                If you do not agree to these terms, please do not use our services.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">2. Description of Service</h2>
              <p className="text-muted-foreground">
                GridMart is a local pickup marketplace that connects buyers with community fulfillment 
                locations called "Nodes." We facilitate the sale of products but do not directly sell goods.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">3. User Accounts</h2>
              <p className="text-muted-foreground">
                You may browse products without an account. However, certain features require account creation. 
                You are responsible for maintaining the confidentiality of your account credentials.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">4. Orders and Payments</h2>
              <p className="text-muted-foreground">
                All payments are processed securely through Stripe. By placing an order, you agree to pay 
                the listed price plus any applicable taxes. Orders are final once payment is confirmed.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">5. Pickup Policy</h2>
              <p className="text-muted-foreground">
                You must pick up your order within the scheduled time window. Orders not picked up within 
                48 hours of the scheduled time may be canceled. Refunds for missed pickups are at our discretion.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">6. Product Condition</h2>
              <p className="text-muted-foreground">
                Products are sold in the condition described. We strive for accuracy but some items may 
                show minor variations. Please inspect items at pickup and report any concerns immediately.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">7. Refunds and Returns</h2>
              <p className="text-muted-foreground">
                Refunds are available for items significantly not as described. Contact us within 24 hours 
                of pickup to initiate a return. Items must be in their original condition.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">8. Node Host Responsibilities</h2>
              <p className="text-muted-foreground">
                Node hosts agree to provide secure storage for products and facilitate pickups during 
                their posted availability hours. Node hosts do not handle payments directly.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">9. Limitation of Liability</h2>
              <p className="text-muted-foreground">
                GridMart is not liable for any indirect, incidental, or consequential damages arising 
                from your use of our services. Our liability is limited to the amount you paid for your order.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">10. Changes to Terms</h2>
              <p className="text-muted-foreground">
                We may update these terms from time to time. Continued use of GridMart after changes 
                constitutes acceptance of the new terms.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">11. Contact</h2>
              <p className="text-muted-foreground">
                Questions about these Terms? Contact us at legal@gridmart.ca.
              </p>
            </section>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
