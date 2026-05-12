import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Check, ShoppingBag, Truck, Store, Loader2, Shield, AlertTriangle, FileText, X, Tag, Trash2, Plus, Minus } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import { useToast } from '@/hooks/use-toast';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useCart, useOrders } from '@/lib/store';
import { formatCurrency } from '@/lib/mockData';
import { useAuth } from '@/lib/auth';

const CA_PROVINCES = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
];

interface Agreement {
  id: string;
  key: string;
  title: string;
  content: string;
  updatedAt: string;
}

function PaymentForm({ orderId, onSuccess, onError, isProcessing, setIsProcessing, agreementsAccepted }: {
  orderId: string;
  onSuccess: (orderId: string) => void;
  onError: (error: string) => void;
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
  agreementsAccepted: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (!agreementsAccepted) {
      onError('Please accept the terms and conditions to continue.');
      return;
    }
    setIsProcessing(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.origin + `/thank-you?order=${orderId}` },
      redirect: 'if_required',
    });
    if (error) {
      onError(error.message || 'Payment failed. Please try again.');
      setIsProcessing(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      try {
        const res = await fetch('/api/stripe/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ orderId, paymentIntentId: paymentIntent.id }),
        });
        const result = await res.json();
        if (result.success) {
          onSuccess(orderId);
        } else {
          onError(result.error || 'Payment confirmation failed');
          setIsProcessing(false);
        }
      } catch (err) {
        console.error('Payment confirm error:', err);
        onError('Payment confirmation failed');
        setIsProcessing(false);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <Button type="submit" className="w-full" disabled={!stripe || isProcessing} data-testid="button-pay">
        {isProcessing ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
        ) : (
          <><CreditCard className="w-4 h-4 mr-2" />Pay Now</>
        )}
      </Button>
    </form>
  );
}

