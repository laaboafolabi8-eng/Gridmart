import React, { useState, useEffect, useRef, useCallback } from 'react';
import { loadGoogleMaps } from '@/lib/googleMaps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, Copy, MapPin, Loader2, Navigation, Download } from 'lucide-react';
import { MapScreenshotTrigger, MapScreenshotOverlay } from '@/components/map/MapScreenshot';

interface AddressResult {
  address: string;
  distance: number;
  lat: number;
  lon: number;
}

interface SearchStats {
  taggedAddresses: number;
  untaggedBuildings: number;
  estimatedTotal: number;
}

const CANADA_BOUNDS = { south: 41.6, north: 83.1, west: -141.0, east: -52.6 };

function isInCanada(lat: number, lon: number): boolean {
  return lat >= CANADA_BOUNDS.south && lat <= CANADA_BOUNDS.north &&
         lon >= CANADA_BOUNDS.west && lon <= CANADA_BOUNDS.east;
}

interface NodeOption {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
}

export default function FlyerDistribution() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const highlightMarkerRef = useRef<google.maps.Marker | null>(null);
  const addressMarkersRef = useRef<google.maps.Marker[]>([]);
  const buildingMarkersRef = useRef<google.maps.Marker[]>([]);
  const innerCircleRef = useRef<google.maps.Circle | null>(null);
  const outerCircleRef = useRef<google.maps.Circle | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [gmReady, setGmReady] = useState(false);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [innerRadius, setInnerRadius] = useState(0);
  const [outerRadius, setOuterRadius] = useState(500);
  const [addresses, setAddresses] = useState<AddressResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [centerLabel, setCenterLabel] = useState('');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState('');
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [nodeOptions, setNodeOptions] = useState<NodeOption[]>([]);
  const [showScreenshot, setShowScreenshot] = useState(false);

  useEffect(() => {
    fetch('/api/nodes', { credentials: 'include' })
      .then(res => res.json())
      .then((nodes: any[]) => {
        const opts = nodes
          .filter((n: any) => n.latitude && n.longitude && n.status === 'active')
          .map((n: any) => ({
            id: n.id,
            name: n.name,
            address: n.address || '',
            city: n.city || '',
            lat: parseFloat(n.latitude),
            lng: parseFloat(n.longitude),
          }))
          .sort((a: NodeOption, b: NodeOption) => a.name.localeCompare(b.name));
        setNodeOptions(opts);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadGoogleMaps().then(() => setGmReady(true)).catch(console.error);
  }, []);

  useEffect(() => {
    if (!gmReady || !mapRef.current || mapInstance.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 42.3149, lng: -83.0364 },
      zoom: 14,
      styles: [
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'poi.park', stylers: [{ visibility: 'simplified' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
      ],
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapInstance.current = map;

    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        setCenter(pos);
        updateMarker(pos);
        reverseGeocode(pos);
      }
    });

    if (searchInputRef.current) {
      const ac = new google.maps.places.Autocomplete(searchInputRef.current, {
        fields: ['geometry', 'formatted_address'],
        componentRestrictions: { country: 'ca' },
      });
      ac.bindTo('bounds', map);
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (place.geometry?.location) {
          const pos = {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          };
          setCenter(pos);
          setCenterLabel(place.formatted_address || '');
          setSearchText(place.formatted_address || '');
          updateMarker(pos);
          map.panTo(pos);
          map.setZoom(15);
        }
      });
      autocompleteRef.current = ac;
    }
  }, [gmReady]);

  const updateMarker = useCallback((pos: { lat: number; lng: number }) => {
    if (!mapInstance.current) return;
    if (markerRef.current) {
      markerRef.current.setPosition(pos);
    } else {
      markerRef.current = new google.maps.Marker({
        position: pos,
        map: mapInstance.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#0d9488',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
      });
    }
  }, []);

  const handleNodeSelect = useCallback((nodeId: string) => {
    if (!nodeId) return;
    const node = nodeOptions.find(n => n.id === nodeId);
    if (!node) return;
    const pos = { lat: node.lat, lng: node.lng };
    setCenter(pos);
    const label = `${node.name} — ${node.address}${node.city ? ', ' + node.city : ''}`;
    setCenterLabel(label);
    setSearchText(label);
    updateMarker(pos);
    if (mapInstance.current) {
      mapInstance.current.panTo(pos);
      mapInstance.current.setZoom(15);
    }
  }, [nodeOptions, updateMarker]);

  const clearAddressMarkers = useCallback(() => {
    addressMarkersRef.current.forEach(m => m.setMap(null));
    addressMarkersRef.current = [];
  }, []);

  const clearBuildingMarkers = useCallback(() => {
    buildingMarkersRef.current.forEach(m => m.setMap(null));
    buildingMarkersRef.current = [];
  }, []);

  const showAddressMarkers = useCallback((addrs: AddressResult[]) => {
    clearAddressMarkers();
    if (!mapInstance.current || addrs.length === 0) return;
    addrs.forEach((addr, i) => {
      const num = i + 1;
      const marker = new google.maps.Marker({
        position: { lat: addr.lat, lng: addr.lon },
        map: mapInstance.current!,
        label: {
          text: String(num),
          color: '#fff',
          fontSize: '11px',
          fontWeight: 'bold',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: '#0d9488',
          fillOpacity: 0.85,
          strokeColor: '#fff',
          strokeWeight: 1.5,
        },
        title: addr.address,
        zIndex: 100,
      });
      addressMarkersRef.current.push(marker);
    });
  }, [clearAddressMarkers]);

  const showBuildingMarkers = useCallback((buildings: Array<{ lat: number; lon: number }>) => {
    clearBuildingMarkers();
    if (!mapInstance.current || buildings.length === 0) return;
    buildings.forEach(b => {
      const marker = new google.maps.Marker({
        position: { lat: b.lat, lng: b.lon },
        map: mapInstance.current!,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#f97316',
          fillOpacity: 0.7,
          strokeColor: '#fff',
          strokeWeight: 1,
        },
        zIndex: 50,
      });
      buildingMarkersRef.current.push(marker);
    });
  }, [clearBuildingMarkers]);

  const showHighlight = useCallback((addr: AddressResult | null) => {
    if (!mapInstance.current) return;
    if (!addr) {
      if (highlightMarkerRef.current) {
        highlightMarkerRef.current.setMap(null);
        highlightMarkerRef.current = null;
      }
      return;
    }
    const pos = { lat: addr.lat, lng: addr.lon };
    if (highlightMarkerRef.current) {
      highlightMarkerRef.current.setPosition(pos);
      highlightMarkerRef.current.setMap(mapInstance.current);
    } else {
      highlightMarkerRef.current = new google.maps.Marker({
        position: pos,
        map: mapInstance.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#ef4444',
          fillOpacity: 0.9,
          strokeColor: '#fff',
          strokeWeight: 3,
        },
        zIndex: 999,
      });
    }
  }, []);

  const reverseGeocode = useCallback((pos: { lat: number; lng: number }) => {
    setCenterLabel(`${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
  }, []);

  useEffect(() => {
    if (!mapInstance.current || !center) return;

    if (outerCircleRef.current) outerCircleRef.current.setMap(null);
    if (innerCircleRef.current) innerCircleRef.current.setMap(null);

    outerCircleRef.current = new google.maps.Circle({
      map: mapInstance.current,
      center,
      radius: outerRadius,
      fillColor: '#0d9488',
      fillOpacity: 0.12,
      strokeColor: '#0d9488',
      strokeWeight: 2,
      strokeOpacity: 0.6,
      clickable: false,
    });

    if (innerRadius > 0) {
      innerCircleRef.current = new google.maps.Circle({
        map: mapInstance.current,
        center,
        radius: innerRadius,
        fillColor: '#ffffff',
        fillOpacity: 0.8,
        strokeColor: '#ef4444',
        strokeWeight: 1.5,
        strokeOpacity: 0.5,
        clickable: false,
      });
    }

    const bounds = outerCircleRef.current.getBounds();
    if (bounds) mapInstance.current.fitBounds(bounds);
  }, [center, innerRadius, outerRadius]);

  const fetchAddresses = useCallback(async () => {
    if (!center) {
      toast.error('Click or search for a location on the map first');
      return;
    }

    if (!isInCanada(center.lat, center.lng)) {
      toast.error('Please select a location within Canada');
      return;
    }

    setLoading(true);
    setAddresses([]);
    setStats(null);
    setHoveredIndex(null);
    showHighlight(null);
    clearAddressMarkers();
    clearBuildingMarkers();
    setProgress('Fetching addresses from OpenStreetMap...');

    const results: AddressResult[] = [];
    const seen = new Set<string>();
    const untaggedBuildingCoords: Array<{ lat: number; lon: number }> = [];

    try {
      const query = `
        [out:json][timeout:45];
        (
          node["addr:housenumber"](around:${outerRadius},${center.lat},${center.lng});
          way["addr:housenumber"](around:${outerRadius},${center.lat},${center.lng});
          relation["addr:housenumber"](around:${outerRadius},${center.lat},${center.lng});
          way["building"](around:${outerRadius},${center.lat},${center.lng});
          relation["building"](around:${outerRadius},${center.lat},${center.lng});
        );
        out center tags;
      `;

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (response.ok) {
        const data = await response.json();
        const addressCoords = new Set<string>();

        for (const element of data.elements) {
          const tags = element.tags || {};
          const lat = element.lat || element.center?.lat;
          const lon = element.lon || element.center?.lon;
          if (!lat || !lon) continue;
          if (!isInCanada(lat, lon)) continue;

          const country = tags['addr:country'];
          if (country && country.toUpperCase() !== 'CA' && country.toUpperCase() !== 'CANADA') continue;

          const dist = haversine(center.lat, center.lng, lat, lon);
          if (dist < innerRadius || dist > outerRadius) continue;

          if (tags['addr:housenumber']) {
            const street = tags['addr:street'] || '';
            const parts = [tags['addr:housenumber']];
            if (street) parts.push(street);
            if (tags['addr:city']) parts.push(tags['addr:city']);
            if (tags['addr:province'] || tags['addr:state']) parts.push(tags['addr:province'] || tags['addr:state']);
            if (tags['addr:postcode']) parts.push(tags['addr:postcode']);
            const addr = parts.join(', ');

            if (!seen.has(addr)) {
              seen.add(addr);
              addressCoords.add(`${lat.toFixed(5)},${lon.toFixed(5)}`);
              results.push({ address: addr, distance: Math.round(dist), lat, lon });
            }
          } else if (tags['building']) {
            const coordKey = `${lat.toFixed(5)},${lon.toFixed(5)}`;
            const bType = tags['building'];
            const isResidential = ['yes', 'residential', 'house', 'detached', 'semidetached_house',
              'apartments', 'terrace', 'townhouse', 'duplex', 'triplex'].includes(bType);
            if (isResidential && !addressCoords.has(coordKey)) {
              untaggedBuildingCoords.push({ lat, lon });
            }
          }
        }
      }
    } catch (err) {
      console.error('OSM fetch error:', err);
      toast.error('Failed to fetch addresses. Please try again.');
    }

    results.sort((a, b) => a.distance - b.distance);
    setAddresses(results);
    showAddressMarkers(results);
    showBuildingMarkers(untaggedBuildingCoords);
    setStats({
      taggedAddresses: results.length,
      untaggedBuildings: untaggedBuildingCoords.length,
      estimatedTotal: results.length + untaggedBuildingCoords.length,
    });
    setProgress('');

    if (results.length === 0 && untaggedBuildingCoords.length === 0) {
      toast.info('No addresses found in the selected range. Try a larger radius or different area.');
    } else {
      const msg = results.length > 0
        ? `Found ${results.length} address${results.length !== 1 ? 'es' : ''}` +
          (untaggedBuildingCoords.length > 0 ? ` + ~${untaggedBuildingCoords.length} additional buildings` : '')
        : `Found ~${untaggedBuildingCoords.length} residential buildings (no tagged addresses in this area)`;
      toast.success(msg);
    }

    setLoading(false);
  }, [center, innerRadius, outerRadius, showHighlight, clearAddressMarkers, clearBuildingMarkers, showAddressMarkers, showBuildingMarkers]);

  const handleAddressHover = useCallback((index: number | null) => {
    setHoveredIndex(index);
    if (index !== null && addresses[index]) {
      showHighlight(addresses[index]);
    } else {
      showHighlight(null);
    }
  }, [addresses, showHighlight]);

  const copyAddresses = useCallback(() => {
    if (addresses.length === 0) return;
    const text = addresses.map(a => a.address).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${addresses.length} address${addresses.length !== 1 ? 'es' : ''} copied to clipboard`);
    });
  }, [addresses]);

  const downloadCsv = useCallback(() => {
    if (addresses.length === 0) return;
    const header = 'Address,Distance (m),Latitude,Longitude\n';
    const rows = addresses.map(a => `"${a.address}",${a.distance},${a.lat},${a.lon}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flyer-addresses-${innerRadius}m-${outerRadius}m.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [addresses, innerRadius, outerRadius]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Navigation className="w-5 h-5" />
                Location & Radius
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {nodeOptions.length > 0 && (
                <div className="space-y-2">
                  <Label>Jump to Node</Label>
                  <Select onValueChange={handleNodeSelect}>
                    <SelectTrigger data-testid="flyer-node-select">
                      <SelectValue placeholder="Select a node location..." />
                    </SelectTrigger>
                    <SelectContent>
                      {nodeOptions.map(n => (
                        <SelectItem key={n.id} value={n.id}>
                          {n.name} — {n.address}{n.city ? `, ${n.city}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Search Location</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search a Canadian address or click the map..."
                    className="pl-9"
                    data-testid="flyer-search-input"
                  />
                </div>
                {centerLabel && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {centerLabel}
                  </p>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Inner Radius (excluded zone)</Label>
                    <Badge variant="secondary" className="font-mono">{innerRadius}m</Badge>
                  </div>
                  <Slider
                    value={[innerRadius]}
                    onValueChange={([v]) => setInnerRadius(Math.min(v, outerRadius - 50))}
                    min={0}
                    max={2000}
                    step={25}
                    data-testid="inner-radius-slider"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Outer Radius</Label>
                    <Badge variant="secondary" className="font-mono">{outerRadius}m</Badge>
                  </div>
                  <Slider
                    value={[outerRadius]}
                    onValueChange={([v]) => setOuterRadius(Math.max(v, innerRadius + 50))}
                    min={100}
                    max={5000}
                    step={25}
                    data-testid="outer-radius-slider"
                  />
                </div>

                <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                  {innerRadius > 0 ? (
                    <>Donut zone: <strong>{innerRadius}m</strong> – <strong>{outerRadius}m</strong> from center</>
                  ) : (
                    <>Full circle: <strong>0</strong> – <strong>{outerRadius}m</strong> from center</>
                  )}
                </div>
              </div>

              <Button
                onClick={fetchAddresses}
                disabled={!center || loading}
                className="w-full"
                data-testid="fetch-addresses-btn"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching...</>
                ) : (
                  <><Search className="w-4 h-4 mr-2" /> Find Addresses</>
                )}
              </Button>
              {progress && (
                <p className="text-xs text-muted-foreground text-center">{progress}</p>
              )}
            </CardContent>
          </Card>

          {stats && (
            <Card>
              <CardContent className="py-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-primary">{stats.taggedAddresses}</div>
                    <div className="text-xs text-muted-foreground">Confirmed Addresses</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-orange-500">~{stats.untaggedBuildings}</div>
                    <div className="text-xs text-muted-foreground">Additional Buildings</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">~{stats.estimatedTotal}</div>
                    <div className="text-xs text-muted-foreground">Estimated Total</div>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-full bg-primary"></span>
                    Confirmed (numbered)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-full bg-orange-500"></span>
                    Buildings (no address data)
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {addresses.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    Addresses
                    <Badge variant="secondary" className="ml-2">{addresses.length}</Badge>
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={copyAddresses} data-testid="copy-addresses-btn">
                      <Copy className="w-4 h-4 mr-1" /> Copy All
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadCsv} data-testid="download-csv-btn">
                      <Download className="w-4 h-4 mr-1" /> CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-y-auto space-y-1 border rounded-lg p-2" data-testid="address-list">
                  {addresses.map((a, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between py-1.5 px-2 rounded text-sm cursor-pointer transition-colors ${
                        hoveredIndex === i ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/50'
                      }`}
                      onMouseEnter={() => handleAddressHover(i)}
                      onMouseLeave={() => handleAddressHover(null)}
                      data-testid={`address-item-${i}`}
                    >
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold shrink-0 mr-2">{i + 1}</span>
                      <span className="flex-1 mr-2">{a.address}</span>
                      <Badge variant="outline" className="font-mono text-xs shrink-0">{a.distance}m</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:w-[55%]">
          <Card className="h-full">
            <CardContent className="p-0 h-full min-h-[500px] relative">
              <MapScreenshotTrigger onActivate={() => setShowScreenshot(true)} />
              <div ref={mapRef} className="w-full h-full min-h-[500px] rounded-lg" data-testid="flyer-map" />
              {showScreenshot && (
                <MapScreenshotOverlay
                  mapContainerRef={mapRef}
                  filename="flyer-distribution-map"
                  onClose={() => setShowScreenshot(false)}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
