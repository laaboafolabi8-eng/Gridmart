import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { loadGoogleMaps, GRIDMART_MAP_STYLES } from '@/lib/googleMaps';
import { CreditCard, Clock, Check, ShoppingBag, MapPin, Package, Loader2, Shield, AlertTriangle, FileText, X, Tag, Trash2, Plus, Minus } from 'lucide-react';
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
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { TimeSlotPicker, type PickupSlot } from '@/components/checkout/TimeSlotPicker';
import { useCart, useOrders, useServingCities, useSelectedNode } from '@/lib/store';
import { formatCurrency, type Node } from '@/lib/mockData';
import { useAuth } from '@/lib/auth';

interface Agreement {
  id: string;
  key: string;
  title: string;
  content: string;
  updatedAt: string;
}

type SlotCacheStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SlotCache {
  status: SlotCacheStatus;
  slots: PickupSlot[];
}

const ZONE_COLORS = ['#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#22c55e'];

function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs((Math.sin(hash) * 10000) % 1);
}

function generateOffsetCenter(lat: number, lng: number, nodeId: string | number): [number, number] {
  const maxOffsetKm = 0.4;
  const id = String(nodeId);
  const angle = seededRandom(id + 'angle') * 2 * Math.PI;
  const distance = seededRandom(id + 'dist') * maxOffsetKm;
  const latOffset = (distance * Math.cos(angle)) / 111;
  const lngOffset = (distance * Math.sin(angle)) / (111 * Math.cos(lat * Math.PI / 180));
  return [lat + latOffset, lng + lngOffset];
}

function formatTime12h(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function formatSlotDay(dateStr: string): { label: string; subLabel: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Parse date string as local date (not UTC) by splitting components
  // "2026-01-22" should be Jan 22 local time, not UTC midnight which shifts back a day
  const [year, month, day] = dateStr.split('-').map(Number);
  const slotDate = new Date(year, month - 1, day);
  slotDate.setHours(0, 0, 0, 0);
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const formattedDate = `${monthNames[slotDate.getMonth()]} ${slotDate.getDate()}`;
  
  if (slotDate.getTime() === today.getTime()) {
    return { label: 'Today', subLabel: formattedDate };
  }
  if (slotDate.getTime() === tomorrow.getTime()) {
    return { label: 'Tomorrow', subLabel: formattedDate };
  }
  return { label: dayNames[slotDate.getDay()], subLabel: formattedDate };
}

interface PaymentFormProps {
  orderId: string;
  onSuccess: (orderId: string) => void;
  onError: (error: string) => void;
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
  agreementsAccepted: boolean;
}

function PaymentForm({ orderId, onSuccess, onError, isProcessing, setIsProcessing, agreementsAccepted }: PaymentFormProps) {
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
      confirmParams: {
        return_url: window.location.origin + `/thank-you?order=${orderId}`,
      },
      redirect: 'if_required',
    });
    
    if (error) {
      onError(error.message || 'Payment failed. Please try again.');
      setIsProcessing(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      // Confirm payment on backend
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
        onError('Payment confirmation failed');
        setIsProcessing(false);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement 
        options={{
          layout: 'tabs',
        }}
      />
      <Button 
        type="submit" 
        className="w-full" 
        disabled={!stripe || isProcessing}
        data-testid="button-pay"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4 mr-2" />
            Pay Now
          </>
        )}
      </Button>
    </form>
  );
}