export default function Checkout() {
  const [, navigate] = useLocation();
  const { cart, cartTotal, clearCart, removeFromCart, updateQuantity } = useCart();
  const { createOrder } = useOrders();
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [fulfillmentType, setFulfillmentType] = useState<'ship' | 'pickup'>('ship');

  const [shippingAddress, setShippingAddress] = useState({
    name: '',
    street: '',
    city: '',
    province: '',
    postalCode: '',
  });

  const [contactInfo, setContactInfo] = useState({ name: '', email: '', phone: '' });

  const [removedItems, setRemovedItems] = useState<string[]>([]);
  const [cartValidated, setCartValidated] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [agreementsAccepted, setAgreementsAccepted] = useState(false);
  const [viewingAgreement, setViewingAgreement] = useState<Agreement | null>(null);

  const [promoCode, setPromoCode] = useState('');
  const [promoCodeValidating, setPromoCodeValidating] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{
    id: string; code: string; name: string;
    discountType: 'percentage' | 'fixed' | 'free_gift' | 'gift_choice' | 'combo';
    discountValue: number; discountAmount: number;
    giftProductIds?: string[]; giftQuantity?: number;
    giftPoolSize?: number; giftSelectCount?: number;
    giftProducts?: Array<{ id: string; name: string; code: string; images: string[]; price: string }>;
    benefits?: any[]; comboBenefits?: any[];
  } | null>(null);
  const [selectedGiftProductIds, setSelectedGiftProductIds] = useState<string[]>([]);
  const [promoError, setPromoError] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) throw new Error('Failed to fetch site settings');
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const taxEnabled = siteSettings.taxEnabled !== 'false';
  const taxRatePercent = parseFloat(siteSettings.taxRate || '13') / 100;
  const taxLabel = siteSettings.taxLabel || 'HST';
  const flatShippingRate = parseFloat(siteSettings.shippingFlatRate || '15.00');
  const freeShippingThreshold = parseFloat(siteSettings.freeShippingThreshold || '99.00');

  const { data: agreements = [] } = useQuery<Agreement[]>({
    queryKey: ['agreements'],
    queryFn: async () => {
      const res = await fetch('/api/agreements');
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Pre-fill contact from user profile
  useEffect(() => {
    if (user) {
      setContactInfo({
        name: user.name || '',
        email: user.email?.includes('@phone.gridmart.ca') ? '' : (user.email || ''),
        phone: user.phone || '',
      });
      setShippingAddress(prev => ({ ...prev, name: user.name || '' }));
    }
  }, [user]);

  // Validate cart items against live products on mount
  useEffect(() => {
    if (cart.length === 0 || cartValidated) return;
    const validate = async () => {
      try {
        const res = await fetch('/api/products?live=true');
        const products = await res.json();
        const liveIds = new Set(products.map((p: any) => p.id));
        const removed: string[] = [];
        for (const item of cart) {
          if (!liveIds.has(item.product.id)) {
            removed.push(item.product.name);
            removeFromCart(item.product.id, item.selectedColor?.hex);
          }
        }
        if (removed.length > 0) setRemovedItems(removed);
      } catch (err) {
        console.error('Cart validation error:', err);
      }
      setCartValidated(true);
    };
    validate();
  }, []);

  const discountAmount = appliedPromo?.discountAmount || 0;
  const subtotalAfterDiscount = cartTotal - discountAmount;
  const shippingCost = fulfillmentType === 'ship'
    ? (subtotalAfterDiscount >= freeShippingThreshold ? 0 : flatShippingRate)
    : 0;
  const taxAmount = taxEnabled ? subtotalAfterDiscount * taxRatePercent : 0;
  const orderTotal = subtotalAfterDiscount + taxAmount + shippingCost;

  const formatPhone = (value: string) => {
    const d = value.replace(/\D/g, '');
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  };

  const validatePromoCode = async () => {
    if (!promoCode.trim()) return;
    setPromoCodeValidating(true);
    setPromoError('');
    try {
      const res = await fetch('/api/promo-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim(), orderTotal: cartTotal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoError(data.error || 'Invalid promo code');
        setAppliedPromo(null);
      } else {
        const promo = data.promoCode;
        setAppliedPromo({
          id: promo.id, code: promo.code, name: promo.name,
          discountType: promo.discountType,
          discountValue: parseFloat(promo.discountValue) || 0,
          discountAmount: data.discountAmount || 0,
          giftProductIds: promo.giftProductIds, giftQuantity: promo.giftQuantity,
          giftPoolSize: promo.giftPoolSize, giftSelectCount: promo.giftSelectCount,
          giftProducts: data.giftProducts, benefits: promo.benefits, comboBenefits: data.comboBenefits,
        });
        setSelectedGiftProductIds([]);
        setPromoError('');
      }
    } catch (err) {
      console.error('Promo validate error:', err);
      setPromoError('Failed to validate promo code');
      setAppliedPromo(null);
    }
    setPromoCodeValidating(false);
  };

  const removePromoCode = () => {
    setAppliedPromo(null);
    setPromoCode('');
    setPromoError('');
    setSelectedGiftProductIds([]);
  };

  const canProceedToPayment = () => {
    if (!user || user.type === 'node') return false;
    const name = contactInfo.name.trim() || user.name?.trim();
    if (!name) return false;
    if (fulfillmentType === 'ship') {
      const { street, city, province, postalCode } = shippingAddress;
      if (!street.trim() || !city.trim() || !province || !postalCode.trim()) return false;
      // Basic Canadian postal code format: A1A 1A1
      if (!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(postalCode.trim())) return false;
    }
    return true;
  };

  const createPaymentIntent = async () => {
    if (!user) return;
    setIsProcessing(true);
    setPaymentError(null);
    const buyerName = contactInfo.name.trim() || user.name || 'Customer';
    const buyerEmail = user.email?.includes('@phone.gridmart.ca') ? contactInfo.email : (user.email || contactInfo.email);
    const buyerPhone = user.phone?.replace(/\D/g, '') || contactInfo.phone.replace(/\D/g, '');
    try {
      const response = await fetch('/api/stripe/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          items: cart.map(item => ({
            productId: item.product.id,
            name: item.product.name,
            price: item.product.price,
            quantity: item.quantity,
            images: item.product.images,
          })),
          fulfillmentType,
          ...(fulfillmentType === 'ship' ? {
            shippingName: shippingAddress.name.trim() || buyerName,
            shippingStreet: shippingAddress.street.trim(),
            shippingCity: shippingAddress.city.trim(),
            shippingProvince: shippingAddress.province,
            shippingPostalCode: shippingAddress.postalCode.trim().toUpperCase(),
          } : {}),
          buyerName,
          buyerEmail,
          buyerPhone,
          promoCodeId: appliedPromo?.id || null,
          giftProductIds: (() => {
            if (appliedPromo?.discountType === 'gift_choice') return selectedGiftProductIds;
            if (appliedPromo?.discountType === 'free_gift') return appliedPromo.giftProductIds || [];
            if (appliedPromo?.discountType === 'combo' && appliedPromo.comboBenefits) {
              const ids: string[] = [];
              appliedPromo.comboBenefits.forEach((b: any) => {
                if (b.type === 'free_gift' && b.products) b.products.forEach((p: any) => ids.push(p.id));
                else if (b.type === 'gift_choice') selectedGiftProductIds.forEach(id => ids.push(id));
              });
              return ids;
            }
            return [];
          })(),
        }),
      });
      const result = await response.json();
      if (response.status === 401) {
        navigate('/login?redirect=/checkout');
        setIsProcessing(false);
        return;
      }
      if (result.clientSecret) {
        setClientSecret(result.clientSecret);
        setPendingOrderId(result.orderId);
        setStep(2);
        window.scrollTo(0, 0);
      } else {
        setPaymentError(result.error || 'Failed to initialize payment');
      }
    } catch (err) {
      console.error('Payment intent error:', err);
      setPaymentError('Failed to initialize payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <div className="text-center">
            <ShoppingBag className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold mb-2">Your cart is empty</h1>
            <p className="text-muted-foreground mb-6">Add some products to checkout</p>
            <Link href="/"><Button>Start Shopping</Button></Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <h1 className="font-display text-3xl font-bold mb-6" data-testid="text-cart-title">
            {step === 1 ? 'Checkout' : 'Payment'}
          </h1>

          {removedItems.length > 0 && (
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Some items were removed from your cart</AlertTitle>
              <AlertDescription>
                The following items are no longer available:
                <ul className="list-disc list-inside mt-2">
                  {removedItems.map((item, i) => <li key={i} className="text-sm">{item}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Main column */}
            <div className="lg:col-span-2 space-y-6">

              {step === 1 && (
                <div className="animate-fade-in space-y-6">

                  {/* Fulfillment choice */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="font-display text-lg">How would you like to receive your order?</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Ship option */}
                      <button
                        type="button"
                        onClick={() => setFulfillmentType('ship')}
                        className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${fulfillmentType === 'ship' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                        data-testid="button-fulfillment-ship"
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${fulfillmentType === 'ship' ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                          {fulfillmentType === 'ship' && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <Truck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">Ship to Canada</p>
                          <p className="text-sm text-muted-foreground">
                            {shippingCost === 0 && fulfillmentType === 'ship'
                              ? 'Free shipping on this order'
                              : `$${flatShippingRate.toFixed(2)} flat rate · Free on orders over $${freeShippingThreshold.toFixed(0)}`}
                          </p>
                        </div>
                        {fulfillmentType === 'ship' && shippingCost === 0 && (
                          <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0">Free</Badge>
                        )}
                        {fulfillmentType === 'ship' && shippingCost > 0 && (
                          <span className="font-semibold shrink-0">{formatCurrency(shippingCost)}</span>
                        )}
                      </button>

                      {/* Pickup option */}
                      <button
                        type="button"
                        onClick={() => setFulfillmentType('pickup')}
                        className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${fulfillmentType === 'pickup' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                        data-testid="button-fulfillment-pickup"
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${fulfillmentType === 'pickup' ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                          {fulfillmentType === 'pickup' && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <Store className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">Pick Up In Store</p>
                          <p className="text-sm text-muted-foreground">Free · 3176 Walker Rd, Windsor, ON N8W 3R5</p>
                        </div>
                        <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0">Free</Badge>
                      </button>
                    </CardContent>
                  </Card>

                  {/* Shipping address (ship only) */}
                  {fulfillmentType === 'ship' && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="font-display text-lg flex items-center gap-2">
                          <Truck className="w-5 h-5" />Shipping Address
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label htmlFor="ship-name">Full Name <span className="text-destructive">*</span></Label>
                          <Input id="ship-name" value={shippingAddress.name}
                            onChange={e => setShippingAddress(p => ({ ...p, name: e.target.value }))}
                            placeholder="Jane Smith" data-testid="input-shipping-name" />
                        </div>
                        <div>
                          <Label htmlFor="ship-street">Street Address <span className="text-destructive">*</span></Label>
                          <Input id="ship-street" value={shippingAddress.street}
                            onChange={e => setShippingAddress(p => ({ ...p, street: e.target.value }))}
                            placeholder="123 Main St, Apt 4" data-testid="input-shipping-street" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="ship-city">City <span className="text-destructive">*</span></Label>
                            <Input id="ship-city" value={shippingAddress.city}
                              onChange={e => setShippingAddress(p => ({ ...p, city: e.target.value }))}
                              placeholder="Toronto" data-testid="input-shipping-city" />
                          </div>
                          <div>
                            <Label htmlFor="ship-province">Province <span className="text-destructive">*</span></Label>
                            <Select value={shippingAddress.province} onValueChange={val => setShippingAddress(p => ({ ...p, province: val }))}>
                              <SelectTrigger id="ship-province" data-testid="select-shipping-province">
                                <SelectValue placeholder="Select province" />
                              </SelectTrigger>
                              <SelectContent>
                                {CA_PROVINCES.map(p => (
                                  <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="max-w-[200px]">
                          <Label htmlFor="ship-postal">Postal Code <span className="text-destructive">*</span></Label>
                          <Input id="ship-postal" value={shippingAddress.postalCode}
                            onChange={e => setShippingAddress(p => ({ ...p, postalCode: e.target.value.toUpperCase() }))}
                            placeholder="A1A 1A1" maxLength={7} data-testid="input-shipping-postal" />
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Contact info */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="font-display text-lg">Contact Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {!user && (
                        <Alert>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            <Link href="/login?redirect=/checkout" className="underline font-medium">Sign in</Link> to auto-fill your details and track your order.
                          </AlertDescription>
                        </Alert>
                      )}
                      {user?.type === 'node' && (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>Node Account</AlertTitle>
                          <AlertDescription>Node host accounts cannot make purchases. Please create a separate buyer account.</AlertDescription>
                        </Alert>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="contact-name">Full Name <span className="text-destructive">*</span></Label>
                          <Input id="contact-name" value={contactInfo.name}
                            onChange={e => setContactInfo(p => ({ ...p, name: e.target.value }))}
                            placeholder="Jane Smith" data-testid="input-contact-name" />
                        </div>
                        <div>
                          <Label htmlFor="contact-phone">Phone {fulfillmentType === 'pickup' ? '(for pickup notifications)' : '(optional)'}</Label>
                          <Input id="contact-phone" type="tel" value={contactInfo.phone}
                            onChange={e => setContactInfo(p => ({ ...p, phone: formatPhone(e.target.value) }))}
                            placeholder="(416) 555-1234" maxLength={14} data-testid="input-contact-phone" />
                        </div>
                        {!user?.email || user.email.includes('@phone.gridmart.ca') ? (
                          <div className="sm:col-span-2">
                            <Label htmlFor="contact-email">Email <span className="text-destructive">*</span></Label>
                            <Input id="contact-email" type="email" value={contactInfo.email}
                              onChange={e => setContactInfo(p => ({ ...p, email: e.target.value }))}
                              placeholder="jane@example.com" data-testid="input-contact-email" />
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Cart items */}
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="font-display font-semibold text-sm mb-3">
                        Your Cart ({cart.length} {cart.length === 1 ? 'item' : 'items'})
                      </h3>
                      <div className="space-y-3">
                        {cart.map((item) => {
                          const invStock = item.product.inventory.reduce((sum: number, inv: any) => sum + inv.quantity, 0);
                          const maxStock = invStock > 0 ? invStock : (item.product.sheetQuantity || 0);
                          return (
                            <div key={`${item.product.id}-${item.selectedColor?.hex || ''}`}
                              className="flex items-center gap-3 py-2 border-b last:border-b-0"
                              data-testid={`checkout-cart-item-${item.product.id}`}>
                              {item.product.images?.[0] && (
                                <img src={item.product.images[0]} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{item.product.name}</p>
                                {item.selectedColor && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: item.selectedColor.hex }} />
                                    <span className="text-xs text-muted-foreground">{item.selectedColor.name}</span>
                                  </div>
                                )}
                                <p className="text-xs text-muted-foreground">{formatCurrency(item.product.price)} each</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button variant="outline" size="icon" className="h-7 w-7"
                                  onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.selectedColor?.hex)}
                                  data-testid={`checkout-button-minus-${item.product.id}`}>
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <Input type="number" min="1" value={item.quantity}
                                  onChange={(e) => {
                                    const newQty = parseInt(e.target.value) || 1;
                                    if (newQty > maxStock) {
                                      toast({ title: 'Maximum available quantity reached', variant: 'destructive' });
                                      updateQuantity(item.product.id, maxStock, item.selectedColor?.hex);
                                    } else if (newQty >= 1) {
                                      updateQuantity(item.product.id, newQty, item.selectedColor?.hex);
                                    }
                                  }}
                                  className="w-12 h-7 text-center text-sm px-1"
                                  data-testid={`checkout-input-quantity-${item.product.id}`} />
                                <Button variant="outline" size="icon" className="h-7 w-7"
                                  onClick={() => {
                                    if (item.quantity >= maxStock) toast({ title: 'Maximum available quantity reached', variant: 'destructive' });
                                    else updateQuantity(item.product.id, item.quantity + 1, item.selectedColor?.hex);
                                  }}
                                  data-testid={`checkout-button-plus-${item.product.id}`}>
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>
                              <span className="text-sm font-semibold w-16 text-right shrink-0">{formatCurrency(item.product.price * item.quantity)}</span>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  removeFromCart(item.product.id, item.selectedColor?.hex);
                                  toast({ title: 'Item removed', description: `${item.product.name} removed from cart` });
                                }}
                                data-testid={`checkout-button-remove-${item.product.id}`}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {paymentError && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{paymentError}</AlertDescription>
                    </Alert>
                  )}

                  <Button className="w-full" size="lg"
                    disabled={!canProceedToPayment() || isProcessing}
                    onClick={createPaymentIntent}
                    data-testid="button-continue-to-payment">
                    {isProcessing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</>
                    ) : 'Continue to Payment'}
                  </Button>
                </div>
              )}

              {step === 2 && (
                <div className="animate-fade-in space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-display flex items-center gap-2">
                        <CreditCard className="w-5 h-5" />Payment Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {clientSecret ? (
                        <Elements stripe={stripePromise} options={{
                          clientSecret,
                          appearance: { theme: 'stripe', variables: { colorPrimary: '#14b8a6' } },
                        }}>
                          <PaymentForm
                            orderId={pendingOrderId || ''}
                            onSuccess={(orderId) => { clearCart(); navigate(`/thank-you?order=${orderId}`); }}
                            onError={(error) => setPaymentError(error)}
                            isProcessing={isProcessing}
                            setIsProcessing={setIsProcessing}
                            agreementsAccepted={agreementsAccepted}
                          />
                        </Elements>
                      ) : (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {paymentError && (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>{paymentError}</AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

            {/* Order summary sidebar */}
            <div className="lg:col-span-1">
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle className="font-display">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex items-center text-sm gap-0">
                      <span className="text-muted-foreground truncate min-w-0 flex-1">{item.product.name}</span>
                      <span className="shrink-0 text-muted-foreground w-10 text-right">×<span className="font-bold">{item.quantity}</span></span>
                      <span className="shrink-0 w-16 text-right">{formatCurrency(item.product.price * item.quantity)}</span>
                    </div>
                  ))}

                  <Separator />

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(cartTotal)}</span>
                  </div>

                  {/* Promo code */}
                  {step === 2 && (
                    <div className="space-y-2">
                      {appliedPromo ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-2 bg-green-50 rounded-lg border border-green-200">
                            <div className="flex items-center gap-2">
                              <Tag className="w-4 h-4 text-green-600" />
                              <div>
                                <span className="font-mono text-sm font-semibold text-green-700">{appliedPromo.code}</span>
                                <span className="text-xs text-green-600 ml-2">
                                  {appliedPromo.discountType === 'percentage' && `${appliedPromo.discountValue}% off`}
                                  {appliedPromo.discountType === 'fixed' && `$${appliedPromo.discountValue.toFixed(2)} off`}
                                  {appliedPromo.discountType === 'free_gift' && 'Free gift!'}
                                  {appliedPromo.discountType === 'gift_choice' && `Choose ${appliedPromo.giftSelectCount} free gift${(appliedPromo.giftSelectCount || 1) > 1 ? 's' : ''}`}
                                  {appliedPromo.discountType === 'combo' && 'Combo deal!'}
                                </span>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={removePromoCode}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          {appliedPromo.discountType === 'gift_choice' && appliedPromo.giftProducts && (
                            <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                              <p className="text-sm font-medium text-purple-800 mb-2">
                                Select {appliedPromo.giftSelectCount} free gift{(appliedPromo.giftSelectCount || 1) > 1 ? 's' : ''}:
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                {appliedPromo.giftProducts.slice(0, appliedPromo.giftPoolSize).map(product => {
                                  const isSelected = selectedGiftProductIds.includes(product.id);
                                  const canSelect = selectedGiftProductIds.length < (appliedPromo.giftSelectCount || 1);
                                  return (
                                    <button key={product.id} type="button"
                                      onClick={() => {
                                        if (isSelected) setSelectedGiftProductIds(p => p.filter(id => id !== product.id));
                                        else if (canSelect) setSelectedGiftProductIds(p => [...p, product.id]);
                                      }}
                                      className={`p-2 rounded-lg border text-left transition-all ${isSelected ? 'border-purple-500 bg-purple-100 ring-2 ring-purple-300' : canSelect ? 'border-gray-200 hover:border-purple-300 bg-white' : 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'}`}
                                      disabled={!isSelected && !canSelect}
                                      data-testid={`gift-product-${product.id}`}>
                                      <div className="flex items-center gap-2">
                                        {product.images?.[0] && <img src={product.images[0]} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />}
                                        <div className="min-w-0">
                                          <div className="text-xs font-mono text-muted-foreground">{product.code}</div>
                                          <div className="text-sm font-medium truncate">{product.name}</div>
                                        </div>
                                        {isSelected && <Check className="w-4 h-4 text-purple-600 ml-auto flex-shrink-0" />}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="text-xs text-purple-600 mt-2">{selectedGiftProductIds.length} of {appliedPromo.giftSelectCount} selected</p>
                            </div>
                          )}
                          {appliedPromo.discountType === 'free_gift' && appliedPromo.giftProducts && (
                            <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                              <p className="text-sm font-medium text-purple-800 mb-2">Your free gift{(appliedPromo.giftQuantity || 1) > 1 ? 's' : ''}:</p>
                              {appliedPromo.giftProducts.map(product => (
                                <div key={product.id} className="flex items-center gap-2 p-2 bg-white rounded border border-purple-200">
                                  {product.images?.[0] && <img src={product.images[0]} alt="" className="w-10 h-10 rounded object-cover" />}
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground">{product.code}</div>
                                    <div className="text-sm font-medium">{product.name}</div>
                                  </div>
                                  <div className="ml-auto text-xs text-purple-600 font-medium">FREE</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Input placeholder="Promo code" value={promoCode}
                            onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(''); }}
                            onKeyDown={e => e.key === 'Enter' && validatePromoCode()}
                            className="flex-1 font-mono text-sm" data-testid="input-promo-code-checkout" />
                          <Button variant="outline" size="sm" onClick={validatePromoCode}
                            disabled={promoCodeValidating || !promoCode.trim()} data-testid="button-apply-promo">
                            {promoCodeValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                          </Button>
                        </div>
                      )}
                      {promoError && <p className="text-xs text-destructive">{promoError}</p>}
                    </div>
                  )}

                  {appliedPromo && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount</span>
                      <span>-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}

                  {shippingCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Shipping</span>
                      <span>{formatCurrency(shippingCost)}</span>
                    </div>
                  )}
                  {shippingCost === 0 && fulfillmentType === 'ship' && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Shipping</span>
                      <span>Free</span>
                    </div>
                  )}
                  {fulfillmentType === 'pickup' && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>In-Store Pickup</span>
                      <span>Free</span>
                    </div>
                  )}

                  {taxEnabled && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax ({(taxRatePercent * 100).toFixed(1).replace(/\.0$/, '')}% {taxLabel})</span>
                      <span>{formatCurrency(taxAmount)}</span>
                    </div>
                  )}

                  <Separator />

                  <div className="flex justify-between font-display font-semibold text-lg">
                    <span>Total</span>
                    <span data-testid="text-order-total">{formatCurrency(orderTotal)}</span>
                  </div>

                  {/* Agreements */}
                  {step === 2 && (
                    <div className="flex items-start gap-2 pt-2">
                      <Checkbox id="agreements" checked={agreementsAccepted}
                        onCheckedChange={c => setAgreementsAccepted(c === true)}
                        data-testid="checkbox-agreements" />
                      <label htmlFor="agreements" className="text-sm leading-tight cursor-pointer">
                        I agree to the{' '}
                        <button type="button" className="text-primary underline hover:no-underline"
                          onClick={() => { const a = agreements.find(a => a.key === 'terms'); if (a) setViewingAgreement(a); }}
                          data-testid="link-terms">Terms of Service</button>,{' '}
                        <button type="button" className="text-primary underline hover:no-underline"
                          onClick={() => { const a = agreements.find(a => a.key === 'refund'); if (a) setViewingAgreement(a); }}
                          data-testid="link-refund">Refund Policy</button>
                        {fulfillmentType === 'pickup' && (<>, and{' '}
                          <button type="button" className="text-primary underline hover:no-underline"
                            onClick={() => { const a = agreements.find(a => a.key === 'host_handoff'); if (a) setViewingAgreement(a); }}
                            data-testid="link-host-handoff">Pickup Policy</button></>)}
                      </label>
                    </div>
                  )}

                  {step > 1 && (
                    <Button variant="ghost" className="w-full"
                      onClick={() => { setStep(1); setClientSecret(null); setPendingOrderId(null); setPaymentError(null); }}
                      data-testid="button-back-step">
                      ← Back
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* Agreement viewer */}
      <Dialog open={!!viewingAgreement} onOpenChange={() => setViewingAgreement(null)}>
        <DialogContent className="max-w-3xl w-[90vw] h-[85vh] max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="font-display">{viewingAgreement?.title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-4">
            <div className="text-sm text-muted-foreground whitespace-pre-wrap pr-2">{viewingAgreement?.content}</div>
          </ScrollArea>
          <div className="flex justify-end pt-4 border-t flex-shrink-0">
            <Button onClick={() => setViewingAgreement(null)} data-testid="button-close-agreement">Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
