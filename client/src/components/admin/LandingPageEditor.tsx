import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, GripVertical, Eye, Check, Loader2, MapPin, Clock, Package, Search, ArrowLeft, Save, ChevronLeft, ChevronRight, Store, Navigation, Image, Type, ShoppingBag, Tag, QrCode, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/mockData';

type Product = {
  id: number | string;
  name: string;
  price: number | string;
  images?: string[];
  image?: string;
  category?: string;
  subcategory?: string;
  productCode?: string;
  brand?: string;
  condition?: string;
  description?: string | string[];
};

type NodeInfo = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  latitude?: string;
  longitude?: string;
  status?: string;
};

type LandingPage = {
  id: string;
  slug: string;
  productId: string;
  mode?: string;
  productIds?: string[];
  nodeId?: string;
  status: string;
  headline?: string | null;
  subheadline?: string | null;
  showPrice?: boolean | null;
  showDescription?: boolean | null;
  showCondition?: boolean | null;
  showBrand?: boolean | null;
  promoCodes?: string[] | null;
  shopMoreMode?: string | null;
  shopMoreProductIds?: (string | number)[] | null;
  gradientFrom?: string | null;
  gradientTo?: string | null;
  ctaText?: string | null;
  ctaColor?: string | null;
  layoutOrder?: string[] | null;
  postSearchLayoutOrder?: string[] | null;
  carouselEnabled?: boolean | null;
  carouselAutoplay?: boolean | null;
  carouselSpeed?: number | null;
  carouselVisibleCount?: number | null;
  textboxContent?: string | null;
  headlineFontSize?: number | null;
  subheadlineFontSize?: number | null;
  priceFontSize?: number | null;
  shopMoreText?: string | null;
  shopMoreLink?: string | null;
  showMapCircle?: boolean | null;
  mapCircleSize?: number | null;
  promoTitle?: string | null;
  groupByCategory?: boolean | null;
  showSubcategories?: boolean | null;
  carouselProductIds?: string[] | null;
  createdAt?: string;
};

interface LandingPageEditorProps {
  editingPage: LandingPage | null;
  productList: Product[];
  promoCodeList: any[];
  nodeList: NodeInfo[];
  onClose: () => void;
  onSaved: () => void;
}

const DEFAULT_LAYOUT_PRODUCT = ['hero', 'promoCodes', 'search', 'shopMore'];
const DEFAULT_LAYOUT_LOCATION = ['locationHero', 'map', 'promoCodes', 'productCarousel', 'allLocationsLink'];

function generateSlug(name: string) {
  return name.toLowerCase().replace(/&/g, 'and').replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 80).replace(/-+$/, '');
}

