import { useState, useRef, useEffect, useCallback } from 'react';
import { Package, Printer, Download, Move, Settings, Image, Save, RotateCcw, GripVertical, Upload, X, Undo2, Redo2, AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, FileText } from 'lucide-react';
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

interface ProductWithQuantity {
  id: string;
  name: string;
  productCode?: string;
  quantity: number;
}

interface LabelEditorProps {
  products: any[] | ProductWithQuantity[];
  isOpen: boolean;
  onClose: () => void;
}

const DYMO_LABEL_SIZES = {
  '30252': { name: 'Dymo Address (1-1/8" x 3-1/2")', width: 252, height: 81, printer: 'dymo' },
  '30336': { name: 'Dymo Small Multipurpose (1" x 2-1/8")', width: 153, height: 72, printer: 'dymo' },
  '30332': { name: 'Dymo Square (1" x 1")', width: 72, height: 72, printer: 'dymo' },
  '30346': { name: 'Dymo Library Barcode (1/2" x 1-7/8")', width: 135, height: 36, printer: 'dymo' },
  '30323': { name: 'Dymo Shipping (2-1/8" x 4")', width: 288, height: 153, printer: 'dymo' },
  '30256': { name: 'Dymo Large Shipping (2-5/16" x 4")', width: 288, height: 166, printer: 'dymo' },
  'DK-11201': { name: 'QL-800 Standard Address (1.1" x 3.5")', width: 252, height: 83, printer: 'ql800' },
  'DK-11209': { name: 'QL-800 Small Address (1.1" x 2.1")', width: 151, height: 83, printer: 'ql800' },
  'DK-11204': { name: 'QL-800 Return Address (0.66" x 2.1")', width: 151, height: 48, printer: 'ql800' },
  'DK-11208': { name: 'QL-800 Large Address (1.5" x 3.5")', width: 252, height: 108, printer: 'ql800' },
  'DK-11202': { name: 'QL-800 Shipping (2.4" x 3.9")', width: 281, height: 173, printer: 'ql800' },
  'DK-11241': { name: 'QL-800 Large Shipping (2.4" x 4")', width: 288, height: 173, printer: 'ql800' },
  'DK-11203': { name: 'QL-800 File Folder (0.66" x 3.4")', width: 245, height: 48, printer: 'ql800' },
  'DK-11218': { name: 'QL-800 Round (0.94" dia)', width: 68, height: 68, printer: 'ql800' },
} as const;

type LabelSize = keyof typeof DYMO_LABEL_SIZES;

interface LabelElement {
  id: string;
  type: 'logo' | 'brand' | 'name' | 'code' | 'website';
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  visible: boolean;
  textAlign?: 'left' | 'center' | 'right';
  text?: string;
}

interface LabelTemplate {
  labelSize: LabelSize;
  elements: LabelElement[];
  customLogoUrl: string;
  customBrandUrl: string;
  showLogo: boolean;
  showBrand: boolean;
}