export default function Checkout() {
  const [, navigate] = useLocation();
  const { cart, cartTotal, clearCart, removeFromCart, updateQuantity } = useCart();
  const { createOrder } = useOrders();
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const { selectedCity } = useServingCities();
  const { selectedNodeId: homepageSelectedNodeId } = useSelectedNode();
  
  const [step, setStep] = useState(1);
  // Fetch site settings for tax configuration
  const { data: siteSettings } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) throw new Error('Failed to fetch site settings');
      return res.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  const taxEnabled = siteSettings?.taxEnabled !== 'false';
  const taxRatePercent = parseFloat(siteSettings?.taxRate || '13') / 100;
  const taxLabel = siteSettings?.taxLabel || 'HST';

  const nodeColors = useMemo(() => {
    try { return siteSettings?.nodeColors ? JSON.parse(siteSettings.nodeColors) as Record<string, string> : {}; } catch { return {}; }
  }, [siteSettings?.nodeColors]);
  const nodeBorderColors = useMemo(() => {
    try { return siteSettings?.nodeBorderColors ? JSON.parse(siteSettings.nodeBorderColors) as Record<string, string> : {}; } catch { return {}; }
  }, [siteSettings?.nodeBorderColors]);
  const nodeOpacities = useMemo(() => {
    try { return siteSettings?.nodeOpacities ? JSON.parse(siteSettings.nodeOpacities) as Record<string, number> : {}; } catch { return {}; }
  }, [siteSettings?.nodeOpacities]);
  const nodeStrokeOpacities = useMemo(() => {
    try { return siteSettings?.nodeStrokeOpacities ? JSON.parse(siteSettings.nodeStrokeOpacities) as Record<string, number> : {}; } catch { return {}; }
  }, [siteSettings?.nodeStrokeOpacities]);

  const [availableNodes, setAvailableNodes] = useState<Node[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<PickupSlot | null>(null);
  const [nodeSlotsCache, setNodeSlotsCache] = useState<Record<string, SlotCache>>({});
  const [nodeItemAvailability, setNodeItemAvailability] = useState<Record<string, { node: Node; availableItems: number[]; missingItems: number[]; partialStock: Record<number, { available: number; requested: number }> }>>({});
  const [showConsolidation, setShowConsolidation] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const checkoutMapRef = useRef<HTMLDivElement>(null);
  const checkoutMapInstanceRef = useRef<google.maps.Map | null>(null);
  const checkoutMapCirclesRef = useRef<google.maps.Circle[]>([]);
  const [buyerInfo, setBuyerInfo] = useState({ name: '', email: '', phone: '' });
  const [pickupInfo, setPickupInfo] = useState({ alternateName: '', alternatePhone: '', vehicleMakeColor: '' });
  
  useEffect(() => {
    window.scrollTo(0, 0);
    loadGoogleMaps().then(() => setMapsReady(true)).catch(console.error);
  }, []);

  useEffect(() => {
    if (user) {
      setBuyerInfo({
        name: user.name || '',
        email: user.email?.includes('@phone.gridmart.ca') ? '' : (user.email || ''),
        phone: user.phone || '',
      });
    }
  }, [user]);
  const [liveProducts, setLiveProducts] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSearching, setIsSearching] = useState(true);
  const [searchComplete, setSearchComplete] = useState(false);
  const [removedItems, setRemovedItems] = useState<string[]>([]);
  const [cartValidated, setCartValidated] = useState(false);
  const [agreementsAccepted, setAgreementsAccepted] = useState(false);
  const [viewingAgreement, setViewingAgreement] = useState<Agreement | null>(null);
  const [previewingSlotsNodeId, setPreviewingSlotsNodeId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoCodeValidating, setPromoCodeValidating] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{
    id: string;
    code: string;
    name: string;
    discountType: 'percentage' | 'fixed' | 'free_gift' | 'gift_choice' | 'combo';
    discountValue: number;
    discountAmount: number;
    giftProductIds?: string[];
    giftQuantity?: number;
    giftPoolSize?: number;
    giftSelectCount?: number;
    giftProducts?: Array<{ id: string; name: string; code: string; images: string[]; price: string }>;
    benefits?: any[];
    comboBenefits?: any[];
  } | null>(null);
  const [selectedGiftProductIds, setSelectedGiftProductIds] = useState<string[]>([]);
  const [promoError, setPromoError] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const { data: agreements = [] } = useQuery<Agreement[]>({
    queryKey: ['agreements'],
    queryFn: async () => {
      const res = await fetch('/api/agreements');
      if (!res.ok) return [];
      return res.json();
    },
  });

  useEffect(() => {
    if (cart.length > 0 && step === 1 && !searchComplete) {
      validateAndFindNodes();
    }
  }, [cart, step]);

  useEffect(() => {
    if (showConsolidation && cartValidated && step === 1) {
      validateAndFindNodes();
    }
  }, [cart.length]);

  useEffect(() => {
    if (selectedNode) {
      const cache = nodeSlotsCache[selectedNode.id];
      if (!cache || cache.status === 'idle') {
        fetchPickupSlots(selectedNode.id);
      }
    }
  }, [selectedNode]);

  const fetchPickupSlots = async (nodeId: string) => {
    setNodeSlotsCache(prev => ({
      ...prev,
      [nodeId]: { status: 'loading', slots: [] }
    }));
    setSelectedSlot(null);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/pickup-slots`);
      const data = await res.json();
      const now = new Date();
      const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const todayDate = now.toISOString().split('T')[0];
      const cutoffDate = cutoff.toISOString().split('T')[0];
      const filtered = (data.slots || []).filter((s: any) => s.date >= todayDate && s.date < cutoffDate);
      setNodeSlotsCache(prev => ({
        ...prev,
        [nodeId]: { status: 'ready', slots: filtered }
      }));
    } catch (error) {
      console.error('Error fetching pickup slots:', error);
      setNodeSlotsCache(prev => ({
        ...prev,
        [nodeId]: { status: 'error', slots: [] }
      }));
    }
  };

  const getPickupSlotsForSelectedNode = (): PickupSlot[] => {
    if (!selectedNode) return [];
    return nodeSlotsCache[selectedNode.id]?.slots || [];
  };

  const isLoadingSlots = selectedNode ? 
    nodeSlotsCache[selectedNode.id]?.status === 'loading' : false;

  // Auto-fetch pickup slots when a node is selected
  useEffect(() => {
    if (selectedNode && !nodeSlotsCache[selectedNode.id]) {
      fetchPickupSlots(selectedNode.id);
    }
  }, [selectedNode?.id]);

  // Pre-fetch pickup slots for all available nodes so we can show earliest time upfront
  useEffect(() => {
    availableNodes.forEach(node => {
      if (!nodeSlotsCache[node.id]) {
        fetchPickupSlots(node.id);
      }
    });
  }, [availableNodes]);

  useEffect(() => {
    if (selectedNode || availableNodes.length === 0) return;
    if (homepageSelectedNodeId) {
      const homepageNode = availableNodes.find(n => n.id === homepageSelectedNodeId);
      if (homepageNode) {
        setSelectedNode(homepageNode);
        return;
      }
    }
    const nodeWithSlots = availableNodes.find(node => {
      const cache = nodeSlotsCache[node.id];
      return cache?.status === 'ready' && cache.slots.length > 0;
    });
    if (nodeWithSlots) {
      setSelectedNode(nodeWithSlots);
    }
  }, [availableNodes, nodeSlotsCache, selectedNode, homepageSelectedNodeId]);

  useEffect(() => {
    if (!checkoutMapRef.current || availableNodes.length === 0 || !mapsReady) return;

    checkoutMapCirclesRef.current.forEach(c => c.setMap(null));
    checkoutMapCirclesRef.current = [];

    const validNodes = availableNodes.filter(n => n.latitude && n.longitude);
    if (validNodes.length === 0) return;

    const cityMapLat = selectedCity?.mapLat || selectedCity?.latitude;
    const cityMapLng = selectedCity?.mapLng || selectedCity?.longitude;
    const cityMapZoom = selectedCity?.mapZoom;
    const mapLat = cityMapLat ? parseFloat(cityMapLat) : (siteSettings?.mapLat ? parseFloat(siteSettings.mapLat) : validNodes.reduce((s, n) => s + Number(n.latitude), 0) / validNodes.length);
    const mapLng = cityMapLng ? parseFloat(cityMapLng) : (siteSettings?.mapLng ? parseFloat(siteSettings.mapLng) : validNodes.reduce((s, n) => s + Number(n.longitude), 0) / validNodes.length);
    const mapZoom = cityMapZoom ? parseInt(cityMapZoom, 10) : parseInt(siteSettings?.mapZoom || (validNodes.length === 1 ? '13' : '11'), 10);
    const circleRadius = parseInt(siteSettings?.nodeCircleSize || '500', 10);

    const map = new google.maps.Map(checkoutMapRef.current, {
      center: { lat: mapLat, lng: mapLng },
      zoom: mapZoom,
      styles: GRIDMART_MAP_STYLES,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'cooperative',
    });
    checkoutMapInstanceRef.current = map;

    validNodes.forEach((node, idx) => {
      const lat = Number(node.latitude);
      const lng = Number(node.longitude);
      const [circleLat, circleLng] = generateOffsetCenter(lat, lng, node.id);
      const color = nodeColors[String(node.id)] || ZONE_COLORS[idx % ZONE_COLORS.length];
      const borderColor = nodeBorderColors[String(node.id)] || color;
      const fillOp = nodeOpacities[String(node.id)] ?? 0.2;
      const strokeOp = nodeStrokeOpacities[String(node.id)] ?? 1;
      const isSelected = selectedNode?.id === node.id;

      const circle = new google.maps.Circle({
        center: { lat: circleLat, lng: circleLng },
        radius: circleRadius,
        strokeColor: isSelected ? '#f59e0b' : borderColor,
        fillColor: isSelected ? '#f59e0b' : color,
        fillOpacity: isSelected ? 0.4 : fillOp,
        strokeOpacity: isSelected ? 1 : strokeOp,
        strokeWeight: isSelected ? 4 : 2,
        map,
        clickable: true,
      });

      circle.addListener('click', () => {
        if (selectedNode?.id !== node.id) {
          setSelectedSlot(null);
        }
        setSelectedNode(node);
        const cache = nodeSlotsCache[node.id];
        if (!cache || cache.status === 'idle') {
          fetchPickupSlots(node.id);
        }
        setPreviewingSlotsNodeId(node.id);
      });

      checkoutMapCirclesRef.current.push(circle);
    });

    return () => {
      checkoutMapCirclesRef.current.forEach(c => c.setMap(null));
      checkoutMapCirclesRef.current = [];
      checkoutMapInstanceRef.current = null;
    };
  }, [availableNodes, mapsReady, selectedNode?.id, nodeColors, nodeBorderColors, nodeOpacities, nodeStrokeOpacities, siteSettings?.mapLat, siteSettings?.mapLng, siteSettings?.mapZoom, siteSettings?.nodeCircleSize, selectedCity]);

  const validateAndFindNodes = async () => {
    setIsSearching(true);
    setSearchComplete(false);
    try {
      const [productsRes, nodesRes] = await Promise.all([
        fetch('/api/products?live=true'),
        fetch('/api/nodes')
      ]);
      const products = await productsRes.json();
      const nodes = await nodesRes.json();
      setLiveProducts(products);
      
      // Step 1: Validate cart items against live products
      const liveProductIds = new Set(products.map((p: any) => p.id));
      const invalidItems: string[] = [];
      
      for (const cartItem of cart) {
        if (!liveProductIds.has(cartItem.product.id)) {
          invalidItems.push(cartItem.product.name);
          removeFromCart(cartItem.product.id, cartItem.selectedColor?.hex);
        }
      }
      
      if (invalidItems.length > 0) {
        setRemovedItems(invalidItems);
      }
      setCartValidated(true);
      
      // Get current valid cart after removal
      const validCartItems = cart.filter(item => liveProductIds.has(item.product.id));
      
      if (validCartItems.length === 0) {
        setAvailableNodes([]);
        setSearchComplete(true);
        setIsSearching(false);
        return;
      }
      
      const cityName = selectedCity?.name || '';
      const activeNodes = nodes.filter((n: Node) => 
        n.status === 'active' && (!n.city || !cityName || n.city.includes(cityName))
      );
      const nodesWithStock: Node[] = [];
      const perNodeAvailability: Record<string, { node: Node; availableItems: number[]; missingItems: number[]; partialStock: Record<number, { available: number; requested: number }> }> = {};
      
      for (const node of activeNodes) {
        let hasAllProducts = true;
        const available: number[] = [];
        const missing: number[] = [];
        const partialStock: Record<number, { available: number; requested: number }> = {};
        
        for (const cartItem of validCartItems) {
          const product = products.find((p: any) => p.id === cartItem.product.id);
          if (product) {
            const nodeInventory = product.inventory?.find((inv: any) => inv.nodeId === node.id);
            if (nodeInventory && nodeInventory.quantity >= cartItem.quantity) {
              available.push(cartItem.product.id);
            } else {
              missing.push(cartItem.product.id);
              hasAllProducts = false;
              if (nodeInventory && nodeInventory.quantity > 0 && nodeInventory.quantity < cartItem.quantity) {
                partialStock[cartItem.product.id] = { available: nodeInventory.quantity, requested: cartItem.quantity };
              }
            }
          } else {
            missing.push(cartItem.product.id);
            hasAllProducts = false;
          }
        }
        
        if (available.length > 0 || Object.keys(partialStock).length > 0) {
          perNodeAvailability[node.id] = { node, availableItems: available, missingItems: missing, partialStock };
        }
        
        if (hasAllProducts) {
          nodesWithStock.push(node);
        }
      }
      
      setNodeItemAvailability(perNodeAvailability);
      setAvailableNodes(nodesWithStock);
      setShowConsolidation(nodesWithStock.length === 0 && Object.keys(perNodeAvailability).length > 0);
      setSearchComplete(true);
    } catch (error) {
      console.error('Error finding nodes:', error);
      setSearchComplete(true);
    }
    setIsSearching(false);
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
            <Link href="/">
              <Button>Start Shopping</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const validatePromoCode = async () => {
    if (!promoCode.trim()) return;
    setPromoCodeValidating(true);
    setPromoError('');
    try {
      const res = await fetch('/api/promo-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim(), orderTotal: cartTotal, nodeId: selectedNode?.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoError(data.error || 'Invalid promo code');
        setAppliedPromo(null);
      } else {
        const promo = data.promoCode;
        setAppliedPromo({
          id: promo.id,
          code: promo.code,
          name: promo.name,
          discountType: promo.discountType,
          discountValue: parseFloat(promo.discountValue) || 0,
          discountAmount: data.discountAmount || 0,
          giftProductIds: promo.giftProductIds,
          giftQuantity: promo.giftQuantity,
          giftPoolSize: promo.giftPoolSize,
          giftSelectCount: promo.giftSelectCount,
          giftProducts: data.giftProducts,
          benefits: promo.benefits,
          comboBenefits: data.comboBenefits,
        });
        setSelectedGiftProductIds([]);
        setPromoError('');
      }
    } catch {
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

  const discountAmount = appliedPromo?.discountAmount || 0;
  const subtotalAfterDiscount = cartTotal - discountAmount;
  const taxAmount = taxEnabled ? subtotalAfterDiscount * taxRatePercent : 0;
  const orderTotal = subtotalAfterDiscount + taxAmount;

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setBuyerInfo({ ...buyerInfo, phone: formatted });
  };

  const createPaymentIntent = async () => {
    if (!user) return;
    // Use user's name if they have one (Google login), otherwise use entered name
    const buyerName = buyerInfo.name.trim() || user.name || 'Customer';
    const buyerEmail = user.email?.includes('@phone.gridmart.ca') ? '' : (user.email || '');
    // User's phone from their profile
    const buyerPhone = user.phone?.replace(/\D/g, '') || '';
    // If alternate pickup person, use their name and optional phone
    const pickupName = pickupInfo.alternateName.trim() || buyerName;
    const pickupPhone = pickupInfo.alternatePhone.replace(/\D/g, '') || buyerPhone;
    
    if (!selectedNode || !selectedSlot) return;
    
    setIsProcessing(true);
    setPaymentError(null);
    
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
          nodeId: selectedNode.id,
          scheduledDate: selectedSlot.date,
          scheduledTime: `${selectedSlot.startTime}-${selectedSlot.endTime}`,
          buyerName,
          buyerEmail,
          buyerPhone,
          pickupPersonName: pickupName,
          pickupPersonPhone: pickupPhone,
          vehicleInfo: pickupInfo.vehicleMakeColor.trim() || undefined,
          promoCodeId: appliedPromo?.id || null,
          giftProductIds: (() => {
            if (appliedPromo?.discountType === 'gift_choice') {
              return selectedGiftProductIds;
            } else if (appliedPromo?.discountType === 'free_gift') {
              return appliedPromo.giftProductIds || [];
            } else if (appliedPromo?.discountType === 'combo' && appliedPromo.comboBenefits) {
              // Collect all gift IDs from combo benefits
              const allGiftIds: string[] = [];
              appliedPromo.comboBenefits.forEach((benefit: any) => {
                if (benefit.type === 'free_gift' && benefit.products) {
                  benefit.products.forEach((p: any) => allGiftIds.push(p.id));
                } else if (benefit.type === 'gift_choice') {
                  // Use selectedGiftProductIds for gift_choice within combo
                  selectedGiftProductIds.forEach(id => allGiftIds.push(id));
                }
              });
              return allGiftIds;
            }
            return [];
          })(),
        }),
      });
      
      const result = await response.json();
      
      if (response.status === 401) {
        alert('Please log in to complete your purchase');
        navigate('/login?redirect=/checkout');
        setIsProcessing(false);
        return;
      }
      
      if (result.clientSecret) {
        setClientSecret(result.clientSecret);
        setPendingOrderId(result.orderId);
        setStep(2);
      } else if (result.error) {
        setPaymentError(result.error);
      }
    } catch (error: any) {
      console.error('Payment intent error:', error);
      setPaymentError('Failed to initialize payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayment = async () => {
    // This is now handled by the PaymentForm component
  };

  const canProceed = () => {
    if (step === 1) {
      if (!selectedNode || !selectedSlot || !user) return false;
      if (user.type === 'node') return false;
      // Check name is provided (user.name for Google users, buyerInfo.name for others)
      const hasName = user.name?.trim() || buyerInfo.name?.trim();
      // If alternate pickup person specified, their phone is optional but if provided must be valid
      if (pickupInfo.alternateName.trim() && pickupInfo.alternatePhone.trim()) {
        const alternatePhoneValid = pickupInfo.alternatePhone.replace(/\D/g, '').length === 10;
        if (!alternatePhoneValid) return false;
      }
      return !!hasName;
    }
    if (step === 2) {
      // User must be logged in and accept agreements
      return user !== null && agreementsAccepted;
    }
    return false;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <h1 className="font-display text-3xl font-bold mb-6" data-testid="text-cart-title">
            {step === 1 ? 'Choose Pickup Location and Time' : 'Payment'}
          </h1>

          {removedItems.length > 0 && (
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Some items were removed from your cart</AlertTitle>
              <AlertDescription>
                The following items are no longer available and have been removed:
                <ul className="list-disc list-inside mt-2">
                  {removedItems.map((item, index) => (
                    <li key={index} className="text-sm">{item}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className={step === 1 ? "lg:col-span-3" : "lg:col-span-2"}>
              {step === 1 && (
                <div className="animate-fade-in space-y-6">
                  {/* Pickup Location Selection */}
                  <p className="text-muted-foreground mb-3">Select a node to view full availability</p>
                  {isSearching ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                        <p className="text-muted-foreground">Finding available pickup locations...</p>
                      </CardContent>
                    </Card>
                  ) : availableNodes.length > 0 ? (
                    <div className="space-y-3">
                      <div
                        ref={checkoutMapRef}
                        className="w-full min-h-[400px] rounded-lg border overflow-hidden"
                        data-testid="checkout-map"
                      />
                      <div className="flex flex-wrap gap-2">
                        {availableNodes.map((node, idx) => {
                          const cache = nodeSlotsCache[node.id];
                          const isSelected = selectedNode?.id === node.id;

                          let timeLabel: React.ReactNode = null;
                          if (!cache || cache.status === 'idle') {
                            timeLabel = <span className="text-[10px] text-muted-foreground">View times</span>;
                          } else if (cache.status === 'loading') {
                            timeLabel = <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />;
                          } else if (cache.status === 'error') {
                            timeLabel = <span className="text-[10px] text-destructive">Error</span>;
                          } else if (cache.slots.length === 0) {
                            timeLabel = <span className="text-[10px] text-amber-600">No times</span>;
                          } else if (isSelected && selectedSlot) {
                            const { label } = formatSlotDay(selectedSlot.date);
                            timeLabel = (
                              <span className="text-[10px] text-primary font-medium">
                                {label} {formatTime12h(selectedSlot.startTime)}
                              </span>
                            );
                          } else {
                            const earliest = cache.slots[0];
                            const { label } = formatSlotDay(earliest.date);
                            timeLabel = (
                              <span className="text-[10px] text-muted-foreground">
                                {label} {formatTime12h(earliest.startTime)}
                              </span>
                            );
                          }

                          return (
                            <button
                              key={node.id}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-md border text-left transition-all hover:border-primary/50 ${
                                isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border'
                              }`}
                              onClick={() => {
                                if (!isSelected) setSelectedSlot(null);
                                setSelectedNode(node);
                                if (node.latitude && node.longitude && checkoutMapInstanceRef.current) {
                                  checkoutMapInstanceRef.current.panTo({ lat: Number(node.latitude), lng: Number(node.longitude) });
                                  checkoutMapInstanceRef.current.setZoom(Math.max(checkoutMapInstanceRef.current.getZoom() || 12, 13));
                                }
                                if (!cache || cache.status === 'idle') fetchPickupSlots(node.id);
                                setPreviewingSlotsNodeId(node.id);
                              }}
                              data-testid={`card-node-${node.id}`}
                            >
                              <div className="min-w-0">
                                <div className={`text-xs font-medium truncate ${isSelected ? 'text-primary' : ''}`}>{node.name}</div>
                                <div className="truncate">{timeLabel}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : showConsolidation ? null : (
                    <Card className="border-destructive/50 bg-destructive/5">
                      <CardContent className="py-8 text-center">
                        <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="font-display font-semibold text-lg mb-2">No Pickup Location Available</h3>
                        <p className="text-muted-foreground mb-4">
                          No location currently has any of your items in stock.
                        </p>
                        <Link href="/">
                          <Button variant="outline" className="gap-2">
                            <ShoppingBag className="w-4 h-4" />
                            Browse Products
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  )}

                  {showConsolidation && (() => {
                    const hasOnlyPartialStock = Object.values(nodeItemAvailability).every(
                      ({ availableItems }) => availableItems.length === 0
                    );
                    const allPartialEntries = Object.values(nodeItemAvailability).flatMap(
                      ({ partialStock }) => Object.entries(partialStock)
                    );
                    const isQuantityIssue = hasOnlyPartialStock && allPartialEntries.length > 0;
                    return (
                    <Card className="border-amber-300/50 bg-amber-50/30">
                      <CardContent className="py-6">
                        <div className="text-center mb-4">
                          <Package className="w-10 h-10 text-amber-600 mx-auto mb-2" />
                          <h3 className="font-display font-semibold text-lg">
                            {isQuantityIssue
                              ? "Requested quantity exceeds availability"
                              : "No single location has all your items"}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {isQuantityIssue
                              ? "Some locations have this item, but not in the quantity you selected. Here's what's currently available:"
                              : "Choose a location below and we'll show which items are available there. You can remove unavailable items to proceed."}
                          </p>
                        </div>
                        <div className="space-y-3">
                          {Object.values(nodeItemAvailability)
                            .sort((a, b) => {
                              const aPartialMax = Math.max(0, ...Object.values(a.partialStock).map(p => p.available));
                              const bPartialMax = Math.max(0, ...Object.values(b.partialStock).map(p => p.available));
                              if (b.availableItems.length !== a.availableItems.length) return b.availableItems.length - a.availableItems.length;
                              return bPartialMax - aPartialMax;
                            })
                            .map(({ node, availableItems, missingItems: rawMissing, partialStock }) => {
                            const missingItems = rawMissing.filter(id => cart.some(c => c.product.id === id));
                            const currentCartIds = cart.map(c => c.product.id);
                            const currentAvailable = availableItems.filter(id => currentCartIds.includes(id));
                            return (
                            <Card 
                              key={node.id}
                              className={`cursor-pointer transition-all hover:border-primary/50 ${
                                selectedNode?.id === node.id ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : ''
                              }`}
                              onClick={() => {
                                setSelectedNode(node);
                                setSelectedSlot(null);
                                const cache = nodeSlotsCache[node.id];
                                if (!cache || cache.status === 'idle') {
                                  fetchPickupSlots(node.id);
                                }
                              }}
                              data-testid={`card-consolidation-node-${node.id}`}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                                    selectedNode?.id === node.id ? 'border-primary bg-primary' : 'border-muted-foreground'
                                  }`}>
                                    {selectedNode?.id === node.id && (
                                      <Check className="w-3 h-3 text-white" />
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <h3 className="font-display font-semibold">{node.name}</h3>
                                      <Badge variant={missingItems.length === 0 ? "default" : "secondary"} className="text-xs">
                                        {currentAvailable.length === 0 && Object.keys(partialStock).length > 0
                                          ? Object.values(partialStock).map(p => `${p.available} in stock`).join(', ')
                                          : `${currentAvailable.length}/${currentAvailable.length + missingItems.length} items`
                                        }
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{node.city}</p>
                                    
                                    {(selectedNode?.id === node.id || isQuantityIssue) && missingItems.length > 0 && (
                                      <div className="mt-3 space-y-2">
                                        <div className="text-xs font-medium text-amber-700">
                                          {missingItems.some(id => partialStock[id]) ? "Stock issues at this location:" : "Unavailable at this location:"}
                                        </div>
                                        {cart.filter(item => missingItems.includes(item.product.id)).map(item => {
                                          const partial = partialStock[item.product.id];
                                          return (
                                          <div key={item.product.id} className="flex items-center justify-between bg-amber-50 rounded-lg p-2 border border-amber-200">
                                            <div className="flex items-center gap-2">
                                              {item.product.images?.[0] && (
                                                <img src={item.product.images[0]} alt="" className="w-8 h-8 rounded object-cover" />
                                              )}
                                              <div className="flex flex-col">
                                                <span className="text-sm">{item.product.name}</span>
                                                {partial ? (
                                                  <span className="text-xs text-amber-600">
                                                    Only {partial.available} in stock (you need {partial.requested})
                                                  </span>
                                                ) : (
                                                  <span className="text-xs text-muted-foreground">Not available here</span>
                                                )}
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                              {partial && partial.available > 0 && (
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    updateQuantity(item.product.id, partial.available, item.selectedColor?.hex);
                                                    toast({
                                                      title: "Quantity updated",
                                                      description: `${item.product.name} reduced to ${partial.available}`,
                                                    });
                                                  }}
                                                  data-testid={`button-reduce-qty-${item.product.id}`}
                                                >
                                                  Reduce to {partial.available}
                                                </Button>
                                              )}
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  removeFromCart(item.product.id, item.selectedColor?.hex);
                                                  toast({
                                                    title: "Item removed",
                                                    description: `${item.product.name} removed from cart`,
                                                  });
                                                }}
                                                data-testid={`button-remove-unavailable-${item.product.id}`}
                                              >
                                                <X className="w-3 h-3 mr-1" />
                                                Remove
                                              </Button>
                                            </div>
                                          </div>
                                          );
                                        })}
                                        <p className="text-xs text-muted-foreground">
                                          {missingItems.some(id => partialStock[id]) 
                                            ? "Reduce quantity or remove items to checkout from this location."
                                            : "Remove unavailable items to checkout from this location."}
                                        </p>
                                      </div>
                                    )}
                                    
                                    {selectedNode?.id === node.id && missingItems.length === 0 && (
                                      <div className="mt-3 space-y-3">
                                        <div className="text-xs text-green-600 font-medium flex items-center gap-1">
                                          <Check className="w-3 h-3" />
                                          All items in your cart are available here
                                        </div>
                                        <Button
                                          size="sm"
                                          className="gap-1"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setPreviewingSlotsNodeId(node.id);
                                          }}
                                          data-testid={`button-view-times-${node.id}`}
                                        >
                                          <Clock className="w-3.5 h-3.5" />
                                          Choose Pickup Time
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                          })}
                        </div>
                        {selectedNode && selectedSlot && (
                          <div className="mt-4 flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                            <Check className="w-5 h-5 text-primary shrink-0" />
                            <div className="flex-1">
                              <div className="font-medium text-sm">
                                {selectedNode.name} — {(() => {
                                  const d = new Date(selectedSlot.date + 'T00:00:00');
                                  const today = new Date(); today.setHours(0,0,0,0);
                                  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
                                  const dayLabel = d.getTime() === today.getTime() ? 'Today' : d.getTime() === tomorrow.getTime() ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                                  return dayLabel;
                                })()}, {formatTime12h(selectedSlot.startTime)} – {formatTime12h(selectedSlot.endTime)}
                              </div>
                              <div className="text-xs text-muted-foreground">Pickup time selected</div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    );
                  })()}
                  
                  {/* Editable Cart Items */}
                  {cart.length > 0 && (
                    <Card>
                      <CardContent className="p-4">
                        <h3 className="font-display font-semibold text-sm mb-3">Your Cart ({cart.length} {cart.length === 1 ? 'item' : 'items'})</h3>
                        <div className="space-y-3">
                          {cart.map((item) => {
                            const invStock = item.product.inventory.reduce((sum: number, inv: any) => sum + inv.quantity, 0);
                            const maxStock = invStock > 0 ? invStock : (item.product.sheetQuantity || 0);
                            return (
                              <div key={`${item.product.id}-${item.selectedColor?.hex || ''}`} className="flex items-center gap-3 py-2 border-b last:border-b-0" data-testid={`checkout-cart-item-${item.product.id}`}>
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
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.selectedColor?.hex)}
                                    data-testid={`checkout-button-minus-${item.product.id}`}
                                  >
                                    <Minus className="w-3 h-3" />
                                  </Button>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const newQty = parseInt(e.target.value) || 1;
                                      if (newQty > maxStock) {
                                        toast({ title: "Maximum available quantity reached", variant: "destructive" });
                                        updateQuantity(item.product.id, maxStock, item.selectedColor?.hex);
                                      } else if (newQty >= 1) {
                                        updateQuantity(item.product.id, newQty, item.selectedColor?.hex);
                                      }
                                    }}
                                    className="w-12 h-7 text-center text-sm px-1"
                                    data-testid={`checkout-input-quantity-${item.product.id}`}
                                  />
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      if (item.quantity >= maxStock) {
                                        toast({ title: "Maximum available quantity reached", variant: "destructive" });
                                      } else {
                                        updateQuantity(item.product.id, item.quantity + 1, item.selectedColor?.hex);
                                      }
                                    }}
                                    data-testid={`checkout-button-plus-${item.product.id}`}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </Button>
                                </div>
                                <span className="text-sm font-semibold w-16 text-right shrink-0">{formatCurrency(item.product.price * item.quantity)}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => {
                                    removeFromCart(item.product.id, item.selectedColor?.hex);
                                    toast({ title: "Item removed", description: `${item.product.name} removed from cart` });
                                  }}
                                  data-testid={`checkout-button-remove-${item.product.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-between items-center mt-3 pt-3 border-t">
                          <span className="text-sm font-medium">Subtotal</span>
                          <span className="font-display font-bold">{formatCurrency(cartTotal)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Login prompt if not logged in */}
                  {!user && selectedNode && selectedSlot && (
                    <Card className="mt-6 border-amber-300/50 bg-amber-50/50">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                          <div className="flex-1">
                            <p className="font-medium text-sm">Login required to continue</p>
                            <p className="text-sm text-muted-foreground">Please log in or create an account to proceed to payment.</p>
                          </div>
                          <Link href="/login">
                            <Button size="sm" data-testid="button-login-checkout">
                              Log In
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {user && user.type === 'node' && selectedNode && selectedSlot && (
                    <Alert variant="destructive" className="mt-6">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Node Account</AlertTitle>
                      <AlertDescription>
                        Node host accounts cannot make purchases. Please create a separate buyer account to shop.
                      </AlertDescription>
                    </Alert>
                  )}

                  {user && user.type !== 'node' && selectedNode && selectedSlot && (
                    <Card className="mt-6">
                      <CardContent className="p-6 space-y-4">
                        <h3 className="font-display font-semibold">Pickup Information</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="pickupNameInline">Pickup Person Name <span className="text-destructive">*</span></Label>
                            <Input
                              id="pickupNameInline"
                              value={buyerInfo.name || user?.name || ''}
                              onChange={(e) => setBuyerInfo({ ...buyerInfo, name: e.target.value })}
                              placeholder="Name of pickup person"
                              required
                              data-testid="input-buyer-name-inline"
                            />
                          </div>
                          <div>
                            <Label htmlFor="vehicleInfoInline">Vehicle (optional)</Label>
                            <Input
                              id="vehicleInfoInline"
                              value={pickupInfo.vehicleMakeColor}
                              onChange={(e) => setPickupInfo({ ...pickupInfo, vehicleMakeColor: e.target.value })}
                              placeholder="e.g., Red Honda Civic"
                              data-testid="input-vehicle-info-inline"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Vehicle info helps the host find you during curbside pickup
                        </p>
                        <Button
                          className="w-full"
                          size="lg"
                          onClick={() => {
                            if (!selectedNode || !selectedSlot) {
                              toast({
                                title: "Select pickup location and time",
                                description: "Please choose a pickup location and time window before continuing.",
                                variant: "destructive",
                              });
                              return;
                            }
                            const hasName = user?.name?.trim() || buyerInfo.name?.trim();
                            if (!hasName) {
                              toast({
                                title: "Name required",
                                description: "Please enter the pickup person's name.",
                                variant: "destructive",
                              });
                              return;
                            }
                            if (pickupInfo.alternateName.trim() && pickupInfo.alternatePhone.trim()) {
                              const alternatePhoneValid = pickupInfo.alternatePhone.replace(/\D/g, '').length === 10;
                              if (!alternatePhoneValid) {
                                toast({
                                  title: "Invalid phone number",
                                  description: "Please enter a valid 10-digit phone number for the alternate pickup person.",
                                  variant: "destructive",
                                });
                                return;
                              }
                            }
                            createPaymentIntent();
                          }}
                          disabled={isProcessing}
                          data-testid="button-continue-inline"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            'Continue to Payment'
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {step === 2 && selectedNode && selectedSlot && (
                <div className="animate-fade-in space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-display flex items-center gap-2">
                        <CreditCard className="w-5 h-5" />
                        Payment Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-3">
                        <Label className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4" />
                          Payment Details
                        </Label>
                        {clientSecret ? (
                          <Elements 
                            stripe={stripePromise} 
                            options={{ 
                              clientSecret,
                              appearance: {
                                theme: 'stripe',
                                variables: {
                                  colorPrimary: '#14b8a6',
                                },
                              },
                            }}
                          >
                            <PaymentForm
                              orderId={pendingOrderId || ''}
                              onSuccess={(orderId) => {
                                clearCart();
                                navigate(`/thank-you?order=${orderId}`);
                              }}
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
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

            <div className={`lg:col-span-1 ${step === 1 ? 'hidden' : ''}`}>
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle className="font-display">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex items-center text-sm gap-0">
                      <span className="text-muted-foreground truncate min-w-0 flex-1">{item.product.name}</span>
                      <span className="shrink-0 text-muted-foreground w-10 text-right">× <span className="font-bold">{item.quantity}</span></span>
                      <span className="shrink-0 w-16 text-right">{formatCurrency(item.product.price * item.quantity)}</span>
                    </div>
                  ))}

                  <Separator />

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(cartTotal)}</span>
                  </div>
                  
                  {/* Promo Code - only on payment step */}
                  {step === 2 && (<><div className="space-y-2">
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
                                {appliedPromo.discountType === 'free_gift' && `Free gift included!`}
                                {appliedPromo.discountType === 'gift_choice' && `Choose ${appliedPromo.giftSelectCount} free gift${(appliedPromo.giftSelectCount || 1) > 1 ? 's' : ''}`}
                                {appliedPromo.discountType === 'combo' && `Combo deal!`}
                              </span>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={removePromoCode}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        {/* Gift Selection for gift_choice promo codes */}
                        {appliedPromo.discountType === 'gift_choice' && appliedPromo.giftProducts && appliedPromo.giftProducts.length > 0 && (
                          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                            <div className="text-sm font-medium text-purple-800 mb-2">
                              Select {appliedPromo.giftSelectCount} free gift{(appliedPromo.giftSelectCount || 1) > 1 ? 's' : ''} from the options below:
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {appliedPromo.giftProducts.slice(0, appliedPromo.giftPoolSize).map((product) => {
                                const isSelected = selectedGiftProductIds.includes(product.id);
                                const canSelect = selectedGiftProductIds.length < (appliedPromo.giftSelectCount || 1);
                                return (
                                  <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedGiftProductIds(prev => prev.filter(id => id !== product.id));
                                      } else if (canSelect) {
                                        setSelectedGiftProductIds(prev => [...prev, product.id]);
                                      }
                                    }}
                                    className={`p-2 rounded-lg border text-left transition-all ${
                                      isSelected 
                                        ? 'border-purple-500 bg-purple-100 ring-2 ring-purple-300' 
                                        : canSelect 
                                          ? 'border-gray-200 hover:border-purple-300 bg-white' 
                                          : 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                                    }`}
                                    disabled={!isSelected && !canSelect}
                                    data-testid={`gift-product-${product.id}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      {product.images?.[0] && (
                                        <img src={product.images[0]} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                                      )}
                                      <div className="min-w-0">
                                        <div className="text-xs font-mono text-muted-foreground">{product.code}</div>
                                        <div className="text-sm font-medium truncate">{product.name}</div>
                                      </div>
                                      {isSelected && (
                                        <Check className="w-4 h-4 text-purple-600 ml-auto flex-shrink-0" />
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            <div className="text-xs text-purple-600 mt-2">
                              {selectedGiftProductIds.length} of {appliedPromo.giftSelectCount} selected
                            </div>
                          </div>
                        )}
                        {/* Show the free gift for free_gift promo codes */}
                        {appliedPromo.discountType === 'free_gift' && appliedPromo.giftProducts && appliedPromo.giftProducts.length > 0 && (
                          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                            <div className="text-sm font-medium text-purple-800 mb-2">
                              Your free gift{(appliedPromo.giftQuantity || 1) > 1 ? 's' : ''}:
                            </div>
                            <div className="space-y-2">
                              {appliedPromo.giftProducts.map((product) => (
                                <div key={product.id} className="flex items-center gap-2 p-2 bg-white rounded border border-purple-200">
                                  {product.images?.[0] && (
                                    <img src={product.images[0]} alt="" className="w-10 h-10 rounded object-cover" />
                                  )}
                                  <div>
                                    <div className="text-xs font-mono text-muted-foreground">{product.code}</div>
                                    <div className="text-sm font-medium">{product.name}</div>
                                  </div>
                                  <div className="ml-auto text-xs text-purple-600 font-medium">FREE</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Show combo benefits */}
                        {appliedPromo.discountType === 'combo' && appliedPromo.comboBenefits && appliedPromo.comboBenefits.length > 0 && (
                          <div className="space-y-3">
                            {appliedPromo.comboBenefits.map((benefit: any, idx: number) => (
                              <div key={idx}>
                                {(benefit.type === 'percentage' || benefit.type === 'fixed') && (
                                  <div className="text-sm text-green-600">
                                    {benefit.type === 'percentage' ? `${benefit.value}% off` : `$${benefit.value.toFixed(2)} off`}
                                  </div>
                                )}
                                {benefit.type === 'free_gift' && benefit.products?.length > 0 && (
                                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                                    <div className="text-sm font-medium text-purple-800 mb-2">
                                      Your free gift{(benefit.quantity || 1) > 1 ? 's' : ''}:
                                    </div>
                                    <div className="space-y-2">
                                      {benefit.products.map((product: any) => (
                                        <div key={product.id} className="flex items-center gap-2 p-2 bg-white rounded border border-purple-200">
                                          {product.images?.[0] && (
                                            <img src={product.images[0]} alt="" className="w-10 h-10 rounded object-cover" />
                                          )}
                                          <div>
                                            <div className="text-xs font-mono text-muted-foreground">{product.code}</div>
                                            <div className="text-sm font-medium">{product.name}</div>
                                          </div>
                                          <div className="ml-auto text-xs text-purple-600 font-medium">FREE</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {benefit.type === 'gift_choice' && benefit.products?.length > 0 && (
                                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                                    <div className="text-sm font-medium text-purple-800 mb-2">
                                      Choose {benefit.selectCount} free gift{benefit.selectCount > 1 ? 's' : ''} from below ({selectedGiftProductIds.length} of {benefit.selectCount} selected):
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      {benefit.products.slice(0, benefit.poolSize).map((product: any) => {
                                        const isSelected = selectedGiftProductIds.includes(product.id);
                                        return (
                                          <div 
                                            key={product.id} 
                                            onClick={() => {
                                              if (isSelected) {
                                                setSelectedGiftProductIds(selectedGiftProductIds.filter(id => id !== product.id));
                                              } else if (selectedGiftProductIds.length < benefit.selectCount) {
                                                setSelectedGiftProductIds([...selectedGiftProductIds, product.id]);
                                              }
                                            }}
                                            className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                                              isSelected 
                                                ? 'bg-purple-100 border-purple-400 ring-2 ring-purple-300' 
                                                : 'bg-white border-purple-200 hover:bg-purple-50'
                                            }`}
                                          >
                                            {product.images?.[0] && (
                                              <img src={product.images[0]} alt="" className="w-8 h-8 rounded object-cover" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs font-mono text-muted-foreground truncate">{product.code}</div>
                                              <div className="text-xs font-medium truncate">{product.name}</div>
                                            </div>
                                            {isSelected && (
                                              <div className="text-purple-600"><Check className="w-4 h-4" /></div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Promo code"
                          value={promoCode}
                          onChange={(e) => {
                            setPromoCode(e.target.value.toUpperCase());
                            setPromoError('');
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && validatePromoCode()}
                          className="flex-1 font-mono text-sm"
                          data-testid="input-promo-code-checkout"
                        />
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={validatePromoCode}
                          disabled={promoCodeValidating || !promoCode.trim()}
                          data-testid="button-apply-promo"
                        >
                          {promoCodeValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                        </Button>
                      </div>
                    )}
                    {promoError && (
                      <p className="text-xs text-destructive">{promoError}</p>
                    )}
                  </div>
                  
                  {appliedPromo && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount</span>
                      <span>-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}
                  </>)}
                  
                  {taxEnabled && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax ({(taxRatePercent * 100).toFixed(1).replace(/\.0$/,'')}% {taxLabel})</span>
                    <span>{formatCurrency(taxAmount)}</span>
                  </div>
                  )}

                  <Separator />

                  <div className="flex justify-between font-display font-semibold text-lg">
                    <span>Total</span>
                    <span data-testid="text-order-total">{formatCurrency(orderTotal)}</span>
                  </div>

                  {step === 2 && (
                    <div className="flex items-start gap-2 pt-2 pb-2">
                      <Checkbox 
                        id="agreements" 
                        checked={agreementsAccepted}
                        onCheckedChange={(checked) => setAgreementsAccepted(checked === true)}
                        data-testid="checkbox-agreements"
                      />
                      <label htmlFor="agreements" className="text-sm leading-tight cursor-pointer">
                        I agree to the{' '}
                        <button
                          type="button"
                          className="text-primary underline hover:no-underline"
                          onClick={(e) => {
                            e.preventDefault();
                            const termsAgreement = agreements.find(a => a.key === 'terms');
                            if (termsAgreement) setViewingAgreement(termsAgreement);
                          }}
                          data-testid="link-terms"
                        >
                          Terms of Service
                        </button>
                        ,{' '}
                        <button
                          type="button"
                          className="text-primary underline hover:no-underline"
                          onClick={(e) => {
                            e.preventDefault();
                            const refundAgreement = agreements.find(a => a.key === 'refund');
                            if (refundAgreement) setViewingAgreement(refundAgreement);
                          }}
                          data-testid="link-refund"
                        >
                          Refund Policy
                        </button>
                        , and{' '}
                        <button
                          type="button"
                          className="text-primary underline hover:no-underline"
                          onClick={(e) => {
                            e.preventDefault();
                            const handoffAgreement = agreements.find(a => a.key === 'host_handoff');
                            if (handoffAgreement) setViewingAgreement(handoffAgreement);
                          }}
                          data-testid="link-host-handoff"
                        >
                          Host Handoff Responsibilities
                        </button>
                      </label>
                    </div>
                  )}

                  {step < 2 && user?.type === 'node' && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Node Account</AlertTitle>
                      <AlertDescription>
                        Node host accounts cannot make purchases. Please create a separate buyer account to shop.
                      </AlertDescription>
                    </Alert>
                  )}

                  {step < 2 && user?.type !== 'node' && (
                    <>
                      <Separator />
                      <div className="space-y-4">
                        <h4 className="font-medium text-sm">Pickup Information</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="pickupName">Pickup Person Name <span className="text-destructive">*</span></Label>
                            <Input
                              id="pickupName"
                              value={buyerInfo.name || user?.name || ''}
                              onChange={(e) => setBuyerInfo({ ...buyerInfo, name: e.target.value })}
                              placeholder="Name of pickup person"
                              required
                              data-testid="input-buyer-name"
                            />
                          </div>
                          <div>
                            <Label htmlFor="vehicleInfo">Vehicle (optional)</Label>
                            <Input
                              id="vehicleInfo"
                              value={pickupInfo.vehicleMakeColor}
                              onChange={(e) => setPickupInfo({ ...pickupInfo, vehicleMakeColor: e.target.value })}
                              placeholder="e.g., Red Honda Civic"
                              data-testid="input-vehicle-info"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Vehicle info helps the host find you during curbside pickup
                        </p>
                      </div>
                      <Button
                        className="w-full"
                        size="lg"
                        onClick={() => {
                          if (!selectedNode || !selectedSlot) {
                            toast({
                              title: "Select pickup location and time",
                              description: "Please choose a pickup location and time window before continuing.",
                              variant: "destructive",
                            });
                            return;
                          }
                          const hasName = user?.name?.trim() || buyerInfo.name?.trim();
                          if (!hasName) {
                            toast({
                              title: "Name required",
                              description: "Please enter the pickup person's name.",
                              variant: "destructive",
                            });
                            return;
                          }
                          if (pickupInfo.alternateName.trim() && pickupInfo.alternatePhone.trim()) {
                            const alternatePhoneValid = pickupInfo.alternatePhone.replace(/\D/g, '').length === 10;
                            if (!alternatePhoneValid) {
                              toast({
                                title: "Invalid phone number",
                                description: "Please enter a valid 10-digit phone number for the alternate pickup person.",
                                variant: "destructive",
                              });
                              return;
                            }
                          }
                          createPaymentIntent();
                        }}
                        disabled={isProcessing}
                        data-testid="button-continue"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          'Continue to Payment'
                        )}
                      </Button>
                    </>
                  )}

                  {step > 1 && (
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => {
                        setStep(step - 1);
                        setClientSecret(null);
                        setPendingOrderId(null);
                        setPaymentError(null);
                      }}
                      data-testid="button-back-step"
                    >
                      Back
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <Footer />
      <Dialog open={!!viewingAgreement} onOpenChange={() => setViewingAgreement(null)}>
        <DialogContent className="max-w-3xl w-[90vw] h-[85vh] max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="font-display">{viewingAgreement?.title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-4">
            <div className="text-sm text-muted-foreground whitespace-pre-wrap pr-2">
              {viewingAgreement?.content}
            </div>
          </ScrollArea>
          <div className="flex justify-end pt-4 border-t flex-shrink-0">
            <Button onClick={() => setViewingAgreement(null)} data-testid="button-close-agreement">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!previewingSlotsNodeId} onOpenChange={() => setPreviewingSlotsNodeId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Available Pickup Windows
            </DialogTitle>
          </DialogHeader>
          {(() => {
            if (!previewingSlotsNodeId) return null;
            const node = availableNodes.find(n => n.id === previewingSlotsNodeId) || nodeItemAvailability[previewingSlotsNodeId]?.node;
            const cache = nodeSlotsCache[previewingSlotsNodeId];
            
            if (!cache || cache.status === 'loading') {
              return (
                <div className="py-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Loading available times...</p>
                </div>
              );
            }
            
            if (cache.status === 'error') {
              return (
                <div className="py-6 text-center">
                  <p className="text-sm text-destructive mb-3">Could not load pickup times</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => fetchPickupSlots(previewingSlotsNodeId)}
                  >
                    Try Again
                  </Button>
                </div>
              );
            }
            
            const guaranteedSlots = cache.slots;
            if (guaranteedSlots.length === 0) {
              return (
                <div className="py-6 text-center">
                  <Clock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No pickup windows available right now.
                  </p>
                </div>
              );
            }
            
            const slotsByDate: Record<string, typeof guaranteedSlots> = {};
            guaranteedSlots.forEach(slot => {
              if (!slotsByDate[slot.date]) slotsByDate[slot.date] = [];
              slotsByDate[slot.date].push(slot);
            });
            
            return (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Click a time slot to select {node?.name}:
                </p>
                <ScrollArea className="max-h-[50vh]">
                  <div className="space-y-3 min-w-0">
                    {Object.entries(slotsByDate).map(([date, daySlots]) => {
                      const { label, subLabel } = formatSlotDay(date);
                      
                      return (
                        <div key={date} className="space-y-1.5">
                          {daySlots.map((slot, idx) => {
                            const isSelected = selectedSlot?.id === slot.id && selectedNode?.id === node?.id;
                            return (
                              <button
                                key={slot.id || idx}
                                className={`w-full text-left px-4 py-3 rounded-lg transition-all border ${
                                  isSelected 
                                    ? 'bg-primary text-white border-primary' 
                                    : 'hover:bg-primary/10 border-border hover:border-primary/50'
                                }`}
                                onClick={() => {
                                  if (node) {
                                    setSelectedNode(node);
                                    setSelectedSlot(slot);
                                    setPreviewingSlotsNodeId(null);
                                  }
                                }}
                                data-testid={`button-select-slot-${slot.id || idx}`}
                              >
                                <div className="flex items-center gap-2">
                                  <Clock className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-primary'}`} />
                                  <span className="font-medium text-sm">{label}</span>
                                  <span className={`text-xs ${isSelected ? 'text-white/70' : 'text-muted-foreground'}`}>{subLabel}</span>
                                </div>
                                <div className={`text-sm mt-1 ml-6 ${isSelected ? 'text-white font-medium' : ''}`}>
                                  {formatTime12h(slot.startTime)} – {formatTime12h(slot.endTime)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
                <p className="text-xs text-muted-foreground text-center pt-2 border-t">
                  These times are guaranteed and cannot be changed by the host.
                </p>
              </div>
            );
          })()}
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setPreviewingSlotsNodeId(null)} data-testid="button-close-slots-preview">
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
