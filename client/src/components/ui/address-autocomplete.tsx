/// <reference types="@types/google.maps" />
import { useEffect, useRef, useCallback } from 'react';
import { Input } from './input';
import { cn } from '@/lib/utils';
import { loadGoogleMaps } from '@/lib/googleMaps';

type PlaceResult = google.maps.places.PlaceResult;
type AddressComponent = google.maps.GeocoderAddressComponent;

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelected?: (place: PlaceResult) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'data-testid'?: string;
  countries?: string[];
}

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  onKeyDown,
  placeholder = 'Enter address...',
  className,
  disabled,
  'data-testid': testId,
  countries = ['ca', 'us'],
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const suppressNextOnChange = useRef(false);
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  onPlaceSelectedRef.current = onPlaceSelected;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!inputRef.current) return;

    let mounted = true;
    const currentInput = inputRef.current;

    loadGoogleMaps().then(() => {
      if (!mounted || !currentInput) return;

      if (autocompleteRef.current) {
        try { google.maps.event.clearInstanceListeners(autocompleteRef.current); } catch {}
        autocompleteRef.current = null;
      }

      try {
        const autocomplete = new google.maps.places.Autocomplete(currentInput, {
          types: ['address'],
          componentRestrictions: { country: countries },
          fields: ['formatted_address', 'geometry', 'address_components', 'place_id'],
        });

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (place.formatted_address) {
            suppressNextOnChange.current = true;
            if (inputRef.current) {
              inputRef.current.value = place.formatted_address;
            }
            onChangeRef.current(place.formatted_address);
          }
          onPlaceSelectedRef.current?.(place);
        });

        autocompleteRef.current = autocomplete;
      } catch (e) {
        console.warn('Google Places Autocomplete init error:', e);
      }
    }).catch((e) => {
      console.warn('Failed to load Google Maps:', e);
    });

    return () => {
      mounted = false;
      if (autocompleteRef.current) {
        try { google.maps.event.clearInstanceListeners(autocompleteRef.current); } catch {}
        autocompleteRef.current = null;
      }
    };
  }, []);

  const setInitialValue = useCallback((node: HTMLInputElement | null) => {
    if (node && value) {
      node.value = value;
    }
    (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
  }, []);

  useEffect(() => {
    if (suppressNextOnChange.current) {
      suppressNextOnChange.current = false;
      return;
    }
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChangeRef.current(e.target.value);
  }, []);

  return (
    <Input
      ref={setInitialValue}
      defaultValue={value}
      onChange={handleInputChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={cn(className)}
      disabled={disabled}
      data-testid={testId}
    />
  );
}

export function parseAddressComponents(place: PlaceResult) {
  const components: AddressComponent[] = place.address_components || [];
  
  const getComponent = (type: string, useShortName = false) => {
    const component = components.find((c: AddressComponent) => c.types.includes(type));
    return useShortName ? component?.short_name : component?.long_name;
  };

  return {
    streetNumber: getComponent('street_number') || '',
    streetName: getComponent('route') || '',
    city: getComponent('locality') || getComponent('sublocality') || '',
    neighborhood: getComponent('neighborhood') || getComponent('sublocality_level_1') || '',
    state: getComponent('administrative_area_level_1') || '',
    stateShort: getComponent('administrative_area_level_1', true) || '',
    country: getComponent('country') || '',
    countryShort: getComponent('country', true) || '',
    postalCode: getComponent('postal_code') || '',
    formattedAddress: place.formatted_address || '',
    lat: place.geometry?.location?.lat(),
    lng: place.geometry?.location?.lng(),
  };
}
