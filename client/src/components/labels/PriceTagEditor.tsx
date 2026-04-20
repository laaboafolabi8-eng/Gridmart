import { useState, useRef, useEffect, useCallback } from 'react';
import { Tag, Printer, Download, X, Save, RotateCcw, Upload, Undo2, Redo2, AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Plus, Trash2, Magnet, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const INCH_TO_PX = 96;
const EDITOR_SCALE = 3;
const PREVIEW_SCALE = 2.4;
const SNAP_THRESHOLD = 5;

interface PriceTagEditorProps {
  products: any[];
  isOpen: boolean;
  onClose: () => void;
}

interface PriceTagElement {
  id: 'logo' | 'name' | 'price' | 'image';
  type: 'logo' | 'name' | 'price' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  visible: boolean;
  textAlign?: 'left' | 'center' | 'right';
}

interface PriceTagTemplate {
  key: string;
  displayName: string;
  widthPx: number;
  heightPx: number;
  widthIn: number;
  heightIn: number;
  elements: PriceTagElement[];
  customLogoUrl: string;
}

function getProductImageUrl(product: any): string {
  const candidates = [
    product.image,
    product.imageUrl,
    ...(Array.isArray(product.images) ? product.images : []),
  ];
  for (const url of candidates) {
    if (typeof url === 'string' && url.trim()) return url.trim();
  }
  return '';
}

function toAbsoluteUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  return `${window.location.origin}${url.startsWith('/') ? url : '/' + url}`;
}

interface CustomBox {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  textAlign: 'left' | 'center' | 'right';
  bold: boolean;
  color: string;
}

const CEDIT = 4; // scale for the per-product custom-box mini editor

function makeDefaultElements(w: number, h: number): PriceTagElement[] {
  const pad = Math.round(w * 0.03);
  // Image: right ~35% of width, full inner height
  const imgW = Math.round(w * 0.34);
  const imgH = h - pad * 2;
  const imgX = w - imgW - pad;
  const imgY = pad;
  // Left column width (image column takes right side)
  const leftW = imgX - pad * 2;
  // Logo: top-left
  const logoH = Math.round(h * 0.26);
  const logoW = logoH;
  const logoX = pad;
  const logoY = pad;
  // Name: below logo
  const nameY = logoY + logoH + Math.round(h * 0.04);
  const nameH = Math.round(h * 0.22);
  const nameFontSize = Math.max(6, Math.round(h * 0.10));
  // Price: bottom of left column
  const priceH = Math.round(h * 0.28);
  const priceY = h - priceH - pad;
  const priceFontSize = Math.max(12, Math.round(h * 0.22));
  return [
    { id: 'image', type: 'image', x: imgX, y: imgY, width: imgW, height: imgH, fontSize: 0, visible: true },
    { id: 'logo', type: 'logo', x: logoX, y: logoY, width: logoW, height: logoH, fontSize: 0, visible: true },
    { id: 'name', type: 'name', x: logoX + logoW + Math.round(w * 0.02), y: logoY, width: leftW - logoW - Math.round(w * 0.02), height: logoH, fontSize: nameFontSize, visible: true, textAlign: 'left' },
    { id: 'price', type: 'price', x: pad, y: priceY, width: leftW + pad, height: priceH, fontSize: priceFontSize, visible: true, textAlign: 'left' },
  ];
}

const STANDARD_TEMPLATE: PriceTagTemplate = {
  key: 'standard',
  displayName: 'Standard (1.75" × 1")',
  widthPx: 168,
  heightPx: 96,
  widthIn: 1.75,
  heightIn: 1.0,
  elements: makeDefaultElements(168, 96),
  customLogoUrl: '',
};

const DEFAULT_TEMPLATES: Record<string, PriceTagTemplate> = {
  standard: STANDARD_TEMPLATE,
};

function formatPrice(price: any): string {
  const num = typeof price === 'string' ? parseFloat(price) : (typeof price === 'number' ? price : 0);
  if (isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function getResizeHandleStyle(handle: string): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute', width: 8, height: 8, background: 'white',
    border: '2px solid #3b82f6', borderRadius: '50%', zIndex: 10, cursor: `${handle}-resize`,
  };
  if (handle === 'nw') return { ...base, top: -4, left: -4 };
  if (handle === 'n') return { ...base, top: -4, left: '50%', transform: 'translateX(-50%)' };
  if (handle === 'ne') return { ...base, top: -4, right: -4 };
  if (handle === 'e') return { ...base, top: '50%', right: -4, transform: 'translateY(-50%)' };
  if (handle === 'se') return { ...base, bottom: -4, right: -4 };
  if (handle === 's') return { ...base, bottom: -4, left: '50%', transform: 'translateX(-50%)' };
  if (handle === 'sw') return { ...base, bottom: -4, left: -4 };
  if (handle === 'w') return { ...base, top: '50%', left: -4, transform: 'translateY(-50%)' };
  return base;
}

