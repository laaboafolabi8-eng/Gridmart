import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useSearch, useLocation } from 'wouter';
import { loadGoogleMaps, GRIDMART_MAP_STYLES } from '@/lib/googleMaps';
import { Search, MapPin, Package, Truck, Warehouse, ChevronLeft, ChevronRight, ChevronDown, Check, Plus, Home as HomeIcon, Wallet, Calendar, Zap, Clock, Loader2, User, Phone, LogOut, Settings, ShoppingBag, Heart, Shield, Camera, Store } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ProductCard, type StorefrontLayoutSettings } from '@/components/products/ProductCard';
import { formatCurrency, type Product, type Node } from '@/lib/mockData';
import { useSelectedNode, useCart, useServingCities } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

const DEFAULT_MAP_CENTER = { lat: 42.3149, lng: -83.0364 };
const DEFAULT_ZONE_RADIUS = 500;
const ZONE_COLORS = ['#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#22c55e'];

function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
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

function formatSlotDay(dateStr: string): { label: string; subLabel: string } {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (date.getTime() === today.getTime()) return { label: 'Today', subLabel: monthDay };
  if (date.getTime() === tomorrow.getTime()) return { label: 'Tomorrow', subLabel: monthDay };
  return { label: dayOfWeek, subLabel: monthDay };
}

