import React, { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, X, ImageIcon } from 'lucide-react';

interface ImageDropZoneProps {
  value: string;
  onChange: (url: string) => void;
  onUpload: (file: File) => Promise<string | null>;
  label: string;
  hint?: string;
}

export function ImageDropZone({ value, onChange, onUpload, label, hint }: ImageDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    const url = await onUpload(file);
    if (url) onChange(url);
    setUploading(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>

      <div
        className={`relative rounded-lg border-2 border-dashed transition-colors cursor-pointer overflow-hidden ${
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
        } ${value ? 'h-36' : 'h-28'}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        {value ? (
          <>
            <img
              src={value}
              alt={label}
              className="w-full h-full object-cover"
              onError={e => (e.currentTarget.style.display = 'none')}
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <span className="text-white text-xs font-medium flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" /> Replace photo
              </span>
            </div>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(''); }}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
            >
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          </>
        ) : uploading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs">Uploading…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground pointer-events-none">
            <ImageIcon className="w-7 h-7 opacity-30" />
            <span className="text-xs font-medium">Drag & drop or click to upload</span>
            {hint && <span className="text-xs opacity-60">{hint}</span>}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileInput}
        />
      </div>

      <Input
        placeholder="or paste image URL…"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs h-8"
      />
    </div>
  );
}
