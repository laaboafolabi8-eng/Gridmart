import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function Disclaimer() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-3xl font-bold mb-6">Disclaimer</h1>
          <p className="text-muted-foreground mb-8">Last updated: June 2026</p>

          <div className="prose prose-slate max-w-none space-y-8">

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">General</h2>
              <p className="text-muted-foreground">
                The information provided on gridmart.ca is for general informational purposes only.
                While GridMart (a registered trade name of BookBuy Express Inc.) makes reasonable
                efforts to keep product listings, pricing, and store information accurate and up to
                date, we make no representations or warranties of any kind, express or implied, about
                the completeness, accuracy, reliability, or availability of any information, product,
                or service on this website. Your use of this website and reliance on any information
                is strictly at your own risk.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Product Information</h2>
              <p className="text-muted-foreground">
                Product descriptions, specifications, images, and pricing are provided in good faith
                and are subject to change without notice. GridMart does not guarantee that product
                descriptions are error-free or complete. Images are for illustrative purposes only
                and may not reflect the exact appearance of a product. In the event of a pricing
                error, GridMart reserves the right to cancel or correct an order before fulfillment.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Availability</h2>
              <p className="text-muted-foreground">
                Product availability is subject to change at any time. Listing a product on this
                website does not guarantee that the product is in stock or will remain available.
                GridMart is not liable for any loss or inconvenience resulting from a product being
                unavailable after an order is placed.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Shipping and Delivery</h2>
              <p className="text-muted-foreground">
                GridMart ships orders via UPS. Estimated delivery times are provided by the carrier
                and are not guaranteed by GridMart. GridMart is not responsible for delays, losses,
                or damage caused by the carrier, customs, weather, or any other circumstances outside
                of GridMart's control. Once a shipment is handed to UPS, responsibility for delivery
                lies with the carrier.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Third-Party Links</h2>
              <p className="text-muted-foreground">
                This website may contain links to third-party websites, including social media
                platforms (Instagram, Facebook, LinkedIn) and external service providers. These links
                are provided for convenience only. GridMart has no control over, and assumes no
                responsibility for, the content, privacy practices, or availability of any
                third-party website. Accessing a third-party link is done entirely at your own risk.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Payment Processing</h2>
              <p className="text-muted-foreground">
                Online payments are processed by Stripe, Inc., a third-party payment processor.
                GridMart does not store, access, or control your payment information. GridMart is
                not liable for any issues, errors, or unauthorized access arising from the payment
                processing systems of Stripe or any other financial institution.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Errors and Omissions</h2>
              <p className="text-muted-foreground">
                GridMart makes reasonable efforts to ensure all information on this website is
                accurate. However, we do not accept liability for any errors or omissions, and
                reserve the right to change information, prices, specifications, and product
                descriptions at any time without notice.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Limitation of Liability</h2>
              <p className="text-muted-foreground">
                To the fullest extent permitted by applicable law, GridMart (BookBuy Express Inc.)
                and its officers, directors, employees, and partners shall not be liable for any
                direct, indirect, incidental, consequential, special, or exemplary damages arising
                from your use of this website, your purchase of products, or your reliance on any
                information provided — even if GridMart has been advised of the possibility of such
                damages. GridMart's total liability to you for any claim shall not exceed the amount
                you paid for the product or service giving rise to the claim.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Governing Law</h2>
              <p className="text-muted-foreground">
                This disclaimer and your use of gridmart.ca are governed by the laws of the Province
                of Ontario and the federal laws of Canada applicable therein. Any disputes shall be
                subject to the exclusive jurisdiction of the courts of Ontario.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-semibold mb-3">Contact</h2>
              <p className="text-muted-foreground">If you have questions about this disclaimer, please contact us:</p>
              <ul className="list-none text-muted-foreground mt-3 space-y-1">
                <li>
                  <strong>Email:</strong>{' '}
                  <a href="mailto:admin@gridmart.ca" className="text-primary hover:underline">admin@gridmart.ca</a>
                </li>
                <li>
                  <strong>Phone:</strong>{' '}
                  <a href="tel:+15199197764" className="text-primary hover:underline">(519) 919-7764</a>
                </li>
                <li><strong>Address:</strong> 3176 Walker Rd, Windsor, ON N8W 3R5, Canada</li>
              </ul>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
