import { useState, useRef, useEffect, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const RECENT_COLORS_KEY = 'gridmart-recent-colors';
const MAX_RECENT = 12;

function getRecentColors(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_COLORS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveRecentColor(color: string) {
  const normalized = color.toLowerCase();
  const recent = getRecentColors().filter(c => c !== normalized);
  recent.unshift(normalized);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
  localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recent));
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f43f5e',
  '#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#ffffff',
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
  label?: string;
  'data-testid'?: string;
}

export function ColorPicker({ value, onChange, className = '', label, ...props }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value);
  const [recentColors, setRecentColors] = useState<string[]>(getRecentColors());
  const nativeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHexInput(value);
  }, [value]);

  useEffect(() => {
    if (open) {
      setRecentColors(getRecentColors());
    }
  }, [open]);

  const applyColor = useCallback((color: string, closeAfter = false) => {
    const normalized = color.toLowerCase();
    onChange(normalized);
    setHexInput(normalized);
    saveRecentColor(normalized);
    setRecentColors(getRecentColors());
    if (closeAfter) setOpen(false);
  }, [onChange]);

  const handleHexSubmit = () => {
    let hex = hexInput.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
      if (hex.length === 4) {
        hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
      }
      applyColor(hex, true);
    } else {
      setHexInput(value);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          className={`rounded border cursor-pointer flex items-center justify-center ${className || 'w-7 h-7'}`}
          style={{ backgroundColor: value }}
          data-testid={props['data-testid']}
          type="button"
        >
          <span className="sr-only">{label || 'Pick color'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-3 space-y-3 z-[9999]"
        align="start"
        side="bottom"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8 shrink-0">
            <div
              className="w-8 h-8 rounded border cursor-pointer"
              style={{ backgroundColor: value }}
            />
            <input
              ref={nativeRef}
              type="color"
              value={value}
              onChange={(e) => applyColor(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={handleHexSubmit}
              onKeyDown={(e) => { if (e.key === 'Enter') handleHexSubmit(); }}
              className="w-full text-xs font-mono border rounded px-2 py-1 bg-background"
              placeholder="#000000"
              data-testid={props['data-testid'] ? `${props['data-testid']}-hex` : undefined}
            />
          </div>
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground mb-1.5">Presets</p>
          <div className="grid grid-cols-8 gap-1">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                className={`w-5 h-5 rounded-sm border cursor-pointer hover:scale-110 transition-transform ${value.toLowerCase() === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => applyColor(c, true)}
              />
            ))}
          </div>
        </div>

        {recentColors.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5">Recent</p>
            <div className="grid grid-cols-8 gap-1">
              {recentColors.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`w-5 h-5 rounded-sm border cursor-pointer hover:scale-110 transition-transform ${value.toLowerCase() === c ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => applyColor(c, true)}
                />
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