function to12h(t: string) {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

export default function Home() {
  const searchParams = useSearch();
  const urlCategory = new URLSearchParams(searchParams).get('category');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(urlCategory);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const { selectedCity } = useServingCities();
  const { selectedNode, selectedNodeId, setSelectedNode } = useSelectedNode();
  const { user, isAuthenticated, activeRole, getAvailableRoles, switchRole, logout } = useAuth();
  const availableRoles = getAvailableRoles();
  const [, navigate] = useLocation();
  const homeMapRef = useRef<HTMLDivElement>(null);
  const homeMapInstanceRef = useRef<google.maps.Map | null>(null);
  const homeMapCirclesRef = useRef<google.maps.Circle[]>([]);
  const homeMapMarkersRef = useRef<google.maps.Marker[]>([]);
  const homeMapOverlaysRef = useRef<google.maps.OverlayView[]>([]);
  const [mapsReady, setMapsReady] = useState(false);
  const [mapSelectedNode, setMapSelectedNode] = useState<{ id: string; name: string; availabilityNoticeHours?: number; isStorefront?: boolean; storeHours?: string } | null>(null);
  const [mapSlots, setMapSlots] = useState<any[]>([]);
  const [mapSlotsLoading, setMapSlotsLoading] = useState(false);
  const [mapClickCount, setMapClickCount] = useState(0);
  const [showFreezeBtn, setShowFreezeBtn] = useState(false);
  const [freezeSaving, setFreezeSaving] = useState(false);
  const [showScreenshotBtn, setShowScreenshotBtn] = useState(false);
  const [screenshotMode, setScreenshotMode] = useState(false);
  const screenshotMapRef = useRef<HTMLDivElement>(null);
  const mapClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleMapClickRef = useRef<() => void>(() => {});
  const isAdmin = user?.type === 'admin';

  const { data: storefrontLayout } = useQuery<StorefrontLayoutSettings>({
    queryKey: ['storefrontLayout'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      const settings = await res.json();
      if (settings.storefrontLayout) {
        try { return JSON.parse(settings.storefrontLayout); } catch { return {}; }
      }
      return {};
    },
    staleTime: 60000,
  });

  const gridGapValue = ({ tight: '4px', normal: '8px', relaxed: '16px', spacious: '24px' } as Record<string, string>)[storefrontLayout?.gridGap || 'normal'] || '8px';
  const gridColsDesktop = parseInt(storefrontLayout?.columnsDesktop || '7') || 7;
  const gridColsTablet = parseInt(storefrontLayout?.columnsTablet || '5') || 5;
  const gridColsMobile = parseInt(storefrontLayout?.columnsMobile || '4') || 4;

  const fontSizeMapHeading: Record<string, string> = { small: 'text-lg', medium: 'text-xl md:text-2xl', large: 'text-2xl md:text-3xl', xlarge: 'text-3xl md:text-4xl' };
  const fontWeightMap: Record<string, string> = { normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold' };
  const fontSizeMapSubcat: Record<string, string> = { tiny: 'text-[10px]', small: 'text-xs', medium: 'text-sm', large: 'text-base' };

  const sortProducts = (items: typeof products) => {
    const mode = storefrontLayout?.defaultSort || 'newest';
    return [...items].sort((a, b) => {
      if (mode === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (mode === 'price-asc') return parseFloat(a.price) - parseFloat(b.price);
      if (mode === 'price-desc') return parseFloat(b.price) - parseFloat(a.price);
      if (mode === 'alpha') return (a.name || '').localeCompare(b.name || '');
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  };

  const catHeadingClass = `${fontSizeMapHeading[storefrontLayout?.categoryHeadingFontSize || 'large'] || 'text-2xl md:text-3xl'} ${fontWeightMap[storefrontLayout?.categoryHeadingWeight || 'bold'] || 'font-bold'} font-display mb-6 text-foreground`;
  const catHeadingStyle = storefrontLayout?.categoryHeadingColor ? { color: storefrontLayout.categoryHeadingColor } : {};
  const subcatHeadingClass = `${fontSizeMapSubcat[storefrontLayout?.subcategoryHeadingFontSize || 'tiny'] || 'text-[10px]'} ${fontWeightMap[storefrontLayout?.subcategoryHeadingWeight || 'medium'] || 'font-medium'} uppercase tracking-widest mb-1.5 pl-2 border-l-2 border-primary/20`;
  const subcatHeadingStyle = storefrontLayout?.subcategoryHeadingColor ? { color: storefrontLayout.subcategoryHeadingColor } : {};

  const filterNext48h = (slots: any[]) => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const todayDate = now.toISOString().split('T')[0];
    const cutoffDate = cutoff.toISOString().split('T')[0];
    return slots.filter((s: any) => s.date >= todayDate && s.date < cutoffDate);
  };

  const fetchMapSlots = async (nodeId: string) => {
    setMapSlotsLoading(true);
    setMapSlots([]);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/pickup-slots`);
      const data = await res.json();
      setMapSlots(filterNext48h(data.slots || []));
    } catch {
      setMapSlots([]);
    } finally {
      setMapSlotsLoading(false);
    }
  };
  
  const handleMapBackgroundClick = useCallback(() => {
    if (!isAdmin) return;
    if (showFreezeBtn || screenshotMode) return;
    const newCount = mapClickCount + 1;
    setMapClickCount(newCount);
    if (mapClickTimerRef.current) clearTimeout(mapClickTimerRef.current);
    if (newCount >= 5) {
      setShowFreezeBtn(true);
      setShowScreenshotBtn(true);
      setMapClickCount(0);
    } else {
      mapClickTimerRef.current = setTimeout(() => setMapClickCount(0), 3000);
    }
  }, [isAdmin, showFreezeBtn, screenshotMode, mapClickCount]);

  handleMapClickRef.current = handleMapBackgroundClick;

  const handleFreeze = useCallback(async () => {
    if (!selectedCity || !homeMapInstanceRef.current) return;
    const map = homeMapInstanceRef.current;
    const center = map.getCenter();
    const zoom = map.getZoom();
    if (!center || zoom === undefined) return;

    setFreezeSaving(true);
    try {
      const res = await fetch(`/api/serving-cities/${selectedCity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mapLat: center.lat().toFixed(4),
          mapLng: center.lng().toFixed(4),
          mapZoom: String(zoom),
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setShowFreezeBtn(false);
    } catch {
    } finally {
      setFreezeSaving(false);
    }
  }, [selectedCity]);

  const activeNodesRef = useRef<any[]>([]);
  const nodeColorsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement) {
        setScreenshotMode(false);
        setShowScreenshotBtn(false);
        setShowFreezeBtn(false);
        setTimeout(() => {
          if (homeMapInstanceRef.current) {
            google.maps.event.trigger(homeMapInstanceRef.current, 'resize');
          }
        }, 100);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    if (!screenshotMode) return;
    const mapEl = screenshotMapRef.current;
    if (!mapEl) return;

    mapEl.requestFullscreen?.().then(() => {
      [100, 400, 800].forEach(ms =>
        setTimeout(() => {
          if (homeMapInstanceRef.current) {
            google.maps.event.trigger(homeMapInstanceRef.current, 'resize');
          }
        }, ms)
      );
    }).catch(() => {
      setScreenshotMode(false);
    });
  }, [screenshotMode]);

  useEffect(() => {
    setShowFreezeBtn(false);
    setShowScreenshotBtn(false);
    setScreenshotMode(false);
    setMapClickCount(0);
  }, [selectedCity?.id]);

  useEffect(() => {
    loadGoogleMaps().then(() => setMapsReady(true)).catch(console.error);
  }, []);

  useEffect(() => {
    if (urlCategory) {
      setSelectedCategory(urlCategory);
    }
  }, [urlCategory]);
  
  // Fetch products from API - only show products assigned to nodes in the selected city
  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['products', 'live', selectedCity?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ live: 'true' });
      if (selectedCity?.id) params.set('cityId', selectedCity.id);
      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
  });
  
  // Fetch nodes from API
  const { data: nodes = [] } = useQuery<Node[]>({
    queryKey: ['nodes'],
    queryFn: async () => {
      const res = await fetch('/api/nodes');
      if (!res.ok) throw new Error('Failed to fetch nodes');
      return res.json();
    },
    staleTime: 60000,
    refetchOnWindowFocus: true,
  });

  const { data: siteSettings = {}, isSuccess: siteSettingsLoaded } = useQuery<Record<string, string>>({
    queryKey: ['site-settings'],
    queryFn: async () => {
      const res = await fetch('/api/site-settings');
      if (!res.ok) return {};
      return res.json();
    },
  });
  
  const nodeColors = React.useMemo(() => {
    try {
      return siteSettings.nodeColors ? JSON.parse(siteSettings.nodeColors) as Record<string, string> : {};
    } catch { return {}; }
  }, [siteSettings.nodeColors]);

  const nodeBorderColors = React.useMemo(() => {
    try {
      return siteSettings.nodeBorderColors ? JSON.parse(siteSettings.nodeBorderColors) as Record<string, string> : {};
    } catch { return {}; }
  }, [siteSettings.nodeBorderColors]);

  const nodeOpacities = React.useMemo(() => {
    try {
      return siteSettings.nodeOpacities ? JSON.parse(siteSettings.nodeOpacities) as Record<string, number> : {};
    } catch { return {}; }
  }, [siteSettings.nodeOpacities]);

  const nodeStrokeOpacities = React.useMemo(() => {
    try {
      return siteSettings.nodeStrokeOpacities ? JSON.parse(siteSettings.nodeStrokeOpacities) as Record<string, number> : {};
    } catch { return {}; }
  }, [siteSettings.nodeStrokeOpacities]);

  const nodeHoverTexts = React.useMemo(() => {
    try {
      return siteSettings.nodeHoverTexts ? JSON.parse(siteSettings.nodeHoverTexts) as Record<string, string> : {};
    } catch { return {}; }
  }, [siteSettings.nodeHoverTexts]);

  const nodeSelectedFillColors = React.useMemo(() => {
    try {
      return siteSettings.nodeSelectedFillColors ? JSON.parse(siteSettings.nodeSelectedFillColors) as Record<string, string> : {};
    } catch { return {}; }
  }, [siteSettings.nodeSelectedFillColors]);

  const nodeSelectedStrokeColors = React.useMemo(() => {
    try {
      return siteSettings.nodeSelectedStrokeColors ? JSON.parse(siteSettings.nodeSelectedStrokeColors) as Record<string, string> : {};
    } catch { return {}; }
  }, [siteSettings.nodeSelectedStrokeColors]);

  const nodeSelectedFillOpacities = React.useMemo(() => {
    try {
      return siteSettings.nodeSelectedFillOpacities ? JSON.parse(siteSettings.nodeSelectedFillOpacities) as Record<string, number> : {};
    } catch { return {}; }
  }, [siteSettings.nodeSelectedFillOpacities]);

  const nodeSelectedStrokeOpacities = React.useMemo(() => {
    try {
      return siteSettings.nodeSelectedStrokeOpacities ? JSON.parse(siteSettings.nodeSelectedStrokeOpacities) as Record<string, number> : {};
    } catch { return {}; }
  }, [siteSettings.nodeSelectedStrokeOpacities]);

  const nodeOverlays = React.useMemo(() => {
    try {
      return siteSettings.nodeOverlays ? JSON.parse(siteSettings.nodeOverlays) as Record<string, Array<{
        id: string;
        type: 'text' | 'image';
        content: string;
        x: number;
        y: number;
        width: number;
        height: number;
        fontSize?: number;
        fontWeight?: string;
        color?: string;
        wiggleIntensity: number;
        wiggleSpeed: number;
      }>> : {};
    } catch { return {}; }
  }, [siteSettings.nodeOverlays]);

  // Fetch categories from API (ordered by sortOrder)
  const { data: categoriesFromApi = [] } = useQuery<{ id: string; name: string; parentId?: string | null; sortOrder: number }[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    },
  });
  
  const activeNodes = nodes.filter(n => 
    n.status === 'active' && (!selectedCity?.id || n.servingCityId === selectedCity.id)
  );
  activeNodesRef.current = activeNodes;
  nodeColorsRef.current = nodeColors;
  const activeNodeIds = activeNodes.map(n => n.id).sort().join(',');
  
  useEffect(() => {
    if (!homeMapRef.current || activeNodes.length === 0 || !mapsReady || !siteSettingsLoaded) return;

    homeMapCirclesRef.current.forEach(c => c.setMap(null));
    homeMapCirclesRef.current = [];
    homeMapMarkersRef.current.forEach(m => m.setMap(null));
    homeMapMarkersRef.current = [];
    homeMapOverlaysRef.current.forEach(o => o.setMap(null));
    homeMapOverlaysRef.current = [];
    homeMapInstanceRef.current = null;

    const validNodes = activeNodes.filter(n => n.latitude != null && n.longitude != null);
    if (validNodes.length === 0) return;

    const cityMapLat = selectedCity?.mapLat || selectedCity?.latitude;
    const cityMapLng = selectedCity?.mapLng || selectedCity?.longitude;
    const cityMapZoom = selectedCity?.mapZoom;
    const mapCenter = cityMapLat && cityMapLng
      ? { lat: parseFloat(cityMapLat), lng: parseFloat(cityMapLng) }
      : { lat: parseFloat(siteSettings.mapLat || '42.3149'), lng: parseFloat(siteSettings.mapLng || '-83.0364') };
    const mapZoom = cityMapZoom ? parseInt(cityMapZoom, 10) : parseInt(siteSettings.mapZoom || '10', 10);

    const map = new google.maps.Map(homeMapRef.current, {
      center: mapCenter,
      zoom: mapZoom,
      styles: GRIDMART_MAP_STYLES,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: (showFreezeBtn || screenshotMode) ? 'greedy' : 'cooperative',
    });

    validNodes.forEach((node, idx) => {
      const lat = Number(node.latitude);
      const lng = Number(node.longitude);
      const color = nodeColors[String(node.id)] || ZONE_COLORS[idx % ZONE_COLORS.length];
      const isStorefrontNode = (node as any).nodeType === 'storefront';
      const [circleLat, circleLng] = isStorefrontNode
        ? [lat, lng]
        : generateOffsetCenter(lat, lng, node.id);

      const borderColor = nodeBorderColors[String(node.id)] || color;
      const fillOp = nodeOpacities[String(node.id)] ?? 0.2;
      const strokeOp = nodeStrokeOpacities[String(node.id)] ?? 1;

      const nodeId = String(node.id);
      const selFillColor = nodeSelectedFillColors[nodeId] || '#f59e0b';
      const selStrokeColor = nodeSelectedStrokeColors[nodeId] || '#f59e0b';
      const selFillOp = nodeSelectedFillOpacities[nodeId] ?? 0.4;
      const selStrokeOp = nodeSelectedStrokeOpacities[nodeId] ?? 1;

      if (isStorefrontNode) {
        const storefrontSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><path fill="#f59e0b" stroke="#b45309" stroke-width="1.5" d="M18 0C8.1 0 0 8.1 0 18c0 11.1 18 26 18 26s18-14.9 18-26C36 8.1 27.9 0 18 0z"/><rect x="8" y="10" width="20" height="15" rx="1.5" fill="white"/><rect x="8" y="7" width="20" height="5" rx="1" fill="white" opacity="0.75"/><rect x="14" y="17" width="8" height="8" rx="1" fill="#f59e0b"/></svg>`;
        const sfMarker = new google.maps.Marker({
          position: { lat, lng },
          map,
          title: node.name,
          icon: {
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(storefrontSvg)}`,
            scaledSize: new google.maps.Size(36, 44),
            anchor: new google.maps.Point(18, 44),
          },
          zIndex: 100,
        });
        (sfMarker as any)._nodeId = nodeId;

        const hoursText = (node as any).storeHours || 'Daily: 10:00 AM – 7:00 PM';
        let sfHoverDiv: HTMLDivElement | null = null;
        const SfHoverOverlay = class extends google.maps.OverlayView {
          onAdd() {
            sfHoverDiv = document.createElement('div');
            sfHoverDiv.style.cssText = 'position:absolute;background:rgba(0,0,0,0.82);color:#fff;padding:6px 12px;border-radius:8px;font-size:12px;white-space:nowrap;pointer-events:none;transform:translate(-50%,-100%);margin-top:-52px;opacity:0;transition:opacity 0.15s;z-index:1000;';
            sfHoverDiv.innerHTML = `<div style="font-weight:700">${node.name}</div><div style="opacity:0.85;margin-top:2px;font-size:11px">${hoursText}</div>`;
            this.getPanes()?.floatPane.appendChild(sfHoverDiv);
          }
          draw() {
            if (!sfHoverDiv) return;
            const proj = this.getProjection();
            const pos = proj?.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng));
            if (pos) { sfHoverDiv.style.left = pos.x + 'px'; sfHoverDiv.style.top = pos.y + 'px'; }
          }
          show() { if (sfHoverDiv) sfHoverDiv.style.opacity = '1'; }
          hide() { if (sfHoverDiv) sfHoverDiv.style.opacity = '0'; }
          onRemove() { sfHoverDiv?.remove(); sfHoverDiv = null; }
        };
        const sfHoverOverlay = new SfHoverOverlay();
        sfHoverOverlay.setMap(map);
        sfMarker.addListener('mouseover', () => { sfHoverOverlay.show(); sfHoverOverlay.draw(); });
        sfMarker.addListener('mouseout', () => { sfHoverOverlay.hide(); });
        homeMapOverlaysRef.current.push(sfHoverOverlay);

        sfMarker.addListener('click', () => {
          homeMapCirclesRef.current.forEach(c => {
            const base = (c as any)._baseStyle;
            if (base) c.setOptions(base);
          });
          setMapSelectedNode({ id: nodeId, name: node.name, isStorefront: true, storeHours: (node as any).storeHours || 'Daily: 10:00 AM – 7:00 PM' });
        });
        homeMapMarkersRef.current.push(sfMarker);
      } else {
        const circle = new google.maps.Circle({
          center: { lat: circleLat, lng: circleLng },
          radius: parseInt(siteSettings.nodeCircleSize || '500', 10),
          strokeColor: borderColor,
          fillColor: color,
          fillOpacity: fillOp,
          strokeOpacity: strokeOp,
          strokeWeight: 2,
          map,
          clickable: true,
        });

        (circle as any)._nodeId = nodeId;
        (circle as any)._baseStyle = { fillColor: color, strokeColor: borderColor, fillOpacity: fillOp, strokeOpacity: strokeOp, strokeWeight: 2 };
        (circle as any)._selectedStyle = { fillColor: selFillColor, strokeColor: selStrokeColor, fillOpacity: selFillOp, strokeOpacity: selStrokeOp, strokeWeight: 4 };

        const hoverText = nodeHoverTexts[nodeId] || '';
        if (hoverText) {
          let hoverDiv: HTMLDivElement | null = null;
          const HoverOverlay = class extends google.maps.OverlayView {
            onAdd() {
              hoverDiv = document.createElement('div');
              hoverDiv.style.cssText = 'position:absolute;background:rgba(0,0,0,0.75);color:#fff;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:600;white-space:nowrap;pointer-events:none;transform:translate(-50%,-100%);margin-top:-8px;opacity:0;transition:opacity 0.15s;z-index:1000;';
              hoverDiv.textContent = hoverText;
              this.getPanes()?.floatPane.appendChild(hoverDiv);
            }
            draw() {
              if (!hoverDiv) return;
              const proj = this.getProjection();
              const pos = proj?.fromLatLngToDivPixel(circle.getCenter()!);
              if (pos) {
                hoverDiv.style.left = pos.x + 'px';
                hoverDiv.style.top = pos.y + 'px';
              }
            }
            show() { if (hoverDiv) hoverDiv.style.opacity = '1'; }
            hide() { if (hoverDiv) hoverDiv.style.opacity = '0'; }
            onRemove() { hoverDiv?.remove(); hoverDiv = null; }
          };
          const hoverOverlay = new HoverOverlay();
          hoverOverlay.setMap(map);
          circle.addListener('mouseover', () => { hoverOverlay.show(); hoverOverlay.draw(); });
          circle.addListener('mouseout', () => { hoverOverlay.hide(); });
          homeMapOverlaysRef.current.push(hoverOverlay);
        }

        circle.addListener('click', () => {
          homeMapCirclesRef.current.forEach(c => {
            const base = (c as any)._baseStyle;
            if (base) c.setOptions(base);
          });
          circle.setOptions((circle as any)._selectedStyle);
          setMapSelectedNode({ id: nodeId, name: node.name, availabilityNoticeHours: (node as any).availabilityNoticeHours || 48 });
          fetchMapSlots(nodeId);
        });

        homeMapCirclesRef.current.push(circle);
      }

      const overlays = nodeOverlays[String(node.id)] || [];
      overlays.forEach((overlay) => {
        const CustomOverlay = class extends google.maps.OverlayView {
          private div: HTMLDivElement | null = null;
          private position: google.maps.LatLng;
          private overlayData: typeof overlay;

          constructor(position: google.maps.LatLng, overlayData: typeof overlay) {
            super();
            this.position = position;
            this.overlayData = overlayData;
          }

          onAdd() {
            this.div = document.createElement('div');
            this.div.style.position = 'absolute';
            this.div.style.pointerEvents = 'none';
            this.div.style.zIndex = '10';

            if (this.overlayData.type === 'text') {
              const span = document.createElement('span');
              span.className = 'drop-shadow-sm';
              span.style.whiteSpace = 'pre-wrap';
              span.style.textAlign = 'center';
              span.style.display = 'block';
              span.style.fontSize = `${this.overlayData.fontSize || 14}px`;
              span.style.fontWeight = this.overlayData.fontWeight || 'bold';
              span.style.color = this.overlayData.color || '#000';
              span.textContent = this.overlayData.content;
              this.div.appendChild(span);
            } else if (this.overlayData.content) {
              const img = document.createElement('img');
              img.src = this.overlayData.content;
              img.alt = '';
              img.style.width = `${this.overlayData.width}px`;
              img.style.height = `${this.overlayData.height}px`;
              img.style.objectFit = 'contain';
              this.div.appendChild(img);
            }

            if (this.overlayData.wiggleIntensity > 0 && this.overlayData.wiggleSpeed > 0) {
              const styleEl = document.createElement('style');
              styleEl.textContent = `
                @keyframes wiggle-map-${this.overlayData.id} {
                  0%, 100% { transform: translateX(0px); }
                  25% { transform: translateX(${this.overlayData.wiggleIntensity}px); }
                  75% { transform: translateX(-${this.overlayData.wiggleIntensity}px); }
                }
              `;
              document.head.appendChild(styleEl);
              this.div.style.animation = `wiggle-map-${this.overlayData.id} ${(1 / this.overlayData.wiggleSpeed).toFixed(2)}s ease-in-out infinite`;
            }

            const panes = this.getPanes();
            panes?.overlayMouseTarget.appendChild(this.div);
          }

          draw() {
            if (!this.div) return;
            const projection = this.getProjection();
            if (!projection) return;
            const point = projection.fromLatLngToDivPixel(this.position);
            if (point) {
              this.div.style.left = `${point.x + this.overlayData.x - (this.div.offsetWidth / 2)}px`;
              this.div.style.top = `${point.y + this.overlayData.y - (this.div.offsetHeight / 2)}px`;
            }
          }

          onRemove() {
            if (this.div?.parentNode) {
              this.div.parentNode.removeChild(this.div);
              this.div = null;
            }
          }
        };

        const overlayView = new CustomOverlay(
          new google.maps.LatLng(circleLat, circleLng),
          overlay
        );
        overlayView.setMap(map);
        homeMapOverlaysRef.current.push(overlayView);
      });
    });

    if (validNodes.length > 1 && !cityMapLat && !siteSettings.mapLat && !siteSettings.mapLng) {
      const bounds = new google.maps.LatLngBounds();
      validNodes.forEach(n => bounds.extend({ lat: Number(n.latitude), lng: Number(n.longitude) }));
      map.fitBounds(bounds, 50);
    }

    map.addListener('click', () => {
      handleMapClickRef.current();
    });

    homeMapInstanceRef.current = map;

    return () => {
      homeMapCirclesRef.current.forEach(c => c.setMap(null));
      homeMapCirclesRef.current = [];
      homeMapMarkersRef.current.forEach(m => m.setMap(null));
      homeMapMarkersRef.current = [];
      homeMapOverlaysRef.current.forEach(o => o.setMap(null));
      homeMapOverlaysRef.current = [];
      homeMapInstanceRef.current = null;
    };
  }, [activeNodeIds, siteSettings.mapZoom, siteSettings.mapLat, siteSettings.mapLng, siteSettings.nodeCircleSize, nodeOverlays, nodeColors, nodeBorderColors, nodeOpacities, nodeStrokeOpacities, nodeHoverTexts, nodeSelectedFillColors, nodeSelectedStrokeColors, nodeSelectedFillOpacities, nodeSelectedStrokeOpacities, selectedCity?.id, selectedCity?.mapLat, selectedCity?.mapLng, selectedCity?.mapZoom, mapsReady, showFreezeBtn, screenshotMode, siteSettingsLoaded]);

  useEffect(() => {
    const validNodes = activeNodes.filter(n => n.latitude && n.longitude);
    if (validNodes.length === 0 || mapSelectedNode) return;

    const findFirstAvailableNode = async () => {
      for (const node of validNodes) {
        try {
          const res = await fetch(`/api/nodes/${node.id}/pickup-slots`);
          const data = await res.json();
          const slots = filterNext48h(data.slots || []);
          if (slots.length > 0) {
            setMapSelectedNode({ id: String(node.id), name: node.name, availabilityNoticeHours: (node as any).availabilityNoticeHours || 48 });
            setMapSlots(slots);
            setMapSlotsLoading(false);
            return;
          }
        } catch {}
      }
      const first = validNodes[0];
      setMapSelectedNode({ id: String(first.id), name: first.name, availabilityNoticeHours: (first as any).availabilityNoticeHours || 48 });
      fetchMapSlots(String(first.id));
    };

    setMapSlotsLoading(true);
    findFirstAvailableNode();
  }, [activeNodeIds]);

  // Clear selected node if it doesn't belong to the current city or is stale
  useEffect(() => {
    if (selectedNodeId && nodes.length > 0) {
      const nodeExists = nodes.find(n => n.id === selectedNodeId);
      if (!nodeExists) {
        // Stale selectedNodeId - clear it
        setSelectedNode(null);
      } else if (selectedCity?.id && nodeExists.servingCityId !== selectedCity.id) {
        // Node doesn't belong to current city - clear it
        setSelectedNode(null);
      }
    }
  }, [selectedCity, selectedNodeId, nodes, setSelectedNode]);

  // Get categories in API order, filtered to only those with products
  const productCategories = new Set(products.map(p => p.category));
  const topLevelCatsFromApi = categoriesFromApi.filter(c => !c.parentId);
  const categories = topLevelCatsFromApi
    .map(c => c.name)
    .filter(name => productCategories.has(name));
  
  // Get subcategories for the selected category
  const selectedCategoryObj = categoriesFromApi.find(c => c.name === selectedCategory && !c.parentId);
  const subcategoriesForSelected = selectedCategoryObj 
    ? categoriesFromApi.filter(c => c.parentId === selectedCategoryObj.id)
    : [];
  
  // Helper to get subcategories for any category by name
  const getSubcategoriesForCategory = (catName: string) => {
    const catObj = categoriesFromApi.find(c => c.name === catName && !c.parentId);
    return catObj ? categoriesFromApi.filter(c => c.parentId === catObj.id) : [];
  };

  // Check if selectedNodeId is valid (exists in fetched nodes)
  const validSelectedNodeId = selectedNodeId && nodes.some(n => n.id === selectedNodeId) ? selectedNodeId : null;

  // Helper to extract base code from product code
  const getBaseCode = (product: Product): string => {
    if (!product.productCode) return '';
    if (product.variantSuffix && product.productCode.endsWith(`-${product.variantSuffix}`)) {
      return product.productCode.slice(0, -(product.variantSuffix.length + 1));
    }
    return product.productCode;
  };

  // Build variant groups: map base code -> array of products (parent + variants)
  const variantGroups = products.reduce((groups, product) => {
    if (product.canonicalProductId) return groups;
    
    const baseCode = getBaseCode(product);
    if (!baseCode) return groups;
    
    if (!groups[baseCode]) {
      groups[baseCode] = [];
    }
    groups[baseCode].push(product);
    return groups;
  }, {} as Record<string, Product[]>);

  // Build children map using parentProductId relationship
  const childrenByParentId = products.reduce((map, product) => {
    if (product.parentProductId && product.relationshipType === 'variant') {
      if (!map[product.parentProductId]) {
        map[product.parentProductId] = [];
      }
      map[product.parentProductId].push(product);
    }
    return map;
  }, {} as Record<string, Product[]>);

  // Filter products - show only parent products (no suffix) but include variant data
  const filteredProducts = products.filter(product => {
    if (product.canonicalProductId) {
      return false;
    }
    
    if (product.parentProductId && product.relationshipType === 'variant') {
      return false;
    }
    
    if (product.variantSuffix) {
      return false;
    }
    
    // Collect all related products: base-code group + parentProductId children
    const baseCode = getBaseCode(product);
    const codeGroup = baseCode ? (variantGroups[baseCode] || [product]) : [product];
    const pidChildren = childrenByParentId[product.id] || [];
    const allRelated = new Map<number, Product>();
    for (const p of codeGroup) allRelated.set(p.id, p);
    for (const p of pidChildren) allRelated.set(p.id, p);
    const groupProducts = Array.from(allRelated.values());

    const totalInventory = groupProducts.reduce((sum, p) => {
      return sum + (p.inventory?.reduce((invSum, inv) => invSum + inv.quantity, 0) || 0);
    }, 0);
    
    const isComingSoon = groupProducts.some(p => p.comingSoon);
    if (totalInventory <= 0 && !isComingSoon) {
      return false;
    }
    
    // If a valid node is selected, check if any variant has stock at that node
    if (validSelectedNodeId) {
      const hasNodeStock = groupProducts.some(p => {
        const nodeInventory = p.inventory?.find(inv => inv.nodeId === validSelectedNodeId);
        return nodeInventory && nodeInventory.quantity > 0;
      });
      if (!hasNodeStock) {
        return false;
      }
    }
    
    const descText = Array.isArray(product.description) 
      ? product.description.join(' ').toLowerCase() 
      : (product.description || '').toLowerCase();
    const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase()) ||
      descText.includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    const matchesSubcategory = !selectedSubcategory || product.subcategory === selectedSubcategory;
    return matchesSearch && matchesCategory && matchesSubcategory;
  });

  const displayProducts = validSelectedNodeId ? filteredProducts.map(product => {
    const parentHasStock = product.inventory?.some(
      inv => inv.nodeId === validSelectedNodeId && inv.quantity > 0
    );
    if (parentHasStock) return product;
    const pidChildren = childrenByParentId[product.id] || [];
    const childWithStock = pidChildren.find(child =>
      child.inventory?.some(inv => inv.nodeId === validSelectedNodeId && inv.quantity > 0)
    );
    if (childWithStock) return childWithStock;
    const baseCode = getBaseCode(product);
    const codeGroup = baseCode ? (variantGroups[baseCode] || []) : [];
    const codeChildWithStock = codeGroup.find(p =>
      p.id !== product.id && p.inventory?.some(inv => inv.nodeId === validSelectedNodeId && inv.quantity > 0)
    );
    return codeChildWithStock || product;
  }) : filteredProducts;

  const { addToCart } = useCart();

  // Spotlight carousel state
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Auto-advance spotlight every 4 seconds (pause on hover)
  useEffect(() => {
    if (isHovered || displayProducts.length <= 1) return;
    
    const interval = setInterval(() => {
      setSpotlightIndex(prev => (prev + 1) % displayProducts.length);
    }, 4000);
    
    return () => clearInterval(interval);
  }, [isHovered, displayProducts.length]);

  // Reset index when products change
  useEffect(() => {
    setSpotlightIndex(0);
  }, [selectedNodeId, search, selectedCategory]);

  const scrollPrev = useCallback(() => {
    setSpotlightIndex(prev => prev === 0 ? displayProducts.length - 1 : prev - 1);
  }, [displayProducts.length]);
  
  const scrollNext = useCallback(() => {
    setSpotlightIndex(prev => (prev + 1) % displayProducts.length);
  }, [displayProducts.length]);

  // Get visible products for spotlight (current, prev, next)
  const getVisibleProduct = (offset: number) => {
    if (displayProducts.length === 0) return null;
    const idx = (spotlightIndex + offset + displayProducts.length) % displayProducts.length;
    return displayProducts[idx];
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      {/* Selected Node Banner */}
      {selectedNode && (
        <div className="bg-primary py-3" data-testid="banner-selected-node">
        </div>
      )}
      
      {/* ── STOREFRONT HERO ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/8 via-background to-primary/5">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[80px]" />
          <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px]" />
        </div>
        <div className="container mx-auto px-4 py-10 md:py-16 lg:py-20 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">

            {/* Left – store info */}
            <div className="space-y-5">
              <div className="md:hidden flex items-center justify-center gap-3">
                <Link href="/apply">
                  <Button size="sm" className="h-8 px-3 text-[13px] gap-1 text-white hover:opacity-90" style={{ backgroundColor: '#fda612', borderColor: '#fda612', borderWidth: '2px' }} data-testid="button-become-node-mobile">
                    <HomeIcon className="w-3.5 h-3.5" />
                    Become a Node Host
                  </Button>
                </Link>
                {!isAuthenticated && (
                  <Link href="/login">
                    <Button size="sm" className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90 text-[11px] px-3 h-7" data-testid="nav-mobile-sign-in-hero">
                      <Phone className="w-3 h-3" />
                      Sign In
                    </Button>
                  </Link>
                )}
              </div>

              <h1 className={`font-display ${siteSettings.heroLine1FontSize || 'text-4xl md:text-5xl lg:text-6xl'} ${siteSettings.heroLine1Weight ? ({ normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold' } as Record<string, string>)[siteSettings.heroLine1Weight] || 'font-bold' : 'font-bold'} tracking-tight`} style={{ transform: siteSettings.heroTitleOffset ? `translateY(${siteSettings.heroTitleOffset}px)` : undefined, color: siteSettings.heroLine1Color || undefined, textAlign: (siteSettings.heroAlign as any) || undefined }}>
                {siteSettings.heroLine1 || (siteSettingsLoaded ? 'Shop Local.' : '\u00A0')}{' '}
                <span className={`${siteSettings.heroLine2Color ? '' : 'text-gradient'} ${siteSettings.heroLine2FontSize || ''} ${siteSettings.heroLine2Weight ? ({ normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold' } as Record<string, string>)[siteSettings.heroLine2Weight] || '' : ''}`} style={{ color: siteSettings.heroLine2Color || undefined }}>{siteSettings.heroLine2 || (siteSettingsLoaded ? 'In-Store & Online.' : '')}</span>
              </h1>

              <p className={`${siteSettings.heroSubtitleFontSize || 'text-lg md:text-xl'} ${siteSettings.heroSubtitleColor ? '' : 'text-muted-foreground'} ${siteSettings.heroSubtitleWeight ? ({ light: 'font-light', normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold' } as Record<string, string>)[siteSettings.heroSubtitleWeight] || '' : ''} max-w-lg`} style={{ transform: siteSettings.heroSubtitleOffset ? `translateY(${siteSettings.heroSubtitleOffset}px)` : undefined, color: siteSettings.heroSubtitleColor || undefined, textAlign: (siteSettings.heroAlign as any) || undefined }}>
                {siteSettings.heroSubtitle || (siteSettingsLoaded ? 'Browse our curated selection in person, or order online for local pickup.' : '\u00A0')}
              </p>

              <div className="space-y-2 pt-1">
                <div className="flex items-start gap-2 text-sm text-foreground/80">
                  <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <span>{siteSettings.storefrontAddress || '3176 Walker Rd, Windsor'}</span>
                </div>
                {siteSettings.storefrontHours && (
                  <div className="flex items-start gap-2 text-sm text-foreground/80">
                    <Clock className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                    <span>{siteSettings.storefrontHours}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button size="lg" onClick={() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })}>
                  <ShoppingBag className="w-4 h-4 mr-2" />
                  Browse Products
                </Button>
                <Button size="lg" variant="outline" onClick={() => document.getElementById('pickup')?.scrollIntoView({ behavior: 'smooth' })}>
                  <MapPin className="w-4 h-4 mr-2" />
                  Pickup Locations
                </Button>
              </div>
            </div>

            {/* Right – storefront photos */}
            <div className="space-y-3">
              <div className="rounded-2xl overflow-hidden shadow-xl bg-muted aspect-[4/3]">
                {siteSettings.storefrontHeroImage ? (
                  <img src={siteSettings.storefrontHeroImage} alt="Store exterior" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5 gap-3 p-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <ShoppingBag className="w-8 h-8 text-primary/30" />
                    </div>
                    <p className="text-sm text-muted-foreground">Set storefront photos in Admin → Site Settings</p>
                  </div>
                )}
              </div>
              {siteSettings.storefrontInteriorImage && (
                <div className="rounded-xl overflow-hidden shadow-md bg-muted aspect-[16/7]">
                  <img src={siteSettings.storefrontInteriorImage} alt="Store interior" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

      <main className="flex-1 py-12" id="products">
        <div className="container mx-auto px-4">
          {/* Search bar and Node selector row */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 font-display"
                data-testid="input-search"
              />
            </div>
            
            <Select
              value={validSelectedNodeId || 'all'}
              onValueChange={(val) => {
                setSelectedNode(val === 'all' ? null : val);
              }}
            >
              <SelectTrigger className="w-[180px] sm:w-[220px] font-display" data-testid="select-location-filter">
                <MapPin className="w-4 h-4 mr-1 text-muted-foreground flex-shrink-0" />
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent className="font-display">
                <SelectItem value="all">All Locations</SelectItem>
                {activeNodes.map(node => (
                  <SelectItem key={node.id} value={node.id}>{node.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button 
              variant="default" 
              className="gap-2 whitespace-nowrap font-display"
              data-testid="button-search"
            >
              <Search className="w-4 h-4" />
              Search
            </Button>
          </div>
          
          {/* Categories row - below search */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
            <Button
              variant={selectedCategory === null ? 'default' : 'outline'}
              size="sm"
              className="font-display"
              onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); }}
              data-testid="button-category-all"
            >
              All
            </Button>
            {categories.map(cat => (
              <Button
                key={cat}
                variant={selectedCategory === cat ? 'default' : 'outline'}
                size="sm"
                className="font-display"
                onClick={() => { setSelectedCategory(cat); setSelectedSubcategory(null); }}
                data-testid={`button-category-${cat.toLowerCase()}`}
              >
                {cat}
              </Button>
            ))}
          </div>
          
          {/* Subcategory pills - shown when a category with subcategories is selected */}
          {selectedCategory && subcategoriesForSelected.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-4 mb-2">
              <Button
                variant={selectedSubcategory === null ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs rounded-full font-display"
                onClick={() => setSelectedSubcategory(null)}
                data-testid="button-subcategory-all"
              >
                All {selectedCategory}
              </Button>
              {subcategoriesForSelected.map(sub => (
                <Button
                  key={sub.id}
                  variant={selectedSubcategory === sub.name ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs rounded-full font-display"
                  onClick={() => setSelectedSubcategory(sub.name)}
                  data-testid={`button-subcategory-${sub.name.toLowerCase()}`}
                >
                  {sub.name}
                </Button>
              ))}
            </div>
          )}

          {/* Responsive grid style injection */}
          <style>{`
            .sf-product-grid {
              display: grid;
              gap: ${gridGapValue};
              grid-template-columns: repeat(${gridColsMobile}, minmax(0, 1fr));
            }
            @media (min-width: 640px) {
              .sf-product-grid { grid-template-columns: repeat(${gridColsTablet}, minmax(0, 1fr)); }
            }
            @media (min-width: 1024px) {
              .sf-product-grid { grid-template-columns: repeat(${gridColsDesktop}, minmax(0, 1fr)); }
            }
          `}</style>

          {/* Storefront Heading & Subheading */}
          {storefrontLayout?.showHeading && storefrontLayout?.headingText && (
            <div style={{ textAlign: (storefrontLayout.headingAlign || 'left') as any, marginBottom: storefrontLayout.showSubheading ? '2px' : '12px' }}>
              <h2 className={`${fontSizeMapHeading[storefrontLayout.headingFontSize || 'large'] || 'text-2xl md:text-3xl'} ${fontWeightMap[storefrontLayout.headingWeight || 'bold'] || 'font-bold'} font-display text-foreground`}
                style={storefrontLayout.headingColor ? { color: storefrontLayout.headingColor } : {}}>
                {storefrontLayout.headingText}
              </h2>
            </div>
          )}
          {storefrontLayout?.showSubheading && storefrontLayout?.subheadingText && (
            <div style={{ textAlign: (storefrontLayout.subheadingAlign || 'left') as any, marginBottom: '12px' }}>
              <p className={`${fontSizeMapSubcat[storefrontLayout.subheadingFontSize || 'small'] || 'text-xs'} ${fontWeightMap[storefrontLayout.subheadingWeight || 'normal'] || 'font-normal'} text-muted-foreground`}
                style={storefrontLayout.subheadingColor ? { color: storefrontLayout.subheadingColor } : {}}>
                {storefrontLayout.subheadingText}
              </p>
            </div>
          )}

          {/* Products Grid */}
          {productsLoading ? (
            <div className="mt-4 sf-product-grid">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-square bg-muted rounded-lg mb-2" />
                  <div className="h-3 bg-muted rounded w-3/4 mb-1" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : displayProducts.length > 0 ? (
            <div className="mt-4">
              {selectedCategory === null ? (
                // Group by category when "All" is selected
                <div className="space-y-8">
                  {categories.map(cat => {
                    const categoryProducts = sortProducts(displayProducts
                      .filter(p => p.category === cat));
                    if (categoryProducts.length === 0) return null;
                    const subs = getSubcategoriesForCategory(cat);
                    const hasSubcategories = subs.length > 0 && categoryProducts.some(p => p.subcategory);
                    return (
                      <div key={cat}>
                        <h2 className={catHeadingClass} style={catHeadingStyle}>{cat}</h2>
                        {hasSubcategories ? (
                          <div className="space-y-6">
                            {(() => {
                              const uncategorized = categoryProducts.filter(p => !p.subcategory);
                              if (uncategorized.length === 0) return null;
                              return (
                                <div className="sf-product-grid">
                                  {uncategorized.map((product) => {
                                    const baseCode = getBaseCode(product);
                                    const variants = baseCode ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix) : [];
                                    return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
                                  })}
                                </div>
                              );
                            })()}
                            {subs.map(sub => {
                              const subProducts = categoryProducts.filter(p => p.subcategory === sub.name);
                              if (subProducts.length === 0) return null;
                              return (
                                <div key={sub.id}>
                                  <h3 className={subcatHeadingClass} style={subcatHeadingStyle}>{sub.name}</h3>
                                  <div className="sf-product-grid">
                                    {subProducts.map((product) => {
                                      const baseCode = getBaseCode(product);
                                      const variants = baseCode ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix) : [];
                                      return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="sf-product-grid">
                            {categoryProducts.map((product) => {
                              const baseCode = getBaseCode(product);
                              const variants = baseCode 
                                ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix)
                                : [];
                              return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Category selected view - group by subcategory if available
                (() => {
                  const sorted = sortProducts(displayProducts);
                  const subs = subcategoriesForSelected;
                  const hasSubGroups = !selectedSubcategory && subs.length > 0 && sorted.some(p => p.subcategory);
                  
                  if (hasSubGroups) {
                    return (
                      <div className="space-y-6">
                        {(() => {
                          const uncategorized = sorted.filter(p => !p.subcategory);
                          if (uncategorized.length === 0) return null;
                          return (
                            <div className="sf-product-grid">
                              {uncategorized.map((product) => {
                                const baseCode = getBaseCode(product);
                                const variants = baseCode ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix) : [];
                                return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
                              })}
                            </div>
                          );
                        })()}
                        {subs.map(sub => {
                          const subProducts = sorted.filter(p => p.subcategory === sub.name);
                          if (subProducts.length === 0) return null;
                          return (
                            <div key={sub.id}>
                              <h3 className={subcatHeadingClass} style={subcatHeadingStyle}>{sub.name}</h3>
                              <div className="sf-product-grid">
                                {subProducts.map((product) => {
                                  const baseCode = getBaseCode(product);
                                  const variants = baseCode ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix) : [];
                                  return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  
                  return (
                    <div className="sf-product-grid">
                      {sorted.map((product) => {
                        const baseCode = getBaseCode(product);
                        const variants = baseCode 
                          ? (variantGroups[baseCode] || []).filter(p => p.id !== product.id && p.variantSuffix)
                          : [];
                        return <ProductCard key={product.id} product={product} variants={variants} layout={storefrontLayout} />;
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          ) : (
            <div className="text-center py-16">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-display text-lg font-semibold mb-2">No products found</h3>
              <p className="text-muted-foreground">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </main>

      {/* ── PICKUP LOCATIONS (secondary) ── */}
      <section id="pickup" className="bg-muted/30 border-t py-14">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">
              {siteSettings.pickupSectionTitle || 'Community Pickup Locations'}
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              {siteSettings.pickupSectionSubtitle || "Can't make it to the store? Order online and pick up at a convenient community location near you."}
            </p>
          </div>

          {activeNodes.length > 0 && (
            <div className="w-full max-w-2xl md:max-w-4xl mx-auto" data-testid="homepage-pickup-map">
              <div className="relative group">
                {!screenshotMode && (
                  <>
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none transition-opacity duration-300 group-hover:opacity-0">
                      <span className="text-sm font-semibold text-gray-700 bg-white/80 backdrop-blur-sm px-5 py-1 rounded-full shadow-sm">{siteSettings.mapLabel || 'Pickup Zones'}</span>
                    </div>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none whitespace-nowrap">
                      <span className="text-[10px] sm:text-xs font-medium text-foreground bg-white/85 backdrop-blur-sm px-4 py-1 rounded-full shadow-sm">{siteSettings.mapHint || 'Each circle contains a pickup node. Click one to view available pickup times.'}</span>
                    </div>
                  </>
                )}
                <div
                  ref={(el) => {
                    (homeMapRef as any).current = el;
                    (screenshotMapRef as any).current = el;
                  }}
                  className="overflow-hidden shadow-sm rounded-xl h-[217px] md:h-[342px] border border-primary"
                />
                {showFreezeBtn && isAdmin && !screenshotMode && (
                  <button
                    onClick={handleFreeze}
                    disabled={freezeSaving}
                    className="absolute top-2 right-2 z-[1001] bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-lg transition-colors disabled:opacity-50"
                    data-testid="button-freeze-map"
                  >
                    {freezeSaving ? 'Saving...' : 'Freeze'}
                  </button>
                )}
                {showScreenshotBtn && isAdmin && !screenshotMode && (
                  <button
                    onClick={() => setScreenshotMode(true)}
                    className="absolute top-2 left-2 z-[1001] bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-lg transition-colors flex items-center gap-1"
                    data-testid="button-screenshot-map"
                  >
                    <Camera className="w-3 h-3" />
                    Fullscreen
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-3 justify-center" style={{ opacity: siteSettingsLoaded ? 1 : 0, transition: 'opacity 0.15s ease-in' }}>
                {activeNodes.filter(n => n.latitude && n.longitude).map((node, idx) => {
                  const isSelected = mapSelectedNode?.id === String(node.id);
                  const nodeIsStorefront = (node as any).nodeType === 'storefront';
                  const baseColor = nodeIsStorefront ? '#f59e0b' : (nodeColors[String(node.id)] || ZONE_COLORS[idx % ZONE_COLORS.length]);
                  const selColor = nodeIsStorefront ? '#b45309' : (nodeSelectedStrokeColors[String(node.id)] || '#f59e0b');
                  return (
                    <Badge
                      key={node.id}
                      variant="outline"
                      className="text-sm cursor-pointer transition-all hover:scale-105 flex items-center gap-1"
                      style={{
                        borderColor: isSelected ? selColor : baseColor,
                        color: isSelected ? selColor : baseColor,
                        backgroundColor: isSelected ? `${selColor}20` : nodeIsStorefront ? '#fef3c720' : 'rgba(255,255,255,0.8)',
                      }}
                      onClick={() => {
                        homeMapCirclesRef.current.forEach(c => {
                          const base = (c as any)._baseStyle;
                          if (base) c.setOptions(base);
                        });
                        if (!nodeIsStorefront) {
                          const target = homeMapCirclesRef.current.find(c => (c as any)._nodeId === String(node.id));
                          if (target) target.setOptions((target as any)._selectedStyle);
                        }
                        if (node.latitude && node.longitude && homeMapInstanceRef.current) {
                          homeMapInstanceRef.current.panTo({ lat: Number(node.latitude), lng: Number(node.longitude) });
                          homeMapInstanceRef.current.setZoom(Math.max(homeMapInstanceRef.current.getZoom() || 12, 13));
                        }
                        setMapSelectedNode({
                          id: String(node.id),
                          name: node.name,
                          availabilityNoticeHours: (node as any).availabilityNoticeHours || 48,
                          isStorefront: nodeIsStorefront,
                          storeHours: (node as any).storeHours || undefined,
                        });
                        if (!nodeIsStorefront) fetchMapSlots(String(node.id));
                      }}
                      data-testid={`badge-zone-${node.id}`}
                    >
                      {nodeIsStorefront && <Store className="w-3 h-3" />}
                      {node.name}
                    </Badge>
                  );
                })}
              </div>

              {mapSelectedNode && (
                mapSelectedNode.isStorefront ? (
                  <div className="mt-4 p-4 bg-white/90 backdrop-blur-sm rounded-xl border border-amber-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <Store className="w-4 h-4 text-amber-500" />
                      <span className="font-display font-semibold text-sm">{mapSelectedNode.name} — Store Hours</span>
                    </div>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">Open</div>
                        <div className="text-xs text-muted-foreground">{mapSelectedNode.storeHours}</div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Visit us in person to browse our full selection!</p>
                  </div>
                ) : (
                  <div className="mt-4 p-4 bg-white/90 backdrop-blur-sm rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-primary" />
                      <span className="font-display font-semibold text-sm">{mapSelectedNode.name} - Pickup Windows</span>
                    </div>
                    {mapSlotsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading available times...</span>
                      </div>
                    ) : mapSlots.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No pickup windows right now. Check back later!
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {mapSlots.map((slot, idx) => {
                          const { label, subLabel } = formatSlotDay(slot.date);
                          return (
                            <div key={slot.id || idx} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <Clock className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{label}</div>
                                <div className="text-xs text-muted-foreground">{subLabel}</div>
                              </div>
                              <div className="text-right text-sm">{to12h(slot.startTime)} – {to12h(slot.endTime)}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12 max-w-4xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center shrink-0 shadow-sm border">
                <Calendar className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="font-display font-semibold mb-1">{siteSettings.feature1Title || 'Same-Day Pickup'}</h3>
                <p className="text-sm text-muted-foreground">
                  {siteSettings.feature1Desc || 'Choose your time slot and pick up when it\'s convenient for you.'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center shrink-0 shadow-sm border">
                <MapPin className="w-6 h-6" style={{ color: '#fda612' }} />
              </div>
              <div>
                <h3 className="font-display font-semibold mb-1">{siteSettings.feature2Title || 'Neighborhood Nodes'}</h3>
                <p className="text-sm text-muted-foreground">
                  {siteSettings.feature2Desc || 'Pick up orders from node hosts who store inventory in their homes.'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center shrink-0 shadow-sm border">
                <Wallet className="w-6 h-6 text-primary" style={{ transform: 'rotate(-22.5deg)' }} />
              </div>
              <div>
                <h3 className="font-display font-semibold mb-1">{siteSettings.feature3Title || 'Shipping-Free Pricing'}</h3>
                <p className="text-sm text-muted-foreground">
                  {siteSettings.feature3Desc || 'Zero shipping charges - your neighbourhood, your savings.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
