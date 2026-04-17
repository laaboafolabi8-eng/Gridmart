import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { loadGoogleMaps, GRIDMART_MAP_STYLES } from '@/lib/googleMaps';

interface MapPickerProps {
  latitude?: number;
  longitude?: number;
  onLocationSelect: (lat: number, lng: number) => void;
  className?: string;
}

const DEFAULT_CENTER = { lat: 42.3149, lng: -83.0364 };

export function MapPicker({ latitude, longitude, onLocationSelect, className }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadGoogleMaps().then(() => setReady(true)).catch(console.error);
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || mapInstanceRef.current) return;

    const center = latitude && longitude
      ? { lat: latitude, lng: longitude }
      : DEFAULT_CENTER;

    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: 13,
      styles: GRIDMART_MAP_STYLES,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'cooperative',
    });

    if (latitude && longitude) {
      markerRef.current = new google.maps.Marker({
        position: { lat: latitude, lng: longitude },
        map,
      });
    }

    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      updateMarker(map, lat, lng);
      onLocationSelect(lat, lng);
    });

    mapInstanceRef.current = map;

    return () => {
      mapInstanceRef.current = null;
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
    };
  }, [ready]);

  useEffect(() => {
    if (mapInstanceRef.current && latitude && longitude) {
      mapInstanceRef.current.setCenter({ lat: latitude, lng: longitude });
      mapInstanceRef.current.setZoom(15);
      updateMarker(mapInstanceRef.current, latitude, longitude);
    }
  }, [latitude, longitude]);

  function updateMarker(map: google.maps.Map, lat: number, lng: number) {
    if (markerRef.current) {
      markerRef.current.setPosition({ lat, lng });
    } else {
      markerRef.current = new google.maps.Marker({
        position: { lat, lng },
        map,
      });
    }
  }

  const doSearch = useCallback(() => {
    const query = searchQuery.trim();
    if (!query || !mapInstanceRef.current) return;

    setSearching(true);
    const service = new google.maps.places.PlacesService(mapInstanceRef.current);
    service.textSearch(
      { query: query + ', Canada', region: 'ca' },
      (results, status) => {
        setSearching(false);
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
          const place = results[0];
          if (place.geometry?.location) {
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();
            const map = mapInstanceRef.current!;
            map.setCenter({ lat, lng });
            map.setZoom(16);
            updateMarker(map, lat, lng);
            onLocationSelect(lat, lng);
          }
        }
      }
    );
  }, [searchQuery, onLocationSelect]);

  return (
    <div className={className}>
      <div className="space-y-2 mb-3">
        <Label className="text-sm text-muted-foreground block">Search address</Label>
        <div className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                doSearch();
              }
            }}
            placeholder="Type an address and press Enter..."
            data-testid="input-map-search"
          />
          <Button
            type="button"
            variant="outline"
            onClick={doSearch}
            disabled={searching || !searchQuery.trim()}
            data-testid="button-map-search"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div
        ref={mapRef}
        className="w-full h-[300px] rounded-lg border"
        data-testid="map-picker"
      />

      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
        <MapPin className="w-3 h-3" />
        Click on the map or search to set the node location
      </p>
    </div>
  );
}