function LogoContent({ customLogoUrl, size }: { customLogoUrl: string; size: number }) {
  if (customLogoUrl) {
    return <img src={customLogoUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
  }
  return (
    <div style={{ width: '100%', height: '100%', background: '#20B2AA', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 24 24" fill="white" style={{ width: '70%', height: '70%' }}>
        <path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18s-.41-.06-.57-.18l-7.9-4.44A.991.991 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18s.41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z" />
      </svg>
    </div>
  );
}

export function PriceTagEditor({ products, isOpen, onClose }: PriceTagEditorProps) {
  const [currentTemplateKey, setCurrentTemplateKey] = useState('standard');
  const [templates, setTemplates] = useState<Record<string, PriceTagTemplate>>(
    JSON.parse(JSON.stringify(DEFAULT_TEMPLATES))
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [displayProducts, setDisplayProducts] = useState<any[]>(products);
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({});
  const [productTemplateKeys, setProductTemplateKeys] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'preview' | 'editor'>('preview');
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, elemX: 0, elemY: 0, aspectRatio: 1 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ type: 'v' | 'h'; pos: number }[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showNewTemplateDialog, setShowNewTemplateDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateWidth, setNewTemplateWidth] = useState('1.75');
  const [newTemplateHeight, setNewTemplateHeight] = useState('1.0');

  const [productCustomizations, setProductCustomizations] = useState<Record<string, CustomBox[]>>({});
  const [openCustomProductId, setOpenCustomProductId] = useState<string | null>(null);
  const [selectedCustomBoxId, setSelectedCustomBoxId] = useState<string | null>(null);
  const customDragRef = useRef<{
    productId: string; boxId: string;
    type: 'move' | 'resize'; handle: string;
    startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number;
  } | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const historyRef = useRef<{ stack: Record<string, PriceTagTemplate>[]; pointer: number; isRestoring: boolean }>({
    stack: [JSON.parse(JSON.stringify(DEFAULT_TEMPLATES))],
    pointer: 0,
    isRestoring: false,
  });
  const dragStartSnapshotRef = useRef<Record<string, PriceTagTemplate> | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setDisplayProducts(products);
      const initialQty: Record<string, number> = {};
      products.forEach(p => { initialQty[p.id] = 1; });
      setProductQuantities(initialQty);
      setProductTemplateKeys({});
      setActiveTab('preview');
      setSelectedElements([]);
    }
  }, [isOpen, products]);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        const res = await fetch('/api/pricetag-templates', { credentials: 'include' });
        if (res.ok) {
          const saved = await res.json() as Record<string, any>;
          if (Object.keys(saved).length > 0) {
            const merged: Record<string, PriceTagTemplate> = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
            for (const [key, data] of Object.entries(saved)) {
              if (data?.elements && data?.widthPx && data?.heightPx) {
                const mergedElements: PriceTagElement[] = [...(data.elements as PriceTagElement[])];
                for (const eid of ['image', 'logo', 'name', 'price'] as const) {
                  if (!mergedElements.find(e => e.id === eid)) {
                    const def = makeDefaultElements(data.widthPx, data.heightPx).find(e => e.id === eid);
                    if (def) mergedElements.push(def);
                  }
                }
                merged[key] = { ...data, elements: mergedElements, key };
              }
            }
            setTemplates(merged);
            historyRef.current = { stack: [JSON.parse(JSON.stringify(merged))], pointer: 0, isRestoring: false };
          }
        }
      } catch (e) {
        console.error('Failed to load price tag templates:', e);
      }
    };
    load();
  }, [isOpen]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = customDragRef.current;
      if (!d) return;
      e.preventDefault();
      const dx = (e.clientX - d.startX) / CEDIT;
      const dy = (e.clientY - d.startY) / CEDIT;
      setProductCustomizations(prev => {
        const boxes = prev[d.productId] || [];
        return {
          ...prev,
          [d.productId]: boxes.map(b => {
            if (b.id !== d.boxId) return b;
            if (d.type === 'move') {
              return { ...b, x: Math.round(d.origX + dx), y: Math.round(d.origY + dy) };
            }
            const h = d.handle;
            const rawW = d.origW + (h.includes('e') ? dx : h.includes('w') ? -dx : 0);
            const rawH = d.origH + (h.includes('s') ? dy : h.includes('n') ? -dy : 0);
            const newW = Math.max(20, Math.round(rawW));
            const newH = Math.max(10, Math.round(rawH));
            const newX = h.includes('w') ? Math.round(d.origX + d.origW - newW) : d.origX;
            const newY = h.includes('n') ? Math.round(d.origY + d.origH - newH) : d.origY;
            return { ...b, x: newX, y: newY, width: newW, height: newH };
          }),
        };
      });
    };
    const onUp = () => { customDragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const commitToHistory = useCallback((newTemplates: Record<string, PriceTagTemplate>) => {
    const history = historyRef.current;
    if (history.isRestoring) return;
    history.stack = history.stack.slice(0, history.pointer + 1);
    history.stack.push(JSON.parse(JSON.stringify(newTemplates)));
    if (history.stack.length > 50) history.stack.shift();
    history.pointer = history.stack.length - 1;
    setHistoryVersion(v => v + 1);
  }, []);

  const undo = useCallback(() => {
    const history = historyRef.current;
    if (history.pointer > 0) {
      history.isRestoring = true;
      history.pointer--;
      setTemplates(JSON.parse(JSON.stringify(history.stack[history.pointer])));
      setHistoryVersion(v => v + 1);
      setTimeout(() => { history.isRestoring = false; }, 0);
    }
  }, []);

  const redo = useCallback(() => {
    const history = historyRef.current;
    if (history.pointer < history.stack.length - 1) {
      history.isRestoring = true;
      history.pointer++;
      setTemplates(JSON.parse(JSON.stringify(history.stack[history.pointer])));
      setHistoryVersion(v => v + 1);
      setTimeout(() => { history.isRestoring = false; }, 0);
    }
  }, []);

  const canUndo = historyRef.current.pointer > 0;
  const canRedo = historyRef.current.pointer < historyRef.current.stack.length - 1;

  const addCustomBox = useCallback((productId: string, tmpl: PriceTagTemplate) => {
    const id = `cb-${Date.now()}`;
    const box: CustomBox = {
      id, text: 'Custom text',
      x: Math.round(tmpl.widthPx * 0.05),
      y: Math.round(tmpl.heightPx * 0.78),
      width: Math.round(tmpl.widthPx * 0.9),
      height: Math.round(tmpl.heightPx * 0.16),
      fontSize: 7, textAlign: 'center', bold: false, color: '#000000',
    };
    setProductCustomizations(prev => ({ ...prev, [productId]: [...(prev[productId] || []), box] }));
    setSelectedCustomBoxId(id);
  }, []);

  const updateCustomBox = useCallback((productId: string, boxId: string, updates: Partial<CustomBox>) => {
    setProductCustomizations(prev => ({
      ...prev,
      [productId]: (prev[productId] || []).map(b => b.id === boxId ? { ...b, ...updates } : b),
    }));
  }, []);

  const deleteCustomBox = useCallback((productId: string, boxId: string) => {
    setProductCustomizations(prev => ({
      ...prev,
      [productId]: (prev[productId] || []).filter(b => b.id !== boxId),
    }));
    setSelectedCustomBoxId(s => s === boxId ? null : s);
  }, []);

  const currentTemplate = templates[currentTemplateKey] || STANDARD_TEMPLATE;

  const updateElement = (elementId: string, updates: Partial<PriceTagElement>, addToHistory = false) => {
    setTemplates(prev => {
      const tmpl = prev[currentTemplateKey];
      if (!tmpl) return prev;
      const newTemplates = {
        ...prev,
        [currentTemplateKey]: {
          ...tmpl,
          elements: tmpl.elements.map(el => el.id === elementId ? { ...el, ...updates } : el),
        },
      };
      if (addToHistory) {
        const history = historyRef.current;
        if (!history.isRestoring) {
          history.stack = history.stack.slice(0, history.pointer + 1);
          history.stack.push(JSON.parse(JSON.stringify(newTemplates)));
          if (history.stack.length > 50) history.stack.shift();
          history.pointer = history.stack.length - 1;
        }
      }
      return newTemplates;
    });
    if (addToHistory) setHistoryVersion(v => v + 1);
  };

  const saveTemplates = async () => {
    try {
      const res = await fetch('/api/pricetag-templates/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ templates }),
      });
      if (res.ok) {
        toast.success(`Template "${currentTemplate.displayName}" saved`);
      } else {
        toast.error('Failed to save template');
      }
    } catch {
      toast.error('Failed to save template');
    }
  };

  const resetCurrentTemplate = () => {
    if (currentTemplateKey === 'standard') {
      setTemplates(prev => ({ ...prev, standard: JSON.parse(JSON.stringify(STANDARD_TEMPLATE)) }));
    } else {
      const t = templates[currentTemplateKey];
      setTemplates(prev => ({
        ...prev,
        [currentTemplateKey]: { ...prev[currentTemplateKey], elements: makeDefaultElements(t.widthPx, t.heightPx), customLogoUrl: '' },
      }));
    }
    toast.success('Template reset to default');
  };

  const createNewTemplate = () => {
    const w = parseFloat(newTemplateWidth);
    const h = parseFloat(newTemplateHeight);
    if (!newTemplateName.trim() || isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
      toast.error('Enter a valid name and dimensions');
      return;
    }
    const key = newTemplateName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!key || templates[key]) {
      toast.error(templates[key] ? 'A template with this name already exists' : 'Invalid template name');
      return;
    }
    const widthPx = Math.round(w * INCH_TO_PX);
    const heightPx = Math.round(h * INCH_TO_PX);
    const newTemplate: PriceTagTemplate = {
      key,
      displayName: `${newTemplateName.trim()} (${w}" × ${h}")`,
      widthPx,
      heightPx,
      widthIn: w,
      heightIn: h,
      elements: makeDefaultElements(widthPx, heightPx),
      customLogoUrl: '',
    };
    setTemplates(prev => ({ ...prev, [key]: newTemplate }));
    setCurrentTemplateKey(key);
    setShowNewTemplateDialog(false);
    setNewTemplateName('');
    setNewTemplateWidth('1.75');
    setNewTemplateHeight('1.0');
    toast.success(`Template "${newTemplate.displayName}" created`);
  };

  const deleteTemplate = async (key: string) => {
    if (key === 'standard') { toast.error('Cannot delete the standard template'); return; }
    try {
      await fetch(`/api/pricetag-templates/${encodeURIComponent(key)}`, { method: 'DELETE', credentials: 'include' });
      setTemplates(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (currentTemplateKey === key) setCurrentTemplateKey('standard');
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setTemplates(prev => ({
        ...prev,
        [currentTemplateKey]: { ...prev[currentTemplateKey], customLogoUrl: url },
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // --- Drag / Resize / Marquee ---
  const dragStateRef = useRef({
    selectedElements, dragOffset, currentTemplateKey, templates, isResizing, resizeHandle, resizeStart, marquee, snapEnabled,
  });
  dragStateRef.current = { selectedElements, dragOffset, currentTemplateKey, templates, isResizing, resizeHandle, resizeStart, marquee, snapEnabled };

  const handleMouseDown = (e: React.MouseEvent, elementId: string) => {
    if (activeTab !== 'editor') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) {
      setSelectedElements(prev => prev.includes(elementId) ? prev.filter(id => id !== elementId) : [...prev, elementId]);
    } else {
      setSelectedElements(prev => prev.includes(elementId) ? prev : [elementId]);
    }
    setIsDragging(true);
    dragStartSnapshotRef.current = JSON.parse(JSON.stringify(templates));
    const element = currentTemplate.elements.find(el => el.id === elementId);
    if (element && editorRef.current) {
      const rect = editorRef.current.getBoundingClientRect();
      setDragOffset({ x: e.clientX - rect.left - element.x * EDITOR_SCALE, y: e.clientY - rect.top - element.y * EDITOR_SCALE });
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const { selectedElements, dragOffset, currentTemplateKey, templates, isResizing, resizeHandle, resizeStart, marquee, snapEnabled } = dragStateRef.current;
    if (!editorRef.current) return;
    const tmpl = templates[currentTemplateKey];
    if (!tmpl) return;

    if (marquee) {
      const rect = editorRef.current.getBoundingClientRect();
      setMarquee(prev => prev ? { ...prev, endX: e.clientX - rect.left, endY: e.clientY - rect.top } : null);
      return;
    }

    if (isResizing && resizeHandle && selectedElements.length === 1) {
      const elemId = selectedElements[0];
      const element = tmpl.elements.find(el => el.id === elemId);
      if (!element) return;
      const dX = (e.clientX - resizeStart.x) / EDITOR_SCALE;
      const dY = (e.clientY - resizeStart.y) / EDITOR_SCALE;
      let nW = resizeStart.width, nH = resizeStart.height, nX = resizeStart.elemX, nY = resizeStart.elemY;
      if (resizeHandle.includes('e')) nW = Math.max(10, resizeStart.width + dX);
      if (resizeHandle.includes('w')) { const d = Math.min(dX, resizeStart.width - 10); nX = resizeStart.elemX + d; nW = resizeStart.width - d; }
      if (resizeHandle.includes('s')) nH = Math.max(10, resizeStart.height + dY);
      if (resizeHandle.includes('n')) { const d = Math.min(dY, resizeStart.height - 10); nY = resizeStart.elemY + d; nH = resizeStart.height - d; }
      if (element.type === 'image' || e.shiftKey) {
        const ar = resizeStart.aspectRatio;
        const wc = Math.abs(nW - resizeStart.width), hc = Math.abs(nH - resizeStart.height);
        if (wc >= hc) { nH = nW / ar; } else { nW = nH * ar; }
        if (resizeHandle.includes('w')) nX = resizeStart.elemX + resizeStart.width - nW;
        if (resizeHandle.includes('n')) nY = resizeStart.elemY + resizeStart.height - nH;
      }
      nW = Math.max(10, nW); nH = Math.max(10, nH);
      updateElement(elemId, { x: Math.round(nX), y: Math.round(nY), width: Math.round(nW), height: Math.round(nH) });
      return;
    }

    if (selectedElements.length === 0) return;
    const primary = tmpl.elements.find(el => el.id === selectedElements[0]);
    if (!primary) return;
    const rect = editorRef.current.getBoundingClientRect();
    let newX = (e.clientX - rect.left - dragOffset.x) / EDITOR_SCALE;
    let newY = (e.clientY - rect.top - dragOffset.y) / EDITOR_SCALE;

    const guides: { type: 'v' | 'h'; pos: number }[] = [];
    if (snapEnabled) {
      const others = tmpl.elements.filter(el => el.visible && !selectedElements.includes(el.id));
      const snapX: number[] = [0, tmpl.widthPx];
      const snapY: number[] = [0, tmpl.heightPx];
      others.forEach(el => { snapX.push(el.x, el.x + el.width / 2, el.x + el.width); snapY.push(el.y, el.y + el.height / 2, el.y + el.height); });

      [newX, newX + primary.width / 2, newX + primary.width].forEach((ex, i) => {
        snapX.forEach(sx => {
          if (Math.abs(ex - sx) < SNAP_THRESHOLD) {
            newX = sx - (i === 0 ? 0 : i === 1 ? primary.width / 2 : primary.width);
            guides.push({ type: 'v', pos: sx });
          }
        });
      });
      [newY, newY + primary.height / 2, newY + primary.height].forEach((ey, i) => {
        snapY.forEach(sy => {
          if (Math.abs(ey - sy) < SNAP_THRESHOLD) {
            newY = sy - (i === 0 ? 0 : i === 1 ? primary.height / 2 : primary.height);
            guides.push({ type: 'h', pos: sy });
          }
        });
      });
    }
    setSnapGuides(guides);

    const dX = newX - primary.x, dY = newY - primary.y;
    selectedElements.forEach(id => {
      const el = tmpl.elements.find(e => e.id === id);
      if (el) updateElement(id, {
        x: Math.round(el.x + dX),
        y: Math.round(el.y + dY),
      });
    });
  }, [updateElement]);

  const handleMouseUp = useCallback(() => {
    const { marquee, currentTemplateKey, templates } = dragStateRef.current;
    const tmpl = templates[currentTemplateKey];
    if (marquee && tmpl) {
      const ml = Math.min(marquee.startX, marquee.endX) / EDITOR_SCALE;
      const mr = Math.max(marquee.startX, marquee.endX) / EDITOR_SCALE;
      const mt = Math.min(marquee.startY, marquee.endY) / EDITOR_SCALE;
      const mb = Math.max(marquee.startY, marquee.endY) / EDITOR_SCALE;
      if (Math.abs(marquee.endX - marquee.startX) > 5 || Math.abs(marquee.endY - marquee.startY) > 5) {
        setSelectedElements(tmpl.elements.filter(el => el.visible && el.x < mr && el.x + el.width > ml && el.y < mb && el.y + el.height > mt).map(el => el.id));
      }
      setMarquee(null);
      return;
    }
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
    setSnapGuides([]);
    if (dragStartSnapshotRef.current) {
      commitToHistory(templates);
      dragStartSnapshotRef.current = null;
    }
  }, [commitToHistory]);

  useEffect(() => {
    if (isDragging || isResizing || marquee) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, marquee, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'editor') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
          target.getAttribute('role') === 'slider' || !!target.closest('[role="slider"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedElements(currentTemplate.elements.filter(el => el.visible).map(el => el.id));
        return;
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (selectedElements.length === 0) return;
      const step = e.shiftKey ? 5 : 1;
      const dX = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dY = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      selectedElements.forEach(id => {
        const el = currentTemplate.elements.find(e => e.id === id);
        if (el) updateElement(id, {
          x: el.x + dX,
          y: el.y + dY,
        }, id === selectedElements[selectedElements.length - 1]);
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, activeTab, selectedElements, currentTemplate, undo, redo, updateElement]);

  const alignElement = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selectedElements.length === 0) return;
    const { widthPx, heightPx } = currentTemplate;
    const newTemplates = { ...templates };
    selectedElements.forEach(id => {
      const el = currentTemplate.elements.find(e => e.id === id);
      if (!el) return;
      let nX = el.x, nY = el.y;
      if (alignment === 'left') nX = 0;
      else if (alignment === 'center') nX = Math.round((widthPx - el.width) / 2);
      else if (alignment === 'right') nX = widthPx - el.width;
      else if (alignment === 'top') nY = 0;
      else if (alignment === 'middle') nY = Math.round((heightPx - el.height) / 2);
      else if (alignment === 'bottom') nY = heightPx - el.height;
      newTemplates[currentTemplateKey] = {
        ...newTemplates[currentTemplateKey],
        elements: newTemplates[currentTemplateKey].elements.map(e => e.id === id ? { ...e, x: nX, y: nY } : e),
      };
    });
    setTemplates(newTemplates);
    commitToHistory(newTemplates);
  };

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      const tagsByProduct: Record<string, { name: string; price: string; templateKey: string }[]> = {};
      displayProducts.forEach(p => {
        const qty = productQuantities[p.id] || 1;
        const tKey = productTemplateKeys[p.id] || currentTemplateKey;
        tagsByProduct[p.id] = Array.from({ length: qty }, () => ({
          name: p.name,
          price: formatPrice(p.price),
          templateKey: tKey,
          imageUrl: toAbsoluteUrl(getProductImageUrl(p)),
          customBoxes: productCustomizations[p.id] || [],
        }));
      });
      const res = await fetch('/api/pricetags/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tagsByProduct, templates }),
      });
      if (!res.ok) throw new Error('PDF generation failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] || 'pricetags.pdf';
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Price tags downloaded');
    } catch {
      toast.error('Failed to generate price tags PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    const LOGO_SVG = `<svg viewBox="0 0 24 24" fill="white" style="width:70%;height:70%;"><path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18s-.41-.06-.57-.18l-7.9-4.44A.991.991 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18s.41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z"/></svg>`;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const justify = (el: any) => el?.textAlign === 'center' ? 'center' : el?.textAlign === 'right' ? 'flex-end' : 'flex-start';

    const SHEET_W = 816, SHEET_H = 1056;

    const entries: { name: string; price: string; imageUrl: string; tmpl: typeof currentTemplate; customBoxes: CustomBox[] }[] = [];
    displayProducts.forEach(product => {
      const qty = productQuantities[product.id] || 1;
      const tmpl = templates[productTemplateKeys[product.id] || currentTemplateKey] || currentTemplate;
      const imageUrl = toAbsoluteUrl(getProductImageUrl(product));
      const customBoxes = productCustomizations[product.id] || [];
      for (let i = 0; i < qty; i++) {
        entries.push({ name: product.name, price: formatPrice(product.price), imageUrl, tmpl, customBoxes });
      }
    });

    if (!entries.length) { toast.error('No products to print'); return; }

    const { widthPx, heightPx } = entries[0].tmpl;
    const COLS = Math.max(1, Math.floor(SHEET_W / widthPx));
    const ROWS = Math.max(1, Math.floor(SHEET_H / heightPx));
    const PER_SHEET = COLS * ROWS;
    const offsetX = Math.floor((SHEET_W - COLS * widthPx) / 2);
    const offsetY = Math.floor((SHEET_H - ROWS * heightPx) / 2);

    const padded: (typeof entries[0] | null)[] = [...entries];
    while (padded.length % PER_SHEET !== 0) padded.push(null);

    const sheetGroups: (typeof entries[0] | null)[][] = [];
    for (let i = 0; i < padded.length; i += PER_SHEET) sheetGroups.push(padded.slice(i, i + PER_SHEET));

    const renderCell = (entry: typeof entries[0] | null) => {
      if (!entry) return `<div style="width:${widthPx}px;height:${heightPx}px;outline:1px dashed rgba(0,0,0,0.15);outline-offset:-1px;"></div>`;
      const { elements, customLogoUrl } = entry.tmpl;
      const imgEl = elements.find(e => e.id === 'image');
      const logo = elements.find(e => e.id === 'logo');
      const name = elements.find(e => e.id === 'name');
      const price = elements.find(e => e.id === 'price');
      return `<div style="position:relative;width:${widthPx}px;height:${heightPx}px;background:white;overflow:hidden;outline:1px dashed rgba(0,0,0,0.25);outline-offset:-1px;">
        ${imgEl?.visible && entry.imageUrl ? `<div style="position:absolute;left:${imgEl.x}px;top:${imgEl.y}px;width:${imgEl.width}px;height:${imgEl.height}px;"><img src="${esc(entry.imageUrl)}" style="width:100%;height:100%;object-fit:contain;" crossorigin="anonymous"></div>` : ''}
        ${logo?.visible ? `<div style="position:absolute;left:${logo.x}px;top:${logo.y}px;width:${logo.width}px;height:${logo.height}px;${customLogoUrl ? '' : 'background:#20B2AA;'}border-radius:3px;display:flex;align-items:center;justify-content:center;">${customLogoUrl ? `<img src="${esc(customLogoUrl)}" style="width:100%;height:100%;object-fit:contain;">` : LOGO_SVG}</div>` : ''}
        ${name?.visible ? `<div style="position:absolute;left:${name.x}px;top:${name.y}px;width:${name.width}px;height:${name.height}px;font-size:${name.fontSize}px;font-weight:bold;font-family:Arial,sans-serif;line-height:1.2;display:flex;align-items:center;justify-content:${justify(name)};">${esc(entry.name)}</div>` : ''}
        ${price?.visible ? `<div style="position:absolute;left:${price.x}px;top:${price.y}px;width:${price.width}px;height:${price.height}px;font-size:${price.fontSize}px;font-weight:bold;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:${justify(price)};color:#1a1a1a;">${esc(entry.price)}</div>` : ''}
        ${entry.customBoxes.map(box => `<div style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;font-size:${box.fontSize}px;font-weight:${box.bold ? 'bold' : 'normal'};font-family:Arial,sans-serif;color:${box.color};display:flex;align-items:center;justify-content:${box.textAlign === 'center' ? 'center' : box.textAlign === 'right' ? 'flex-end' : 'flex-start'};line-height:1.2;">${esc(box.text)}</div>`).join('')}
      </div>`;
    };

    const sheetsHtml = sheetGroups.map((group, si) =>
      `<div style="position:relative;width:${SHEET_W}px;height:${SHEET_H}px;background:white;${si < sheetGroups.length - 1 ? 'page-break-after:always;' : ''}">
        <div style="position:absolute;left:${offsetX}px;top:${offsetY}px;display:grid;grid-template-columns:repeat(${COLS},${widthPx}px);grid-template-rows:repeat(${ROWS},${heightPx}px);">
          ${group.map(renderCell).join('')}
        </div>
      </div>`
    ).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;background:white;}@page{size:8.5in 11in;margin:0;}</style></head><body>${sheetsHtml}</body></html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { toast.error('Popup blocked — please allow popups for this site.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const renderTagPreview = (product: any, templateKey?: string, scale?: number, customBoxes?: CustomBox[]) => {
    const tmpl = templates[templateKey || currentTemplateKey] || currentTemplate;
    const { widthPx, heightPx, elements, customLogoUrl } = tmpl;
    const s = scale ?? PREVIEW_SCALE;
    const imgEl = elements.find(e => e.id === 'image');
    const logo = elements.find(e => e.id === 'logo');
    const name = elements.find(e => e.id === 'name');
    const price = elements.find(e => e.id === 'price');
    const productImageUrl = getProductImageUrl(product);
    const boxes = customBoxes ?? (productCustomizations[product.id] || []);
    return (
      <div style={{ position: 'relative', width: widthPx * s, height: heightPx * s, background: 'white', border: '1px solid #e2e8f0', borderRadius: 3, flexShrink: 0 }}>
        {imgEl?.visible && (
          <div style={{ position: 'absolute', left: imgEl.x * s, top: imgEl.y * s, width: imgEl.width * s, height: imgEl.height * s, background: '#f1f5f9', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <span style={{ position: 'absolute', fontSize: imgEl.width * s * 0.3, color: '#94a3b8' }}>📷</span>
            {productImageUrl && (
              <img
                src={productImageUrl}
                style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', zIndex: 1 }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </div>
        )}
        {logo?.visible && (
          <div style={{ position: 'absolute', left: logo.x * s, top: logo.y * s, width: logo.width * s, height: logo.height * s }}>
            <LogoContent customLogoUrl={customLogoUrl} size={logo.width * s} />
          </div>
        )}
        {name?.visible && (
          <div style={{ position: 'absolute', left: name.x * s, top: name.y * s, width: name.width * s, height: name.height * s, fontSize: name.fontSize * s, fontWeight: 'bold', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: name.textAlign === 'center' ? 'center' : name.textAlign === 'right' ? 'flex-end' : 'flex-start', textAlign: name.textAlign || 'left', fontFamily: 'Arial, sans-serif', lineHeight: 1.2 }}>
            {product.name}
          </div>
        )}
        {price?.visible && (
          <div style={{ position: 'absolute', left: price.x * s, top: price.y * s, width: price.width * s, height: price.height * s, fontSize: price.fontSize * s, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: price.textAlign === 'center' ? 'center' : price.textAlign === 'right' ? 'flex-end' : 'flex-start', textAlign: price.textAlign || 'left', fontFamily: 'Arial, sans-serif', color: '#1a1a1a' }}>
            {formatPrice(product.price)}
          </div>
        )}
        {boxes.map(box => (
          <div key={box.id} style={{ position: 'absolute', left: box.x * s, top: box.y * s, width: box.width * s, height: box.height * s, fontSize: box.fontSize * s, fontWeight: box.bold ? 'bold' : 'normal', color: box.color, display: 'flex', alignItems: 'center', justifyContent: box.textAlign === 'center' ? 'center' : box.textAlign === 'right' ? 'flex-end' : 'flex-start', fontFamily: 'Arial, sans-serif', lineHeight: 1.2 }}>
            {box.text}
          </div>
        ))}
      </div>
    );
  };

  const selectedElement = selectedElements.length === 1
    ? currentTemplate.elements.find(el => el.id === selectedElements[0]) ?? null
    : null;

  const templateList = Object.values(templates);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              Price Tag Editor
            </DialogTitle>
            <DialogDescription>
              {displayProducts.length} product{displayProducts.length !== 1 ? 's' : ''} selected
            </DialogDescription>
          </DialogHeader>

          {/* Toolbar */}
          <div className="px-4 py-2 border-b flex items-center gap-2 flex-wrap shrink-0">
            <Label className="text-xs text-muted-foreground">Template:</Label>
            <Select value={currentTemplateKey} onValueChange={setCurrentTemplateKey}>
              <SelectTrigger className="h-8 text-xs w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templateList.map(t => (
                  <SelectItem key={t.key} value={t.key} className="text-xs">{t.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setShowNewTemplateDialog(true)} title="New template">
              <Plus className="w-3 h-3" />
            </Button>
            {currentTemplateKey !== 'standard' && (
              <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => deleteTemplate(currentTemplateKey)} title="Delete template">
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
            <span className="text-xs text-muted-foreground border-l pl-2 ml-1">
              {currentTemplate.widthIn}" × {currentTemplate.heightIn}"
            </span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
              <Redo2 className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={resetCurrentTemplate}>
              <RotateCcw className="w-3 h-3 mr-1" />Reset
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={saveTemplates}>
              <Save className="w-3 h-3 mr-1" />Save Template
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-1" />Print
            </Button>
            <Button size="sm" className="h-8" onClick={handleDownloadPDF} disabled={isGenerating}>
              {isGenerating
                ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />Generating...</>
                : <><Download className="w-4 h-4 mr-1" />Download PDF</>}
            </Button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Main area */}
            <div className="flex-1 overflow-auto p-4">
              <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'preview' | 'editor')}>
                <TabsList className="mb-4">
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="editor">Editor</TabsTrigger>
                </TabsList>

                {/* Preview tab */}
                <TabsContent value="preview" className="mt-0">
                  <div className="space-y-3">
                    {displayProducts.map(product => {
                      const isOpen = openCustomProductId === product.id;
                      const tmpl = templates[productTemplateKeys[product.id] || currentTemplateKey] || currentTemplate;
                      const customBoxes = productCustomizations[product.id] || [];
                      const selBox = customBoxes.find(b => b.id === selectedCustomBoxId) ?? null;
                      const handleCornerMouseDown = (e: React.MouseEvent, boxId: string, handle: string, box: CustomBox) => {
                        e.stopPropagation();
                        e.preventDefault();
                        customDragRef.current = { productId: product.id, boxId, type: 'resize', handle, startX: e.clientX, startY: e.clientY, origX: box.x, origY: box.y, origW: box.width, origH: box.height };
                      };
                      return (
                        <div key={product.id} className={`border rounded-lg ${isOpen ? 'ring-2 ring-primary/40' : ''}`}>
                          {/* Main row */}
                          <div className="flex items-center gap-4 p-3">
                            {renderTagPreview(product, productTemplateKeys[product.id])}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{product.name}</p>
                              <p className="text-xs text-muted-foreground">{formatPrice(product.price)}</p>
                              {customBoxes.length > 0 && (
                                <p className="text-xs text-primary mt-0.5">{customBoxes.length} custom box{customBoxes.length !== 1 ? 'es' : ''}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Label className="text-xs">Qty:</Label>
                              <Input
                                type="number" min={1}
                                value={productQuantities[product.id] || 1}
                                onChange={e => setProductQuantities(prev => ({ ...prev, [product.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                                className="w-16 h-7 text-xs"
                              />
                              {templateList.length > 1 && (
                                <Select
                                  value={productTemplateKeys[product.id] || currentTemplateKey}
                                  onValueChange={v => setProductTemplateKeys(prev => ({ ...prev, [product.id]: v }))}
                                >
                                  <SelectTrigger className="h-7 text-xs w-40">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {templateList.map(t => (
                                      <SelectItem key={t.key} value={t.key} className="text-xs">{t.displayName}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              <Button
                                variant={isOpen ? 'default' : 'outline'}
                                size="sm" className="h-7 px-2"
                                title="Customize this tag"
                                onClick={() => {
                                  setOpenCustomProductId(isOpen ? null : product.id);
                                  setSelectedCustomBoxId(null);
                                }}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-destructive"
                                onClick={() => setDisplayProducts(prev => prev.filter(p => p.id !== product.id))}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>

                          {/* Per-product custom editor */}
                          {isOpen && (
                            <div className="border-t p-4 bg-muted/20">
                              <div className="flex gap-6 flex-wrap">
                                {/* Mini editor canvas */}
                                <div>
                                  <p className="text-xs text-muted-foreground mb-2">Drag boxes to reposition · Click to select · Handles to resize</p>
                                  <div
                                    style={{ position: 'relative', width: tmpl.widthPx * CEDIT, height: tmpl.heightPx * CEDIT, userSelect: 'none', cursor: 'default' }}
                                    onMouseDown={() => setSelectedCustomBoxId(null)}
                                  >
                                    {/* Background: template at CEDIT scale (non-interactive) */}
                                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                                      {renderTagPreview(product, productTemplateKeys[product.id], CEDIT, [])}
                                    </div>
                                    {/* Interactive custom boxes */}
                                    {customBoxes.map(box => {
                                      const isSel = selectedCustomBoxId === box.id;
                                      return (
                                        <div
                                          key={box.id}
                                          style={{
                                            position: 'absolute',
                                            left: box.x * CEDIT, top: box.y * CEDIT,
                                            width: box.width * CEDIT, height: box.height * CEDIT,
                                            border: isSel ? '2px solid #3b82f6' : '1px dashed #94a3b8',
                                            cursor: 'move',
                                            display: 'flex', alignItems: 'center',
                                            justifyContent: box.textAlign === 'center' ? 'center' : box.textAlign === 'right' ? 'flex-end' : 'flex-start',
                                            fontSize: box.fontSize * CEDIT,
                                            fontWeight: box.bold ? 'bold' : 'normal',
                                            color: box.color,
                                            fontFamily: 'Arial, sans-serif',
                                            lineHeight: 1.2,
                                            overflow: 'hidden',
                                            boxSizing: 'border-box',
                                          }}
                                          onMouseDown={e => {
                                            e.stopPropagation();
                                            setSelectedCustomBoxId(box.id);
                                            customDragRef.current = { productId: product.id, boxId: box.id, type: 'move', handle: '', startX: e.clientX, startY: e.clientY, origX: box.x, origY: box.y, origW: box.width, origH: box.height };
                                          }}
                                        >
                                          <span style={{ padding: '0 2px', pointerEvents: 'none' }}>{box.text}</span>
                                          {/* Corner resize handles */}
                                          {isSel && (['nw','ne','se','sw'] as const).map(handle => (
                                            <div
                                              key={handle}
                                              style={{
                                                position: 'absolute',
                                                width: 8, height: 8,
                                                background: 'white', border: '2px solid #3b82f6', borderRadius: '50%',
                                                cursor: `${handle}-resize`,
                                                ...(handle === 'nw' ? { top: -4, left: -4 } : handle === 'ne' ? { top: -4, right: -4 } : handle === 'se' ? { bottom: -4, right: -4 } : { bottom: -4, left: -4 }),
                                              }}
                                              onMouseDown={e => handleCornerMouseDown(e, box.id, handle, box)}
                                            />
                                          ))}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Controls */}
                                <div className="flex-1 min-w-[200px] space-y-3">
                                  <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => addCustomBox(product.id, tmpl)}>
                                    <Plus className="w-3 h-3 mr-1" />Add Text Box
                                  </Button>

                                  {selBox && (
                                    <div className="space-y-2 p-3 border rounded-md bg-background">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium">Selected box</span>
                                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive hover:text-destructive" onClick={() => deleteCustomBox(product.id, selBox.id)}>
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                      <textarea
                                        className="w-full text-xs border rounded p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                                        rows={2}
                                        value={selBox.text}
                                        onChange={e => updateCustomBox(product.id, selBox.id, { text: e.target.value })}
                                        placeholder="Enter text…"
                                      />
                                      <div className="flex items-center gap-2">
                                        <Label className="text-xs shrink-0">Size</Label>
                                        <input
                                          type="number" min={5} max={40} step={1}
                                          value={selBox.fontSize}
                                          onChange={e => updateCustomBox(product.id, selBox.id, { fontSize: Math.max(5, parseInt(e.target.value) || 7) })}
                                          className="w-14 h-6 text-xs border rounded px-1 text-center"
                                        />
                                        <Button size="sm" variant={selBox.bold ? 'default' : 'outline'} className="h-6 px-2 text-xs font-bold" onClick={() => updateCustomBox(product.id, selBox.id, { bold: !selBox.bold })}>B</Button>
                                        <input
                                          type="color"
                                          value={selBox.color}
                                          onChange={e => updateCustomBox(product.id, selBox.id, { color: e.target.value })}
                                          className="w-7 h-6 border rounded cursor-pointer p-0.5"
                                          title="Text color"
                                        />
                                      </div>
                                      <div className="flex gap-1">
                                        {(['left','center','right'] as const).map(a => (
                                          <Button key={a} size="sm" variant={selBox.textAlign === a ? 'default' : 'outline'} className="flex-1 h-6 text-xs" onClick={() => updateCustomBox(product.id, selBox.id, { textAlign: a })}>
                                            {a === 'left' ? <AlignLeft className="w-3 h-3" /> : a === 'center' ? <AlignCenter className="w-3 h-3" /> : <AlignRight className="w-3 h-3" />}
                                          </Button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {customBoxes.length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center pt-2">No custom boxes yet.<br/>Click "Add Text Box" to start.</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {displayProducts.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground text-sm">No products selected</div>
                    )}
                  </div>
                </TabsContent>

                {/* Editor tab */}
                <TabsContent value="editor" className="mt-0">
                  <div className="flex items-center gap-3 mb-3">
                    <p className="text-xs text-muted-foreground">
                      Click to select · Drag to move · Handles to resize · Shift+click multi-select · Arrow keys nudge · Ctrl+Z undo
                    </p>
                    <Button
                      variant={snapEnabled ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs shrink-0"
                      onClick={() => setSnapEnabled(v => !v)}
                      title={snapEnabled ? 'Snapping on — click to disable' : 'Snapping off — click to enable'}
                    >
                      <Magnet className="w-3 h-3 mr-1" />
                      {snapEnabled ? 'Snap On' : 'Snap Off'}
                    </Button>
                  </div>
                  <div
                    ref={editorRef}
                    className="relative border-2 border-dashed border-slate-300 cursor-crosshair select-none inline-block"
                    style={{ width: currentTemplate.widthPx * EDITOR_SCALE, height: currentTemplate.heightPx * EDITOR_SCALE, background: 'white' }}
                    onMouseDown={e => {
                      if (e.target === editorRef.current) {
                        setSelectedElements([]);
                        const rect = editorRef.current!.getBoundingClientRect();
                        const x = e.clientX - rect.left, y = e.clientY - rect.top;
                        setMarquee({ startX: x, startY: y, endX: x, endY: y });
                      }
                    }}
                  >
                    {/* Snap guides */}
                    {snapGuides.map((g, i) =>
                      g.type === 'v'
                        ? <div key={i} style={{ position: 'absolute', left: g.pos * EDITOR_SCALE, top: 0, width: 1, height: '100%', background: '#3b82f6', pointerEvents: 'none', zIndex: 99 }} />
                        : <div key={i} style={{ position: 'absolute', top: g.pos * EDITOR_SCALE, left: 0, height: 1, width: '100%', background: '#3b82f6', pointerEvents: 'none', zIndex: 99 }} />
                    )}
                    {/* Marquee */}
                    {marquee && (
                      <div style={{ position: 'absolute', left: Math.min(marquee.startX, marquee.endX), top: Math.min(marquee.startY, marquee.endY), width: Math.abs(marquee.endX - marquee.startX), height: Math.abs(marquee.endY - marquee.startY), border: '1px dashed #3b82f6', background: 'rgba(59,130,246,0.07)', pointerEvents: 'none', zIndex: 100 }} />
                    )}
                    {/* Elements */}
                    {currentTemplate.elements.map(element => {
                      const isSelected = selectedElements.includes(element.id);
                      return (
                        <div
                          key={element.id}
                          style={{
                            position: 'absolute',
                            left: element.x * EDITOR_SCALE,
                            top: element.y * EDITOR_SCALE,
                            width: element.width * EDITOR_SCALE,
                            height: element.height * EDITOR_SCALE,
                            border: isSelected ? '2px solid #3b82f6' : '1px dashed #cbd5e1',
                            cursor: element.visible ? 'grab' : 'default',
                            boxSizing: 'border-box',
                            overflow: element.type === 'image' ? 'visible' : 'hidden',
                            opacity: element.visible ? 1 : 0.25,
                          }}
                          onMouseDown={e => element.visible && handleMouseDown(e, element.id)}
                        >
                          {element.type === 'image' && (() => {
                            const imgUrl = getProductImageUrl(displayProducts[0] || {});
                            return (
                              <div style={{ width: '100%', height: '100%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                <span style={{ position: 'absolute', fontSize: element.width * EDITOR_SCALE * 0.25, color: '#94a3b8' }}>📷</span>
                                {imgUrl && <img src={imgUrl} style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', zIndex: 1 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
                              </div>
                            );
                          })()}
                          {element.type === 'logo' && (
                            <LogoContent customLogoUrl={currentTemplate.customLogoUrl} size={element.width * EDITOR_SCALE} />
                          )}
                          {element.type === 'name' && (
                            <div style={{ width: '100%', height: '100%', fontSize: element.fontSize * EDITOR_SCALE, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start', textAlign: element.textAlign || 'left', padding: '0 2px', overflow: 'hidden', fontFamily: 'Arial', color: '#1a1a1a' }}>
                              {displayProducts[0]?.name || 'Product Name'}
                            </div>
                          )}
                          {element.type === 'price' && (
                            <div style={{ width: '100%', height: '100%', fontSize: element.fontSize * EDITOR_SCALE, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start', textAlign: element.textAlign || 'left', padding: '0 2px', overflow: 'hidden', fontFamily: 'Arial', color: '#1a1a1a' }}>
                              {formatPrice(displayProducts[0]?.price || 0)}
                            </div>
                          )}
                          {/* Resize handles */}
                          {isSelected && element.visible && selectedElements.length === 1 &&
                            (element.type === 'image' ? ['nw', 'ne', 'se', 'sw'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']).map(h => (
                              <div key={h} style={getResizeHandleStyle(h)}
                                onMouseDown={e => {
                                  e.preventDefault(); e.stopPropagation();
                                  setIsResizing(true);
                                  setResizeHandle(h);
                                  dragStartSnapshotRef.current = JSON.parse(JSON.stringify(templates));
                                  setResizeStart({ x: e.clientX, y: e.clientY, width: element.width, height: element.height, elemX: element.x, elemY: element.y, aspectRatio: element.width / (element.height || 1) });
                                }}
                              />
                            ))
                          }
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Right panel */}
            <div className="w-60 border-l overflow-y-auto p-4 space-y-5 shrink-0">
              {/* Logo upload */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Logo</Label>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                {currentTemplate.customLogoUrl ? (
                  <div className="space-y-1">
                    <img src={currentTemplate.customLogoUrl} className="h-10 w-full object-contain border rounded p-1" />
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => logoInputRef.current?.click()}>
                        <Upload className="w-3 h-3 mr-1" />Change
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => setTemplates(prev => ({ ...prev, [currentTemplateKey]: { ...prev[currentTemplateKey], customLogoUrl: '' } }))}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => logoInputRef.current?.click()}>
                    <Upload className="w-3 h-3 mr-1" />Upload Logo
                  </Button>
                )}
              </div>

              {/* Element controls */}
              {currentTemplate.elements.map(element => {
                const isSelected = selectedElements.includes(element.id);
                const label = element.type === 'image' ? 'Product Image' : element.type === 'logo' ? 'Logo' : element.type === 'name' ? 'Product Name' : 'Price';
                return (
                  <div key={element.id} className={`space-y-2 p-3 rounded-lg border transition-colors ${isSelected ? 'border-blue-300 bg-blue-50' : 'border-border'}`}>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">{label}</Label>
                      <Switch
                        checked={element.visible}
                        onCheckedChange={v => updateElement(element.id, { visible: v }, true)}
                        className="scale-75 origin-right"
                      />
                    </div>

                    {element.visible && element.type === 'logo' && (
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <Label className="text-xs text-muted-foreground">Size</Label>
                          <span className="text-xs text-muted-foreground">{element.width}px</span>
                        </div>
                        <Slider min={12} max={Math.round(Math.min(currentTemplate.widthPx, currentTemplate.heightPx) * 0.8)} step={1}
                          value={[element.width]}
                          onValueChange={([v]) => updateElement(element.id, { width: v, height: v })}
                          onPointerUp={() => commitToHistory(templates)}
                        />
                      </div>
                    )}
                    {element.visible && element.type === 'image' && (
                      <p className="text-xs text-muted-foreground">Displays the product photo. Drag and resize on the canvas.</p>
                    )}

                    {element.visible && (element.type === 'name' || element.type === 'price') && (
                      <>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <Label className="text-xs text-muted-foreground">Font size</Label>
                            <span className="text-xs text-muted-foreground">{element.fontSize}px</span>
                          </div>
                          <Slider min={6} max={72} step={1} value={[element.fontSize]}
                            onValueChange={([v]) => updateElement(element.id, { fontSize: v })}
                            onPointerUp={() => commitToHistory(templates)}
                          />
                        </div>
                        <div className="flex gap-1">
                          {(['left', 'center', 'right'] as const).map(align => {
                            const isActive = (element.textAlign || 'left') === align;
                            const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                            return (
                              <Button key={align} variant={isActive ? 'default' : 'outline'} size="sm" className="flex-1 h-7 p-0"
                                onClick={() => updateElement(element.id, { textAlign: align }, true)}>
                                <Icon className="w-3 h-3" />
                              </Button>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {isSelected && element.visible && (
                      <>
                        <Label className="text-xs text-muted-foreground">Align on canvas</Label>
                        <div className="grid grid-cols-3 gap-1">
                          <Button variant="outline" size="sm" className="h-6 p-0" title="Left" onClick={() => alignElement('left')}><AlignVerticalJustifyStart className="w-3 h-3 rotate-90" /></Button>
                          <Button variant="outline" size="sm" className="h-6 p-0" title="Center H" onClick={() => alignElement('center')}><AlignVerticalJustifyCenter className="w-3 h-3 rotate-90" /></Button>
                          <Button variant="outline" size="sm" className="h-6 p-0" title="Right" onClick={() => alignElement('right')}><AlignVerticalJustifyEnd className="w-3 h-3 rotate-90" /></Button>
                          <Button variant="outline" size="sm" className="h-6 p-0" title="Top" onClick={() => alignElement('top')}><AlignVerticalJustifyStart className="w-3 h-3" /></Button>
                          <Button variant="outline" size="sm" className="h-6 p-0" title="Center V" onClick={() => alignElement('middle')}><AlignVerticalJustifyCenter className="w-3 h-3" /></Button>
                          <Button variant="outline" size="sm" className="h-6 p-0" title="Bottom" onClick={() => alignElement('bottom')}><AlignVerticalJustifyEnd className="w-3 h-3" /></Button>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 text-xs text-muted-foreground">
                          <span>X: {element.x}px</span><span>Y: {element.y}px</span>
                          <span>W: {element.width}px</span><span>H: {element.height}px</span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New template dialog */}
      <Dialog open={showNewTemplateDialog} onOpenChange={setShowNewTemplateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Price Tag Template</DialogTitle>
            <DialogDescription>Define a custom size and save it as a reusable template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-sm">Template Name</Label>
              <Input
                value={newTemplateName}
                onChange={e => setNewTemplateName(e.target.value)}
                placeholder="e.g. Large, Jumbo, Sale Tag"
                onKeyDown={e => e.key === 'Enter' && createNewTemplate()}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Width (inches)</Label>
                <Input type="number" step="0.25" min="0.5" max="12" value={newTemplateWidth} onChange={e => setNewTemplateWidth(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Height (inches)</Label>
                <Input type="number" step="0.25" min="0.5" max="12" value={newTemplateHeight} onChange={e => setNewTemplateHeight(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewTemplateDialog(false)}>Cancel</Button>
            <Button onClick={createNewTemplate}>Create Template</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
