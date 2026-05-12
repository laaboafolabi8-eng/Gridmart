import { useState } from 'react';
import { Mail, Send, Phone, MapPin, Clock, ExternalLink, Instagram, Facebook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';

export default function Contact() {
  const { user, isAuthenticated } = useAuth();

  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60000,
  });

  const contactEmail = siteSettings.contactEmail || 'admin@gridmart.ca';
  const contactPhone = siteSettings.contactPhone || '';
  const address = siteSettings.storefrontAddress || '3176 Walker Rd, Windsor, ON N8W 3R5';
  const hours = siteSettings.storefrontHours || 'Monday–Friday, 10:00 AM – 7:00 PM';

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    subject: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError('Failed to send message. Please try again or email us directly.');
      }
    } catch {
      setError('Connection error. Please try again.');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-4xl">

          {/* Business identity */}
          <div className="text-center mb-10">
            <h1 className="font-display text-3xl font-bold mb-1">Contact Us</h1>
            <p className="font-semibold text-lg">GridMart &mdash; gridmart.ca</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              GridMart is a registered trade name of BookBuy Express Inc.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              We typically respond within <strong>24 hours</strong>.
            </p>
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <Card>
              <CardContent className="pt-6 text-center">
                <MapPin className="w-7 h-7 text-primary mx-auto mb-3" />
                <h3 className="font-semibold mb-1 text-sm">Visit Us</h3>
                <p className="text-xs text-muted-foreground leading-snug">{address}</p>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                >
                  Get directions <ExternalLink className="w-3 h-3" />
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <Mail className="w-7 h-7 text-primary mx-auto mb-3" />
                <h3 className="font-semibold mb-1 text-sm">Email</h3>
                <a
                  href={`mailto:${contactEmail}`}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors break-all"
                  data-testid="text-contact-email"
                >
                  {contactEmail}
                </a>
              </CardContent>
            </Card>

            {contactPhone ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <Phone className="w-7 h-7 text-primary mx-auto mb-3" />
                  <h3 className="font-semibold mb-1 text-sm">Phone</h3>
                  <a
                    href={`tel:${contactPhone.replace(/[^+\d]/g, '')}`}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    data-testid="text-contact-phone"
                  >
                    {contactPhone}
                  </a>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardContent className="pt-6 text-center">
                <Clock className="w-7 h-7 text-primary mx-auto mb-3" />
                <h3 className="font-semibold mb-1 text-sm">Hours</h3>
                <p className="text-xs text-muted-foreground leading-snug">{hours}</p>
              </CardContent>
            </Card>
          </div>

          {/* Social media */}
          <div className="flex items-center justify-center gap-4 mb-10">
            <span className="text-sm text-muted-foreground">Connect with us:</span>
            <a
              href="https://www.instagram.com/grid.mart/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
              aria-label="GridMart on Instagram"
            >
              <Instagram className="w-4 h-4" /> Instagram
            </a>
            <a
              href="https://www.facebook.com/profile.php?id=61586144236175"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
              aria-label="GridMart on Facebook"
            >
              <Facebook className="w-4 h-4" /> Facebook
            </a>
          </div>

          {/* Contact form */}
          <Card>
            <CardHeader>
              <CardTitle>Send us a message</CardTitle>
              <p className="text-sm text-muted-foreground">We'll get back to you within 24 hours.</p>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Send className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-2">Message Sent!</h3>
                  <p className="text-muted-foreground">We'll get back to you within 24 hours.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {!isAuthenticated && (
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="name">Name</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                          data-testid="input-contact-name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                          data-testid="input-contact-email"
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      required
                      data-testid="input-contact-subject"
                    />
                  </div>
                  <div>
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      rows={5}
                      required
                      data-testid="textarea-contact-message"
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <div className="space-y-2">
                    <Button type="submit" disabled={isSubmitting} data-testid="button-contact-submit">
                      {isSubmitting ? 'Sending...' : 'Send Message'}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      By submitting this form, you agree to our{' '}
                      <Link href="/privacy" className="underline hover:text-primary">Privacy Policy</Link>.
                    </p>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
