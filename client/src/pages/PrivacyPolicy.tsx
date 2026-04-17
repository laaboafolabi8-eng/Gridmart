import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-3xl font-bold mb-6">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: January 2026</p>
          
          <div className="prose prose-slate max-w-none space-y-6">
            <section>
              <h2 className="font-display text-xl font-semibold mb-3">1. Information We Collect</h2>
              <p className="text-muted-foreground">
                We collect information you provide directly to us, including your name, email address, 
                phone number (optional), and order information when you make a purchase through GridMart.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">2. How We Use Your Information</h2>
              <p className="text-muted-foreground">We use the information we collect to:</p>
              <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
                <li>Process and fulfill your orders</li>
                <li>Send you order confirmations and updates</li>
                <li>Communicate with you about products and services</li>
                <li>Improve our platform and customer experience</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">3. Information Sharing</h2>
              <p className="text-muted-foreground">
                We share your information with Node hosts only as necessary to fulfill your orders. 
                Node hosts receive your name and pickup time, but not your email or phone number.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">4. Data Security</h2>
              <p className="text-muted-foreground">
                We implement appropriate security measures to protect your personal information. 
                Payment information is processed securely through Stripe and is never stored on our servers.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">5. Cookies</h2>
              <p className="text-muted-foreground">
                We use cookies to maintain your session and remember your preferences. 
                You can disable cookies in your browser settings, but this may affect functionality.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">6. Your Rights</h2>
              <p className="text-muted-foreground">
                You have the right to access, correct, or delete your personal information. 
                Contact us at privacy@gridmart.ca to exercise these rights.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">7. Contact Us</h2>
              <p className="text-muted-foreground">
                If you have questions about this Privacy Policy, please contact us at privacy@gridmart.ca.
              </p>
            </section>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