const DEFAULT_TEMPLATES: Record<LabelSize, LabelTemplate> = {
  '30252': {
    labelSize: '30252',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: true,
    showBrand: true,
    elements: [
      { id: 'logo', type: 'logo', x: 8, y: 8, width: 16, height: 16, fontSize: 0, visible: true },
      { id: 'brand', type: 'brand', x: 28, y: 8, width: 60, height: 16, fontSize: 10, visible: true },
      { id: 'name', type: 'name', x: 8, y: 28, width: 236, height: 28, fontSize: 12, visible: true },
      { id: 'code', type: 'code', x: 8, y: 60, width: 100, height: 18, fontSize: 18, visible: true },
      { id: 'website', type: 'website', x: 0, y: 73, width: 252, height: 8, fontSize: 6, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
  '30336': {
    labelSize: '30336',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: true,
    showBrand: true,
    elements: [
      { id: 'logo', type: 'logo', x: 6, y: 6, width: 14, height: 14, fontSize: 0, visible: true },
      { id: 'brand', type: 'brand', x: 24, y: 6, width: 50, height: 14, fontSize: 8, visible: true },
      { id: 'name', type: 'name', x: 6, y: 24, width: 141, height: 24, fontSize: 10, visible: true },
      { id: 'code', type: 'code', x: 6, y: 52, width: 80, height: 16, fontSize: 14, visible: true },
      { id: 'website', type: 'website', x: 0, y: 64, width: 153, height: 8, fontSize: 5, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
  '30332': {
    labelSize: '30332',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: true,
    showBrand: false,
    elements: [
      { id: 'logo', type: 'logo', x: 4, y: 4, width: 12, height: 12, fontSize: 0, visible: true },
      { id: 'brand', type: 'brand', x: 20, y: 4, width: 40, height: 12, fontSize: 7, visible: false },
      { id: 'name', type: 'name', x: 4, y: 18, width: 64, height: 28, fontSize: 8, visible: true },
      { id: 'code', type: 'code', x: 4, y: 50, width: 64, height: 18, fontSize: 12, visible: true },
      { id: 'website', type: 'website', x: 0, y: 65, width: 72, height: 7, fontSize: 4, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
  '30346': {
    labelSize: '30346',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: false,
    showBrand: false,
    elements: [
      { id: 'logo', type: 'logo', x: 4, y: 4, width: 10, height: 10, fontSize: 0, visible: false },
      { id: 'brand', type: 'brand', x: 18, y: 4, width: 30, height: 10, fontSize: 6, visible: false },
      { id: 'name', type: 'name', x: 4, y: 4, width: 127, height: 14, fontSize: 8, visible: true },
      { id: 'code', type: 'code', x: 4, y: 20, width: 80, height: 12, fontSize: 11, visible: true },
      { id: 'website', type: 'website', x: 0, y: 30, width: 135, height: 6, fontSize: 4, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
  '30323': {
    labelSize: '30323',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: true,
    showBrand: true,
    elements: [
      { id: 'logo', type: 'logo', x: 10, y: 10, width: 24, height: 24, fontSize: 0, visible: true },
      { id: 'brand', type: 'brand', x: 40, y: 10, width: 80, height: 20, fontSize: 14, visible: true },
      { id: 'name', type: 'name', x: 10, y: 45, width: 268, height: 60, fontSize: 16, visible: true },
      { id: 'code', type: 'code', x: 10, y: 120, width: 150, height: 28, fontSize: 24, visible: true },
      { id: 'website', type: 'website', x: 0, y: 145, width: 288, height: 8, fontSize: 6, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
  '30256': {
    labelSize: '30256',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: true,
    showBrand: true,
    elements: [
      { id: 'logo', type: 'logo', x: 10, y: 10, width: 28, height: 28, fontSize: 0, visible: true },
      { id: 'brand', type: 'brand', x: 44, y: 12, width: 90, height: 24, fontSize: 16, visible: true },
      { id: 'name', type: 'name', x: 10, y: 50, width: 268, height: 70, fontSize: 18, visible: true },
      { id: 'code', type: 'code', x: 10, y: 130, width: 160, height: 32, fontSize: 26, visible: true },
      { id: 'website', type: 'website', x: 0, y: 158, width: 288, height: 8, fontSize: 6, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
  'DK-11201': {
    labelSize: 'DK-11201',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: true,
    showBrand: true,
    elements: [
      { id: 'logo', type: 'logo', x: 8, y: 8, width: 16, height: 16, fontSize: 0, visible: true },
      { id: 'brand', type: 'brand', x: 28, y: 8, width: 60, height: 16, fontSize: 10, visible: true },
      { id: 'name', type: 'name', x: 8, y: 28, width: 236, height: 28, fontSize: 12, visible: true },
      { id: 'code', type: 'code', x: 8, y: 60, width: 100, height: 18, fontSize: 18, visible: true },
      { id: 'website', type: 'website', x: 0, y: 75, width: 252, height: 8, fontSize: 6, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
  'DK-11209': {
    labelSize: 'DK-11209',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: true,
    showBrand: true,
    elements: [
      { id: 'logo', type: 'logo', x: 6, y: 6, width: 14, height: 14, fontSize: 0, visible: true },
      { id: 'brand', type: 'brand', x: 24, y: 6, width: 50, height: 14, fontSize: 8, visible: true },
      { id: 'name', type: 'name', x: 6, y: 24, width: 139, height: 24, fontSize: 10, visible: true },
      { id: 'code', type: 'code', x: 6, y: 52, width: 80, height: 16, fontSize: 14, visible: true },
      { id: 'website', type: 'website', x: 0, y: 75, width: 151, height: 8, fontSize: 5, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
  'DK-11204': {
    labelSize: 'DK-11204',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: false,
    showBrand: false,
    elements: [
      { id: 'logo', type: 'logo', x: 4, y: 4, width: 10, height: 10, fontSize: 0, visible: false },
      { id: 'brand', type: 'brand', x: 18, y: 4, width: 30, height: 10, fontSize: 6, visible: false },
      { id: 'name', type: 'name', x: 4, y: 4, width: 143, height: 18, fontSize: 8, visible: true },
      { id: 'code', type: 'code', x: 4, y: 24, width: 80, height: 14, fontSize: 11, visible: true },
      { id: 'website', type: 'website', x: 0, y: 40, width: 151, height: 8, fontSize: 4, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
  'DK-11208': {
    labelSize: 'DK-11208',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: true,
    showBrand: true,
    elements: [
      { id: 'logo', type: 'logo', x: 8, y: 8, width: 20, height: 20, fontSize: 0, visible: true },
      { id: 'brand', type: 'brand', x: 32, y: 8, width: 70, height: 18, fontSize: 12, visible: true },
      { id: 'name', type: 'name', x: 8, y: 32, width: 236, height: 40, fontSize: 14, visible: true },
      { id: 'code', type: 'code', x: 8, y: 78, width: 120, height: 22, fontSize: 20, visible: true },
      { id: 'website', type: 'website', x: 0, y: 100, width: 252, height: 8, fontSize: 6, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
  'DK-11202': {
    labelSize: 'DK-11202',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: true,
    showBrand: true,
    elements: [
      { id: 'logo', type: 'logo', x: 10, y: 10, width: 24, height: 24, fontSize: 0, visible: true },
      { id: 'brand', type: 'brand', x: 40, y: 10, width: 80, height: 20, fontSize: 14, visible: true },
      { id: 'name', type: 'name', x: 10, y: 45, width: 261, height: 60, fontSize: 16, visible: true },
      { id: 'code', type: 'code', x: 10, y: 120, width: 150, height: 28, fontSize: 24, visible: true },
      { id: 'website', type: 'website', x: 0, y: 163, width: 281, height: 10, fontSize: 6, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
  'DK-11241': {
    labelSize: 'DK-11241',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: true,
    showBrand: true,
    elements: [
      { id: 'logo', type: 'logo', x: 10, y: 10, width: 28, height: 28, fontSize: 0, visible: true },
      { id: 'brand', type: 'brand', x: 44, y: 12, width: 90, height: 24, fontSize: 16, visible: true },
      { id: 'name', type: 'name', x: 10, y: 50, width: 268, height: 70, fontSize: 18, visible: true },
      { id: 'code', type: 'code', x: 10, y: 130, width: 160, height: 32, fontSize: 26, visible: true },
      { id: 'website', type: 'website', x: 0, y: 163, width: 288, height: 10, fontSize: 6, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
  'DK-11203': {
    labelSize: 'DK-11203',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: false,
    showBrand: false,
    elements: [
      { id: 'logo', type: 'logo', x: 4, y: 4, width: 10, height: 10, fontSize: 0, visible: false },
      { id: 'brand', type: 'brand', x: 18, y: 4, width: 30, height: 10, fontSize: 6, visible: false },
      { id: 'name', type: 'name', x: 4, y: 4, width: 237, height: 18, fontSize: 8, visible: true },
      { id: 'code', type: 'code', x: 4, y: 24, width: 100, height: 14, fontSize: 11, visible: true },
      { id: 'website', type: 'website', x: 0, y: 40, width: 245, height: 8, fontSize: 4, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
  'DK-11218': {
    labelSize: 'DK-11218',
    customLogoUrl: '',
    customBrandUrl: '',
    showLogo: false,
    showBrand: false,
    elements: [
      { id: 'logo', type: 'logo', x: 4, y: 4, width: 10, height: 10, fontSize: 0, visible: false },
      { id: 'brand', type: 'brand', x: 18, y: 4, width: 30, height: 10, fontSize: 6, visible: false },
      { id: 'name', type: 'name', x: 4, y: 4, width: 60, height: 32, fontSize: 7, visible: true },
      { id: 'code', type: 'code', x: 4, y: 40, width: 60, height: 18, fontSize: 11, visible: true },
      { id: 'website', type: 'website', x: 0, y: 60, width: 68, height: 8, fontSize: 4, visible: true, textAlign: 'center', text: 'gridmart.ca' },
    ],
  },
};

// Get initial quantity from product data (defined outside component to avoid hoisting issues)
function getInitialProductQuantity(product: any): number {
  if ('quantity' in product && typeof product.quantity === 'number') {
    return product.quantity;
  }
  if ('inventory' in product && Array.isArray(product.inventory)) {
    const invStock = product.inventory.reduce((sum: number, inv: any) => sum + inv.quantity, 0);
    const sheetQty = product.sheetQuantity || 0;
    return Math.max(invStock, sheetQty) || 1;
  }
  return product.sheetQuantity || 1;
}

export function LabelEditor({ products, isOpen, onClose }: LabelEditorProps) {
  const [labelSize, setLabelSize] = useState<LabelSize>('30256');
  const [isGenerating, setIsGenerating] = useState(false);
  const [displayProducts, setDisplayProducts] = useState<(any | ProductWithQuantity)[]>(products);
  
  // Per-product quantity overrides (product id -> custom quantity)
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({});
  // Per-product template overrides (product id -> label size)
  const [productTemplates, setProductTemplates] = useState<Record<string, LabelSize>>({});

  useEffect(() => {
    setDisplayProducts(products);
    // Initialize quantities from product data
    const initialQuantities: Record<string, number> = {};
    products.forEach((p: any) => {
      const qty = getInitialProductQuantity(p);
      initialQuantities[p.id] = qty;
    });
    setProductQuantities(initialQuantities);
    setProductTemplates({});
  }, [products]);
  
  const updateProductQuantity = (productId: string, quantity: number) => {
    setProductQuantities(prev => ({ ...prev, [productId]: Math.max(1, quantity) }));
  };
  
  const updateProductTemplate = (productId: string, template: LabelSize) => {
    setProductTemplates(prev => ({ ...prev, [productId]: template }));
  };

  const removeProduct = (productId: string) => {
    setDisplayProducts(prev => prev.filter(p => p.id !== productId));
    setProductQuantities(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setProductTemplates(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };
  const [activeTab, setActiveTab] = useState<'preview' | 'editor'>('preview');
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, elemX: 0, elemY: 0, aspectRatio: 1 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ type: 'v' | 'h'; pos: number }[]>([]);
  const editorRef = useRef<HTMLDivElement>(null);
  const uploadTargetRef = useRef<'logo' | 'brand'>('logo');
  
  const [templates, setTemplates] = useState<Record<LabelSize, LabelTemplate>>(
    JSON.parse(JSON.stringify(DEFAULT_TEMPLATES))
  );
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  
  // Load templates from server on mount
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const res = await fetch('/api/label-templates', { credentials: 'include' });
        if (res.ok) {
          const savedTemplates = await res.json();
          if (Object.keys(savedTemplates).length > 0) {
            // Merge saved templates with defaults
            const merged: Record<LabelSize, LabelTemplate> = {} as any;
            for (const key of Object.keys(DEFAULT_TEMPLATES) as LabelSize[]) {
              const defaultTemplate = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES[key]));
              const savedTemplate = savedTemplates[key];
              
              let mergedElements = savedTemplate?.elements 
                ? JSON.parse(JSON.stringify(savedTemplate.elements))
                : defaultTemplate.elements;
              
              // Ensure all default element types exist
              for (const defaultElement of defaultTemplate.elements) {
                const exists = mergedElements.some((e: LabelElement) => e.id === defaultElement.id);
                if (!exists) {
                  mergedElements.push(JSON.parse(JSON.stringify(defaultElement)));
                }
              }
              
              // Ensure website elements have text property
              mergedElements = mergedElements.map((el: LabelElement) => {
                if (el.type === 'website' && !el.text) {
                  return { ...el, text: 'gridmart.ca' };
                }
                return el;
              });
              
              merged[key] = {
                ...defaultTemplate,
                ...savedTemplate,
                elements: mergedElements,
              };
            }
            setTemplates(merged);
          }
        }
      } catch (e) {
        console.error('Failed to load label templates:', e);
      }
      setTemplatesLoaded(true);
    };
    
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);
  
  // History management for undo/redo
  const historyRef = useRef<{ stack: Record<LabelSize, LabelTemplate>[]; pointer: number; isRestoring: boolean }>({
    stack: [JSON.parse(JSON.stringify(templates))],
    pointer: 0,
    isRestoring: false,
  });
  const dragStartSnapshotRef = useRef<Record<LabelSize, LabelTemplate> | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0); // Force re-render for canUndo/canRedo
  
  const pushHistory = useCallback(() => {
    // Will be called via effect after state updates
  }, []);
  
  const commitToHistory = useCallback((newTemplates: Record<LabelSize, LabelTemplate>) => {
    const history = historyRef.current;
    if (history.isRestoring) return; // Don't push during undo/redo
    
    // Trim any redo states beyond current pointer
    history.stack = history.stack.slice(0, history.pointer + 1);
    history.stack.push(JSON.parse(JSON.stringify(newTemplates)));
    
    // Limit history to 50 entries
    if (history.stack.length > 50) {
      history.stack.shift();
      // Keep pointer at last valid index after shift
    }
    history.pointer = history.stack.length - 1;
    setHistoryVersion(v => v + 1);
  }, []);
  
  const undo = useCallback(() => {
    const history = historyRef.current;
    if (history.pointer > 0) {
      history.isRestoring = true;
      history.pointer--;
      const restored = JSON.parse(JSON.stringify(history.stack[history.pointer]));
      setTemplates(restored);
      setHistoryVersion(v => v + 1);
      setTimeout(() => { history.isRestoring = false; }, 0);
    }
  }, []);
  
  const redo = useCallback(() => {
    const history = historyRef.current;
    if (history.pointer < history.stack.length - 1) {
      history.isRestoring = true;
      history.pointer++;
      const restored = JSON.parse(JSON.stringify(history.stack[history.pointer]));
      setTemplates(restored);
      setHistoryVersion(v => v + 1);
      setTimeout(() => { history.isRestoring = false; }, 0);
    }
  }, []);
  
  const canUndo = historyRef.current.pointer > 0;
  const canRedo = historyRef.current.pointer < historyRef.current.stack.length - 1;

  // Custom logo URL synced with current template
  const customLogoUrl = templates[labelSize]?.customLogoUrl || '';
  const customBrandUrl = templates[labelSize]?.customBrandUrl || '';
  
  const setCustomLogoUrl = (url: string) => {
    setTemplates(prev => {
      const current = prev[labelSize];
      return {
        ...prev,
        [labelSize]: {
          ...current,
          elements: [...current.elements],
          customLogoUrl: url,
        },
      };
    });
  };
  
  const setCustomBrandUrl = (url: string) => {
    setTemplates(prev => {
      const current = prev[labelSize];
      return {
        ...prev,
        [labelSize]: {
          ...current,
          elements: [...current.elements],
          customBrandUrl: url,
        },
      };
    });
  };

  const currentTemplate = templates[labelSize];
  const selectedSize = DYMO_LABEL_SIZES[labelSize];
  const scale = 2;

  const getProductQuantity = (product: any): number => {
    // Use the override quantity if available
    if (productQuantities[product.id] !== undefined) {
      return productQuantities[product.id];
    }
    return getInitialProductQuantity(product);
  };
  
  const getProductTemplate = (product: any): LabelSize => {
    return productTemplates[product.id] || labelSize;
  };

  // Expanded labels with per-product template support
  const expandedLabels = displayProducts.flatMap((product) => {
    const qty = getProductQuantity(product);
    const template = getProductTemplate(product);
    return Array.from({ length: qty }, () => ({
      name: product.name,
      productCode: product.productCode || 'GM-XXX',
      templateSize: template,
    }));
  });

  const totalLabelCount = expandedLabels.length;

  const updateElement = (elementId: string, updates: Partial<LabelElement>, addToHistory: boolean = false) => {
    setTemplates(prev => {
      const newTemplates = {
        ...prev,
        [labelSize]: {
          ...prev[labelSize],
          elements: prev[labelSize].elements.map(el => 
            el.id === elementId ? { ...el, ...updates } : el
          ),
        },
      };
      if (addToHistory) {
        // Commit with the new state directly
        const history = historyRef.current;
        if (!history.isRestoring) {
          history.stack = history.stack.slice(0, history.pointer + 1);
          history.stack.push(JSON.parse(JSON.stringify(newTemplates)));
          if (history.stack.length > 50) {
            history.stack.shift();
          }
          history.pointer = history.stack.length - 1;
        }
      }
      return newTemplates;
    });
    if (addToHistory) {
      setHistoryVersion(v => v + 1);
    }
  };

  const saveTemplate = async () => {
    try {
      const res = await fetch('/api/label-templates/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ templates }),
      });
      if (res.ok) {
        toast.success(`Template saved for ${DYMO_LABEL_SIZES[labelSize].name}`);
      } else {
        toast.error('Failed to save template');
      }
    } catch (e) {
      console.error('Save template error:', e);
      toast.error('Failed to save template');
    }
  };

  const resetTemplate = () => {
    setTemplates(prev => ({
      ...prev,
      [labelSize]: JSON.parse(JSON.stringify(DEFAULT_TEMPLATES[labelSize])),
    }));
    toast.success('Template reset to default');
  };

  const handleMouseDown = (e: React.MouseEvent, elementId: string) => {
    if (activeTab !== 'editor') return;
    e.preventDefault();
    e.stopPropagation();
    
    // Multi-select with Shift key
    if (e.shiftKey) {
      setSelectedElements(prev => 
        prev.includes(elementId) 
          ? prev.filter(id => id !== elementId) 
          : [...prev, elementId]
      );
    } else {
      // Preserve selection if clicking on an already-selected element (for multi-drag)
      // Only replace selection if clicking on an unselected element
      setSelectedElements(prev => 
        prev.includes(elementId) ? prev : [elementId]
      );
    }
    setIsDragging(true);
    
    // Save snapshot at drag start for history
    dragStartSnapshotRef.current = JSON.parse(JSON.stringify(templates));
    
    const element = currentTemplate.elements.find(el => el.id === elementId);
    if (element && editorRef.current) {
      const rect = editorRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left - element.x * scale,
        y: e.clientY - rect.top - element.y * scale,
      });
    }
  };

  // Use refs to avoid callback recreation on every template change
  const dragStateRef = useRef({ selectedElements, dragOffset, scale, selectedSize, templates, labelSize, isResizing, resizeHandle, resizeStart, marquee, snapGuides });
  dragStateRef.current = { selectedElements, dragOffset, scale, selectedSize, templates, labelSize, isResizing, resizeHandle, resizeStart, marquee, snapGuides };
  
  const SNAP_THRESHOLD = 5; // pixels to snap within
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const { selectedElements, dragOffset, scale, selectedSize, templates, labelSize, isResizing, resizeHandle, resizeStart, marquee } = dragStateRef.current;
    if (!editorRef.current) return;
    
    // Handle marquee selection
    if (marquee) {
      const rect = editorRef.current.getBoundingClientRect();
      setMarquee(prev => prev ? { ...prev, endX: e.clientX - rect.left, endY: e.clientY - rect.top } : null);
      return;
    }
    
    // Handle resizing
    if (isResizing && resizeHandle && selectedElements.length === 1) {
      const elemId = selectedElements[0];
      const currentElements = templates[labelSize]?.elements || [];
      const element = currentElements.find(el => el.id === elemId);
      if (!element) return;
      
      const deltaX = (e.clientX - resizeStart.x) / scale;
      const deltaY = (e.clientY - resizeStart.y) / scale;
      
      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;
      let newX = resizeStart.elemX;
      let newY = resizeStart.elemY;
      
      // Apply resize based on which handle is being dragged
      if (resizeHandle.includes('e')) {
        newWidth = Math.max(10, resizeStart.width + deltaX);
      }
      if (resizeHandle.includes('w')) {
        const widthDelta = Math.min(deltaX, resizeStart.width - 10);
        newX = resizeStart.elemX + widthDelta;
        newWidth = resizeStart.width - widthDelta;
      }
      if (resizeHandle.includes('s')) {
        newHeight = Math.max(10, resizeStart.height + deltaY);
      }
      if (resizeHandle.includes('n')) {
        const heightDelta = Math.min(deltaY, resizeStart.height - 10);
        newY = resizeStart.elemY + heightDelta;
        newHeight = resizeStart.height - heightDelta;
      }
      
      // Shift key: maintain aspect ratio
      if (e.shiftKey) {
        const aspectRatio = resizeStart.aspectRatio;
        // Determine which dimension changed more and constrain the other
        const widthChange = Math.abs(newWidth - resizeStart.width);
        const heightChange = Math.abs(newHeight - resizeStart.height);
        
        if (widthChange >= heightChange) {
          // Width is driving, adjust height
          newHeight = newWidth / aspectRatio;
        } else {
          // Height is driving, adjust width
          newWidth = newHeight * aspectRatio;
        }
        
        // For handles that adjust position (n, w), recalculate position
        if (resizeHandle.includes('w')) {
          newX = resizeStart.elemX + resizeStart.width - newWidth;
        }
        if (resizeHandle.includes('n')) {
          newY = resizeStart.elemY + resizeStart.height - newHeight;
        }
      }
      
      // Constrain to label bounds
      newX = Math.max(0, newX);
      newY = Math.max(0, newY);
      newWidth = Math.min(newWidth, selectedSize.width - newX);
      newHeight = Math.min(newHeight, selectedSize.height - newY);
      
      updateElement(elemId, { 
        x: Math.round(newX), 
        y: Math.round(newY), 
        width: Math.round(newWidth), 
        height: Math.round(newHeight) 
      });
      return;
    }
    
    // Handle dragging
    if (selectedElements.length === 0) return;
    
    const currentElements = templates[labelSize]?.elements || [];
    const primaryElement = currentElements.find(el => el.id === selectedElements[0]);
    if (!primaryElement) return;
    
    const rect = editorRef.current.getBoundingClientRect();
    let newX = (e.clientX - rect.left - dragOffset.x) / scale;
    let newY = (e.clientY - rect.top - dragOffset.y) / scale;
    
    // Calculate snap guides from other non-selected elements
    const otherElements = currentElements.filter(el => el.visible && !selectedElements.includes(el.id));
    const activeGuides: { type: 'v' | 'h'; pos: number }[] = [];
    
    // Collect snap points from other elements and label edges
    const snapPointsX: number[] = [0, selectedSize.width]; // Label edges
    const snapPointsY: number[] = [0, selectedSize.height];
    
    otherElements.forEach(el => {
      snapPointsX.push(el.x, el.x + el.width / 2, el.x + el.width);
      snapPointsY.push(el.y, el.y + el.height / 2, el.y + el.height);
    });
    
    // Check snap for primary element edges
    const elemEdgesX = [newX, newX + primaryElement.width / 2, newX + primaryElement.width];
    const elemEdgesY = [newY, newY + primaryElement.height / 2, newY + primaryElement.height];
    
    snapPointsX.forEach(snapX => {
      elemEdgesX.forEach((edgeX, i) => {
        if (Math.abs(edgeX - snapX) < SNAP_THRESHOLD) {
          const offset = i === 0 ? 0 : i === 1 ? primaryElement.width / 2 : primaryElement.width;
          newX = snapX - offset;
          activeGuides.push({ type: 'v', pos: snapX });
        }
      });
    });
    
    snapPointsY.forEach(snapY => {
      elemEdgesY.forEach((edgeY, i) => {
        if (Math.abs(edgeY - snapY) < SNAP_THRESHOLD) {
          const offset = i === 0 ? 0 : i === 1 ? primaryElement.height / 2 : primaryElement.height;
          newY = snapY - offset;
          activeGuides.push({ type: 'h', pos: snapY });
        }
      });
    });
    
    setSnapGuides(activeGuides);
    
    const deltaX = newX - primaryElement.x;
    const deltaY = newY - primaryElement.y;
    
    // Move all selected elements by the same delta
    selectedElements.forEach(elemId => {
      const elem = currentElements.find(el => el.id === elemId);
      if (elem) {
        const elemNewX = Math.max(0, Math.min(selectedSize.width - elem.width, elem.x + deltaX));
        const elemNewY = Math.max(0, Math.min(selectedSize.height - elem.height, elem.y + deltaY));
        updateElement(elemId, { x: Math.round(elemNewX), y: Math.round(elemNewY) });
      }
    });
  }, [updateElement]);

  const handleMouseUp = useCallback(() => {
    const { marquee, templates, labelSize, scale } = dragStateRef.current;
    
    // Complete marquee selection
    if (marquee) {
      const currentElements = templates[labelSize]?.elements || [];
      const marqueeLeft = Math.min(marquee.startX, marquee.endX) / scale;
      const marqueeRight = Math.max(marquee.startX, marquee.endX) / scale;
      const marqueeTop = Math.min(marquee.startY, marquee.endY) / scale;
      const marqueeBottom = Math.max(marquee.startY, marquee.endY) / scale;
      
      // Only select if marquee has meaningful size
      if (Math.abs(marquee.endX - marquee.startX) > 5 || Math.abs(marquee.endY - marquee.startY) > 5) {
        const selectedIds = currentElements
          .filter(el => el.visible)
          .filter(el => {
            const elemLeft = el.x;
            const elemRight = el.x + el.width;
            const elemTop = el.y;
            const elemBottom = el.y + el.height;
            // Check if element intersects with marquee
            return elemLeft < marqueeRight && elemRight > marqueeLeft && 
                   elemTop < marqueeBottom && elemBottom > marqueeTop;
          })
          .map(el => el.id);
        setSelectedElements(selectedIds);
      }
      setMarquee(null);
      return;
    }
    
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
    setSnapGuides([]); // Clear snap guides when done dragging
    // Push history if there was actual movement
    if (dragStartSnapshotRef.current) {
      commitToHistory(templates);
      dragStartSnapshotRef.current = null;
    }
  }, [templates, commitToHistory]);

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

  // Keyboard handler for arrow keys and shortcuts
  useEffect(() => {
    if (!isOpen || activeTab !== 'editor') return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keys when typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      
      // Undo/Redo shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      
      // Select all with Ctrl+A
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedElements(currentTemplate.elements.filter(el => el.visible).map(el => el.id));
        return;
      }
      
      // Always prevent arrow keys from affecting sliders/controls when in editor
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
      
      // Arrow key movement - only when elements are selected
      if (selectedElements.length === 0) return;
      
      const step = e.shiftKey ? 5 : 1;
      let deltaX = 0;
      let deltaY = 0;
      
      switch (e.key) {
        case 'ArrowUp':
          deltaY = -step;
          break;
        case 'ArrowDown':
          deltaY = step;
          break;
        case 'ArrowLeft':
          deltaX = -step;
          break;
        case 'ArrowRight':
          deltaX = step;
          break;
        default:
          return;
      }
      
      if (deltaX !== 0 || deltaY !== 0) {
        selectedElements.forEach(elemId => {
          const elem = currentTemplate.elements.find(el => el.id === elemId);
          if (elem) {
            const newX = Math.max(0, Math.min(selectedSize.width - elem.width, elem.x + deltaX));
            const newY = Math.max(0, Math.min(selectedSize.height - elem.height, elem.y + deltaY));
            updateElement(elemId, { x: newX, y: newY }, elemId === selectedElements[selectedElements.length - 1]);
          }
        });
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeTab, selectedElements, currentTemplate, selectedSize, undo, redo, updateElement]);

  // Alignment functions - treats multiple selected elements as a group
  const alignElement = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selectedElements.length === 0) return;
    
    // Get all selected elements
    const elements = selectedElements
      .map(id => currentTemplate.elements.find(el => el.id === id))
      .filter((el): el is LabelElement => !!el);
    
    if (elements.length === 0) return;
    
    // Calculate bounding box of all selected elements as a group
    const groupBounds = {
      minX: Math.min(...elements.map(el => el.x)),
      minY: Math.min(...elements.map(el => el.y)),
      maxX: Math.max(...elements.map(el => el.x + el.width)),
      maxY: Math.max(...elements.map(el => el.y + el.height)),
    };
    const groupWidth = groupBounds.maxX - groupBounds.minX;
    const groupHeight = groupBounds.maxY - groupBounds.minY;
    
    // Calculate offset to move the entire group
    let offsetX = 0;
    let offsetY = 0;
    
    switch (alignment) {
      case 'left':
        offsetX = -groupBounds.minX;
        break;
      case 'center':
        offsetX = Math.round((selectedSize.width - groupWidth) / 2) - groupBounds.minX;
        break;
      case 'right':
        offsetX = selectedSize.width - groupBounds.maxX;
        break;
      case 'top':
        offsetY = -groupBounds.minY;
        break;
      case 'middle':
        offsetY = Math.round((selectedSize.height - groupHeight) / 2) - groupBounds.minY;
        break;
      case 'bottom':
        offsetY = selectedSize.height - groupBounds.maxY;
        break;
    }
    
    // Apply offset to all selected elements
    selectedElements.forEach(elemId => {
      const element = currentTemplate.elements.find(el => el.id === elemId);
      if (!element) return;
      
      const updates: Partial<LabelElement> = {};
      if (offsetX !== 0) updates.x = element.x + offsetX;
      if (offsetY !== 0) updates.y = element.y + offsetY;
      
      if (Object.keys(updates).length > 0) {
        updateElement(elemId, updates, elemId === selectedElements[selectedElements.length - 1]);
      }
    });
  };
  
  // Text alignment function - aligns text inside the element
  const setTextAlign = (align: 'left' | 'center' | 'right') => {
    if (selectedElements.length === 0) return;
    
    selectedElements.forEach(elemId => {
      const element = currentTemplate.elements.find(el => el.id === elemId);
      if (!element || element.type === 'logo') return; // Logo doesn't have text
      
      updateElement(elemId, { textAlign: align }, elemId === selectedElements[selectedElements.length - 1]);
    });
  };

  // Resize handle mouse down
  const handleResizeMouseDown = (e: React.MouseEvent, elementId: string, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const element = currentTemplate.elements.find(el => el.id === elementId);
    if (!element) return;
    
    setIsResizing(true);
    setResizeHandle(handle);
    setSelectedElements([elementId]);
    dragStartSnapshotRef.current = JSON.parse(JSON.stringify(templates));
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: element.width,
      height: element.height,
      elemX: element.x,
      elemY: element.y,
      aspectRatio: element.width / element.height,
    });
  };

  // Resize handles component
  const renderResizeHandles = (element: LabelElement) => {
    const handleSize = 8;
    const handles = [
      { id: 'nw', cursor: 'nw-resize', top: -handleSize/2, left: -handleSize/2 },
      { id: 'ne', cursor: 'ne-resize', top: -handleSize/2, right: -handleSize/2 },
      { id: 'sw', cursor: 'sw-resize', bottom: -handleSize/2, left: -handleSize/2 },
      { id: 'se', cursor: 'se-resize', bottom: -handleSize/2, right: -handleSize/2 },
    ];
    
    return handles.map(({ id, cursor, ...pos }) => (
      <div
        key={id}
        style={{
          position: 'absolute',
          width: handleSize,
          height: handleSize,
          backgroundColor: '#0ea5e9',
          border: '1px solid white',
          borderRadius: 2,
          cursor,
          zIndex: 200,
          ...pos,
        }}
        onMouseDown={(e) => handleResizeMouseDown(e, element.id, id)}
      />
    ));
  };

  const renderLabelElement = (element: LabelElement, preview: boolean = false, sampleData?: { name: string; code: string }, _templateSize?: LabelSize) => {
    if (!element.visible) return null;
    
    const isSelected = selectedElements.includes(element.id) && !preview;
    
    // Smaller elements (logo, brand) get higher z-index so they stay clickable above larger elements
    const elementZIndex: Record<string, number> = { logo: 10, brand: 9, name: 2, code: 3 };
    const zIndex = isSelected ? 100 : (elementZIndex[element.type] || 1);
    
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      left: element.x * scale,
      top: element.y * scale,
      width: element.width * scale,
      height: element.height * scale,
      cursor: preview ? 'default' : 'move',
      userSelect: 'none',
      zIndex,
    };

    const selectionStyle = isSelected ? {
      outline: '2px solid #0ea5e9',
      outlineOffset: '0px',
    } : {};
    
    // Bounding box only visible when element is selected (not in preview)
    const boundingBoxStyle = isSelected && !preview ? {
      border: '1px dashed rgba(0, 0, 0, 0.3)',
    } : {};
    
    switch (element.type) {
      case 'logo':
        return (
          <div
            key={element.id}
            style={{ ...baseStyle, ...boundingBoxStyle, ...selectionStyle }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!preview) handleMouseDown(e, element.id);
            }}
            className={`flex items-center justify-center rounded ${customLogoUrl ? '' : 'bg-primary'}`}
          >
            {customLogoUrl ? (
              <img src={customLogoUrl} alt="Logo" className="w-full h-full object-contain pointer-events-none select-none" draggable={false} />
            ) : (
              <Package className="text-white pointer-events-none select-none" style={{ width: element.width * scale * 0.6, height: element.height * scale * 0.6 }} />
            )}
            {isSelected && renderResizeHandles(element)}
          </div>
        );
      
      case 'brand':
        return (
          <div
            key={element.id}
            style={{ 
              ...baseStyle, 
              ...boundingBoxStyle, 
              ...selectionStyle, 
              fontSize: element.fontSize * scale,
              textAlign: element.textAlign || 'left',
              justifyContent: element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start',
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!preview) handleMouseDown(e, element.id);
            }}
            className="font-bold flex items-center"
          >
            {customBrandUrl ? (
              <img src={customBrandUrl} alt="Brand" className="w-full h-full object-contain pointer-events-none select-none" draggable={false} />
            ) : (
              <>
                <span className="text-primary pointer-events-none select-none">Grid</span>
                <span className="text-[#1D3557] pointer-events-none select-none">Mart</span>
              </>
            )}
            {isSelected && renderResizeHandles(element)}
          </div>
        );
      
      case 'name':
        return (
          <div
            key={element.id}
            style={{ 
              ...baseStyle, 
              ...boundingBoxStyle,
              ...selectionStyle, 
              fontSize: element.fontSize * scale,
              lineHeight: 1.2,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as any,
              textAlign: element.textAlign || 'left',
            }}
            onMouseDown={(e) => !preview && handleMouseDown(e, element.id)}
            className="font-bold"
          >
            {sampleData?.name || 'Product Name Sample'}
            {isSelected && renderResizeHandles(element)}
          </div>
        );
      
      case 'code':
        return (
          <div
            key={element.id}
            style={{ 
              ...baseStyle, 
              ...boundingBoxStyle,
              ...selectionStyle, 
              fontSize: element.fontSize * scale,
              letterSpacing: '1px',
              textAlign: element.textAlign || 'left',
              lineHeight: 1,
            }}
            onMouseDown={(e) => !preview && handleMouseDown(e, element.id)}
            className="font-mono font-bold"
          >
            {sampleData?.code || 'GM-XXXX'}
            {isSelected && renderResizeHandles(element)}
          </div>
        );
      
      case 'website':
        return (
          <div
            key={element.id}
            style={{ 
              ...baseStyle, 
              ...boundingBoxStyle,
              ...selectionStyle, 
              fontSize: element.fontSize * scale,
              textAlign: element.textAlign || 'center',
              color: '#666',
              lineHeight: 1,
            }}
            onMouseDown={(e) => !preview && handleMouseDown(e, element.id)}
          >
            {element.text || 'gridmart.ca'}
            {isSelected && renderResizeHandles(element)}
          </div>
        );
      
      default:
        return null;
    }
  };

  const getSelectedElementData = () => {
    if (selectedElements.length === 0) return null;
    // Return first selected element for the settings panel
    return currentTemplate.elements.find(el => el.id === selectedElements[0]);
  };

  const handlePrint = () => {
    if (products.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GridMart Product Labels</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: Arial, sans-serif; }
            @page { margin: 0; }
            ${generatePageSizeCSS()}
            @media print { 
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              html, body { margin: 0; padding: 0; }
            }
          </style>
        </head>
        <body>${generateLabelHTMLForExport()}</body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const cancelledRef = useRef(false);

  const [brotherTemplatePath, setBrotherTemplatePath] = useState<string>(
    () => localStorage.getItem('brotherTemplatePath') || ''
  );
  const [brotherPrinterName, setBrotherPrinterName] = useState<string>(
    () => localStorage.getItem('brotherPrinterName') || ''
  );
  const [brotherFieldMap, setBrotherFieldMap] = useState<Record<string, string>>(
    () => {
      try {
        return JSON.parse(localStorage.getItem('brotherFieldMap') || '{}');
      } catch {
        return {};
      }
    }
  );
  const [isBrotherPrinting, setIsBrotherPrinting] = useState(false);
  const [showBrotherSettings, setShowBrotherSettings] = useState(false);

  const saveBrotherTemplatePath = (path: string) => {
    setBrotherTemplatePath(path);
    localStorage.setItem('brotherTemplatePath', path);
  };

  const saveBrotherPrinterName = (name: string) => {
    setBrotherPrinterName(name);
    localStorage.setItem('brotherPrinterName', name);
  };

  const saveBrotherFieldMap = (field: string, value: string) => {
    setBrotherFieldMap(prev => {
      const updated = { ...prev, [field]: value };
      localStorage.setItem('brotherFieldMap', JSON.stringify(updated));
      return updated;
    });
  };

  const handleBrotherPrint = async () => {
    if (expandedLabels.length === 0) return;

    if (!brotherTemplatePath) {
      setShowBrotherSettings(true);
      toast.error('Please set your Brother .lbx template file path first');
      return;
    }

    setIsBrotherPrinting(true);
    try {
      const BrotherSDK = (await import(
        /* @vite-ignore */
        'https://cdn.jsdelivr.net/npm/bpac-js@latest/dist/index.js'
      )).default;

      const doc = new BrotherSDK({
        templatePath: brotherTemplatePath,
        exportDir: '',
        ...(brotherPrinterName ? { printer: brotherPrinterName } : {}),
      });

      let printed = 0;
      let failed = 0;

      const nameField = brotherFieldMap.productName || 'objProductName';
      const codeField = brotherFieldMap.productCode || 'objCode';
      const websiteField = brotherFieldMap.website || 'objWebsite';

      for (const label of expandedLabels) {
        try {
          const data: Record<string, string> = {
            [nameField]: label.name,
            [codeField]: label.productCode,
            [websiteField]: templates[label.templateSize]?.elements.find(e => e.type === 'website')?.text || 'gridmart.ca',
          };

          await doc.print(data, {
            copies: 1,
            printName: `GridMart-${label.productCode}`,
          });
          printed++;
        } catch (err) {
          console.error(`Failed to print label for ${label.productCode}:`, err);
          failed++;
        }
      }

      if (failed === 0) {
        toast.success(`${printed} label${printed !== 1 ? 's' : ''} sent to Brother printer`);
      } else {
        toast.warning(`${printed} printed, ${failed} failed. Check printer connection and template.`);
      }
    } catch (error: any) {
      console.error('Brother b-PAC error:', error);
      if (error?.message?.includes('extension') || error?.message?.includes('Extension') || error?.toString?.()?.includes('Failed to fetch')) {
        toast.error('Brother b-PAC extension not detected. Make sure it is installed and enabled in your browser.');
      } else {
        toast.error(`Brother print failed: ${error?.message || 'Unknown error'}. Check that b-PAC Client and browser extension are installed.`);
      }
    } finally {
      setIsBrotherPrinting(false);
    }
  };

  const pxToMm = (px: number) => (px * 0.264583).toFixed(2);

  const generateLabelHTMLForExport = () => {
    return expandedLabels.map((label) => {
      const labelTemplate = templates[label.templateSize];
      const labelSizeData = DYMO_LABEL_SIZES[label.templateSize];
      const elements = labelTemplate.elements;
      const logo = elements.find(e => e.id === 'logo');
      const brand = elements.find(e => e.id === 'brand');
      const name = elements.find(e => e.id === 'name');
      const code = elements.find(e => e.id === 'code');
      const website = elements.find(e => e.id === 'website');
      const labelLogoUrl = labelTemplate.customLogoUrl || '';
      const labelBrandUrl = labelTemplate.customBrandUrl || '';
      const pageName = label.templateSize.replace(/[^a-zA-Z0-9]/g, '');

      return `
        <div class="label" style="position: relative; width: ${labelSizeData.width}px; height: ${labelSizeData.height}px; page: labelPage_${pageName};">
          ${logo?.visible ? `
            <div style="position: absolute; left: ${logo.x}px; top: ${logo.y}px; width: ${logo.width}px; height: ${logo.height}px; ${labelLogoUrl ? '' : 'background: #20B2AA;'} border-radius: 3px; display: flex; align-items: center; justify-content: center;">
              ${labelLogoUrl ? `<img src="${labelLogoUrl}" style="width: 100%; height: 100%; object-fit: contain;">` : `<svg viewBox="0 0 24 24" fill="white" style="width: 60%; height: 60%;"><path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18s-.41-.06-.57-.18l-7.9-4.44A.991.991 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18s.41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z"/></svg>`}
            </div>
          ` : ''}
          ${brand?.visible ? `
            <div style="position: absolute; left: ${brand.x}px; top: ${brand.y}px; width: ${brand.width}px; height: ${brand.height}px; font-size: ${brand.fontSize}px; font-weight: bold; display: flex; align-items: center; justify-content: ${brand.textAlign === 'center' ? 'center' : brand.textAlign === 'right' ? 'flex-end' : 'flex-start'}; text-align: ${brand.textAlign || 'left'};">
              ${labelBrandUrl ? `<img src="${labelBrandUrl}" style="width: 100%; height: 100%; object-fit: contain;">` : `<span style="color: #20B2AA;">Grid</span><span style="color: #1D3557;">Mart</span>`}
            </div>
          ` : ''}
          ${name?.visible ? `
            <div style="position: absolute; left: ${name.x}px; top: ${name.y}px; width: ${name.width}px; height: ${name.height}px; font-size: ${name.fontSize}px; font-weight: bold; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-align: ${name.textAlign || 'left'};">
              ${label.name}
            </div>
          ` : ''}
          ${code?.visible ? `
            <div style="position: absolute; left: ${code.x}px; top: ${code.y}px; width: ${code.width}px; font-size: ${code.fontSize}px; font-weight: bold; font-family: monospace; letter-spacing: 1px; text-align: ${code.textAlign || 'left'};">
              ${label.productCode}
            </div>
          ` : ''}
          ${website?.visible ? `
            <div style="position: absolute; left: ${website.x}px; top: ${website.y}px; width: ${website.width}px; height: ${website.height}px; font-size: ${website.fontSize}px; color: #666; font-family: Arial, sans-serif; text-align: ${website.textAlign || 'center'};">
              ${website.text || 'gridmart.ca'}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  };

  const generatePageSizeCSS = () => {
    const usedSizes = new Set(expandedLabels.map(l => l.templateSize));
    return Array.from(usedSizes).map(sizeKey => {
      const sizeData = DYMO_LABEL_SIZES[sizeKey];
      const pageName = sizeKey.replace(/[^a-zA-Z0-9]/g, '');
      const wMm = pxToMm(sizeData.width);
      const hMm = pxToMm(sizeData.height);
      return `@page labelPage_${pageName} { size: ${wMm}mm ${hMm}mm; margin: 0; }`;
    }).join('\n');
  };
  
  const handleDownloadPDF = async () => {
    if (expandedLabels.length === 0) return;
    setIsGenerating(true);
    cancelledRef.current = false;

    try {
      toast.info('Preparing PDF for download...', { id: 'pdf-progress' });
      
      const labelsByProduct: Record<string, typeof expandedLabels> = {};
      for (const label of expandedLabels) {
        const key = label.productCode || 'unknown';
        if (!labelsByProduct[key]) {
          labelsByProduct[key] = [];
        }
        labelsByProduct[key].push(label);
      }
      const productCodes = Object.keys(labelsByProduct);
      const filename = productCodes.length === 1 ? `${productCodes[0]}-labels` : 'labels';
      
      const pdfWindow = window.open('', '_blank');
      if (!pdfWindow) {
        toast.error('Pop-up blocked. Please allow pop-ups and try again.');
        setIsGenerating(false);
        return;
      }

      pdfWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${filename}</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { font-family: Arial, sans-serif; }
              @page { margin: 0; }
              ${generatePageSizeCSS()}
              @media print { 
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                html, body { margin: 0; padding: 0; }
              }
              .download-banner {
                position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
                background: #0d9488; color: white; padding: 12px 20px;
                display: flex; align-items: center; justify-content: space-between;
                font-family: Arial, sans-serif; font-size: 14px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
              }
              .download-banner button {
                background: white; color: #0d9488; border: none; padding: 8px 20px;
                border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px;
              }
              .download-banner button:hover { background: #f0fdfa; }
              .labels-container { padding-top: 52px; }
              @media print {
                .download-banner { display: none !important; }
                .labels-container { padding-top: 0 !important; }
              }
            </style>
          </head>
          <body>
            <div class="download-banner">
              <span>Use your browser's <b>Print</b> dialog → select <b>"Save as PDF"</b> as the destination to download.</span>
              <button onclick="window.print()">Save as PDF</button>
            </div>
            <div class="labels-container">
              ${generateLabelHTMLForExport()}
            </div>
          </body>
        </html>
      `);

      pdfWindow.document.close();
      pdfWindow.focus();
      
      toast.success(`${expandedLabels.length} label${expandedLabels.length > 1 ? 's' : ''} ready — use "Save as PDF" in the print dialog`, { id: 'pdf-progress', duration: 5000 });
    } catch (error: any) {
      if (!cancelledRef.current) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF');
      }
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleCancelDownload = () => {
    cancelledRef.current = true;
    setIsGenerating(false);
    toast.info('PDF generation cancelled', { id: 'pdf-progress' });
  };

  const selectedElementData = getSelectedElementData();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Printer className="w-5 h-5" />
            Label Editor
          </DialogTitle>
          <DialogDescription>
            Create and customize labels for {displayProducts.length} product{displayProducts.length !== 1 ? 's' : ''} ({totalLabelCount} total label{totalLabelCount !== 1 ? 's' : ''})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>Label Size</Label>
              <Select value={labelSize} onValueChange={(val) => {
                setLabelSize(val as LabelSize);
                setSelectedElements([]);
              }}>
                <SelectTrigger data-testid="select-label-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Dymo LabelWriter</div>
                  {Object.entries(DYMO_LABEL_SIZES).filter(([, s]) => s.printer === 'dymo').map(([key, size]) => (
                    <SelectItem key={key} value={key}>
                      {key} - {size.name}
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-1 border-t">Brother QL-800</div>
                  {Object.entries(DYMO_LABEL_SIZES).filter(([, s]) => s.printer === 'ql800').map(([key, size]) => (
                    <SelectItem key={key} value={key}>
                      {key} - {size.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-5">
              <Button variant="outline" size="sm" onClick={saveTemplate}>
                <Save className="w-4 h-4 mr-1" />
                Save Template
              </Button>
              <Button variant="ghost" size="sm" onClick={resetTemplate}>
                <RotateCcw className="w-4 h-4 mr-1" />
                Reset
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'preview' | 'editor')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="editor">
                <Settings className="w-4 h-4 mr-1" />
                Editor
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="space-y-4">
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center justify-between mb-3">
                  <Label className="block">Label Preview ({displayProducts.length} product{displayProducts.length !== 1 ? 's' : ''}, {totalLabelCount} total pages)</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const allToOne: Record<string, number> = {};
                      displayProducts.forEach((p: any) => {
                        allToOne[p.id] = 1;
                      });
                      setProductQuantities(allToOne);
                    }}
                    data-testid="button-set-all-to-one"
                  >
                    Set All to 1
                  </Button>
                </div>
                {displayProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Printer className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No products selected</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-4 justify-center max-h-[400px] overflow-auto p-2">
                    {displayProducts.map((product) => {
                      const qty = getProductQuantity(product);
                      const productTemplate = getProductTemplate(product);
                      const productSize = DYMO_LABEL_SIZES[productTemplate];
                      const productTemplateData = templates[productTemplate];
                      return (
                        <div key={product.id} className="flex flex-col items-center pb-4 bg-muted/20 rounded-lg p-3 border">
                          <div className="flex items-center gap-1 mb-2 max-w-full">
                            <span className="text-xs font-medium text-foreground truncate max-w-[180px]" title={product.name}>
                              {product.name}
                            </span>
                            <button
                              onClick={() => removeProduct(product.id)}
                              className="p-0.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                              title="Remove from labels"
                              data-testid={`button-remove-label-${product.id}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          
                          {/* Per-product template selector */}
                          <div className="w-full mb-2">
                            <Select 
                              value={productTemplate} 
                              onValueChange={(val) => updateProductTemplate(product.id, val as LabelSize)}
                            >
                              <SelectTrigger className="h-7 text-xs" data-testid={`select-template-${product.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Dymo LabelWriter</div>
                                {Object.entries(DYMO_LABEL_SIZES).filter(([, s]) => s.printer === 'dymo').map(([key, size]) => (
                                  <SelectItem key={key} value={key} className="text-xs">
                                    {key} - {size.name}
                                  </SelectItem>
                                ))}
                                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-1 border-t">Brother QL-800</div>
                                {Object.entries(DYMO_LABEL_SIZES).filter(([, s]) => s.printer === 'ql800').map(([key, size]) => (
                                  <SelectItem key={key} value={key} className="text-xs">
                                    {key} - {size.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div
                            className="bg-white border-2 border-dashed border-muted-foreground/30 rounded shadow-sm relative"
                            style={{
                              width: productSize.width * scale,
                              height: productSize.height * scale,
                            }}
                          >
                            {productTemplateData.elements.map(el => 
                              renderLabelElement(el, true, { name: product.name, code: product.productCode || 'GM-XXX' }, productTemplate)
                            )}
                          </div>
                          
                          {/* Quantity controls */}
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() => updateProductQuantity(product.id, qty - 1)}
                              disabled={qty <= 1}
                              className="w-6 h-6 rounded-full bg-muted hover:bg-muted-foreground/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-sm font-medium"
                              data-testid={`button-qty-minus-${product.id}`}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={qty}
                              onChange={(e) => updateProductQuantity(product.id, parseInt(e.target.value) || 1)}
                              className="w-12 h-6 text-center text-xs border rounded bg-background"
                              data-testid={`input-qty-${product.id}`}
                            />
                            <button
                              onClick={() => updateProductQuantity(product.id, qty + 1)}
                              className="w-6 h-6 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center text-sm font-medium"
                              data-testid={`button-qty-plus-${product.id}`}
                            >
                              +
                            </button>
                            <span className="text-xs text-muted-foreground">labels</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="editor" className="space-y-4">
              <div className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={undo}
                    disabled={!canUndo}
                    title="Undo (Ctrl+Z)"
                    data-testid="button-undo"
                  >
                    <Undo2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={redo}
                    disabled={!canRedo}
                    title="Redo (Ctrl+Shift+Z)"
                    data-testid="button-redo"
                  >
                    <Redo2 className="w-4 h-4" />
                  </Button>
                  <div className="h-4 w-px bg-border mx-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => alignElement('left')}
                    disabled={selectedElements.length === 0}
                    title="Align Left"
                    data-testid="button-align-left"
                  >
                    <AlignLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => alignElement('center')}
                    disabled={selectedElements.length === 0}
                    title="Align Center"
                    data-testid="button-align-center"
                  >
                    <AlignCenter className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => alignElement('right')}
                    disabled={selectedElements.length === 0}
                    title="Align Right"
                    data-testid="button-align-right"
                  >
                    <AlignRight className="w-4 h-4" />
                  </Button>
                  <div className="h-4 w-px bg-border mx-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTextAlign('left')}
                    disabled={selectedElements.length === 0 || selectedElements.every(id => currentTemplate.elements.find(el => el.id === id)?.type === 'logo')}
                    title="Text Align Left"
                    data-testid="button-text-left"
                  >
                    <AlignLeft className="w-4 h-4 text-orange-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTextAlign('center')}
                    disabled={selectedElements.length === 0 || selectedElements.every(id => currentTemplate.elements.find(el => el.id === id)?.type === 'logo')}
                    title="Text Align Center"
                    data-testid="button-text-center"
                  >
                    <AlignCenter className="w-4 h-4 text-orange-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTextAlign('right')}
                    disabled={selectedElements.length === 0 || selectedElements.every(id => currentTemplate.elements.find(el => el.id === id)?.type === 'logo')}
                    title="Text Align Right"
                    data-testid="button-text-right"
                  >
                    <AlignRight className="w-4 h-4 text-orange-500" />
                  </Button>
                  <div className="h-4 w-px bg-border mx-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => alignElement('top')}
                    disabled={selectedElements.length === 0}
                    title="Align Top"
                    data-testid="button-align-top"
                  >
                    <AlignVerticalJustifyStart className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => alignElement('middle')}
                    disabled={selectedElements.length === 0}
                    title="Align Middle"
                    data-testid="button-align-middle"
                  >
                    <AlignVerticalJustifyCenter className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => alignElement('bottom')}
                    disabled={selectedElements.length === 0}
                    title="Align Bottom"
                    data-testid="button-align-bottom"
                  >
                    <AlignVerticalJustifyEnd className="w-4 h-4" />
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">Arrow keys: 1px | Shift+Arrow: 5px</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-4 bg-muted/30 overflow-hidden">
                  <Label className="mb-3 block flex items-center gap-2">
                    <Move className="w-4 h-4" />
                    Drag Elements to Reposition
                  </Label>
                  <div>
                    <div
                      ref={editorRef}
                      className="bg-white border-2 border-primary/30 rounded shadow-sm relative cursor-crosshair"
                      style={{
                        width: selectedSize.width * scale,
                        height: selectedSize.height * scale,
                        minWidth: selectedSize.width * scale,
                      }}
                      onMouseDown={(e) => {
                        // Only start marquee if clicking directly on the background
                        if (e.target === e.currentTarget && editorRef.current) {
                          const rect = editorRef.current.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const y = e.clientY - rect.top;
                          setMarquee({ startX: x, startY: y, endX: x, endY: y });
                          setSelectedElements([]);
                        }
                      }}
                    >
                      {currentTemplate.elements.map(el => renderLabelElement(el, false, { name: 'Sample Product', code: 'GM-1234' }))}
                      {snapGuides.map((guide, i) => (
                        <div
                          key={`guide-${i}`}
                          style={{
                            position: 'absolute',
                            backgroundColor: '#f97316',
                            zIndex: 140,
                            ...(guide.type === 'v' 
                              ? { left: guide.pos * scale, top: 0, width: 1, height: '100%' }
                              : { top: guide.pos * scale, left: 0, height: 1, width: '100%' }
                            ),
                          }}
                        />
                      ))}
                      {marquee && (
                        <div
                          style={{
                            position: 'absolute',
                            left: Math.min(marquee.startX, marquee.endX),
                            top: Math.min(marquee.startY, marquee.endY),
                            width: Math.abs(marquee.endX - marquee.startX),
                            height: Math.abs(marquee.endY - marquee.startY),
                            border: '1px dashed #0ea5e9',
                            backgroundColor: 'rgba(14, 165, 233, 0.1)',
                            pointerEvents: 'none',
                            zIndex: 150,
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Click an element to select, then drag to move
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <Label className="mb-3 block">Element Settings</Label>
                    {selectedElementData ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                          <span className="font-medium capitalize">{selectedElementData.type}</span>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">Visible</Label>
                            <Switch
                              checked={selectedElementData.visible}
                              onCheckedChange={(checked) => updateElement(selectedElementData.id, { visible: checked })}
                            />
                          </div>
                        </div>
                        
                        {selectedElementData.type === 'logo' ? (
                          <div>
                            <Label className="text-xs mb-2 block">Image Size: {selectedElementData.width}px</Label>
                            <Slider
                              value={[selectedElementData.width]}
                              onValueChange={([val]) => updateElement(selectedElementData.id, { width: val, height: val })}
                              min={8}
                              max={80}
                              step={1}
                            />
                          </div>
                        ) : (
                          <div>
                            <Label className="text-xs mb-2 block">Font Size: {selectedElementData.fontSize}px</Label>
                            <Slider
                              value={[selectedElementData.fontSize]}
                              onValueChange={([val]) => updateElement(selectedElementData.id, { fontSize: val })}
                              min={6}
                              max={72}
                              step={1}
                            />
                          </div>
                        )}
                        
                        {(selectedElementData.type === 'logo' || selectedElementData.type === 'brand') && (
                          <div className="border-t pt-3 mt-3">
                            <Label className="text-xs mb-2 block flex items-center gap-2">
                              <Image className="w-3 h-3" />
                              {selectedElementData.type === 'logo' ? 'Custom Logo Icon' : 'Custom Brand Image'}
                            </Label>
                            <div className="flex gap-2 items-center mb-2">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id="image-upload-input"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      const dataUrl = event.target?.result as string;
                                      if (uploadTargetRef.current === 'logo') {
                                        setCustomLogoUrl(dataUrl);
                                      } else {
                                        setCustomBrandUrl(dataUrl);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                  e.target.value = '';
                                }}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  uploadTargetRef.current = selectedElementData.type as 'logo' | 'brand';
                                  document.getElementById('image-upload-input')?.click();
                                }}
                                className="flex-1"
                              >
                                <Upload className="w-4 h-4 mr-2" />
                                {(selectedElementData.type === 'logo' ? customLogoUrl : customBrandUrl) ? 'Change' : 'Upload'}
                              </Button>
                              {(selectedElementData.type === 'logo' ? customLogoUrl : customBrandUrl) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => selectedElementData.type === 'logo' ? setCustomLogoUrl('') : setCustomBrandUrl('')}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                            {(selectedElementData.type === 'logo' ? customLogoUrl : customBrandUrl) && (
                              <div className="w-10 h-10 border rounded overflow-hidden">
                                <img 
                                  src={selectedElementData.type === 'logo' ? customLogoUrl : customBrandUrl} 
                                  alt={selectedElementData.type === 'logo' ? "Logo preview" : "Brand preview"} 
                                  className="w-full h-full object-contain" 
                                />
                              </div>
                            )}
                          </div>
                        )}
                        
                        {selectedElementData.type === 'website' && (
                          <div className="border-t pt-3 mt-3">
                            <Label className="text-xs mb-2 block">Website Text</Label>
                            <Input
                              value={selectedElementData.text || 'gridmart.ca'}
                              onChange={(e) => updateElement(selectedElementData.id, { text: e.target.value })}
                              placeholder="gridmart.ca"
                              className="h-8 text-sm"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Edit the website URL displayed on the label
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <GripVertical className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        Click an element on the label to edit
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex gap-2">
            <Button 
              onClick={handlePrint} 
              className="flex-1" 
              disabled={products.length === 0 || isGenerating}
              data-testid="button-print-labels"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print Labels
            </Button>
            {isGenerating ? (
              <Button
                onClick={handleCancelDownload}
                variant="destructive"
                className="flex-1"
                data-testid="button-cancel-download"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            ) : (
              <Button
                onClick={handleDownloadPDF}
                variant="outline"
                className="flex-1"
                disabled={products.length === 0}
                data-testid="button-download-labels"
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            )}
          </div>

          <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium">Brother P-touch (b-PAC)</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBrotherSettings(!showBrotherSettings)}
                data-testid="button-brother-settings-toggle"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>

            {showBrotherSettings && (
              <div className="space-y-3 pt-1">
                <div>
                  <Label className="text-xs mb-1 block">Printer Name</Label>
                  <Input
                    value={brotherPrinterName}
                    onChange={(e) => saveBrotherPrinterName(e.target.value)}
                    placeholder="Brother QL-800"
                    className="h-8 text-sm"
                    data-testid="input-brother-printer-name"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Exact printer name as shown in Windows Devices & Printers
                  </p>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Template File Path (.lbx)</Label>
                  <Input
                    value={brotherTemplatePath}
                    onChange={(e) => saveBrotherTemplatePath(e.target.value)}
                    placeholder="C:\Templates\gridmart-label.lbx"
                    className="h-8 text-sm font-mono"
                    data-testid="input-brother-template-path"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Local path to your .lbx template (avoid network drives)
                  </p>
                </div>
                <div className="border-t pt-2">
                  <Label className="text-xs mb-2 block font-medium">Template Object Names</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Match these to the object names in your P-touch Editor template
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Product Name</Label>
                      <Input
                        value={brotherFieldMap.productName || 'objProductName'}
                        onChange={(e) => saveBrotherFieldMap('productName', e.target.value)}
                        className="h-7 text-xs font-mono"
                        data-testid="input-brother-field-name"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Product Code</Label>
                      <Input
                        value={brotherFieldMap.productCode || 'objCode'}
                        onChange={(e) => saveBrotherFieldMap('productCode', e.target.value)}
                        className="h-7 text-xs font-mono"
                        data-testid="input-brother-field-code"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Website</Label>
                      <Input
                        value={brotherFieldMap.website || 'objWebsite'}
                        onChange={(e) => saveBrotherFieldMap('website', e.target.value)}
                        className="h-7 text-xs font-mono"
                        data-testid="input-brother-field-website"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={handleBrotherPrint}
              variant="outline"
              className="w-full border-blue-200 hover:bg-blue-50 text-blue-700"
              disabled={products.length === 0 || isBrotherPrinting}
              data-testid="button-brother-print"
            >
              {isBrotherPrinting ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Printing...
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4 mr-2" />
                  Print to Brother
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