export default function LandingPageEditor({ editingPage, productList, promoCodeList, nodeList, onClose, onSaved }: LandingPageEditorProps) {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    slug: '',
    productId: '' as string,
    mode: 'single' as string,
    productIds: [] as string[],
    nodeId: '' as string,
    status: 'active' as string,
    headline: '',
    subheadline: '',
    showPrice: true,
    showDescription: true,
    showCondition: false,
    showBrand: false,
    promoCodes: [] as string[],
    promoTitle: '',
    shopMoreMode: 'subcategory' as string,
    shopMoreProductIds: [] as string[],
    gradientFrom: '#0d9488',
    gradientTo: '#1e3a5f',
    ctaText: 'Find My Pickup Spot',
    ctaColor: '#14b8a6',
    layoutOrder: [] as string[],
    postSearchLayoutOrder: [] as string[],
    headlineFontSize: 48,
    subheadlineFontSize: 20,
    priceFontSize: 36,
    carouselProductIds: [] as string[],
    carouselEnabled: true,
    carouselAutoplay: false,
    carouselSpeed: 3,
    carouselVisibleCount: 3,
    shopMoreText: '',
    shopMoreLink: '',
    showMapCircle: true,
    mapCircleSize: 500,
    groupByCategory: true,
    showSubcategories: false,
    textboxContent: '',
  });

  const [productSearch, setProductSearch] = useState('');
  const [plProductSearch, setPlProductSearch] = useState('');
  const [multiProductSearch, setMultiProductSearch] = useState('');
  const [shopMoreSearch, setShopMoreSearch] = useState('');
  const [carouselSearch, setCarouselSearch] = useState('');
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState('content');

  const [panelWidth, setPanelWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const [productBrowserOpen, setProductBrowserOpen] = useState(false);
  const [productBrowserSearch, setProductBrowserSearch] = useState('');
  const textboxEditorRef = useRef<HTMLDivElement>(null);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [qrName, setQrName] = useState('');
  const [qrLinkType, setQrLinkType] = useState<string>('landing');
  const [qrCustomUrl, setQrCustomUrl] = useState('');
  const [qrSize, setQrSize] = useState(300);
  const [qrFgColor, setQrFgColor] = useState('#1D3557');
  const [qrBgColor, setQrBgColor] = useState('#FFFFFF');
  const [qrBorderEnabled, setQrBorderEnabled] = useState(false);
  const [qrBorderColor, setQrBorderColor] = useState('#1D3557');
  const [qrBorderWidth, setQrBorderWidth] = useState(8);
  const [qrCornerRadius, setQrCornerRadius] = useState(0);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [qrShowStyle, setQrShowStyle] = useState(false);

  const QR_BASE = 'https://gridmart.ca';
  const qrLinkOptions = [
    { value: 'landing', label: 'This Landing Page', url: '' },
    { value: 'homepage', label: 'Homepage', url: QR_BASE },
    { value: 'apply', label: 'Become a Host (Apply)', url: `${QR_BASE}/apply` },
    { value: 'about', label: 'About Us', url: `${QR_BASE}/about` },
    { value: 'custom', label: 'Custom URL', url: '' },
  ];

  const { data: savedQrs = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/qr-codes'],
    staleTime: 30000,
  });
  const createQrMutation = useMutation({
    mutationFn: async (qr: any) => {
      const res = await apiRequest('POST', '/api/admin/qr-codes', qr);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/admin/qr-codes'] }),
  });
  const deleteQrMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/admin/qr-codes/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/admin/qr-codes'] }),
  });

  const getQrUrl = useCallback(() => {
    if (qrLinkType === 'landing') return `${QR_BASE}/lp/${formData.slug || 'page-slug'}`;
    if (qrLinkType === 'custom') return qrCustomUrl;
    return qrLinkOptions.find(o => o.value === qrLinkType)?.url || QR_BASE;
  }, [qrLinkType, qrCustomUrl, formData.slug]);

  const renderQrWithStyle = useCallback(async (
    url: string, size: number, fg: string, bg: string,
    border: boolean, borderColor: string, borderW: number, radius: number
  ): Promise<string> => {
    const rawDataUrl = await QRCode.toDataURL(url, {
      width: size, margin: 2,
      color: { dark: fg, light: bg },
      errorCorrectionLevel: 'H',
    });
    if (!border && radius === 0) return rawDataUrl;
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const pad = border ? borderW : 0;
        const totalW = size + pad * 2;
        const totalH = size + pad * 2;
        const canvas = document.createElement('canvas');
        canvas.width = totalW; canvas.height = totalH;
        const ctx = canvas.getContext('2d')!;
        if (radius > 0) {
          ctx.beginPath();
          ctx.moveTo(radius, 0); ctx.lineTo(totalW - radius, 0);
          ctx.quadraticCurveTo(totalW, 0, totalW, radius);
          ctx.lineTo(totalW, totalH - radius);
          ctx.quadraticCurveTo(totalW, totalH, totalW - radius, totalH);
          ctx.lineTo(radius, totalH);
          ctx.quadraticCurveTo(0, totalH, 0, totalH - radius);
          ctx.lineTo(0, radius);
          ctx.quadraticCurveTo(0, 0, radius, 0);
          ctx.closePath(); ctx.clip();
        }
        ctx.fillStyle = border ? borderColor : bg;
        ctx.fillRect(0, 0, totalW, totalH);
        ctx.drawImage(img, pad, pad, size, size);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = rawDataUrl;
    });
  }, []);

  useEffect(() => {
    if (!qrExpanded) return;
    const url = getQrUrl();
    if (!url) { setQrPreviewUrl(null); return; }
    const timer = setTimeout(async () => {
      try {
        const dataUrl = await renderQrWithStyle(url, qrSize, qrFgColor, qrBgColor, qrBorderEnabled, qrBorderColor, qrBorderWidth, qrCornerRadius);
        setQrPreviewUrl(dataUrl);
      } catch (err) { console.error('QR generation error:', err); }
    }, 150);
    return () => clearTimeout(timer);
  }, [qrExpanded, getQrUrl, qrSize, qrFgColor, qrBgColor, qrBorderEnabled, qrBorderColor, qrBorderWidth, qrCornerRadius, renderQrWithStyle]);

  const saveQrCode = useCallback(async () => {
    if (!qrPreviewUrl) { toast.error('Generate a QR code first'); return; }
    const name = qrName.trim() || `${formData.slug || 'landing'} QR`;
    try {
      await createQrMutation.mutateAsync({
        name, linkType: qrLinkType, customUrl: qrLinkType === 'custom' ? qrCustomUrl : qrLinkType === 'landing' ? `${QR_BASE}/lp/${formData.slug}` : null,
        dataUrl: qrPreviewUrl, size: qrSize, fgColor: qrFgColor, bgColor: qrBgColor,
        borderEnabled: qrBorderEnabled, borderColor: qrBorderColor, borderWidth: qrBorderWidth, cornerRadius: qrCornerRadius,
      });
      setQrName('');
      toast.success(`"${name}" saved`);
    } catch { toast.error('Failed to save QR code'); }
  }, [qrPreviewUrl, qrName, qrLinkType, qrCustomUrl, qrSize, qrFgColor, qrBgColor, qrBorderEnabled, qrBorderColor, qrBorderWidth, qrCornerRadius, formData.slug, createQrMutation]);

  const downloadQrImage = useCallback((dataUrl: string, name: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
  }, []);

  useEffect(() => {
    if (editingPage) {
      const defaultLayout = (editingPage.mode === 'location') ? DEFAULT_LAYOUT_LOCATION : DEFAULT_LAYOUT_PRODUCT;
      setFormData({
        slug: editingPage.slug,
        productId: String(editingPage.productId),
        mode: editingPage.mode || 'single',
        productIds: (editingPage.productIds || []).map(String),
        nodeId: editingPage.nodeId || '',
        status: editingPage.status,
        headline: editingPage.headline || '',
        subheadline: editingPage.subheadline || '',
        showPrice: editingPage.showPrice ?? true,
        showDescription: editingPage.showDescription ?? true,
        showCondition: editingPage.showCondition ?? false,
        showBrand: editingPage.showBrand ?? false,
        promoCodes: editingPage.promoCodes || [],
        promoTitle: editingPage.promoTitle || '',
        shopMoreMode: editingPage.shopMoreMode || 'subcategory',
        shopMoreProductIds: (editingPage.shopMoreProductIds || []).map(String),
        gradientFrom: editingPage.gradientFrom || '#0d9488',
        gradientTo: editingPage.gradientTo || '#1e3a5f',
        ctaText: editingPage.ctaText || 'Find My Pickup Spot',
        ctaColor: editingPage.ctaColor || '#14b8a6',
        layoutOrder: (() => {
          const lo = editingPage.layoutOrder || defaultLayout;
          if (!lo.includes('promoCodes')) {
            const heroIdx = lo.indexOf('hero');
            const locHeroIdx = lo.indexOf('locationHero');
            const insertAfter = locHeroIdx >= 0 ? locHeroIdx : heroIdx >= 0 ? heroIdx : -1;
            if (insertAfter >= 0) {
              const updated = [...lo];
              updated.splice(insertAfter + 1, 0, 'promoCodes');
              return updated;
            }
            return [...lo, 'promoCodes'];
          }
          return lo;
        })(),
        headlineFontSize: editingPage.headlineFontSize ?? 48,
        subheadlineFontSize: editingPage.subheadlineFontSize ?? 20,
        priceFontSize: editingPage.priceFontSize ?? 36,
        carouselProductIds: editingPage.carouselProductIds || [],
        carouselEnabled: editingPage.carouselEnabled ?? true,
        carouselAutoplay: editingPage.carouselAutoplay ?? false,
        carouselSpeed: editingPage.carouselSpeed ?? 3,
        carouselVisibleCount: editingPage.carouselVisibleCount ?? 3,
        shopMoreText: editingPage.shopMoreText || '',
        shopMoreLink: editingPage.shopMoreLink || '',
        showMapCircle: editingPage.showMapCircle ?? true,
        mapCircleSize: editingPage.mapCircleSize ?? 500,
        groupByCategory: editingPage.groupByCategory ?? true,
        showSubcategories: editingPage.showSubcategories ?? false,
        textboxContent: editingPage.textboxContent || '',
        postSearchLayoutOrder: editingPage.postSearchLayoutOrder || [],
      });
    } else {
      setFormData(prev => ({
        ...prev,
        layoutOrder: DEFAULT_LAYOUT_PRODUCT,
      }));
    }
    if (textboxEditorRef.current) {
      textboxEditorRef.current.removeAttribute('data-initialized');
    }
  }, [editingPage]);

  useEffect(() => {
    if (!editingPage) {
      const defaultLayout = formData.mode === 'location' ? DEFAULT_LAYOUT_LOCATION : DEFAULT_LAYOUT_PRODUCT;
      setFormData(prev => ({ ...prev, layoutOrder: defaultLayout }));
    }
  }, [formData.mode]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch('/api/admin/landing-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landing-pages'] });
      toast.success('Landing page created');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await fetch(`/api/admin/landing-pages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landing-pages'] });
      toast.success('Landing page updated');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (formData.mode === 'location') {
      if (!formData.nodeId) {
        toast.error('Please select a pickup location');
        return;
      }
      if (!formData.productId) {
        formData.productId = 'location-placeholder';
      }
    } else if (formData.mode === 'postal-code') {
      if (!formData.productId) {
        formData.productId = 'postal-code-placeholder';
      }
    } else if (formData.mode === 'product-location') {
      if (formData.productIds.length === 0) {
        toast.error('Please select at least one product');
        return;
      }
      if (!formData.nodeId) {
        toast.error('Please select a pickup location');
        return;
      }
      formData.productId = formData.productIds[0];
    } else if (formData.mode === 'multi') {
      if (formData.productIds.length === 0) {
        toast.error('Please select at least one product');
        return;
      }
      formData.productId = formData.productIds[0];
    } else {
      if (!formData.productId || formData.productId === '0') {
        toast.error('Please select a product');
        return;
      }
    }
    if (!formData.slug) {
      toast.error('Please enter a slug');
      return;
    }
    if (editingPage) {
      updateMutation.mutate({ id: editingPage.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleProductSelect = (productId: string) => {
    const product = productList.find(p => String(p.id) === productId);
    setFormData(prev => ({
      ...prev,
      productId: productId,
      slug: prev.slug || (product ? generateSlug(product.name) : ''),
      headline: prev.headline || (product ? product.name : ''),
    }));
  };

  const handleNodeSelect = (nodeId: string) => {
    const node = nodeList.find(n => n.id === nodeId);
    setFormData(prev => ({
      ...prev,
      nodeId,
      slug: prev.slug || (node ? generateSlug(node.name) : ''),
      headline: prev.headline || (node ? `Pickup at ${node.name}` : ''),
      ctaText: prev.ctaText === 'Find My Pickup Spot' ? 'Browse Products' : prev.ctaText,
    }));
  };

  const handleDragStart = (item: string) => {
    setDraggedItem(item);
  };

  const handleDragOver = (e: React.DragEvent, item: string) => {
    e.preventDefault();
    setDragOverItem(item);
  };

  const handleDrop = (targetItem: string, field: 'layoutOrder' | 'postSearchLayoutOrder' = 'layoutOrder') => {
    if (!draggedItem || draggedItem === targetItem) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }
    setFormData(prev => {
      const items = [...prev[field]];
      const fromIndex = items.indexOf(draggedItem);
      const toIndex = items.indexOf(targetItem);
      if (fromIndex === -1 || toIndex === -1) return prev;
      items.splice(fromIndex, 1);
      items.splice(toIndex, 0, draggedItem);
      return { ...prev, [field]: items };
    });
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = panelWidth;
    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.min(800, Math.max(300, startWidth + (ev.clientX - startX)));
      setPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [panelWidth]);

  const browserFilteredProducts = productBrowserSearch
    ? productList.filter(p =>
        p.name.toLowerCase().includes(productBrowserSearch.toLowerCase()) ||
        (p.productCode && p.productCode.toLowerCase().includes(productBrowserSearch.toLowerCase()))
      )
    : productList;

  const selectedProduct = productList.find(p => String(p.id) === String(formData.productId));
  const selectedNode = nodeList.find(n => n.id === formData.nodeId);
  const filteredProducts = productSearch
    ? productList.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : productList;
  const activePromos = promoCodeList.filter((p: any) => p.status === 'active');
  const activeNodes = nodeList.filter(n => n.status === 'active');

  const gradientFrom = formData.gradientFrom;
  const gradientTo = formData.gradientTo;
  const ctaColor = formData.ctaColor;

  const sectionLabels: Record<string, string> = {
    hero: 'Hero Section',
    search: 'Postal Code Search',
    shopMore: 'Shop More Products',
    promoCodes: 'Promo Codes',
    locationHero: 'Location Hero',
    map: 'Map',
    productCarousel: 'Product Carousel',
    allLocationsLink: 'View All Locations Link',
    textbox: 'Text Block',
  };

  const renderPreviewSection = (section: string) => {
    switch (section) {
      case 'hero':
        return (
          <div key={section} className="p-6 text-white text-center" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}>
            {(formData.mode === 'multi' || formData.mode === 'product-location') ? (
              <>
                <h2 className="font-bold mb-2" style={{ fontSize: `${Math.max(12, formData.headlineFontSize * 0.35)}px` }}>{formData.headline || 'Featured Products'}</h2>
                {formData.subheadline && <p className="opacity-80 mb-4" style={{ fontSize: `${Math.max(8, formData.subheadlineFontSize * 0.45)}px` }}>{formData.subheadline}</p>}
                <div className="flex gap-3 justify-center flex-wrap">
                  {formData.productIds.slice(0, 4).map(pid => {
                    const p = productList.find(pr => String(pr.id) === pid);
                    return p ? (
                      <div key={pid} className="w-24 bg-white/10 rounded-lg p-2">
                        {p.images?.[0] && <img src={p.images[0]} alt="" className="w-full aspect-square object-cover rounded" />}
                        <p className="text-xs mt-1 line-clamp-1">{p.name}</p>
                      </div>
                    ) : null;
                  })}
                </div>
                {formData.mode === 'product-location' && selectedNode && (
                  <div className="mt-3 text-xs opacity-70 flex items-center justify-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {selectedNode.name}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-6">
                <div className="flex-1 text-left">
                  <h2 className="font-bold mb-2" style={{ fontSize: `${Math.max(12, formData.headlineFontSize * 0.35)}px` }}>{formData.headline || selectedProduct?.name || 'Product Name'}</h2>
                  {formData.subheadline && <p className="opacity-80 mb-3" style={{ fontSize: `${Math.max(8, formData.subheadlineFontSize * 0.45)}px` }}>{formData.subheadline}</p>}
                  {formData.showPrice && selectedProduct && (
                    <p className="font-bold" style={{ fontSize: `${Math.max(10, formData.priceFontSize * 0.4)}px` }}>{formatCurrency(typeof selectedProduct.price === 'string' ? parseFloat(selectedProduct.price) : selectedProduct.price)}</p>
                  )}
                </div>
                {selectedProduct?.images?.[0] && (
                  <img src={selectedProduct.images[0]} alt="" className="w-28 h-28 object-cover rounded-xl" />
                )}
              </div>
            )}
          </div>
        );

      case 'search':
        return (
          <div key={section} className="p-4 bg-gray-50">
            <div className="max-w-sm mx-auto">
              <p className="text-xs text-gray-500 mb-2 text-center">Enter postal code to find pickup spots</p>
              <div className="flex gap-2">
                <div className="flex-1 h-8 bg-white border rounded-md px-3 flex items-center text-xs text-gray-400">e.g. N9B 1K3</div>
                <div className="h-8 px-3 rounded-md text-white text-xs flex items-center font-medium" style={{ backgroundColor: ctaColor }}>
                  {formData.ctaText || 'Find My Pickup Spot'}
                </div>
              </div>
            </div>
          </div>
        );

      case 'shopMore': {
        const shopProducts = formData.shopMoreMode === 'custom'
          ? formData.shopMoreProductIds.map(pid => productList.find(p => String(p.id) === pid)).filter(Boolean) as Product[]
          : selectedProduct
            ? productList.filter(p => {
                if (String(p.id) === String(formData.productId)) return false;
                if (formData.shopMoreMode === 'subcategory') return p.subcategory && p.subcategory === selectedProduct.subcategory;
                return p.category && p.category === selectedProduct.category;
              }).slice(0, 6)
            : [];
        return (
          <div key={section} className="p-4 bg-white">
            <h3 className="font-semibold text-sm mb-3">Shop More</h3>
            <div className="flex gap-2 overflow-hidden">
              {(shopProducts.length > 0 ? shopProducts.slice(0, 4) : Array.from({ length: 4 })).map((p, i) => (
                <div key={i} className="w-16 shrink-0">
                  {p ? (
                    <>
                      <div className="w-full aspect-square bg-gray-100 rounded overflow-hidden">
                        {(p as Product).images?.[0] && <img src={(p as Product).images![0]} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <p className="text-[8px] text-gray-600 mt-1 line-clamp-1">{(p as Product).name}</p>
                      {formData.showPrice && <p className="text-[8px] font-bold" style={{ color: gradientFrom }}>{formatCurrency(typeof (p as Product).price === 'string' ? parseFloat((p as Product).price as string) : (p as Product).price as number)}</p>}
                    </>
                  ) : (
                    <>
                      <div className="w-full aspect-square bg-gray-100 rounded" />
                      <div className="h-2 bg-gray-100 rounded mt-1 w-12" />
                      <div className="h-2 bg-gray-100 rounded mt-1 w-8" />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'locationHero':
        return (
          <div key={section} className="p-6 text-white" style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-white/20 flex items-center justify-center">
                <MapPin className="w-8 h-8 text-white" />
              </div>
              <h2 className="font-bold mb-1" style={{ fontSize: `${Math.max(12, formData.headlineFontSize * 0.35)}px` }}>{formData.headline || (selectedNode ? `Pickup at ${selectedNode.name}` : 'Pickup Location')}</h2>
              {formData.subheadline && <p className="opacity-80 mb-2" style={{ fontSize: `${Math.max(8, formData.subheadlineFontSize * 0.45)}px` }}>{formData.subheadline}</p>}
              {selectedNode && (
                <div className="flex items-center justify-center gap-2 text-white/70 text-sm mt-2">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{selectedNode.address}{selectedNode.city ? `, ${selectedNode.city}` : ''}</span>
                </div>
              )}
              <div className="mt-4 inline-block px-4 py-2 rounded-full text-white text-sm font-medium" style={{ backgroundColor: ctaColor }}>
                <Navigation className="w-3.5 h-3.5 inline mr-1.5" />
                Get Directions
              </div>
            </div>
          </div>
        );

      case 'productCarousel': {
        const previewCount = Math.min(formData.carouselVisibleCount, 6);
        const gridProducts = formData.carouselProductIds.length > 0
          ? formData.carouselProductIds.map(pid => productList.find(p => String(p.id) === pid)).filter(Boolean) as Product[]
          : formData.mode === 'location'
            ? productList.slice(0, previewCount * 2)
            : (formData.mode === 'multi' || formData.mode === 'product-location')
              ? formData.productIds.map(pid => productList.find(p => String(p.id) === pid)).filter(Boolean) as Product[]
              : selectedProduct ? [selectedProduct, ...productList.filter(p => String(p.id) !== String(formData.productId) && p.category === selectedProduct.category).slice(0, previewCount * 2 - 1)] : [];
        return (
          <div key={section} className="p-4 bg-white">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" style={{ color: gradientFrom }} />
              {formData.mode === 'location' ? 'Available at this Location' : 'Featured Products'}
            </h3>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${previewCount}, minmax(0, 1fr))` }}>
              {(gridProducts.length > 0 ? gridProducts.slice(0, previewCount * 2) : Array.from({ length: previewCount })).map((p, i) => (
                <div key={i} className="border rounded-lg overflow-hidden">
                  {p ? (
                    <>
                      <div className="w-full aspect-square bg-gray-100 overflow-hidden">
                        {(p as Product).images?.[0] && <img src={(p as Product).images![0]} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="p-1.5">
                        <p className="text-[8px] text-gray-700 line-clamp-1">{(p as Product).name}</p>
                        {formData.showPrice && <p className="text-[8px] font-bold" style={{ color: gradientFrom }}>{formatCurrency(typeof (p as Product).price === 'string' ? parseFloat((p as Product).price as string) : (p as Product).price as number)}</p>}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-full aspect-square bg-gray-100" />
                      <div className="p-1.5">
                        <div className="h-2 bg-gray-200 rounded w-4/5 mb-1" />
                        <div className="h-2 bg-gray-100 rounded w-3/5" />
                      </div>
                    </>
                  )}
                </div>
              ))}
              {gridProducts.length > previewCount && (
                <div className="w-10 shrink-0 border rounded-lg overflow-hidden flex items-center justify-center bg-gray-50">
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'map':
        return (
          <div key={section} className="p-4">
            <div className="relative bg-gray-200 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <MapPin className="w-6 h-6 mx-auto mb-1 text-gray-500" />
                  <p className="text-xs text-gray-500 font-medium">Google Map</p>
                  {selectedNode && <p className="text-[10px] text-gray-400 mt-0.5">{selectedNode.name}</p>}
                  {formData.showMapCircle && (
                    <p className="text-[10px] text-gray-400">Circle: {formData.mapCircleSize}m</p>
                  )}
                </div>
              </div>
              {formData.showMapCircle && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-16 h-16 rounded-full border-2 border-dashed" style={{ borderColor: gradientFrom, backgroundColor: `${gradientFrom}15` }} />
                </div>
              )}
            </div>
          </div>
        );

      case 'allLocationsLink':
        return (
          <div key={section} className="p-4 bg-gray-50 text-center">
            <div className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: gradientFrom }}>
              <Store className="w-4 h-4" />
              View All Pickup Locations
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        );

      case 'promoCodes': {
        const selectedPromos = formData.promoCodes.map(code => promoCodeList.find((p: any) => p.code === code)).filter(Boolean);
        if (selectedPromos.length === 0) {
          return (
            <div key={section} className="p-3 bg-gray-50 text-center">
              <p className="text-xs text-muted-foreground italic">No promo codes selected</p>
            </div>
          );
        }
        const isLocMode = formData.mode === 'location';
        return (
          <div key={section} className={isLocMode
            ? "p-3 bg-gradient-to-r from-amber-50 to-orange-50 border-y border-amber-100"
            : "p-3 rounded-lg"} style={!isLocMode ? { background: `linear-gradient(135deg, ${formData.gradientFrom || '#0d9488'}, ${formData.gradientTo || '#1e3a5f'})` } : undefined}>
            {formData.promoTitle && (
              <p className={`text-center text-[11px] font-semibold mb-1.5 ${isLocMode ? 'text-amber-900' : 'text-white/90'}`}>{formData.promoTitle}</p>
            )}
            <div className="flex flex-wrap gap-1.5 justify-center">
              {selectedPromos.map((promo: any) => (
                <div key={promo.code} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${isLocMode
                  ? 'bg-white border border-amber-200 text-amber-800'
                  : 'bg-white/20 text-white border border-white/30 backdrop-blur-sm'}`}>
                  <Tag className="w-2.5 h-2.5" />
                  {promo.discountType === 'percentage'
                    ? `${promo.discountValue}% OFF`
                    : promo.discountType === 'fixed'
                    ? `$${promo.discountValue} OFF`
                    : promo.name || promo.code}
                  {' — Use code '}<span className="font-bold">{promo.code}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'textbox':
        return (
          <div key={section} className="p-4 bg-white">
            {formData.textboxContent ? (
              <div className="prose prose-sm max-w-none text-[10px] leading-tight" dangerouslySetInnerHTML={{ __html: formData.textboxContent }} />
            ) : (
              <div className="text-center py-4 border-2 border-dashed border-gray-200 rounded-lg">
                <Type className="w-5 h-5 mx-auto mb-1 text-gray-400" />
                <p className="text-xs text-gray-400">Rich text content</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" data-testid="landing-page-editor">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-editor-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <h2 className="font-semibold text-lg">{editingPage ? 'Edit Landing Page' : 'Create Landing Page'}</h2>
          <Badge variant={formData.status === 'active' ? 'default' : 'secondary'}>{formData.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {editingPage && (
            <Button variant="outline" size="sm" onClick={() => window.open(`/lp/${formData.slug}`, '_blank')} data-testid="button-preview-live">
              <Eye className="w-4 h-4 mr-2" />
              Preview Live
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending}
            data-testid="button-save-landing-page"
          >
            {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Save className="w-4 h-4 mr-2" />
            {editingPage ? 'Save Changes' : 'Create Page'}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden" style={isResizing ? { userSelect: 'none' } : undefined}>
        <div style={{ width: `${panelWidth}px` }} className="border-r overflow-y-auto shrink-0 bg-muted/30">
          <Tabs value={settingsTab} onValueChange={setSettingsTab} className="p-4">
            <TabsList className="w-full">
              <TabsTrigger value="content" className="flex-1">Content</TabsTrigger>
              <TabsTrigger value="style" className="flex-1">Style</TabsTrigger>
              <TabsTrigger value="layout" className="flex-1">Layout</TabsTrigger>
              <TabsTrigger value="textblock" className="flex-1">Text Block</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="space-y-5 mt-4">
              <div className="space-y-2">
                <Label>Page Mode</Label>
                <Select value={formData.mode} onValueChange={(v) => setFormData(prev => ({ ...prev, mode: v }))}>
                  <SelectTrigger data-testid="select-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single Product</SelectItem>
                    <SelectItem value="multi">Multiple Products</SelectItem>
                    <SelectItem value="location">Pickup Location</SelectItem>
                    <SelectItem value="product-location">Product + Location</SelectItem>
                    <SelectItem value="postal-code">Postal Code Search</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.mode === 'postal-code' ? (
                <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Postal Code Search Mode</p>
                  <p>Visitors enter their postal code and the nearest pickup node is found automatically. Products at that node are displayed. No product or node selection needed.</p>
                </div>
              ) : formData.mode === 'product-location' ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Products * ({formData.productIds.length} selected)</Label>
                    <Input
                      placeholder="Search products to add..."
                      value={plProductSearch}
                      onChange={(e) => setPlProductSearch(e.target.value)}
                      data-testid="input-pl-product-search"
                    />
                    {plProductSearch && (() => {
                      const filtered = productList.filter(p => p.name.toLowerCase().includes(plProductSearch.toLowerCase())).slice(0, 10);
                      const notYetAdded = filtered.filter(p => !formData.productIds.includes(String(p.id)));
                      return (
                        <div className="max-h-48 overflow-y-auto border rounded-md">
                          {notYetAdded.length > 0 && (
                            <div
                              className="px-3 py-2 cursor-pointer hover:bg-primary/10 text-sm font-medium text-primary border-b flex items-center gap-1"
                              onClick={() => {
                                const newIds = notYetAdded.map(p => String(p.id));
                                setFormData(prev => ({
                                  ...prev,
                                  productIds: [...prev.productIds, ...newIds.filter(id => !prev.productIds.includes(id))],
                                }));
                              }}
                            >
                              <Plus className="w-3 h-3" />
                              Add all {notYetAdded.length} results
                            </div>
                          )}
                          {filtered.map(p => (
                            <div
                              key={p.id}
                              className={`px-3 py-2 cursor-pointer hover:bg-muted text-sm ${formData.productIds.includes(String(p.id)) ? 'bg-muted font-medium' : ''}`}
                              onClick={() => {
                                const pid = String(p.id);
                                setFormData(prev => ({
                                  ...prev,
                                  productIds: prev.productIds.includes(pid) ? prev.productIds.filter(id => id !== pid) : [...prev.productIds, pid],
                                }));
                              }}
                            >
                              {formData.productIds.includes(String(p.id)) && <Check className="w-3 h-3 inline mr-1 text-primary" />}
                              {p.name} {p.productCode ? `(${p.productCode})` : ''}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {formData.productIds.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {formData.productIds.map(pid => {
                          const p = productList.find(pr => String(pr.id) === pid);
                          return (
                            <Badge key={pid} variant="secondary" className="gap-1">
                              {p?.images?.[0] && <img src={p.images[0]} alt="" className="w-4 h-4 object-cover rounded" />}
                              {p?.name || `#${pid}`}
                              <X className="w-3 h-3 cursor-pointer" onClick={() => setFormData(prev => ({ ...prev, productIds: prev.productIds.filter(id => id !== pid) }))} />
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Pickup Location *</Label>
                    <Select value={formData.nodeId} onValueChange={handleNodeSelect}>
                      <SelectTrigger data-testid="select-pl-node">
                        <SelectValue placeholder="Select a location..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeNodes.map(n => (
                          <SelectItem key={n.id} value={n.id}>
                            {n.name} — {n.address}{n.city ? `, ${n.city}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedNode && (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
                        <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <span className="font-medium">{selectedNode.name}</span>
                          <span className="text-muted-foreground ml-1">— {selectedNode.address}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {formData.layoutOrder.includes('map') && (
                    <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
                      <Label className="font-medium">Map Settings</Label>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Show Node Circle</Label>
                        <Checkbox
                          checked={formData.showMapCircle}
                          onCheckedChange={(v) => setFormData(prev => ({ ...prev, showMapCircle: !!v }))}
                          data-testid="checkbox-show-map-circle"
                        />
                      </div>
                      {formData.showMapCircle && (
                        <div className="space-y-1">
                          <Label className="text-sm">Circle Size (meters)</Label>
                          <div className="flex items-center gap-2">
                            <Slider
                              value={[formData.mapCircleSize]}
                              min={100}
                              max={2000}
                              step={50}
                              onValueChange={([v]) => setFormData(prev => ({ ...prev, mapCircleSize: v }))}
                              data-testid="slider-map-circle-size"
                            />
                            <span className="text-sm text-muted-foreground w-14 text-right">{formData.mapCircleSize}m</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>"Shop More" Button Text</Label>
                    <Input
                      value={formData.shopMoreText}
                      onChange={(e) => setFormData(prev => ({ ...prev, shopMoreText: e.target.value }))}
                      placeholder="e.g. Shop more at this location"
                      data-testid="input-shop-more-text"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>"Shop More" Link URL</Label>
                    <Input
                      value={formData.shopMoreLink}
                      onChange={(e) => setFormData(prev => ({ ...prev, shopMoreLink: e.target.value }))}
                      placeholder="e.g. / or /lp/another-page"
                      data-testid="input-shop-more-link"
                    />
                  </div>
                </div>
              ) : formData.mode === 'location' ? (
                <div className="space-y-2">
                  <Label>Pickup Location *</Label>
                  <Select value={formData.nodeId} onValueChange={handleNodeSelect}>
                    <SelectTrigger data-testid="select-node">
                      <SelectValue placeholder="Select a location..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeNodes.map(n => (
                        <SelectItem key={n.id} value={n.id}>
                          {n.name} — {n.address}{n.city ? `, ${n.city}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedNode && (
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div>
                        <span className="font-medium">{selectedNode.name}</span>
                        <span className="text-muted-foreground ml-1">— {selectedNode.address}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : formData.mode === 'single' ? (
                <div className="space-y-2">
                  <Label>Product *</Label>
                  <Input
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    data-testid="input-product-search"
                  />
                  {productSearch && (
                    <div className="max-h-40 overflow-y-auto border rounded-md">
                      {filteredProducts.slice(0, 10).map(p => (
                        <div
                          key={p.id}
                          className={`px-3 py-2 cursor-pointer hover:bg-muted text-sm ${String(p.id) === String(formData.productId) ? 'bg-muted font-medium' : ''}`}
                          onClick={() => { handleProductSelect(String(p.id)); setProductSearch(''); }}
                        >
                          {p.name} {p.productCode ? `(${p.productCode})` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedProduct && (
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
                      {selectedProduct.images?.[0] && <img src={selectedProduct.images[0]} alt="" className="w-8 h-8 object-cover rounded" />}
                      <span className="font-medium">{selectedProduct.name}</span>
                      <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={() => setFormData(prev => ({ ...prev, productId: '' }))}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Products * ({formData.productIds.length} selected)</Label>
                  <Input
                    placeholder="Search products to add..."
                    value={multiProductSearch}
                    onChange={(e) => setMultiProductSearch(e.target.value)}
                    data-testid="input-multi-product-search"
                  />
                  {multiProductSearch && (() => {
                    const filtered = productList.filter(p => p.name.toLowerCase().includes(multiProductSearch.toLowerCase())).slice(0, 10);
                    const notYetAdded = filtered.filter(p => !formData.productIds.includes(String(p.id)));
                    return (
                      <div className="max-h-48 overflow-y-auto border rounded-md">
                        {notYetAdded.length > 0 && (
                          <div
                            className="px-3 py-2 cursor-pointer hover:bg-primary/10 text-sm font-medium text-primary border-b flex items-center gap-1"
                            onClick={() => {
                              const newIds = notYetAdded.map(p => String(p.id));
                              setFormData(prev => ({
                                ...prev,
                                productIds: [...prev.productIds, ...newIds.filter(id => !prev.productIds.includes(id))],
                              }));
                            }}
                          >
                            <Plus className="w-3 h-3" />
                            Add all {notYetAdded.length} results
                          </div>
                        )}
                        {filtered.map(p => (
                          <div
                            key={p.id}
                            className={`px-3 py-2 cursor-pointer hover:bg-muted text-sm ${formData.productIds.includes(String(p.id)) ? 'bg-muted font-medium' : ''}`}
                            onClick={() => {
                              const pid = String(p.id);
                              setFormData(prev => ({
                                ...prev,
                                productIds: prev.productIds.includes(pid) ? prev.productIds.filter(id => id !== pid) : [...prev.productIds, pid],
                              }));
                            }}
                          >
                            {formData.productIds.includes(String(p.id)) && <Check className="w-3 h-3 inline mr-1 text-primary" />}
                            {p.name} {p.productCode ? `(${p.productCode})` : ''}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  {formData.productIds.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {formData.productIds.map(pid => {
                        const p = productList.find(pr => String(pr.id) === pid);
                        return (
                          <Badge key={pid} variant="secondary" className="gap-1">
                            {p?.images?.[0] && <img src={p.images[0]} alt="" className="w-4 h-4 object-cover rounded" />}
                            {p?.name || `#${pid}`}
                            <X className="w-3 h-3 cursor-pointer" onClick={() => setFormData(prev => ({ ...prev, productIds: prev.productIds.filter(id => id !== pid) }))} />
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setProductBrowserOpen(!productBrowserOpen)}
                  className="w-full flex items-center justify-between p-2.5 hover:bg-muted/50 transition-colors text-sm"
                  data-testid="toggle-product-browser"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    Browse All Products
                    <Badge variant="secondary" className="text-xs">{productList.length}</Badge>
                  </span>
                  {productBrowserOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {productBrowserOpen && (
                  <div className="border-t p-2 space-y-2">
                    <Input
                      placeholder="Filter by name or code..."
                      value={productBrowserSearch}
                      onChange={(e) => setProductBrowserSearch(e.target.value)}
                      className="h-8 text-sm"
                      data-testid="input-product-browser-search"
                    />
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {browserFilteredProducts.map(p => {
                        const isSelected = formData.mode === 'single'
                          ? String(p.id) === String(formData.productId)
                          : formData.productIds.includes(String(p.id));
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-muted transition-colors text-xs ${isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                            onClick={() => {
                              if (formData.mode === 'single') {
                                handleProductSelect(String(p.id));
                              } else {
                                const pid = String(p.id);
                                setFormData(prev => ({
                                  ...prev,
                                  productIds: prev.productIds.includes(pid)
                                    ? prev.productIds.filter(id => id !== pid)
                                    : [...prev.productIds, pid],
                                }));
                              }
                            }}
                            data-testid={`browser-product-${p.id}`}
                          >
                            {p.images?.[0] && <img src={p.images[0]} alt="" className="w-10 h-10 object-cover rounded shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{p.name}</p>
                              <p className="text-muted-foreground">{p.productCode || ''} {p.price ? `— $${p.price}` : ''}</p>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                          </div>
                        );
                      })}
                      {browserFilteredProducts.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-3">No products match your search</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Slug *</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">/lp/</span>
                    <Input
                      value={formData.slug}
                      onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                      placeholder="page-slug"
                      className="text-sm"
                      data-testid="input-slug"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v }))}>
                    <SelectTrigger data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Headline</Label>
                <Input
                  value={formData.headline}
                  onChange={(e) => setFormData(prev => ({ ...prev, headline: e.target.value }))}
                  placeholder={formData.mode === 'location' ? 'e.g. Pickup at Node Name' : 'Custom headline'}
                  data-testid="input-headline"
                />
              </div>

              <div className="space-y-2">
                <Label>Subheadline</Label>
                <Textarea
                  value={formData.subheadline}
                  onChange={(e) => setFormData(prev => ({ ...prev, subheadline: e.target.value }))}
                  placeholder="Additional text below the headline"
                  rows={2}
                  data-testid="input-subheadline"
                />
              </div>

              <div className="space-y-2">
                <Label>CTA Button Text</Label>
                <Input
                  value={formData.ctaText}
                  onChange={(e) => setFormData(prev => ({ ...prev, ctaText: e.target.value }))}
                  placeholder={formData.mode === 'location' ? 'Browse Products' : 'Find My Pickup Spot'}
                  data-testid="input-cta-text"
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-sm font-medium">Text Sizing</Label>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Headline Size</Label>
                      <span className="text-sm text-muted-foreground">{formData.headlineFontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={24}
                      max={80}
                      step={2}
                      value={formData.headlineFontSize}
                      onChange={(e) => setFormData(prev => ({ ...prev, headlineFontSize: parseInt(e.target.value) }))}
                      className="w-full accent-primary"
                      data-testid="range-headline-size"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>24px</span>
                      <span>80px</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Subheadline Size</Label>
                      <span className="text-sm text-muted-foreground">{formData.subheadlineFontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={12}
                      max={40}
                      step={1}
                      value={formData.subheadlineFontSize}
                      onChange={(e) => setFormData(prev => ({ ...prev, subheadlineFontSize: parseInt(e.target.value) }))}
                      className="w-full accent-primary"
                      data-testid="range-subheadline-size"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>12px</span>
                      <span>40px</span>
                    </div>
                  </div>
                  {formData.mode !== 'location' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Price Size</Label>
                        <span className="text-sm text-muted-foreground">{formData.priceFontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min={16}
                        max={60}
                        step={2}
                        value={formData.priceFontSize}
                        onChange={(e) => setFormData(prev => ({ ...prev, priceFontSize: parseInt(e.target.value) }))}
                        className="w-full accent-primary"
                        data-testid="range-price-size"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>16px</span>
                        <span>60px</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-sm font-medium">Display Toggles</Label>
                <div className="space-y-2">
                  {[
                    { key: 'showPrice', label: 'Show Price' },
                    { key: 'showDescription', label: 'Show Description' },
                    { key: 'showCondition', label: 'Show Condition' },
                    { key: 'showBrand', label: 'Show Brand' },
                    { key: 'groupByCategory', label: 'Group by Category' },
                    ...(formData.groupByCategory ? [{ key: 'showSubcategories', label: 'Show Subcategories' }] : []),
                  ].map(toggle => (
                    <div key={toggle.key} className="flex items-center justify-between">
                      <Label className="text-sm">{toggle.label}</Label>
                      <Switch
                        checked={(formData as any)[toggle.key]}
                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, [toggle.key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-medium">Promo Codes</Label>
                <Input
                  value={formData.promoTitle}
                  onChange={(e) => setFormData(prev => ({ ...prev, promoTitle: e.target.value }))}
                  placeholder="e.g. Use these codes at checkout!"
                  className="text-sm"
                  data-testid="input-promo-title"
                />
                <div className="flex flex-wrap gap-2">
                  {activePromos.map((promo: any) => (
                    <Badge
                      key={promo.id}
                      variant={formData.promoCodes.includes(promo.code) ? 'default' : 'outline'}
                      className="cursor-pointer text-xs"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          promoCodes: prev.promoCodes.includes(promo.code)
                            ? prev.promoCodes.filter(c => c !== promo.code)
                            : [...prev.promoCodes, promo.code],
                        }));
                      }}
                    >
                      {promo.code}
                      {formData.promoCodes.includes(promo.code) && <Check className="w-3 h-3 ml-1" />}
                    </Badge>
                  ))}
                  {activePromos.length === 0 && <p className="text-xs text-muted-foreground">No active promo codes</p>}
                </div>
              </div>

              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-medium">Product Grid Settings</Label>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Max Tiles Per Row</Label>
                      <span className="text-sm text-muted-foreground">{formData.carouselVisibleCount}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={6}
                      step={1}
                      value={formData.carouselVisibleCount}
                      onChange={(e) => setFormData(prev => ({ ...prev, carouselVisibleCount: parseInt(e.target.value) }))}
                      className="w-full accent-primary"
                      data-testid="range-max-tiles"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>1</span>
                      <span>6</span>
                    </div>
                  </div>

                      <Separator className="my-2" />
                      <Label className="text-sm">Custom Product Order</Label>
                      <p className="text-xs text-muted-foreground">Add products to control grid display order. Leave empty to use default.</p>
                      <Input
                        value={carouselSearch}
                        onChange={(e) => setCarouselSearch(e.target.value)}
                        placeholder="Search products to add..."
                        className="text-sm"
                        data-testid="input-carousel-search"
                      />
                      {carouselSearch && (
                        <div className="max-h-32 overflow-y-auto border rounded space-y-0.5 p-1">
                          {productList
                            .filter(p => !formData.carouselProductIds.includes(String(p.id)) &&
                              (p.name?.toLowerCase().includes(carouselSearch.toLowerCase()) ||
                               p.productCode?.toLowerCase().includes(carouselSearch.toLowerCase())))
                            .slice(0, 8)
                            .map(p => (
                              <div
                                key={p.id}
                                className="flex items-center gap-2 p-1 rounded hover:bg-muted cursor-pointer text-xs"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, carouselProductIds: [...prev.carouselProductIds, String(p.id)] }));
                                  setCarouselSearch('');
                                }}
                                data-testid={`carousel-add-${p.id}`}
                              >
                                {p.images?.[0] && <img src={p.images[0]} alt="" className="w-6 h-6 rounded object-cover" />}
                                <span className="truncate flex-1">{p.name}</span>
                                <Plus className="w-3 h-3 text-muted-foreground shrink-0" />
                              </div>
                            ))}
                        </div>
                      )}
                      {formData.carouselProductIds.length > 0 && (
                        <div className="space-y-1">
                          {formData.carouselProductIds.map((pid, idx) => {
                            const p = productList.find(pr => String(pr.id) === pid);
                            return (
                              <div
                                key={pid}
                                className="flex items-center gap-1.5 p-1 rounded border bg-white text-xs"
                                draggable
                                onDragStart={() => setDraggedItem(`carousel-${idx}`)}
                                onDragOver={(e) => { e.preventDefault(); setDragOverItem(`carousel-${idx}`); }}
                                onDrop={() => {
                                  if (draggedItem?.startsWith('carousel-')) {
                                    const fromIdx = parseInt(draggedItem.split('-')[1]);
                                    setFormData(prev => {
                                      const ids = [...prev.carouselProductIds];
                                      const [moved] = ids.splice(fromIdx, 1);
                                      ids.splice(idx, 0, moved);
                                      return { ...prev, carouselProductIds: ids };
                                    });
                                  }
                                  setDraggedItem(null);
                                  setDragOverItem(null);
                                }}
                                onDragEnd={() => { setDraggedItem(null); setDragOverItem(null); }}
                                data-testid={`carousel-item-${idx}`}
                              >
                                <GripVertical className="w-3 h-3 text-muted-foreground cursor-grab shrink-0" />
                                <span className="text-muted-foreground w-4 text-center shrink-0">{idx + 1}</span>
                                {p?.images?.[0] && <img src={p.images[0]} alt="" className="w-5 h-5 rounded object-cover shrink-0" />}
                                <span className="truncate flex-1">{p?.name || pid}</span>
                                <button
                                  type="button"
                                  onClick={() => setFormData(prev => ({
                                    ...prev,
                                    carouselProductIds: prev.carouselProductIds.filter((_, i) => i !== idx),
                                  }))}
                                  className="text-muted-foreground hover:text-destructive shrink-0"
                                  data-testid={`carousel-remove-${idx}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                </div>
              </div>

              {formData.mode !== 'location' && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Shop More Section</Label>
                    <Select value={formData.shopMoreMode} onValueChange={(v) => setFormData(prev => ({ ...prev, shopMoreMode: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="subcategory">Same Subcategory</SelectItem>
                        <SelectItem value="category">Same Category</SelectItem>
                        <SelectItem value="custom">Custom Products</SelectItem>
                      </SelectContent>
                    </Select>

                    {formData.shopMoreMode === 'custom' && (
                      <div className="space-y-2">
                        <Input
                          placeholder="Search products to add..."
                          value={shopMoreSearch}
                          onChange={(e) => setShopMoreSearch(e.target.value)}
                        />
                        {shopMoreSearch && (
                          <div className="max-h-32 overflow-y-auto border rounded-md">
                            {productList.filter(p => p.name.toLowerCase().includes(shopMoreSearch.toLowerCase())).slice(0, 8).map(p => (
                              <div
                                key={p.id}
                                className={`px-3 py-2 cursor-pointer hover:bg-muted text-sm ${formData.shopMoreProductIds.includes(String(p.id)) ? 'bg-muted' : ''}`}
                                onClick={() => {
                                  const pid = String(p.id);
                                  setFormData(prev => ({
                                    ...prev,
                                    shopMoreProductIds: prev.shopMoreProductIds.includes(pid)
                                      ? prev.shopMoreProductIds.filter(id => id !== pid)
                                      : [...prev.shopMoreProductIds, pid],
                                  }));
                                }}
                              >
                                {formData.shopMoreProductIds.includes(String(p.id)) && <Check className="w-3 h-3 inline mr-1 text-primary" />}
                                {p.name}
                              </div>
                            ))}
                          </div>
                        )}
                        {formData.shopMoreProductIds.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {formData.shopMoreProductIds.map(pid => {
                              const p = productList.find(pr => String(pr.id) === pid);
                              return (
                                <Badge key={pid} variant="secondary" className="gap-1 text-xs">
                                  {p?.name || `#${pid}`}
                                  <X className="w-3 h-3 cursor-pointer" onClick={() => setFormData(prev => ({ ...prev, shopMoreProductIds: prev.shopMoreProductIds.filter(id => id !== pid) }))} />
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

            </TabsContent>

            <TabsContent value="style" className="space-y-5 mt-4">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Colors</Label>
                <div className="space-y-3">
                  {[
                    { key: 'gradientFrom', label: 'Gradient Start' },
                    { key: 'gradientTo', label: 'Gradient End' },
                    { key: 'ctaColor', label: 'CTA Button Color' },
                  ].map(color => (
                    <div key={color.key} className="flex items-center gap-3">
                      <input
                        type="color"
                        value={(formData as any)[color.key]}
                        onChange={(e) => setFormData(prev => ({ ...prev, [color.key]: e.target.value }))}
                        className="w-8 h-8 rounded cursor-pointer border shrink-0"
                      />
                      <div className="flex-1">
                        <Label className="text-xs">{color.label}</Label>
                        <Input
                          value={(formData as any)[color.key]}
                          onChange={(e) => setFormData(prev => ({ ...prev, [color.key]: e.target.value }))}
                          className="font-mono text-xs h-7 mt-1"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm font-medium">Gradient Preview</Label>
                <div className="rounded-lg p-6 text-white text-center" style={{ background: `linear-gradient(135deg, ${formData.gradientFrom}, ${formData.gradientTo})` }}>
                  <p className="text-lg font-bold mb-2">{formData.headline || 'Headline Preview'}</p>
                  {formData.subheadline && <p className="text-sm opacity-80 mb-3">{formData.subheadline}</p>}
                  <div className="inline-block px-5 py-2 rounded-full text-white font-medium text-sm" style={{ backgroundColor: formData.ctaColor }}>
                    {formData.ctaText || 'CTA Button'}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="textblock" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Type className="w-4 h-4" />
                  Text Block Content
                </Label>
                <p className="text-xs text-muted-foreground">Write rich text here. Make sure to add "Text Block" in the Layout tab to display it on your page.</p>
                {!formData.layoutOrder.includes('textbox') && (
                  <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-800 flex-1">Text Block is not in your layout yet.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 border-amber-300 text-amber-800 hover:bg-amber-100"
                      onClick={() => setFormData(prev => ({ ...prev, layoutOrder: [...prev.layoutOrder, 'textbox'] }))}
                      data-testid="button-add-textbox-to-layout"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add to Layout
                    </Button>
                  </div>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="flex flex-wrap items-center gap-0.5 p-1.5 bg-muted/50 border-b">
                  <button type="button" className="p-1.5 rounded hover:bg-background text-xs font-bold" onClick={() => document.execCommand('bold')} data-testid="button-textbox-bold">B</button>
                  <button type="button" className="p-1.5 rounded hover:bg-background text-xs italic" onClick={() => document.execCommand('italic')} data-testid="button-textbox-italic">I</button>
                  <button type="button" className="p-1.5 rounded hover:bg-background text-xs underline" onClick={() => document.execCommand('underline')} data-testid="button-textbox-underline">U</button>
                  <div className="w-px h-5 bg-border mx-1" />
                  <select className="text-xs border rounded px-1.5 py-1 bg-background" onChange={(e) => { document.execCommand('fontSize', false, e.target.value); }} defaultValue="3" data-testid="select-textbox-fontsize">
                    <option value="1">Small</option>
                    <option value="3">Normal</option>
                    <option value="5">Large</option>
                    <option value="7">Huge</option>
                  </select>
                  <select className="text-xs border rounded px-1.5 py-1 bg-background" onChange={(e) => { document.execCommand('fontName', false, e.target.value); }} defaultValue="" data-testid="select-textbox-fontfamily">
                    <option value="">Font</option>
                    <option value="Inter">Inter</option>
                    <option value="Montserrat">Montserrat</option>
                    <option value="Arial">Arial</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Courier New">Courier New</option>
                  </select>
                  <div className="w-px h-5 bg-border mx-1" />
                  <button type="button" className="p-1.5 rounded hover:bg-background text-xs" onClick={() => document.execCommand('insertUnorderedList')} data-testid="button-textbox-ul">• List</button>
                  <button type="button" className="p-1.5 rounded hover:bg-background text-xs" onClick={() => document.execCommand('insertOrderedList')} data-testid="button-textbox-ol">1. List</button>
                  <div className="w-px h-5 bg-border mx-1" />
                  <button type="button" className="p-1.5 rounded hover:bg-background text-xs" onClick={() => document.execCommand('justifyLeft')} data-testid="button-textbox-left">Left</button>
                  <button type="button" className="p-1.5 rounded hover:bg-background text-xs" onClick={() => document.execCommand('justifyCenter')} data-testid="button-textbox-center">Center</button>
                  <button type="button" className="p-1.5 rounded hover:bg-background text-xs" onClick={() => document.execCommand('justifyRight')} data-testid="button-textbox-right">Right</button>
                  <div className="w-px h-5 bg-border mx-1" />
                  <button type="button" className="p-1.5 rounded hover:bg-background text-xs" onClick={() => {
                    const url = prompt('Enter link URL:');
                    if (url) document.execCommand('createLink', false, url);
                  }} data-testid="button-textbox-link">Link</button>
                  <label className="p-1.5 rounded hover:bg-background text-xs cursor-pointer" data-testid="button-textbox-image">
                    Img
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const urlRes = await fetch('/api/uploads/request-url', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
                        });
                        if (!urlRes.ok) throw new Error('Upload failed');
                        const { uploadURL, objectPath } = await urlRes.json();
                        await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
                        const publicUrl = `/api/objects/public/${objectPath.split('/').pop()}`;
                        document.execCommand('insertImage', false, publicUrl);
                        const editor = textboxEditorRef.current;
                        if (editor) {
                          const imgs = editor.querySelectorAll('img:not([style])');
                          imgs.forEach(img => { (img as HTMLElement).style.maxWidth = '100%'; (img as HTMLElement).style.borderRadius = '8px'; (img as HTMLElement).style.margin = '8px 0'; });
                          setFormData(prev => ({ ...prev, textboxContent: editor.innerHTML }));
                        }
                      } catch (err) {
                        console.error('Image upload failed:', err);
                      }
                      e.target.value = '';
                    }} />
                  </label>
                  <div className="w-px h-5 bg-border mx-1" />
                  <input type="color" className="w-6 h-6 rounded cursor-pointer border-0 p-0" onChange={(e) => document.execCommand('foreColor', false, e.target.value)} title="Text color" data-testid="input-textbox-color" />
                </div>
                <div
                  id="textbox-editor"
                  ref={(el) => {
                    textboxEditorRef.current = el;
                    if (el && !el.dataset.initialized && formData.textboxContent) {
                      el.innerHTML = formData.textboxContent;
                      el.dataset.initialized = 'true';
                    }
                  }}
                  contentEditable
                  suppressContentEditableWarning
                  className="p-3 min-h-[200px] max-h-[400px] overflow-y-auto text-sm focus:outline-none prose prose-sm max-w-none"
                  onInput={(e) => {
                    setFormData(prev => ({ ...prev, textboxContent: (e.target as HTMLElement).innerHTML }));
                  }}
                  onBlur={(e) => {
                    setFormData(prev => ({ ...prev, textboxContent: (e.target as HTMLElement).innerHTML }));
                  }}
                  data-testid="editor-textbox-content"
                />
              </div>
            </TabsContent>

            <TabsContent value="layout" className="space-y-4 mt-4">
              {formData.mode === 'postal-code' ? (
                <>
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-800 font-medium">Pre-Search Layout</p>
                      <p className="text-xs text-blue-600 mt-0.5">Shown before the visitor searches a postal code.</p>
                    </div>
                    <div className="space-y-2">
                      {formData.layoutOrder.map((section) => (
                        <div
                          key={`pre-${section}`}
                          draggable
                          onDragStart={() => handleDragStart(section)}
                          onDragOver={(e) => handleDragOver(e, section)}
                          onDrop={() => handleDrop(section, 'layoutOrder')}
                          onDragEnd={() => { setDraggedItem(null); setDragOverItem(null); }}
                          className={`flex items-center gap-3 p-3 bg-background border rounded-lg cursor-grab active:cursor-grabbing transition-all ${
                            dragOverItem === section ? 'border-primary ring-1 ring-primary' : ''
                          } ${draggedItem === section ? 'opacity-50' : ''}`}
                          data-testid={`layout-item-pre-${section}`}
                        >
                          <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium flex-1">{sectionLabels[section] || section}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFormData(prev => ({ ...prev, layoutOrder: prev.layoutOrder.filter(s => s !== section) })); }}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            data-testid={`remove-layout-pre-${section}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const allSections = ['hero', 'promoCodes', 'search', 'shopMore', 'productCarousel', 'locationHero', 'map', 'allLocationsLink', 'textbox'];
                      const removed = allSections.filter(s => !formData.layoutOrder.includes(s));
                      if (removed.length === 0) return null;
                      return (
                        <div>
                          <Label className="text-xs text-muted-foreground">Available Sections</Label>
                          <div className="space-y-1.5 mt-1.5">
                            {removed.map(section => (
                              <div key={section} className="flex items-center gap-3 p-2.5 border border-dashed rounded-lg bg-muted/30" data-testid={`removed-layout-pre-${section}`}>
                                <span className="text-sm text-muted-foreground flex-1">{sectionLabels[section] || section}</span>
                                <button
                                  type="button"
                                  onClick={() => setFormData(prev => ({ ...prev, layoutOrder: [...prev.layoutOrder, section] }))}
                                  className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                  data-testid={`add-layout-pre-${section}`}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-xs text-green-800 font-medium">Post-Search Layout</p>
                      <p className="text-xs text-green-600 mt-0.5">Shown after a location is found. Leave empty to use the pre-search layout.</p>
                    </div>
                    <div className="space-y-2">
                      {formData.postSearchLayoutOrder.map((section) => (
                        <div
                          key={`post-${section}`}
                          draggable
                          onDragStart={() => handleDragStart(section)}
                          onDragOver={(e) => handleDragOver(e, section)}
                          onDrop={() => handleDrop(section, 'postSearchLayoutOrder')}
                          onDragEnd={() => { setDraggedItem(null); setDragOverItem(null); }}
                          className={`flex items-center gap-3 p-3 bg-background border rounded-lg cursor-grab active:cursor-grabbing transition-all ${
                            dragOverItem === section ? 'border-primary ring-1 ring-primary' : ''
                          } ${draggedItem === section ? 'opacity-50' : ''}`}
                          data-testid={`layout-item-post-${section}`}
                        >
                          <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium flex-1">{sectionLabels[section] || section}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFormData(prev => ({ ...prev, postSearchLayoutOrder: prev.postSearchLayoutOrder.filter(s => s !== section) })); }}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            data-testid={`remove-layout-post-${section}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const allSections = ['hero', 'promoCodes', 'search', 'shopMore', 'productCarousel', 'locationHero', 'map', 'allLocationsLink', 'textbox'];
                      const removed = allSections.filter(s => !formData.postSearchLayoutOrder.includes(s));
                      if (removed.length === 0) return null;
                      return (
                        <div>
                          <Label className="text-xs text-muted-foreground">Available Sections</Label>
                          <div className="space-y-1.5 mt-1.5">
                            {removed.map(section => (
                              <div key={section} className="flex items-center gap-3 p-2.5 border border-dashed rounded-lg bg-muted/30" data-testid={`removed-layout-post-${section}`}>
                                <span className="text-sm text-muted-foreground flex-1">{sectionLabels[section] || section}</span>
                                <button
                                  type="button"
                                  onClick={() => setFormData(prev => ({ ...prev, postSearchLayoutOrder: [...prev.postSearchLayoutOrder, section] }))}
                                  className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                  data-testid={`add-layout-post-${section}`}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label className="text-sm font-medium">Section Order</Label>
                    <p className="text-xs text-muted-foreground mt-1">Drag sections to reorder. Click ✕ to remove a section.</p>
                  </div>
                  <div className="space-y-2">
                    {formData.layoutOrder.map((section) => (
                      <div
                        key={section}
                        draggable
                        onDragStart={() => handleDragStart(section)}
                        onDragOver={(e) => handleDragOver(e, section)}
                        onDrop={() => handleDrop(section)}
                        onDragEnd={() => { setDraggedItem(null); setDragOverItem(null); }}
                        className={`flex items-center gap-3 p-3 bg-background border rounded-lg cursor-grab active:cursor-grabbing transition-all ${
                          dragOverItem === section ? 'border-primary ring-1 ring-primary' : ''
                        } ${draggedItem === section ? 'opacity-50' : ''}`}
                        data-testid={`layout-item-${section}`}
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium flex-1">{sectionLabels[section] || section}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setFormData(prev => ({ ...prev, layoutOrder: prev.layoutOrder.filter(s => s !== section) })); }}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          data-testid={`remove-layout-${section}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const allSections = formData.mode === 'location'
                      ? ['locationHero', 'map', 'promoCodes', 'productCarousel', 'allLocationsLink', 'search', 'hero', 'shopMore', 'textbox']
                      : ['hero', 'promoCodes', 'search', 'shopMore', 'productCarousel', 'locationHero', 'map', 'allLocationsLink', 'textbox'];
                    const removed = allSections.filter(s => !formData.layoutOrder.includes(s));
                    if (removed.length === 0) return null;
                    return (
                      <div>
                        <Label className="text-xs text-muted-foreground">Removed Sections</Label>
                        <div className="space-y-1.5 mt-1.5">
                          {removed.map(section => (
                            <div key={section} className="flex items-center gap-3 p-2.5 border border-dashed rounded-lg bg-muted/30" data-testid={`removed-layout-${section}`}>
                              <span className="text-sm text-muted-foreground flex-1">{sectionLabels[section] || section}</span>
                              <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, layoutOrder: [...prev.layoutOrder, section] }))}
                                className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                data-testid={`add-layout-${section}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </TabsContent>
          </Tabs>

          <div className="border-t">
            <button
              type="button"
              onClick={() => setQrExpanded(!qrExpanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              data-testid="toggle-qr-section"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <QrCode className="w-4 h-4" />
                QR Code Generator
                {savedQrs.length > 0 && <Badge variant="secondary" className="text-xs">{savedQrs.length}</Badge>}
              </div>
              {qrExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {qrExpanded && (
              <div className="px-4 pb-4 space-y-4">
                <div className="flex flex-col gap-4">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Name</Label>
                        <Input value={qrName} onChange={(e) => setQrName(e.target.value)} placeholder={`${formData.slug || 'landing'} QR`} className="h-8 text-sm" data-testid="qr-name-input" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Link Destination</Label>
                        <Select value={qrLinkType} onValueChange={setQrLinkType}>
                          <SelectTrigger className="h-8 text-sm" data-testid="qr-link-select"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {qrLinkOptions.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {qrLinkType === 'custom' && (
                      <div className="space-y-1">
                        <Label className="text-xs">Custom URL</Label>
                        <Input value={qrCustomUrl} onChange={(e) => setQrCustomUrl(e.target.value)} placeholder="https://gridmart.ca/..." className="h-8 text-sm" data-testid="qr-custom-url" />
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground break-all">
                      {getQrUrl()}
                    </p>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Size</Label>
                        <Badge variant="secondary" className="font-mono text-xs">{qrSize}px</Badge>
                      </div>
                      <Slider value={[qrSize]} onValueChange={([v]) => setQrSize(v)} min={150} max={1000} step={50} data-testid="qr-size-slider" />
                    </div>

                    <button type="button" onClick={() => setQrShowStyle(!qrShowStyle)} className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline cursor-pointer" data-testid="toggle-qr-style">
                      {qrShowStyle ? '▾' : '▸'} Style Options
                    </button>

                    {qrShowStyle && (
                      <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">QR Colour</Label>
                            <div className="flex items-center gap-2">
                              <input type="color" value={qrFgColor} onChange={(e) => setQrFgColor(e.target.value)} className="w-7 h-7 rounded border cursor-pointer" data-testid="qr-fg-color" />
                              <Input value={qrFgColor} onChange={(e) => setQrFgColor(e.target.value)} className="flex-1 h-7 text-xs font-mono" />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Background</Label>
                            <div className="flex items-center gap-2">
                              <input type="color" value={qrBgColor} onChange={(e) => setQrBgColor(e.target.value)} className="w-7 h-7 rounded border cursor-pointer" data-testid="qr-bg-color" />
                              <Input value={qrBgColor} onChange={(e) => setQrBgColor(e.target.value)} className="flex-1 h-7 text-xs font-mono" />
                            </div>
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Border</Label>
                            <button type="button" onClick={() => setQrBorderEnabled(!qrBorderEnabled)} className={`relative w-9 h-5 rounded-full transition-colors ${qrBorderEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`} data-testid="qr-border-toggle">
                              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${qrBorderEnabled ? 'translate-x-4' : ''}`} />
                            </button>
                          </div>
                          {qrBorderEnabled && (
                            <div className="space-y-2 pl-1">
                              <div className="flex items-center gap-2">
                                <Label className="text-xs w-14 shrink-0">Colour</Label>
                                <input type="color" value={qrBorderColor} onChange={(e) => setQrBorderColor(e.target.value)} className="w-6 h-6 rounded border cursor-pointer" data-testid="qr-border-color" />
                                <Input value={qrBorderColor} onChange={(e) => setQrBorderColor(e.target.value)} className="flex-1 h-7 text-xs font-mono" />
                              </div>
                              <div className="flex items-center gap-2">
                                <Label className="text-xs w-14 shrink-0">Width</Label>
                                <Slider value={[qrBorderWidth]} onValueChange={([v]) => setQrBorderWidth(v)} min={2} max={30} step={1} className="flex-1" data-testid="qr-border-width" />
                                <Badge variant="secondary" className="font-mono text-xs">{qrBorderWidth}px</Badge>
                              </div>
                            </div>
                          )}
                        </div>

                        <Separator />

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Corner Rounding</Label>
                            <Badge variant="secondary" className="font-mono text-xs">{qrCornerRadius}px</Badge>
                          </div>
                          <Slider value={[qrCornerRadius]} onValueChange={([v]) => setQrCornerRadius(v)} min={0} max={50} step={2} data-testid="qr-corner-radius" />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button onClick={saveQrCode} disabled={!qrPreviewUrl || createQrMutation.isPending} size="sm" className="flex-1" data-testid="save-qr-btn">
                        {createQrMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        Save QR Code
                      </Button>
                      {qrPreviewUrl && (
                        <Button variant="outline" size="sm" onClick={() => downloadQrImage(qrPreviewUrl, qrName || formData.slug || 'qr-code')} data-testid="download-qr-btn">
                          <Download className="w-3 h-3 mr-1" /> PNG
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-center">
                    {qrPreviewUrl ? (
                      <img src={qrPreviewUrl} alt="QR Code Preview" className="max-w-[160px] max-h-[160px] shadow-sm" style={{ borderRadius: `${Math.min(qrCornerRadius, 20)}px` }} data-testid="qr-preview" />
                    ) : (
                      <div className="w-[140px] h-[140px] border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground">
                        <div className="text-center text-xs">
                          <QrCode className="w-8 h-8 mx-auto mb-1 opacity-30" />
                          Preview
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {savedQrs.length > 0 && (
                  <div className="space-y-2">
                    <Separator />
                    <Label className="text-xs font-medium">Saved QR Codes</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {savedQrs.map((qr: any) => (
                        <div key={qr.id} className="group border rounded-lg p-2 space-y-1 hover:shadow-md transition-shadow" data-testid={`saved-qr-${qr.id}`}>
                          <div className="flex items-center justify-center">
                            <img src={qr.dataUrl} alt={qr.name} className="w-[80px] h-[80px] object-contain" style={{ borderRadius: `${Math.min(qr.cornerRadius ?? 0, 10)}px` }} />
                          </div>
                          <p className="text-xs font-medium text-center truncate" title={qr.name}>{qr.name}</p>
                          <p className="text-[10px] text-muted-foreground text-center truncate">
                            {qr.linkType === 'custom' ? qr.customUrl : qr.linkType === 'landing' ? 'Landing Page' : qrLinkOptions.find(o => o.value === qr.linkType)?.label || qr.linkType}
                          </p>
                          <div className="flex gap-1 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => downloadQrImage(qr.dataUrl, qr.name)} data-testid={`download-saved-${qr.id}`}>
                              <Download className="w-3 h-3 mr-0.5" /> PNG
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => {
                              setQrLinkType(qr.linkType);
                              setQrCustomUrl(qr.customUrl || '');
                              setQrSize(qr.size);
                              setQrFgColor(qr.fgColor);
                              setQrBgColor(qr.bgColor);
                              setQrBorderEnabled(qr.borderEnabled ?? false);
                              setQrBorderColor(qr.borderColor || '#1D3557');
                              setQrBorderWidth(qr.borderWidth ?? 8);
                              setQrCornerRadius(qr.cornerRadius ?? 0);
                              setQrName(qr.name);
                              setQrPreviewUrl(qr.dataUrl);
                              setQrShowStyle(true);
                              toast.info(`Loaded "${qr.name}"`);
                            }} data-testid={`edit-saved-${qr.id}`}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] text-destructive hover:text-destructive" onClick={async () => {
                              try { await deleteQrMutation.mutateAsync(qr.id); toast.success('Deleted'); } catch { toast.error('Failed'); }
                            }} data-testid={`delete-saved-${qr.id}`}>
                              ✕
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className="w-1.5 shrink-0 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors relative group"
          onMouseDown={handleResizeStart}
          data-testid="panel-resize-handle"
        >
          <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center">
            <div className="w-0.5 h-8 bg-muted-foreground/30 group-hover:bg-primary/50 rounded-full transition-colors" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-muted/50 p-8 flex justify-center">
          <div className="w-full max-w-[420px]">
            {formData.mode === 'postal-code' ? (
              <>
                <div className="text-xs text-center mb-3 font-medium text-blue-600">
                  Pre-Search Preview — /lp/{formData.slug || 'page-slug'}
                </div>
                <div className="bg-white rounded-xl shadow-xl overflow-hidden border-2 border-blue-200 mb-8">
                  <div className="bg-blue-50 h-8 flex items-center px-3 gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    <div className="flex-1 mx-3 h-4 bg-white rounded-sm flex items-center px-2">
                      <span className="text-[10px] text-gray-400 truncate">gridmart.ca/lp/{formData.slug || '...'}</span>
                    </div>
                  </div>
                  <div className="divide-y">
                    {formData.layoutOrder.map(section => renderPreviewSection(section))}
                  </div>
                  <div className="h-8 bg-gray-100 flex items-center justify-center">
                    <span className="text-[9px] text-gray-400">Footer</span>
                  </div>
                </div>

                <div className="text-xs text-center mb-3 font-medium text-green-600">
                  Post-Search Preview — after location found
                </div>
                <div className="bg-white rounded-xl shadow-xl overflow-hidden border-2 border-green-200">
                  <div className="bg-green-50 h-8 flex items-center px-3 gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    <div className="flex-1 mx-3 h-4 bg-white rounded-sm flex items-center px-2">
                      <span className="text-[10px] text-gray-400 truncate">gridmart.ca/lp/{formData.slug || '...'}</span>
                    </div>
                  </div>
                  <div className="divide-y">
                    {(formData.postSearchLayoutOrder && formData.postSearchLayoutOrder.length > 0 ? formData.postSearchLayoutOrder : formData.layoutOrder).map(section => renderPreviewSection(section))}
                  </div>
                  <div className="h-8 bg-gray-100 flex items-center justify-center">
                    <span className="text-[9px] text-gray-400">Footer</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs text-muted-foreground text-center mb-3 font-medium">
                  Live Preview — /lp/{formData.slug || 'page-slug'}
                </div>
                <div className="bg-white rounded-xl shadow-xl overflow-hidden border">
                  <div className="bg-gray-100 h-8 flex items-center px-3 gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    <div className="flex-1 mx-3 h-4 bg-white rounded-sm flex items-center px-2">
                      <span className="text-[10px] text-gray-400 truncate">gridmart.ca/lp/{formData.slug || '...'}</span>
                    </div>
                  </div>
                  <div className="divide-y">
                    {formData.layoutOrder.map(section => renderPreviewSection(section))}
                  </div>
                  <div className="h-8 bg-gray-100 flex items-center justify-center">
                    <span className="text-[9px] text-gray-400">Footer</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
