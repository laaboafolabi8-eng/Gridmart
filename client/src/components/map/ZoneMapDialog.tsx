import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Map, Clock, Loader2 } from 'lucide-react';
import { loadGoogleMaps, GRIDMART_MAP_STYLES } from '@/lib/googleMaps';

interface PickupSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface ZoneNode {
  id: string | number;
  name: string;
  city: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  zoneNumber: number;
  stockQuantity: number;
  availabilityNoticeHours?: number;
}

interface ZoneMapDialogProps {
  nodes: ZoneNode[];
  trigger?: React.ReactNode;
  highlightedZoneNumber?: number | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  selectable?: boolean;
  onSelectNode?: (nodeId: string | number) => void;
  onSelectSlot?: (nodeId: string | number, slot: PickupSlot) => void;
}

const DEFAULT_CENTER = { lat: 42.3149, lng: -83.0364 };
const ZONE_RADIUS = 500;

function formatTime12h(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

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

function generateOffsetCenter(lat: number, lng: number, nodeId: string | number): { lat: number; lng: number } {
  const maxOffsetKm = 0.4;
  const id = String(nodeId);
  const angle = seededRandom(id + 'angle') * 2 * Math.PI;
  const distance = seededRandom(id + 'dist') * maxOffsetKm;
  const latOffset = (distance * Math.cos(angle)) / 111;
  const lngOffset = (distance * Math.sin(angle)) / (111 * Math.cos(lat * Math.PI / 180));
  return { lat: lat + latOffset, lng: lng + lngOffset };
}

const ZONE_COLORS = [
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#22c55e',
];

const HIGHLIGHT_COLOR = '#f59e0b';

function formatSlotDay(dateStr: string): { label: string; subLabel: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [year, month, day] = dateStr.split('-').map(Number);
  const slotDate = new Date(year, month - 1, day);
  slotDate.setHours(0, 0, 0, 0);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formattedDate = `${monthNames[slotDate.getMonth()]} ${slotDate.getDate()}`;
  if (slotDate.getTime() === today.getTime()) return { label: 'Today', subLabel: formattedDate };
  if (slotDate.getTime() === tomorrow.getTime()) return { label: 'Tomorrow', subLabel: formattedDate };
  return { label: dayNames[slotDate.getDay()], subLabel: formattedDate };
}

export function ZoneMapDialog({ nodes, trigger, highlightedZoneNumber, open: controlledOpen, onOpenChange: controlledOnOpenChange, selectable, onSelectNode, onSelectSlot }: ZoneMapDialogProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const [selectedZone, setSelectedZone] = useState<number | null>(highlightedZoneNumber || null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedNodeSlots, setSelectedNodeSlots] = useState<PickupSlot[]>([]);
  const [selectedNodeData, setSelectedNodeData] = useState<ZoneNode | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<PickupSlot | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [nodeColors, setNodeColors] = useState<Record<string, string>>({});
  const [nodeBorderColors, setNodeBorderColors] = useState<Record<string, string>>({});
  const [nodeOpacities, setNodeOpacities] = useState<Record<string, number>>({});
  const [nodeStrokeOpacities, setNodeStrokeOpacities] = useState<Record<string, number>>({});
  const [nodeHoverTexts, setNodeHoverTexts] = useState<Record<string, string>>({});
  const [nodeSelectedFillColors, setNodeSelectedFillColors] = useState<Record<string, string>>({});
  const [nodeSelectedStrokeColors, setNodeSelectedStrokeColors] = useState<Record<string, string>>({});
  const [nodeSelectedFillOpacities, setNodeSelectedFillOpacities] = useState<Record<string, number>>({});
  const [nodeSelectedStrokeOpacities, setNodeSelectedStrokeOpacities] = useState<Record<string, number>>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const hoverOverlaysRef = useRef<google.maps.OverlayView[]>([]);

  useEffect(() => {
    loadGoogleMaps().then(() => setMapsReady(true)).catch(console.error);
  }, []);

  useEffect(() => {
    fetch('/api/site-settings')
      .then(res => res.json())
      .then(settings => {
        if (settings.nodeColors) {
          try { setNodeColors(JSON.parse(settings.nodeColors)); } catch {}
        }
        if (settings.nodeBorderColors) {
          try { setNodeBorderColors(JSON.parse(settings.nodeBorderColors)); } catch {}
        }
        if (settings.nodeOpacities) {
          try { setNodeOpacities(JSON.parse(settings.nodeOpacities)); } catch {}
        }
        if (settings.nodeStrokeOpacities) {
          try { setNodeStrokeOpacities(JSON.parse(settings.nodeStrokeOpacities)); } catch {}
        }
        if (settings.nodeHoverTexts) {
          try { setNodeHoverTexts(JSON.parse(settings.nodeHoverTexts)); } catch {}
        }
        if (settings.nodeSelectedFillColors) {
          try { setNodeSelectedFillColors(JSON.parse(settings.nodeSelectedFillColors)); } catch {}
        }
        if (settings.nodeSelectedStrokeColors) {
          try { setNodeSelectedStrokeColors(JSON.parse(settings.nodeSelectedStrokeColors)); } catch {}
        }
        if (settings.nodeSelectedFillOpacities) {
          try { setNodeSelectedFillOpacities(JSON.parse(settings.nodeSelectedFillOpacities)); } catch {}
        }
        if (settings.nodeSelectedStrokeOpacities) {
          try { setNodeSelectedStrokeOpacities(JSON.parse(settings.nodeSelectedStrokeOpacities)); } catch {}
        }
        setSettingsLoaded(true);
      })
      .catch(() => { setSettingsLoaded(true); });
  }, []);

  const fetchNodeSlots = async (nodeId: string | number) => {
    setSlotsLoading(true);
    setSelectedNodeSlots([]);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/pickup-slots`);
      const data = await res.json();
      const now = new Date();
      const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const todayDate = now.toISOString().split('T')[0];
      const cutoffDate = cutoff.toISOString().split('T')[0];
      const filtered = (data.slots || []).filter((s: any) => s.date >= todayDate && s.date < cutoffDate);
      setSelectedNodeSlots(filtered);
    } catch (error) {
      console.error('Error fetching pickup slots:', error);
      setSelectedNodeSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleZoneSelect = (node: ZoneNode) => {
    setSelectedZone(node.zoneNumber);
    setSelectedNodeData(node);
    setSelectedSlot(null);
    fetchNodeSlots(node.id);
    updateCircleHighlight(node.zoneNumber);
    if (mapInstanceRef.current && node.latitude && node.longitude) {
      mapInstanceRef.current.setCenter({ lat: Number(node.latitude), lng: Number(node.longitude) });
      mapInstanceRef.current.setZoom(12);
    }
  };

  const updateCircleHighlight = (zoneNumber: number | null) => {
    const validNodes = nodes.filter(n => n.latitude != null && n.longitude != null);
    circlesRef.current.forEach((circle, idx) => {
      if (idx < validNodes.length) {
        const nId = String(validNodes[idx].id);
        const isHighlighted = zoneNumber === validNodes[idx].zoneNumber;
        const baseColor = nodeColors[nId] || ZONE_COLORS[idx % ZONE_COLORS.length];
        const baseBorderColor = nodeBorderColors[nId] || baseColor;
        const baseOpacity = nodeOpacities[nId] ?? 0.15;
        const baseStrokeOpacity = nodeStrokeOpacities[nId] ?? 1;
        const selFillColor = nodeSelectedFillColors[nId] || HIGHLIGHT_COLOR;
        const selStrokeColor = nodeSelectedStrokeColors[nId] || HIGHLIGHT_COLOR;
        const selFillOp = nodeSelectedFillOpacities[nId] ?? 0.4;
        const selStrokeOp = nodeSelectedStrokeOpacities[nId] ?? 1;
        circle.setOptions({
          strokeColor: isHighlighted ? selStrokeColor : baseBorderColor,
          fillColor: isHighlighted ? selFillColor : baseColor,
          fillOpacity: isHighlighted ? selFillOp : baseOpacity,
          strokeOpacity: isHighlighted ? selStrokeOp : baseStrokeOpacity,
          strokeWeight: isHighlighted ? 4 : 2,
        });
      }
    });
  };

  const handleSave = () => {
    if (selectedNodeData && selectable) {
      onSelectNode?.(selectedNodeData.id);
      if (selectedSlot) {
        onSelectSlot?.(selectedNodeData.id, selectedSlot);
      }
    }
    controlledOnOpenChange?.(false);
  };

  const cleanupMap = () => {
    circlesRef.current.forEach(c => c.setMap(null));
    circlesRef.current = [];
    hoverOverlaysRef.current.forEach(o => o.setMap(null));
    hoverOverlaysRef.current = [];
    mapInstanceRef.current = null;
  };

  useEffect(() => {
    return cleanupMap;
  }, []);

  const initializeMap = (zoneToHighlight: number | null = null) => {
    setTimeout(() => {
      if (!mapRef.current || !mapsReady || !settingsLoaded) return;
      cleanupMap();

      const validNodes = nodes.filter(n => n.latitude != null && n.longitude != null);
      const highlightedNode = zoneToHighlight ? validNodes.find(n => n.zoneNumber === zoneToHighlight) : null;

      const center = highlightedNode
        ? { lat: Number(highlightedNode.latitude), lng: Number(highlightedNode.longitude) }
        : validNodes.length > 0
          ? { lat: Number(validNodes[0].latitude), lng: Number(validNodes[0].longitude) }
          : DEFAULT_CENTER;

      const zoomLevel = highlightedNode ? 12 : 11;
      const map = new google.maps.Map(mapRef.current!, {
        center,
        zoom: zoomLevel,
        styles: GRIDMART_MAP_STYLES,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
      });

      validNodes.forEach((node, idx) => {
        const lat = Number(node.latitude);
        const lng = Number(node.longitude);
        const nId = String(node.id);
        const isHighlighted = zoneToHighlight === node.zoneNumber;
        const baseColor = nodeColors[nId] || ZONE_COLORS[idx % ZONE_COLORS.length];
        const baseBorderColor = nodeBorderColors[nId] || baseColor;
        const baseOpacity = nodeOpacities[nId] ?? 0.15;
        const baseStrokeOpacity = nodeStrokeOpacities[nId] ?? 1;
        const selFillColor = nodeSelectedFillColors[nId] || HIGHLIGHT_COLOR;
        const selStrokeColor = nodeSelectedStrokeColors[nId] || HIGHLIGHT_COLOR;
        const selFillOp = nodeSelectedFillOpacities[nId] ?? 0.4;
        const selStrokeOp = nodeSelectedStrokeOpacities[nId] ?? 1;

        const offsetCenter = generateOffsetCenter(lat, lng, node.id);

        const circle = new google.maps.Circle({
          center: offsetCenter,
          radius: ZONE_RADIUS,
          strokeColor: isHighlighted ? selStrokeColor : baseBorderColor,
          fillColor: isHighlighted ? selFillColor : baseColor,
          fillOpacity: isHighlighted ? selFillOp : baseOpacity,
          strokeOpacity: isHighlighted ? selStrokeOp : baseStrokeOpacity,
          strokeWeight: isHighlighted ? 4 : 2,
          map,
          clickable: true,
        });

        const hoverText = nodeHoverTexts[nId] || '';
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
              if (pos) { hoverDiv.style.left = pos.x + 'px'; hoverDiv.style.top = pos.y + 'px'; }
            }
            show() { if (hoverDiv) hoverDiv.style.opacity = '1'; }
            hide() { if (hoverDiv) hoverDiv.style.opacity = '0'; }
            onRemove() { hoverDiv?.remove(); hoverDiv = null; }
          };
          const hoverOverlay = new HoverOverlay();
          hoverOverlay.setMap(map);
          circle.addListener('mouseover', () => { hoverOverlay.show(); hoverOverlay.draw(); });
          circle.addListener('mouseout', () => { hoverOverlay.hide(); });
          hoverOverlaysRef.current.push(hoverOverlay);
        }

        circle.addListener('click', () => {
          setSelectedZone(node.zoneNumber);
          setSelectedNodeData(node);
          setSelectedSlot(null);
          fetchNodeSlots(node.id);
          updateCircleHighlight(node.zoneNumber);
        });

        circlesRef.current.push(circle);
      });

      if (!highlightedNode && validNodes.length > 1) {
        const bounds = new google.maps.LatLngBounds();
        validNodes.forEach(n => bounds.extend({ lat: Number(n.latitude), lng: Number(n.longitude) }));
        map.fitBounds(bounds, 50);
      }

      mapInstanceRef.current = map;
    }, 100);
  };

  useEffect(() => {
    if (controlledOpen && mapsReady) {
      setSelectedZone(highlightedZoneNumber || null);
      initializeMap(highlightedZoneNumber || null);
    } else {
      cleanupMap();
    }
  }, [controlledOpen, highlightedZoneNumber, mapsReady, nodeColors, nodeBorderColors, nodeOpacities, nodeStrokeOpacities, nodeHoverTexts, nodeSelectedFillColors, nodeSelectedStrokeColors, nodeSelectedFillOpacities, nodeSelectedStrokeOpacities, settingsLoaded]);

  const handleOpenChange = (open: boolean) => {
    if (open && mapsReady) {
      initializeMap();
    } else {
      cleanupMap();
      setSelectedNodeData(null);
      setSelectedNodeSlots([]);
      setSelectedSlot(null);
    }
    controlledOnOpenChange?.(open);
  };

  const isControlled = controlledOpen !== undefined;

  return (
    <Dialog open={isControlled ? controlledOpen : undefined} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="ghost" size="sm" className="gap-1 text-primary">
              <Map className="w-4 h-4" />
              View Map
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-display">Pickup Zones</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto max-h-[70vh] pr-2">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This product is available in the following pickup zones. Exact addresses are provided after checkout.
            </p>
            <div
              ref={mapRef}
              className="h-[300px] rounded-lg overflow-hidden border"
            />
          <div className="flex flex-wrap gap-2">
            {nodes.map((node, idx) => {
              const isSelected = selectedZone === node.zoneNumber;
              const baseColor = nodeColors[String(node.id)] || ZONE_COLORS[idx % ZONE_COLORS.length];
              const displayColor = isSelected ? HIGHLIGHT_COLOR : baseColor;
              return (
                <Badge
                  key={node.id}
                  variant="outline"
                  className="text-sm cursor-pointer transition-all hover:scale-105"
                  style={{
                    borderColor: displayColor,
                    color: displayColor,
                    backgroundColor: isSelected ? `${HIGHLIGHT_COLOR}15` : 'transparent'
                  }}
                  onClick={() => handleZoneSelect(node)}
                >
                  {node.name} ({node.stockQuantity > 5 ? '5+' : node.stockQuantity} in stock)
                </Badge>
              );
            })}
          </div>

          {selectedNodeData && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-primary" />
                <span className="font-display font-medium text-sm">
                  {selectedNodeData.name} - Locked-in Pickup Windows
                </span>
              </div>

              {slotsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading available times...</span>
                </div>
              ) : selectedNodeSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No pickup windows available right now. Check back later!
                </p>
              ) : (
                <ScrollArea className="max-h-[40vh]">
                  <div className="space-y-3">
                    {(() => {
                      const guaranteedSlots = selectedNodeSlots;
                      const groupedByDate: Record<string, PickupSlot[]> = {};
                      guaranteedSlots.forEach(slot => {
                        if (!groupedByDate[slot.date]) groupedByDate[slot.date] = [];
                        groupedByDate[slot.date].push(slot);
                      });
                      const sortedDates = Object.keys(groupedByDate).sort();

                      return sortedDates.map(date => {
                        const { label, subLabel } = formatSlotDay(date);
                        const slotsForDate = groupedByDate[date];

                        return (
                          <div
                            key={date}
                            className="border rounded-lg p-3 bg-muted/30"
                          >
                            <div className="font-medium text-sm mb-2 pb-2 border-b">
                              {label} <span className="text-muted-foreground font-normal">• {subLabel}</span>
                            </div>
                            <div className="space-y-1">
                              {slotsForDate.map((slot, idx) => {
                                const isSlotSelected = selectedSlot?.id === slot.id;
                                return (
                                  <button
                                    key={slot.id || idx}
                                    className={`w-full flex items-center gap-2 p-2 rounded text-left transition-all hover:bg-primary/10 ${
                                      isSlotSelected ? 'bg-primary/15 ring-1 ring-primary' : 'bg-background'
                                    }`}
                                    onClick={() => setSelectedSlot(slot)}
                                    data-testid={`button-map-slot-${slot.id || idx}`}
                                  >
                                    <Clock className={`w-4 h-4 shrink-0 ${isSlotSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                                    <span className="text-sm">{formatTime12h(slot.startTime)} – {formatTime12h(slot.endTime)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </ScrollArea>
              )}

              <p className="text-xs text-muted-foreground text-center mt-3 pt-3 border-t">
                These times are guaranteed and cannot be changed by the host.
              </p>
            </div>
          )}

          {selectable && (
            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
              <Button
                variant="outline"
                onClick={() => controlledOnOpenChange?.(false)}
                data-testid="button-map-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!selectedNodeData || (selectedNodeSlots.length > 0 && !selectedSlot)}
                data-testid="button-map-save"
              >
                Confirm Selection
              </Button>
            </div>
          )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
