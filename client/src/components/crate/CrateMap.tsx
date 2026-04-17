import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { X, Printer, Search, Trash2, Plus, Minus, RotateCcw, Undo2, Redo2, Settings, GripVertical, ChevronLeft, ChevronRight, Copy } from 'lucide-react';

interface CrateItem {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
}

interface CellData {
  items: CrateItem[];
}

interface DividerItem {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
}

interface DividerData {
  removed: boolean;
  items: DividerItem[];
}

export interface CrateMapData {
  cells: Record<string, CellData>;
  hDividers: Record<string, DividerData>;
  vDividers: Record<string, DividerData>;
  orientation: 'portrait' | 'landscape';
  printTitle: string;
  printDate: boolean;
  printSubtext: string;
  printSubtextDefault: boolean;
}

interface CrateMapProps {
  crateId: string;
  crateName: string;
  crateItems: Array<{ productId: string; productCode?: string; productName?: string; quantity: number }>;
  allProducts?: Array<{ productId: string; productCode?: string; productName?: string; quantity: number }>;
  initialMapData?: CrateMapData | null;
  onSave: (mapData: CrateMapData, addedItems?: Array<{ productId: string; quantity: number }>) => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onNameChange?: (newName: string) => void;
}

const DEFAULT_MAP_DATA: CrateMapData = {
  cells: {},
  hDividers: {},
  vDividers: {},
  orientation: 'landscape',
  printTitle: 'CRATE MAP',
  printDate: true,
  printSubtext: '',
  printSubtextDefault: false,
};

function getDefaultSubtext(): string {
  try {
    const saved = localStorage.getItem('gridmart_crate_map_default_subtext');
    return saved || '';
  } catch { return ''; }
}

function saveDefaultSubtext(text: string) {
  try { localStorage.setItem('gridmart_crate_map_default_subtext', text); } catch {}
}

type DragSource = {
  productId: string;
  fromType: 'cell' | 'hdivider' | 'vdivider' | 'search';
  fromKey: string;
};

