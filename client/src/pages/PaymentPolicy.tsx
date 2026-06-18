import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Link } from 'wouter';
import { useSiteInfo } from '@/lib/useSiteInfo';

export default function PaymentPolicy() {
  const { email, phone, address, phoneRaw } = useSiteInfo();
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-3xl font-bold mb-6">Payment Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: June 2026</p>

          <div className="prose prose-slate max-w-none space-y-8">

            {/* Intro */}
            <section>
              <p className="text-muted-foreground">
                This page explains the payment methods accepted at GridMart, how your payments are
                processed, and any fees or charges you may encounter. All prices on gridmart.ca are
                displayed and charged in <strong>Canadian dollars (CAD)</strong>.
              </p>
            </section>

            {/* Online payments */}
            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Online Payments</h2>
              <p className="text-muted-foreground mb-4">
                All online payments are processed securely through{' '}
                <strong>Stripe</strong>, a PCI DSS Level 1 certified payment processor.
                GridMart does not store your card details — payment information is handled
                entirely by Stripe's encrypted systems.
              </p>

              <p className="text-muted-foreground mb-4">We accept the following payment methods online:</p>

              {/* Card logos */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <svg viewBox="0 0 60 38" className="h-8 w-auto" aria-label="Visa" role="img">
                  <rect width="60" height="38" rx="4" fill="#1A1F71"/>
                  <text x="30" y="26" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold" fontStyle="italic" fontFamily="Arial, sans-serif">VISA</text>
                </svg>
                <svg viewBox="0 0 60 38" className="h-8 w-auto" aria-label="Mastercard" role="img">
                  <rect width="60" height="38" rx="4" fill="#252525"/>
                  <circle cx="23" cy="19" r="11" fill="#EB001B"/>
                  <circle cx="37" cy="19" r="11" fill="#F79E1B"/>
                  <path d="M30 10.5a11 11 0 0 1 0 17 11 11 0 0 1 0-17z" fill="#FF5F00"/>
                </svg>
                <svg viewBox="0 0 60 38" className="h-8 w-auto" aria-label="American Express" role="img">
                  <rect width="60" height="38" rx="4" fill="#2E77BC"/>
                  <text x="30" y="17" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif">AMERICAN</text>
                  <text x="30" y="27" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif">EXPRESS</text>
                </svg>
                <svg viewBox="0 0 60 38" className="h-8 w-auto" aria-label="Discover" role="img">
                  <rect width="60" height="38" rx="4" fill="white" stroke="#e5e7eb" strokeWidth="1"/>
                  <circle cx="40" cy="19" r="12" fill="#F76F20"/>
                  <text x="18" y="23" textAnchor="middle" fill="#231F20" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif">DISCOVER</text>
                </svg>
                <svg viewBox="0 0 60 38" className="h-8 w-auto" aria-label="Apple Pay" role="img">
                  <rect width="60" height="38" rx="4" fill="#000"/>
                  <text x="30" y="17" textAnchor="middle" fill="white" fontSize="8" fontFamily="Arial, sans-serif"></text>
                  <text x="30" y="25" textAnchor="middle" fill="white" fontSize="9" fontWeight="500" fontFamily="Arial, sans-serif">Pay</text>
                  <text x="22" y="19" textAnchor="middle" fill="white" fontSize="13" fontFamily="-apple-system, Arial, sans-serif"></text>
                </svg>
                <svg viewBox="0 0 60 38" className="h-8 w-auto" aria-label="Google Pay" role="img">
                  <rect width="60" height="38" rx="4" fill="white" stroke="#e5e7eb" strokeWidth="1"/>
                  <text x="10" y="24" fill="#4285F4" fontSize="12" fontWeight="bold" fontFamily="Arial, sans-serif">G</text>
                  <text x="20" y="24" fill="#555" fontSize="10" fontFamily="Arial, sans-serif">Pay</text>
                </svg>
              </div>

              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li><strong>Credit cards</strong> — Visa, Mastercard, American Express, Discover</li>
                <li><strong>Apple Pay</strong> — available on supported Apple devices and Safari</li>
                <li><strong>Google Pay</strong> — available on supported Android devices and Chrome</li>
              </ul>

              <p className="text-muted-foreground mt-4">
                If you experience difficulty at checkout, contact us at{' '}
                <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>{' '}
                or call <a href={`tel:${phoneRaw}`} className="text-primary hover:underline">{phone}</a> and
                we will assist you.
              </p>
            </section>

            {/* In-store payments */}
            <section>
              <h2 className="font-display text-xl font-semibold mb-3">In-Store Payments</h2>
              <p className="text-muted-foreground mb-2">
                At our store located at <strong>{address}</strong>, we accept:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Cash (CAD)</li>
                <li>Credit cards (Visa, Mastercard, American Express, Discover)</li>
                <li>Interac debit</li>
                <li>E-Transfer</li>
              </ul>
            </section>

            {/* In-store pickup (online order) */}
            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Online Orders with In-Store Pickup</h2>
              <p className="text-muted-foreground">
                When you place an order online and choose in-store pickup, payment is collected
                at checkout through Stripe using the online payment methods listed above.
                No additional charges are applied at the time of pickup.
              </p>
            </section>

            {/* Fees */}
            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Fees and Surcharges</h2>
              <p className="text-muted-foreground">
                GridMart does not charge additional fees for using any payment method. The price
                you see at checkout is the price you pay, plus any applicable taxes. Shipping
                charges (where applicable) are shown separately before you confirm your order.
              </p>
            </section>

            {/* Currency */}
            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Currency</h2>
              <p className="text-muted-foreground">
                All transactions are processed in <strong>Canadian dollars (CAD)</strong>. If your
                card is issued in another currency, your bank or card provider may apply a foreign
                exchange conversion fee. GridMart is not responsible for any currency conversion
                charges applied by your financial institution.
              </p>
            </section>

            {/* Security */}
            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Payment Security</h2>
              <p className="text-muted-foreground">
                Online payments are processed by <strong>Stripe</strong>, which is certified to
                PCI DSS Level 1 — the highest level of payment security certification available.
                GridMart does not store, transmit, or have access to your full card number, CVV,
                or expiry date. All payment data is encrypted in transit using TLS.
              </p>
            </section>

            {/* Refunds */}
            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Refunds</h2>
              <p className="text-muted-foreground">
                Approved refunds for online orders are returned to the original payment method
                used at checkout. Processing times are typically <strong>5–10 business days</strong>,
                depending on your bank or card issuer. GridMart has no control over how quickly
                your financial institution applies the credit.
              </p>
              <p className="text-muted-foreground mt-3">
                For in-store purchases, refunds are issued in the same form as the original
                payment where possible (cash refund for cash purchases, card refund for card
                purchases).
              </p>
              <p className="text-muted-foreground mt-3">
                Please review our{' '}
                <Link href="/agreement/refund" className="text-primary hover:underline">Refund Policy</Link>{' '}
                for full details on eligibility and the claims process.
              </p>
            </section>

            {/* Failed payments */}
            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Failed or Declined Payments</h2>
              <p className="text-muted-foreground">
                If your payment is declined, your order will not be placed and you will not be
                charged. Common reasons for a declined payment include insufficient funds, incorrect
                card details, or a security block from your bank. Please verify your information
                and try again, or contact your bank for assistance.
              </p>
              <p className="text-muted-foreground mt-3">
                If you continue to experience issues, contact us at{' '}
                <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>{' '}
                and we will do our best to help.
              </p>
            </section>

            {/* Payment methods not accepted */}
            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Payment Methods Not Accepted Online</h2>
              <p className="text-muted-foreground">
                We currently do not accept the following for online orders:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                <li>PayPal</li>
                <li>Cheques</li>
                <li>Bank wire transfers</li>
                <li>Cryptocurrency</li>
                <li>Gift cards (third-party)</li>
              </ul>
            </section>

            {/* Contact */}
            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Questions About a Payment?</h2>
              <p className="text-muted-foreground">
                If you have a question about a charge, a refund, or any payment-related matter,
                please reach out:
              </p>
              <ul className="list-none text-muted-foreground mt-3 space-y-1">
                <li>
                  <strong>Email:</strong>{' '}
                  <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>
                </li>
                <li>
                  <strong>Phone:</strong>{' '}
                  <a href={`tel:${phoneRaw}`} className="text-primary hover:underline">{phone}</a>
                </li>
                <li><strong>Address:</strong> {address}</li>
                <li><strong>Hours:</strong> Monday–Friday, 10:00 AM – 7:00 PM</li>
              </ul>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
