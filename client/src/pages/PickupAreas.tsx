import { useEffect, useState, useRef } from 'react';
import { MapPin, Clock, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { loadGoogleMaps, GRIDMART_MAP_STYLES } from '@/lib/googleMaps';

function formatTime12h(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${(minutes || 0).toString().padStart(2, '0')} ${period}`;
}

interface PickupSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface NodeArea {
  id: string;
  name: string;
  city: string;
  center: { lat: number; lng: number };
  zoneNumber: number;
  availabilityNoticeHours?: number;
}

const ZONE_COLORS = [
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#22c55e',
];

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

function generateOffsetCenter(lat: number, lng: number, nodeId: string): { lat: number; lng: number } {
  const maxOffsetKm = 0.4;
  const angle = seededRandom(nodeId + 'angle') * 2 * Math.PI;
  const distance = seededRandom(nodeId + 'dist') * maxOffsetKm;
  const latOffset = (distance * Math.cos(angle)) / 111;
  const lngOffset = (distance * Math.sin(angle)) / (111 * Math.cos(lat * Math.PI / 180));
  return { lat: lat + latOffset, lng: lng + lngOffset };
}

export default function PickupAreas() {
  const [nodeAreas, setNodeAreas] = useState<NodeArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<NodeArea | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slots, setSlots] = useState<PickupSlot[]>([]);
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
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const circlesRef = useRef<google.maps.Circle[]>([]);
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

  useEffect(() => {
    fetch('/api/nodes')
      .then(res => res.json())
      .then(nodes => {
        const areas = nodes
          .filter((n: any) => n.status === 'active' && n.latitude && n.longitude)
          .map((n: any, idx: number) => ({
            id: n.id,
            name: n.name,
            city: n.city,
            center: generateOffsetCenter(parseFloat(n.latitude), parseFloat(n.longitude), n.id),
            zoneNumber: n.zoneNumber || idx + 1,
            availabilityNoticeHours: n.availabilityNoticeHours || 48,
          }));
        setNodeAreas(areas);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!mapsReady || !mapRef.current || nodeAreas.length === 0 || !settingsLoaded) return;

    circlesRef.current.forEach(c => c.setMap(null));
    circlesRef.current = [];

    const defaultCenter = nodeAreas.length > 0 ? nodeAreas[0].center : { lat: 42.3149, lng: -83.0364 };

    const map = new google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 12,
      styles: GRIDMART_MAP_STYLES,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'cooperative',
    });

    hoverOverlaysRef.current.forEach(o => o.setMap(null));
    hoverOverlaysRef.current = [];

    nodeAreas.forEach((area, idx) => {
      const areaId = String(area.id);
      const color = nodeColors[areaId] || ZONE_COLORS[idx % ZONE_COLORS.length];
      const isSelected = selectedZone?.id === area.id;

      const bColor = nodeBorderColors[areaId] || color;
      const fillOp = nodeOpacities[areaId] ?? 0.2;
      const strokeOp = nodeStrokeOpacities[areaId] ?? 1;

      const selFillColor = nodeSelectedFillColors[areaId] || '#f59e0b';
      const selStrokeColor = nodeSelectedStrokeColors[areaId] || '#f59e0b';
      const selFillOp = nodeSelectedFillOpacities[areaId] ?? 0.4;
      const selStrokeOp = nodeSelectedStrokeOpacities[areaId] ?? 1;

      const circle = new google.maps.Circle({
        center: area.center,
        radius: 500,
        strokeColor: isSelected ? selStrokeColor : bColor,
        fillColor: isSelected ? selFillColor : color,
        fillOpacity: isSelected ? selFillOp : fillOp,
        strokeOpacity: isSelected ? selStrokeOp : strokeOp,
        strokeWeight: isSelected ? 4 : 2,
        map,
        clickable: true,
      });

      const hoverText = nodeHoverTexts[areaId] || '';
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

      circle.addListener('click', () => handleZoneClick(area));
      circlesRef.current.push(circle);
    });

    if (nodeAreas.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      nodeAreas.forEach(a => bounds.extend(a.center));
      map.fitBounds(bounds, 50);
    }

    mapInstanceRef.current = map;

    return () => {
      circlesRef.current.forEach(c => c.setMap(null));
      circlesRef.current = [];
      hoverOverlaysRef.current.forEach(o => o.setMap(null));
      hoverOverlaysRef.current = [];
      mapInstanceRef.current = null;
    };
  }, [mapsReady, nodeAreas, nodeColors, nodeBorderColors, nodeOpacities, nodeStrokeOpacities, nodeHoverTexts, nodeSelectedFillColors, nodeSelectedStrokeColors, nodeSelectedFillOpacities, nodeSelectedStrokeOpacities, settingsLoaded]);

  useEffect(() => {
    circlesRef.current.forEach((circle, idx) => {
      if (idx < nodeAreas.length) {
        const areaId = String(nodeAreas[idx].id);
        const isSelected = selectedZone?.id === nodeAreas[idx].id;
        const color = nodeColors[areaId] || ZONE_COLORS[idx % ZONE_COLORS.length];
        const bColor = nodeBorderColors[areaId] || color;
        const fillOp = nodeOpacities[areaId] ?? 0.2;
        const strokeOp = nodeStrokeOpacities[areaId] ?? 1;
        const selFillColor = nodeSelectedFillColors[areaId] || '#f59e0b';
        const selStrokeColor = nodeSelectedStrokeColors[areaId] || '#f59e0b';
        const selFillOp = nodeSelectedFillOpacities[areaId] ?? 0.4;
        const selStrokeOp = nodeSelectedStrokeOpacities[areaId] ?? 1;
        circle.setOptions({
          strokeColor: isSelected ? selStrokeColor : bColor,
          fillColor: isSelected ? selFillColor : color,
          fillOpacity: isSelected ? selFillOp : fillOp,
          strokeOpacity: isSelected ? selStrokeOp : strokeOp,
          strokeWeight: isSelected ? 4 : 2,
        });
      }
    });
  }, [selectedZone?.id, nodeColors, nodeBorderColors, nodeOpacities, nodeStrokeOpacities, nodeSelectedFillColors, nodeSelectedStrokeColors, nodeSelectedFillOpacities, nodeSelectedStrokeOpacities]);

  const filterNext48h = (slots: any[]) => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const todayDate = now.toISOString().split('T')[0];
    const cutoffDate = cutoff.toISOString().split('T')[0];
    return slots.filter((s: any) => s.date >= todayDate && s.date < cutoffDate);
  };

  const fetchSlots = async (nodeId: string) => {
    setSlotsLoading(true);
    setSlots([]);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/pickup-slots`);
      const data = await res.json();
      setSlots(filterNext48h(data.slots || []));
    } catch (error) {
      console.error('Error fetching pickup slots:', error);
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleZoneClick = (area: NodeArea) => {
    setSelectedZone(area);
    fetchSlots(area.id);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter(area.center);
      mapInstanceRef.current.setZoom(13);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="py-12 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center animate-slide-up">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Pickup Zones
            </h1>
            <p className="text-muted-foreground">
              Browse our service areas. Each circle represents an approximate pickup zone
              where your order can be fulfilled. Click a zone to view available pickup times.
            </p>
          </div>
        </div>
      </section>

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <div className="h-[500px] flex items-center justify-center bg-muted/30">
                  <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading pickup zones...</p>
                  </div>
                </div>
              ) : (
                <div
                  ref={mapRef}
                  className="h-[500px] w-full"
                />
              )}
            </CardContent>
          </Card>

          {nodeAreas.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2 justify-center" style={{ opacity: settingsLoaded ? 1 : 0, transition: 'opacity 0.15s ease-in' }}>
              {nodeAreas.map((area, idx) => {
                const color = nodeColors[String(area.id)] || ZONE_COLORS[idx % ZONE_COLORS.length];
                const isSelected = selectedZone?.id === area.id;
                return (
                  <Badge
                    key={area.id}
                    variant="outline"
                    className="text-sm cursor-pointer transition-all hover:scale-105"
                    style={{
                      borderColor: isSelected ? '#f59e0b' : color,
                      color: isSelected ? '#f59e0b' : color,
                      backgroundColor: isSelected ? '#f59e0b15' : 'transparent',
                    }}
                    onClick={() => handleZoneClick(area)}
                  >
                    {area.name}
                  </Badge>
                );
              })}
            </div>
          )}

          {selectedZone && (
            <Card className="mt-6">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-primary" />
                  <span className="font-display font-semibold">
                    {selectedZone.name} - Locked-in Pickup Windows
                  </span>
                </div>

                {slotsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Loading available times...</span>
                  </div>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No pickup windows available right now.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {slots.map((slot, idx) => {
                      const { label, subLabel } = formatSlotDay(slot.date);
                      return (
                        <div
                          key={slot.id || idx}
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border"
                        >
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Clock className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-sm">{label}</div>
                            <div className="text-xs text-muted-foreground">{subLabel}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm">{formatTime12h(slot.startTime)} – {formatTime12h(slot.endTime)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="text-xs text-muted-foreground text-center mt-4 pt-4 border-t">
                  These times are guaranteed and cannot be changed by the host.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              Click a zone on the map or select from the badges above to view available pickup windows.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