export function CrateMap({ crateId, crateName, crateItems, allProducts, initialMapData, onSave, onClose, onPrev, onNext, onNameChange }: CrateMapProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(crateName);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [mapData, setMapDataRaw] = useState<CrateMapData>(() => {
    const base = initialMapData ? { ...DEFAULT_MAP_DATA, ...initialMapData } : (() => {
      const defaultSubtext = getDefaultSubtext();
      return { ...DEFAULT_MAP_DATA, printSubtext: defaultSubtext, printSubtextDefault: !!defaultSubtext };
    })();
    const pool = allProducts || crateItems;
    const validIds = new Set(pool.map(i => i.productId));
    const cleanItems = (items: CrateItem[]) => items.filter(i => validIds.has(i.productId));
    if (base.cells) {
      for (const k of Object.keys(base.cells)) {
        base.cells[k] = { ...base.cells[k], items: cleanItems(base.cells[k].items) };
      }
    }
    if (base.hDividers) {
      for (const k of Object.keys(base.hDividers)) {
        base.hDividers[k] = { ...base.hDividers[k], items: cleanItems((base.hDividers[k] as any).items || []) };
      }
    }
    if (base.vDividers) {
      for (const k of Object.keys(base.vDividers)) {
        base.vDividers[k] = { ...base.vDividers[k], items: cleanItems((base.vDividers[k] as any).items || []) };
      }
    }
    return base;
  });
  const historyRef = useRef<CrateMapData[]>([]);
  const redoRef = useRef<CrateMapData[]>([]);
  const skipHistoryRef = useRef(false);

  const setMapData: typeof setMapDataRaw = useCallback((updater) => {
    setMapDataRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      if (!skipHistoryRef.current) {
        historyRef.current = [...historyRef.current, prev];
        if (historyRef.current.length > 50) historyRef.current = historyRef.current.slice(-50);
        redoRef.current = [];
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setMapDataRaw(current => {
      redoRef.current = [...redoRef.current, current];
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return;
    const next = redoRef.current[redoRef.current.length - 1];
    redoRef.current = redoRef.current.slice(0, -1);
    setMapDataRaw(current => {
      historyRef.current = [...historyRef.current, current];
      return next;
    });
  }, []);

  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [selectedDivider, setSelectedDivider] = useState<{ type: 'h' | 'v'; key: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showCopyFromCrate, setShowCopyFromCrate] = useState(false);
  const [otherCrates, setOtherCrates] = useState<any[] | null>(null);
  const [selectedSourceCrate, setSelectedSourceCrate] = useState<string | null>(null);
  const [selectedSourceSection, setSelectedSourceSection] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(0);
  const [pendingQuantity, setPendingQuantity] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const highlightedItemRef = useRef<HTMLDivElement>(null);

  const ROWS = 2;
  const COLS = 3;

  const getCellKey = (r: number, c: number) => `${r}-${c}`;
  const getHDividerKey = (r: number, c: number) => `h-${r}-${c}`;
  const getVDividerKey = (r: number, c: number) => `v-${r}-${c}`;

  const cellGroupMap = useMemo(() => {
    const parent: Record<string, string> = {};
    const find = (x: string): string => {
      if (!parent[x]) parent[x] = x;
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    };
    const union = (a: string, b: string) => { parent[find(a)] = find(b); };
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        find(`${r}-${c}`);
    for (let r = 0; r < ROWS - 1; r++)
      for (let c = 0; c < COLS; c++)
        if (mapData.hDividers[`h-${r}-${c}`]?.removed)
          union(`${r}-${c}`, `${r + 1}-${c}`);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS - 1; c++)
        if (mapData.vDividers[`v-${r}-${c}`]?.removed)
          union(`${r}-${c}`, `${r}-${c + 1}`);
    const result: Record<string, string> = {};
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const key = `${r}-${c}`;
        result[key] = find(key);
      }
    return result;
  }, [mapData.hDividers, mapData.vDividers]);

  const selectableTargets = useMemo(() => {
    const targets: Array<{type: 'cell' | 'hdivider' | 'vdivider', key: string}> = [];
    const seen = new Set<string>();
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const root = cellGroupMap[`${r}-${c}`];
        if (!seen.has(root)) { seen.add(root); targets.push({type: 'cell', key: root}); }
      }
    for (let r = 0; r < ROWS - 1; r++)
      for (let c = 0; c < COLS; c++) {
        const hKey = `h-${r}-${c}`;
        if (!mapData.hDividers[hKey]?.removed) targets.push({type: 'hdivider', key: hKey});
      }
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS - 1; c++) {
        const vKey = `v-${r}-${c}`;
        if (!mapData.vDividers[vKey]?.removed) targets.push({type: 'vdivider', key: vKey});
      }
    return targets;
  }, [cellGroupMap, mapData.hDividers, mapData.vDividers]);

  const allPlacedProductIds = new Set<string>();
  Object.values(mapData.cells).forEach(cell => cell.items.forEach(i => allPlacedProductIds.add(i.productId)));
  Object.values(mapData.hDividers).forEach(d => d.items.forEach(i => allPlacedProductIds.add(i.productId)));
  Object.values(mapData.vDividers).forEach(d => d.items.forEach(i => allPlacedProductIds.add(i.productId)));

  const searchPool = allProducts || crateItems;
  const unplacedItems = crateItems.filter(i => !allPlacedProductIds.has(i.productId));

  const filteredSearch = searchQuery.trim()
    ? searchPool.filter(i => {
        const q = searchQuery.toLowerCase();
        return (i.productCode?.toLowerCase().includes(q) || i.productName?.toLowerCase().includes(q));
      })
    : [];

  const findItemData = (productId: string): CrateItem | null => {
    for (const cell of Object.values(mapData.cells)) {
      const found = cell.items.find(i => i.productId === productId);
      if (found) return found;
    }
    for (const d of Object.values(mapData.hDividers)) {
      const found = d.items.find(i => i.productId === productId);
      if (found) return found;
    }
    for (const d of Object.values(mapData.vDividers)) {
      const found = d.items.find(i => i.productId === productId);
      if (found) return found;
    }
    const fromSearch = searchPool.find(i => i.productId === productId);
    if (fromSearch) return {
      productId: fromSearch.productId,
      productCode: fromSearch.productCode || '',
      productName: fromSearch.productName || '',
      quantity: 0,
    };
    return null;
  };

  const addItemToTarget = (item: CrateItem, targetType: 'cell' | 'hdivider' | 'vdivider', targetKey: string) => {
    setMapData(prev => {
      const next = { ...prev };
      if (targetType === 'cell') {
        const cells = { ...prev.cells };
        const cell = cells[targetKey] || { items: [] };
        if (cell.items.some(i => i.productId === item.productId)) return prev;
        cells[targetKey] = { items: [...cell.items, item] };
        next.cells = cells;
      } else if (targetType === 'hdivider') {
        const dividers = { ...prev.hDividers } as Record<string, DividerData>;
        const divider = dividers[targetKey] || { removed: false, items: [] };
        if (divider.items.some(i => i.productId === item.productId)) return prev;
        dividers[targetKey] = { ...divider, items: [...divider.items, item] };
        next.hDividers = dividers;
      } else if (targetType === 'vdivider') {
        const dividers = { ...prev.vDividers } as Record<string, DividerData>;
        const divider = dividers[targetKey] || { removed: false, items: [] };
        if (divider.items.some(i => i.productId === item.productId)) return prev;
        dividers[targetKey] = { ...divider, items: [...divider.items, item] };
        next.vDividers = dividers;
      }
      return next;
    });
  };

  const removeItemFrom = (productId: string, fromType: 'cell' | 'hdivider' | 'vdivider', fromKey: string) => {
    setMapData(prev => {
      const next = { ...prev };
      if (fromType === 'cell') {
        const cells = { ...prev.cells };
        const cell = cells[fromKey];
        if (!cell) return prev;
        cells[fromKey] = { items: cell.items.filter(i => i.productId !== productId) };
        next.cells = cells;
      } else if (fromType === 'hdivider') {
        const dividers = { ...prev.hDividers } as Record<string, DividerData>;
        const divider = dividers[fromKey];
        if (!divider) return prev;
        dividers[fromKey] = { ...divider, items: divider.items.filter(i => i.productId !== productId) };
        next.hDividers = dividers;
      } else if (fromType === 'vdivider') {
        const dividers = { ...prev.vDividers } as Record<string, DividerData>;
        const divider = dividers[fromKey];
        if (!divider) return prev;
        dividers[fromKey] = { ...divider, items: divider.items.filter(i => i.productId !== productId) };
        next.vDividers = dividers;
      }
      return next;
    });
  };

  const updateItemQuantity = (productId: string, fromType: 'cell' | 'hdivider' | 'vdivider', fromKey: string, delta: number) => {
    setMapData(prev => {
      const next = { ...prev };
      const updateItems = (items: CrateItem[]) =>
        items.map(i => i.productId === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i);

      if (fromType === 'cell') {
        const cells = { ...prev.cells };
        const cell = cells[fromKey];
        if (!cell) return prev;
        cells[fromKey] = { items: updateItems(cell.items) };
        next.cells = cells;
      } else if (fromType === 'hdivider') {
        const dividers = { ...prev.hDividers } as Record<string, DividerData>;
        const divider = dividers[fromKey];
        if (!divider) return prev;
        dividers[fromKey] = { ...divider, items: updateItems(divider.items) };
        next.hDividers = dividers;
      } else if (fromType === 'vdivider') {
        const dividers = { ...prev.vDividers } as Record<string, DividerData>;
        const divider = dividers[fromKey];
        if (!divider) return prev;
        dividers[fromKey] = { ...divider, items: updateItems(divider.items) };
        next.vDividers = dividers;
      }
      return next;
    });
  };

  const addItemToSelection = useCallback((item: typeof crateItems[0]) => {
    const newItem: CrateItem = {
      productId: item.productId,
      productCode: item.productCode || '',
      productName: item.productName || '',
      quantity: pendingQuantity,
    };

    if (selectedCell) {
      addItemToTarget(newItem, 'cell', selectedCell);
    } else if (selectedDivider) {
      const targetType = selectedDivider.type === 'h' ? 'hdivider' : 'vdivider';
      addItemToTarget(newItem, targetType as 'hdivider' | 'vdivider', selectedDivider.key);
    }
    setSearchQuery('');
    setHighlightedSearchIndex(0);
    setPendingQuantity(1);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [selectedCell, selectedDivider, pendingQuantity]);

  const fetchOtherCrates = useCallback(async () => {
    try {
      const res = await fetch('/api/crates', { credentials: 'include' });
      if (!res.ok) return;
      const all = await res.json();
      setOtherCrates(all.filter((c: any) => c.id !== crateId && c.mapData));
    } catch {}
  }, [crateId]);

  const openCopyFromCrate = useCallback(() => {
    setShowCopyFromCrate(true);
    setSelectedSourceCrate(null);
    setSelectedSourceSection(null);
    if (!otherCrates) fetchOtherCrates();
  }, [otherCrates, fetchOtherCrates]);

  const buildSourceCellGroups = (sourceMapData: CrateMapData) => {
    const SROWS = 2, SCOLS = 3;
    const parent: Record<string, string> = {};
    const find = (x: string): string => {
      if (!parent[x]) parent[x] = x;
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    };
    const union = (a: string, b: string) => { parent[find(a)] = find(b); };
    for (let r = 0; r < SROWS; r++)
      for (let c = 0; c < SCOLS; c++) find(`${r}-${c}`);
    for (let r = 0; r < SROWS - 1; r++)
      for (let c = 0; c < SCOLS; c++)
        if (sourceMapData.hDividers[`h-${r}-${c}`]?.removed) union(`${r}-${c}`, `${r + 1}-${c}`);
    for (let r = 0; r < SROWS; r++)
      for (let c = 0; c < SCOLS - 1; c++)
        if (sourceMapData.vDividers[`v-${r}-${c}`]?.removed) union(`${r}-${c}`, `${r}-${c + 1}`);
    const groupMap: Record<string, string> = {};
    for (let r = 0; r < SROWS; r++)
      for (let c = 0; c < SCOLS; c++) {
        const key = `${r}-${c}`;
        groupMap[key] = find(key);
      }
    return groupMap;
  };

  const getSourceSections = (sourceMapData: CrateMapData) => {
    const groupMap = buildSourceCellGroups(sourceMapData);
    const roots = [...new Set(Object.values(groupMap))];
    const sections: Array<{ key: string; label: string; items: CrateItem[]; cellKeys: string[] }> = [];
    for (const root of roots) {
      const cellKeys = Object.entries(groupMap).filter(([_, v]) => v === root).map(([k]) => k);
      const items: CrateItem[] = [];
      for (const ck of cellKeys) {
        const cell = sourceMapData.cells[ck];
        if (cell?.items) items.push(...cell.items);
      }
      const isMerged = cellKeys.length > 1;
      sections.push({
        key: root,
        label: isMerged ? `Section ${root} (merged ${cellKeys.length} cells)` : `Section ${root}`,
        items,
        cellKeys,
      });
    }
    return sections;
  };

  const getSourceDividers = (sourceMapData: CrateMapData) => {
    const dividers: Array<{ key: string; type: 'h' | 'v'; label: string; items: CrateItem[] }> = [];
    for (const [key, d] of Object.entries(sourceMapData.hDividers)) {
      if (!d.removed && d.items?.length > 0) {
        dividers.push({ key, type: 'h', label: `H-Divider ${key}`, items: d.items });
      }
    }
    for (const [key, d] of Object.entries(sourceMapData.vDividers)) {
      if (!d.removed && d.items?.length > 0) {
        dividers.push({ key, type: 'v', label: `V-Divider ${key}`, items: d.items });
      }
    }
    return dividers;
  };

  const applyCopyFromSource = (items: CrateItem[]) => {
    if (!selectedCell && !selectedDivider) return;
    for (const item of items) {
      if (selectedCell) {
        addItemToTarget({ ...item }, 'cell', selectedCell);
      } else if (selectedDivider) {
        addItemToTarget({ ...item }, selectedDivider.type === 'h' ? 'hdivider' : 'vdivider', selectedDivider.key);
      }
    }
    setShowCopyFromCrate(false);
    setSelectedSourceCrate(null);
    setSelectedSourceSection(null);
  };

  const toggleDivider = (type: 'h' | 'v', key: string) => {
    const divKey = type === 'h' ? 'hDividers' : 'vDividers';
    setMapData(prev => {
      const dividers = { ...prev[divKey] } as Record<string, DividerData>;
      const divider = dividers[key] || { removed: false, items: [] };
      dividers[key] = { ...divider, removed: !divider.removed };
      return { ...prev, [divKey]: dividers };
    });
  };

  const cycleSelection = useCallback((direction: 1 | -1) => {
    if (selectableTargets.length === 0) return;
    let currentIdx = -1;
    if (selectedCell) {
      currentIdx = selectableTargets.findIndex(t => t.type === 'cell' && t.key === selectedCell);
    } else if (selectedDivider) {
      const divType = selectedDivider.type === 'h' ? 'hdivider' : 'vdivider';
      currentIdx = selectableTargets.findIndex(t => t.type === divType && t.key === selectedDivider.key);
    }
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + direction + selectableTargets.length) % selectableTargets.length;
    const next = selectableTargets[nextIdx];
    if (next.type === 'cell') {
      setSelectedCell(next.key);
      setSelectedDivider(null);
    } else {
      setSelectedCell(null);
      setSelectedDivider({ type: next.type === 'hdivider' ? 'h' : 'v', key: next.key });
    }
  }, [selectableTargets, selectedCell, selectedDivider]);

  const handleDragStart = (e: React.DragEvent, source: DragSource) => {
    setDragSource(source);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', source.productId);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(targetId);
  };

  const handleDragLeave = () => {
    setDragOver(null);
  };

  const handleDrop = (e: React.DragEvent, targetType: 'cell' | 'hdivider' | 'vdivider', targetKey: string) => {
    e.preventDefault();
    setDragOver(null);
    if (!dragSource) return;

    const itemData = findItemData(dragSource.productId);
    if (!itemData) return;

    if (dragSource.fromType !== 'search') {
      removeItemFrom(dragSource.productId, dragSource.fromType, dragSource.fromKey);
    }
    addItemToTarget(itemData, targetType, targetKey);
    setDragSource(null);
  };

  const handlePrint = () => {
    if (mapData.printSubtextDefault) {
      saveDefaultSubtext(mapData.printSubtext);
    }
    const printHtml = generateCrateMapPrintHtml(mapData);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>${mapData.printTitle || 'CRATE MAP'}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 20px; }
        @page { margin: 10mm; margin-top: 5mm; }
        @media print { body { padding: 0; } }
        .print-title { font-size: 24px; font-weight: bold; margin-bottom: 4px; }
        .print-date { font-size: 12px; color: #666; margin-bottom: 4px; }
        .print-subtext { font-size: 11px; color: #444; margin-bottom: 12px; font-style: italic; }
        .grid-table { border: 2px solid #000; border-collapse: collapse; }
        .grid-cell {
          border: 1px solid #000;
          padding: 6px 8px;
          vertical-align: top;
          font-size: 11px;
          line-height: 1.4;
        }
        .cell-items { display: flex; flex-wrap: wrap; gap: 1px 12px; }
        .cell-items-merged { display: flex; flex-direction: row; gap: 12px; flex-wrap: wrap; }
        .cell-items-col { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; }
        .cell-item { white-space: nowrap; }
        .v-div { width: 4px; }
        .v-div-items {
          width: 24px;
          background: #f5f5f5;
          border-top: 1px solid #000;
          border-bottom: 1px solid #000;
          text-align: center;
          font-size: 9px;
          padding: 2px;
          writing-mode: vertical-rl;
          text-orientation: mixed;
        }
        .h-div { height: 4px; }
        .h-div-items {
          background: #f5f5f5;
          border-left: 1px solid #000;
          border-right: 1px solid #000;
          text-align: center;
          font-size: 10px;
          padding: 1px 4px;
        }
        .corner { width: 4px; height: 4px; }
      </style>
      </head><body>
        ${printHtml}
        <script>window.print(); window.close();<\/script>
      </body></html>
    `);
    printWindow.document.close();
  };

  const handleSave = () => {
    if (mapData.printSubtextDefault) {
      saveDefaultSubtext(mapData.printSubtext);
    }
    onSave(mapData);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        e.stopPropagation();
        cycleSelection(e.shiftKey ? -1 : 1);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        cycleSelection(1);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        cycleSelection(-1);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        e.stopPropagation();
        redo();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [cycleSelection, undo, redo]);

  useEffect(() => {
    setHighlightedSearchIndex(0);
    setPendingQuantity(1);
  }, [searchQuery]);

  useEffect(() => {
    highlightedItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [highlightedSearchIndex]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      return;
    }
    if (filteredSearch.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedSearchIndex(prev => Math.min(prev + 1, filteredSearch.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedSearchIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPendingQuantity(prev => prev + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPendingQuantity(prev => Math.max(0, prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedSearchIndex < filteredSearch.length && (selectedCell || selectedDivider)) {
        addItemToSelection(filteredSearch[highlightedSearchIndex]);
      }
    }
  };

  const isPortrait = mapData.orientation === 'portrait';
  const cellWidth = isPortrait ? '180px' : '220px';
  const cellMinHeight = isPortrait ? '180px' : '140px';

  const renderItemChip = (item: CrateItem, fromType: 'cell' | 'hdivider' | 'vdivider', fromKey: string, isEditing: boolean, small?: boolean) => {
    return (
      <div
        key={item.productId}
        draggable={isEditing}
        onDragStart={(e) => handleDragStart(e, { productId: item.productId, fromType, fromKey })}
        className={`flex items-center gap-0.5 group/item ${isEditing ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ whiteSpace: 'nowrap' }}
      >
        {isEditing && <GripVertical className={`${small ? 'w-2 h-2' : 'w-2.5 h-2.5'} text-muted-foreground/50 flex-shrink-0`} />}
        <span className={`${small ? 'text-[9px]' : 'text-[11px]'}`}>{item.productCode}</span>
        {isEditing && (
          <button
            onClick={(e) => { e.stopPropagation(); updateItemQuantity(item.productId, fromType, fromKey, -1); }}
            className="opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-foreground"
          >
            <Minus className={`${small ? 'w-2 h-2' : 'w-2.5 h-2.5'}`} />
          </button>
        )}
        <span className={`${small ? 'text-[9px]' : 'text-[11px]'} font-semibold tabular-nums`}>{item.quantity}</span>
        {isEditing && (
          <button
            onClick={(e) => { e.stopPropagation(); updateItemQuantity(item.productId, fromType, fromKey, 1); }}
            className="opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-foreground"
          >
            <Plus className={`${small ? 'w-2 h-2' : 'w-2.5 h-2.5'}`} />
          </button>
        )}
        {isEditing && (
          <button
            onClick={(e) => { e.stopPropagation(); removeItemFrom(item.productId, fromType, fromKey); }}
            className="opacity-0 group-hover/item:opacity-100 text-red-400 hover:text-red-600 ml-0.5"
          >
            <X className={`${small ? 'w-2 h-2' : 'w-3 h-3'}`} />
          </button>
        )}
      </div>
    );
  };

  const renderCellContent = (cellKey: string, isEditing: boolean) => {
    const groupRoot = cellGroupMap[cellKey];
    const isMerged = groupRoot !== cellKey || Object.values(cellGroupMap).filter(v => v === groupRoot).length > 1;

    if (groupRoot !== cellKey) {
      return null;
    }

    const groupCells = Object.entries(cellGroupMap)
      .filter(([_, root]) => root === groupRoot)
      .map(([key]) => key);

    const allItems: Array<{ item: CrateItem; cellKey: string }> = [];
    for (const ck of groupCells) {
      const cell = mapData.cells[ck] || { items: [] };
      cell.items.forEach(item => allItems.push({ item, cellKey: ck }));
    }

    if (!isMerged) {
      return (
        <div className="cell-items" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '1px',
          overflow: 'hidden',
        }}>
          {allItems.map(({ item, cellKey: ck }) => renderItemChip(item, 'cell', ck, isEditing))}
        </div>
      );
    }

    const colCount = Math.max(1, Math.ceil(allItems.length / groupCells.length)) || 1;
    const columns: Array<Array<{ item: CrateItem; cellKey: string }>> = [];
    for (let i = 0; i < colCount; i++) columns.push([]);
    allItems.forEach((entry, idx) => {
      columns[idx % colCount].push(entry);
    });

    return (
      <div className="cell-items" style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '4px',
        overflow: 'hidden',
        height: '100%',
        width: '100%',
      }}>
        {columns.map((col, ci) => (
          <div key={ci} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '1px',
          }}>
            {col.map(({ item, cellKey: ck }) => renderItemChip(item, 'cell', ck, isEditing))}
          </div>
        ))}
      </div>
    );
  };

  const renderGrid = (isEditing: boolean) => {
    const gridElements: JSX.Element[] = [];

    for (let r = 0; r < ROWS; r++) {
      const rowCells: JSX.Element[] = [];

      for (let c = 0; c < COLS; c++) {
        const cellKey = getCellKey(r, c);
        const groupRoot = cellGroupMap[cellKey];
        const mergedRight = c < COLS - 1 && (mapData.vDividers[getVDividerKey(r, c)]?.removed || false);
        const mergedBottom = r < ROWS - 1 && (mapData.hDividers[getHDividerKey(r, c)]?.removed || false);
        const mergedLeft = c > 0 && (mapData.vDividers[getVDividerKey(r, c - 1)]?.removed || false);
        const mergedTop = r > 0 && (mapData.hDividers[getHDividerKey(r - 1, c)]?.removed || false);
        const isSelected = selectedCell === groupRoot;
        const isDragTarget = dragOver === `cell-${cellKey}`;

        rowCells.push(
          <td
            key={cellKey}
            className={`p-1.5 transition-colors ${isEditing ? 'cursor-pointer' : ''} ${isSelected ? 'bg-primary/10 ring-2 ring-primary' : ''} ${isDragTarget ? 'bg-blue-50 ring-2 ring-blue-400' : ''}`}
            style={{
              width: cellWidth,
              minHeight: cellMinHeight,
              borderTop: mergedTop ? 'none' : '1px solid #000',
              borderBottom: mergedBottom ? 'none' : '1px solid #000',
              borderLeft: mergedLeft ? 'none' : '1px solid #000',
              borderRight: mergedRight ? 'none' : '1px solid #000',
              verticalAlign: (mergedTop || mergedBottom || mergedLeft || mergedRight) ? 'middle' : 'top',
              overflow: 'hidden',
            }}
            onClick={() => {
              if (!isEditing) return;
              setSelectedDivider(null);
              setSelectedCell(isSelected ? null : groupRoot);
            }}
            onDragOver={(e) => handleDragOver(e, `cell-${cellKey}`)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, 'cell', groupRoot)}
            data-testid={`crate-cell-${cellKey}`}
          >
            {renderCellContent(cellKey, isEditing)}
          </td>
        );

        if (c < COLS - 1) {
          const vKey = getVDividerKey(r, c);
          const vDivider = mapData.vDividers[vKey];
          const isRemoved = vDivider?.removed || false;
          const isSelectedVDiv = selectedDivider?.type === 'v' && selectedDivider?.key === vKey;
          const isDragTargetV = dragOver === `vdiv-${vKey}`;

          rowCells.push(
            <td
              key={`vdiv-${r}-${c}`}
              className={`p-0 relative transition-colors group/vdiv ${isEditing && !isRemoved ? 'cursor-pointer hover:bg-blue-50' : ''} ${isSelectedVDiv ? 'bg-blue-100' : ''} ${isDragTargetV ? 'bg-blue-200' : ''}`}
              style={{
                width: isRemoved ? (isEditing ? '12px' : '0') : '24px',
                minWidth: isRemoved ? (isEditing ? '12px' : '0') : '24px',
                borderTop: (isRemoved || mergedTop) ? 'none' : '1px solid #000',
                borderBottom: (isRemoved || mergedBottom) ? 'none' : '1px solid #000',
                background: isRemoved
                  ? (isEditing ? '#fef2f2' : 'transparent')
                  : (isSelectedVDiv ? '#dbeafe' : isDragTargetV ? '#bfdbfe' : '#f9fafb'),
                verticalAlign: 'middle',
                textAlign: 'center',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isEditing || isRemoved) return;
                setSelectedCell(null);
                setSelectedDivider(isSelectedVDiv ? null : { type: 'v', key: vKey });
              }}
              onDragOver={(e) => !isRemoved && handleDragOver(e, `vdiv-${vKey}`)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => !isRemoved && handleDrop(e, 'vdivider', vKey)}
              data-testid={`crate-vdiv-${vKey}`}
            >
              {isRemoved && isEditing && (
                <button
                  className="absolute inset-0 flex items-center justify-center text-muted-foreground hover:text-primary"
                  onClick={(e) => { e.stopPropagation(); toggleDivider('v', vKey); }}
                  title="Restore divider"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
              {!isRemoved && isEditing && (
                <button
                  className="absolute bottom-0.5 left-0 p-0.5 opacity-0 group-hover/vdiv:opacity-100 text-red-400 hover:text-red-600 z-10"
                  onClick={(e) => { e.stopPropagation(); toggleDivider('v', vKey); }}
                  title="Remove divider"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              {!isRemoved && !vDivider?.items?.length && isEditing && (
                <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                  <div className="w-0.5 h-6 bg-gray-400 rounded" />
                </div>
              )}
              {!isRemoved && vDivider?.items?.map(item => (
                <div key={item.productId} className="text-[8px] leading-tight px-0.5" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {renderItemChip(item, 'vdivider', vKey, isEditing, true)}
                </div>
              ))}
            </td>
          );
        }
      }

      gridElements.push(<tr key={`row-${r}`}>{rowCells}</tr>);

      if (r < ROWS - 1) {
        const dividerCells: JSX.Element[] = [];
        for (let c = 0; c < COLS; c++) {
          const hKey = getHDividerKey(r, c);
          const hDivider = mapData.hDividers[hKey];
          const isRemoved = hDivider?.removed || false;
          const isSelectedDiv = selectedDivider?.type === 'h' && selectedDivider?.key === hKey;
          const isDragTargetH = dragOver === `hdiv-${hKey}`;
          const mergedLeft = c > 0 && (mapData.vDividers[getVDividerKey(r, c - 1)]?.removed || false);
          const mergedRight = c < COLS - 1 && (mapData.vDividers[getVDividerKey(r, c)]?.removed || false);

          dividerCells.push(
            <td
              key={`hdiv-${r}-${c}`}
              className={`p-0 transition-colors group/hdiv ${isEditing && !isRemoved ? 'cursor-pointer hover:bg-blue-50' : ''} ${isSelectedDiv ? 'bg-blue-100 ring-1 ring-blue-400' : ''} ${isDragTargetH ? 'bg-blue-200' : ''}`}
              style={{
                height: isRemoved ? (isEditing ? '12px' : '0') : 'auto',
                minHeight: isRemoved ? (isEditing ? '12px' : '0') : '24px',
                borderLeft: mergedLeft ? 'none' : '1px solid #000',
                borderRight: mergedRight ? 'none' : '1px solid #000',
                background: isRemoved
                  ? (isEditing ? '#fef2f2' : 'transparent')
                  : (isSelectedDiv ? '#dbeafe' : isDragTargetH ? '#bfdbfe' : '#f9fafb'),
                position: 'relative',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isEditing || isRemoved) return;
                setSelectedCell(null);
                setSelectedDivider(isSelectedDiv ? null : { type: 'h', key: hKey });
              }}
              onDragOver={(e) => !isRemoved && handleDragOver(e, `hdiv-${hKey}`)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => !isRemoved && handleDrop(e, 'hdivider', hKey)}
              data-testid={`crate-hdiv-${hKey}`}
            >
              {isRemoved && isEditing && (
                <button
                  className="absolute inset-0 flex items-center justify-center text-muted-foreground hover:text-primary"
                  onClick={(e) => { e.stopPropagation(); toggleDivider('h', hKey); }}
                  title="Restore divider"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
              {!isRemoved && isEditing && (
                <button
                  className="absolute bottom-0 left-0 p-0.5 opacity-0 group-hover/hdiv:opacity-100 text-red-400 hover:text-red-600 z-10"
                  onClick={(e) => { e.stopPropagation(); toggleDivider('h', hKey); }}
                  title="Remove divider"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              {!isRemoved && (
                <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-0 px-1">
                  {hDivider?.items?.map(item => renderItemChip(item, 'hdivider', hKey, isEditing, true))}
                  {isEditing && !hDivider?.items?.length && (
                    <div className="h-1 w-full flex items-center justify-center opacity-30 pointer-events-none">
                      <div className="h-0.5 w-8 bg-gray-400 rounded" />
                    </div>
                  )}
                </div>
              )}
            </td>
          );

          if (c < COLS - 1) {
            dividerCells.push(
              <td key={`corner-${r}-${c}`} style={{ width: '24px', minWidth: '24px', background: '#f3f4f6' }} />
            );
          }
        }
        gridElements.push(<tr key={`hdiv-row-${r}`}>{dividerCells}</tr>);
      }
    }

    return (
      <table className="border-collapse" style={{ border: '2px solid #000' }}>
        <tbody>{gridElements}</tbody>
      </table>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-1">
          {onPrev && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPrev} data-testid="btn-prev-crate-map">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
          {editingName ? (
            <input
              ref={nameInputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={() => {
                setEditingName(false);
                if (nameValue.trim() && nameValue !== crateName && onNameChange) {
                  onNameChange(nameValue.trim());
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setEditingName(false);
                  if (nameValue.trim() && nameValue !== crateName && onNameChange) {
                    onNameChange(nameValue.trim());
                  }
                }
                if (e.key === 'Escape') {
                  setNameValue(crateName);
                  setEditingName(false);
                }
              }}
              className="font-display font-bold text-lg bg-transparent border-b-2 border-primary outline-none px-1"
              data-testid="input-crate-map-name"
            />
          ) : (
            <h3
              className="font-display font-bold text-lg cursor-pointer hover:text-primary transition-colors"
              onClick={() => {
                if (onNameChange) {
                  setNameValue(crateName);
                  setEditingName(true);
                  setTimeout(() => nameInputRef.current?.focus(), 0);
                }
              }}
              title="Click to rename"
              data-testid="text-crate-map-name"
            >
              Crate Map — {crateName}
            </h3>
          )}
          {onNext && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNext} data-testid="btn-next-crate-map">
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)} data-testid="btn-crate-map-settings">
            <Settings className="w-4 h-4 mr-1" /> Settings
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} data-testid="btn-crate-map-print">
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
          <Button size="sm" onClick={handleSave} data-testid="btn-crate-map-save">
            Save Map
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {showSettings && (
        <div className="flex-shrink-0 border rounded-lg p-4 mb-3 bg-muted/30 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Orientation</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  variant={mapData.orientation === 'landscape' ? 'default' : 'outline'}
                  size="sm" className="h-7 text-xs"
                  onClick={() => setMapData(prev => ({ ...prev, orientation: 'landscape' }))}
                >
                  Landscape
                </Button>
                <Button
                  variant={mapData.orientation === 'portrait' ? 'default' : 'outline'}
                  size="sm" className="h-7 text-xs"
                  onClick={() => setMapData(prev => ({ ...prev, orientation: 'portrait' }))}
                >
                  Portrait
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Print Title</Label>
              <Input
                value={mapData.printTitle}
                onChange={e => setMapData(prev => ({ ...prev, printTitle: e.target.value }))}
                className="h-8 text-sm mt-1"
                data-testid="input-crate-map-title"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Print Subtext (below title)</Label>
            <Input
              value={mapData.printSubtext}
              onChange={e => setMapData(prev => ({ ...prev, printSubtext: e.target.value }))}
              placeholder="e.g. If you notice any discrepancies, please call..."
              className="h-8 text-sm mt-1"
              data-testid="input-crate-map-subtext"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <Checkbox
                id="subtext-default"
                checked={mapData.printSubtextDefault}
                onCheckedChange={(v) => setMapData(prev => ({ ...prev, printSubtextDefault: !!v }))}
                data-testid="checkbox-subtext-default"
              />
              <label htmlFor="subtext-default" className="text-xs text-muted-foreground cursor-pointer">Set as default for new crate maps</label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="print-date"
              checked={mapData.printDate}
              onCheckedChange={(v) => setMapData(prev => ({ ...prev, printDate: !!v }))}
              data-testid="checkbox-print-date"
            />
            <label htmlFor="print-date" className="text-xs cursor-pointer">Show date on print</label>
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-4 min-h-0">
        <div className="flex-1 flex flex-col items-center justify-start overflow-auto pt-2">
          <div className="mb-2 text-xs text-muted-foreground">
            Click a section to select. Hover divider for delete. Ctrl+←→ or Ctrl+T to cycle sections.
          </div>
          <div>
            {renderGrid(true)}
          </div>
        </div>

        <div className="w-64 flex-shrink-0 border-l pl-4 flex flex-col min-h-0">
          <div className="flex-shrink-0 mb-2">
            <div className="flex items-center gap-1 mb-1">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">
                {selectedCell ? `Add to section ${selectedCell}` : selectedDivider ? `Add to divider ${selectedDivider.key}` : 'Select a section first'}
              </span>
              {(selectedCell || selectedDivider) && (
                <button
                  onClick={openCopyFromCrate}
                  className="ml-auto text-[10px] text-primary hover:underline flex items-center gap-0.5"
                  data-testid="button-copy-from-crate"
                >
                  <Copy className="w-3 h-3" />
                  Copy from crate
                </button>
              )}
            </div>
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search by code or name..."
              className="h-7 text-xs"
              disabled={!selectedCell && !selectedDivider}
              data-testid="input-crate-map-search"
            />
            {(selectedCell || selectedDivider) && filteredSearch.length > 0 && !showCopyFromCrate && (
              <div className="text-[10px] text-muted-foreground mt-1">
                ↑↓ navigate · ←→ qty · Enter add
              </div>
            )}
          </div>

          {showCopyFromCrate ? (
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">Copy from another crate</span>
                <button onClick={() => { setShowCopyFromCrate(false); setSelectedSourceCrate(null); setSelectedSourceSection(null); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {!otherCrates ? (
                <p className="text-xs text-muted-foreground text-center py-4">Loading crates...</p>
              ) : otherCrates.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No other crates with maps found</p>
              ) : !selectedSourceCrate ? (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground mb-1">Select source crate:</p>
                  {otherCrates.map((c: any) => {
                    const md = typeof c.mapData === 'string' ? JSON.parse(c.mapData) : c.mapData;
                    const totalItems = Object.values(md.cells || {}).reduce((sum: number, cell: any) => sum + (cell.items?.length || 0), 0);
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedSourceCrate(c.id)}
                        className="w-full text-left text-xs p-2 rounded border hover:bg-muted/50 hover:border-primary transition-colors"
                        data-testid={`btn-source-crate-${c.id}`}
                      >
                        <div className="font-medium">{c.name}</div>
                        <div className="text-[10px] text-muted-foreground">{totalItems} item(s) mapped</div>
                      </button>
                    );
                  })}
                </div>
              ) : (() => {
                const sourceCrate = otherCrates.find((c: any) => c.id === selectedSourceCrate);
                if (!sourceCrate) return null;
                const md: CrateMapData = typeof sourceCrate.mapData === 'string' ? JSON.parse(sourceCrate.mapData) : sourceCrate.mapData;
                const sections = getSourceSections(md);
                const dividers = getSourceDividers(md);
                const allSources = [
                  ...sections.filter(s => s.items.length > 0).map(s => ({ ...s, sourceType: 'section' as const })),
                  ...dividers.map(d => ({ key: d.key, label: d.label, items: d.items, sourceType: 'divider' as const })),
                ];
                return (
                  <div className="space-y-1">
                    <button
                      onClick={() => { setSelectedSourceCrate(null); setSelectedSourceSection(null); }}
                      className="text-[10px] text-primary hover:underline flex items-center gap-0.5 mb-1"
                    >
                      <ChevronLeft className="w-3 h-3" />
                      Back to crates
                    </button>
                    <p className="text-[10px] text-muted-foreground mb-1">
                      Pick a section from <span className="font-semibold">{sourceCrate.name}</span>:
                    </p>
                    {allSources.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No sections with items</p>
                    ) : allSources.map((source) => (
                      <button
                        key={`${source.sourceType}-${source.key}`}
                        onClick={() => applyCopyFromSource(source.items)}
                        className="w-full text-left text-xs p-2 rounded border hover:bg-primary/5 hover:border-primary transition-colors"
                        data-testid={`btn-source-section-${source.key}`}
                      >
                        <div className="font-medium">{source.label}</div>
                        <div className="text-[10px] text-muted-foreground flex flex-wrap gap-1 mt-0.5">
                          {source.items.map(i => (
                            <span key={i.productId} className="bg-muted px-1 rounded">{i.productCode} x{i.quantity}</span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-0.5">
              {filteredSearch.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {searchQuery ? 'No matches' : (selectedCell || selectedDivider) ? 'All items placed' : 'Select a section'}
                </p>
              ) : (
                filteredSearch.map((item, idx) => {
                  const isHighlighted = idx === highlightedSearchIndex;
                  return (
                    <div
                      key={item.productId}
                      ref={isHighlighted ? highlightedItemRef : undefined}
                      draggable
                      onDragStart={(e) => handleDragStart(e, { productId: item.productId, fromType: 'search', fromKey: '' })}
                      onClick={() => {
                        setHighlightedSearchIndex(idx);
                        if (selectedCell || selectedDivider) addItemToSelection(item);
                      }}
                      className={`w-full text-left text-xs p-1.5 rounded border transition-colors ${
                        isHighlighted
                          ? 'bg-primary/10 border-primary'
                          : 'hover:bg-muted/50 border-transparent hover:border-border'
                      } ${(!selectedCell && !selectedDivider) ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
                      data-testid={`btn-add-item-${item.productId}`}
                    >
                      <div className="flex items-center gap-1">
                        <GripVertical className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
                        <span className="font-mono font-medium">{item.productCode || 'N/A'}</span>
                        {isHighlighted && (selectedCell || selectedDivider) ? (
                          <span className="ml-auto font-semibold text-primary tabular-nums">qty: {pendingQuantity}</span>
                        ) : (
                          <span className="text-muted-foreground ml-1">x {item.quantity}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate pl-4">{item.productName}</div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {unplacedItems.length > 0 && (
            <div className="flex-shrink-0 border-t pt-2 mt-2">
              <span className="text-[10px] text-amber-600 font-medium">{unplacedItems.length} item(s) not placed</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

export function generateCrateMapPrintHtml(mapData: CrateMapData, title?: string): string {
  const ROWS = 2;
  const COLS = 3;
  const isPortrait = mapData.orientation === 'portrait';
  const cellW = isPortrait ? 180 : 220;
  const cellH = isPortrait ? 180 : 140;

  const parent: Record<string, string> = {};
  const find = (x: string): string => {
    if (!parent[x]) parent[x] = x;
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };
  const union = (a: string, b: string) => { parent[find(a)] = find(b); };
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) find(`${r}-${c}`);
  for (let r = 0; r < ROWS - 1; r++)
    for (let c = 0; c < COLS; c++)
      if (mapData.hDividers[`h-${r}-${c}`]?.removed) union(`${r}-${c}`, `${r + 1}-${c}`);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS - 1; c++)
      if (mapData.vDividers[`v-${r}-${c}`]?.removed) union(`${r}-${c}`, `${r}-${c + 1}`);

  const cellGroupMap: Record<string, string> = {};
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) cellGroupMap[`${r}-${c}`] = find(`${r}-${c}`);

  const TABLE_ROWS = ROWS * 2 - 1;
  const TABLE_COLS = COLS * 2 - 1;

  const skip: Record<string, boolean> = {};
  const rendered = new Set<string>();

  const tableRows: string[] = [];
  for (let tr = 0; tr < TABLE_ROWS; tr++) {
    let rowHtml = '<tr>';
    for (let tc = 0; tc < TABLE_COLS; tc++) {
      if (skip[`${tr}-${tc}`]) continue;

      const isCellRow = tr % 2 === 0;
      const isCellCol = tc % 2 === 0;

      if (isCellRow && isCellCol) {
        const r = tr / 2;
        const c = tc / 2;
        const cellKey = `${r}-${c}`;
        const root = cellGroupMap[cellKey];

        if (root !== cellKey) continue;

        const groupCells = Object.entries(cellGroupMap)
          .filter(([_, rt]) => rt === root)
          .map(([k]) => k);
        const gRows = groupCells.map(k => parseInt(k.split('-')[0]));
        const gCols = groupCells.map(k => parseInt(k.split('-')[1]));
        const minR = Math.min(...gRows), maxR = Math.max(...gRows);
        const minC = Math.min(...gCols), maxC = Math.max(...gCols);

        const colspan = (maxC - minC) * 2 + 1;
        const rowspan = (maxR - minR) * 2 + 1;

        for (let sr = tr; sr < tr + rowspan; sr++)
          for (let sc = tc; sc < tc + colspan; sc++)
            skip[`${sr}-${sc}`] = true;

        const allItems: Array<{ productCode: string; quantity: number }> = [];
        for (const ck of groupCells) {
          const cl = mapData.cells[ck] || { items: [] };
          cl.items.forEach(item => allItems.push(item));
        }

        let itemsHtml = '';
        const isMerged = groupCells.length > 1;
        if (allItems.length > 0) {
          if (isMerged) {
            const colCount = Math.min(4, Math.max(1, Math.ceil(allItems.length / 2)));
            const columns: Array<Array<{ productCode: string; quantity: number }>> = [];
            for (let i = 0; i < colCount; i++) columns.push([]);
            allItems.forEach((item, idx) => { columns[idx % colCount].push(item); });
            const colsHtml = columns.map(col =>
              `<div class="cell-items-col">${col.map(i => `<span class="cell-item">${i.productCode} x${i.quantity}</span>`).join('')}</div>`
            ).join('');
            itemsHtml = `<div class="cell-items-merged">${colsHtml}</div>`;
          } else {
            itemsHtml = `<div class="cell-items">${allItems.map(i => `<span class="cell-item">${i.productCode} x${i.quantity}</span>`).join('')}</div>`;
          }
        }

        const spanW = cellW * (maxC - minC + 1) + 4 * (maxC - minC);
        const spanH = cellH * (maxR - minR + 1) + 4 * (maxR - minR);
        const attrs = [
          colspan > 1 ? `colspan="${colspan}"` : '',
          rowspan > 1 ? `rowspan="${rowspan}"` : '',
        ].filter(Boolean).join(' ');
        rowHtml += `<td ${attrs} class="grid-cell" style="width:${spanW}px;height:${spanH}px;">${itemsHtml}</td>`;

      } else if (isCellRow && !isCellCol) {
        const r = tr / 2;
        const c = (tc - 1) / 2;
        const vKey = `v-${r}-${c}`;
        const vDivider = mapData.vDividers[vKey];
        const isRemoved = vDivider?.removed || false;
        if (isRemoved) {
          continue;
        }
        if (vDivider?.items?.length) {
          const vItemsHtml = vDivider.items.map((i: any) =>
            `<span style="display:block;font-size:9px;line-height:1.3;">${i.productCode} x${i.quantity}</span>`
          ).join('');
          rowHtml += `<td class="v-div-items">${vItemsHtml}</td>`;
        } else {
          rowHtml += `<td class="v-div"></td>`;
        }

      } else if (!isCellRow && isCellCol) {
        const r = (tr - 1) / 2;
        const c = tc / 2;
        const hKey = `h-${r}-${c}`;
        const hDivider = mapData.hDividers[hKey];
        const isRemoved = hDivider?.removed || false;
        if (isRemoved) {
          continue;
        }
        if (hDivider?.items?.length) {
          const dItemsHtml = hDivider.items.map((i: any) => `<span>${i.productCode} x${i.quantity}</span>`).join(' ');
          rowHtml += `<td class="h-div-items">${dItemsHtml}</td>`;
        } else {
          rowHtml += `<td class="h-div"></td>`;
        }

      } else {
        rowHtml += `<td class="corner"></td>`;
      }
    }
    rowHtml += '</tr>';
    tableRows.push(rowHtml);
  }

  let html = '';
  html += `<div class="print-title">${title || mapData.printTitle || 'CRATE MAP'}</div>`;
  if (mapData.printDate) html += `<div class="print-date">${new Date().toLocaleDateString('en-CA')}</div>`;
  if (mapData.printSubtext) html += `<div class="print-subtext">${mapData.printSubtext}</div>`;
  html += `<table class="grid-table" cellspacing="0" cellpadding="0">${tableRows.join('')}</table>`;
  return html;
}

export type { CrateMapData };
