import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Download, X, Move, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

interface MapScreenshotProps {
  mapContainerRef: React.RefObject<HTMLDivElement>;
  filename?: string;
}

export function MapScreenshotTrigger({ onActivate }: { onActivate: () => void }) {
  const [clickCount, setClickCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(() => {
    const next = clickCount + 1;
    setClickCount(next);

    if (timerRef.current) clearTimeout(timerRef.current);

    if (next >= 5) {
      setClickCount(0);
      onActivate();
      return;
    }

    timerRef.current = setTimeout(() => setClickCount(0), 2000);
  }, [clickCount, onActivate]);

  return (
    <div
      onClick={handleClick}
      className="absolute top-2 left-2 w-8 h-8 cursor-default z-10"
      style={{ opacity: 0 }}
      data-testid="screenshot-trigger-zone"
    />
  );
}

export function MapScreenshotOverlay({ mapContainerRef, filename = 'map-screenshot', onClose }: MapScreenshotProps & { onClose: () => void }) {
  const [capturing, setCapturing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropSize, setCropSize] = useState(600);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const captureMap = useCallback(async () => {
    if (!mapContainerRef.current) return;
    setCapturing(true);
    try {
      const mapEl = mapContainerRef.current;
      const internalCanvases = mapEl.querySelectorAll('canvas');
      const replacements: { canvas: HTMLCanvasElement; img: HTMLImageElement }[] = [];

      internalCanvases.forEach(c => {
        try {
          const dataUrl = c.toDataURL('image/png');
          const img = document.createElement('img');
          img.src = dataUrl;
          img.style.cssText = c.style.cssText;
          img.style.position = 'absolute';
          img.style.width = c.style.width || `${c.width}px`;
          img.style.height = c.style.height || `${c.height}px`;
          c.parentElement?.insertBefore(img, c);
          c.style.display = 'none';
          replacements.push({ canvas: c, img });
        } catch {}
      });

      const canvas = await html2canvas(mapEl, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        logging: false,
        backgroundColor: '#ffffff',
      });

      replacements.forEach(({ canvas: c, img }) => {
        c.style.display = '';
        img.remove();
      });

      const url = canvas.toDataURL('image/png');
      setPreviewUrl(url);

      const mapW = mapContainerRef.current.offsetWidth;
      const mapH = mapContainerRef.current.offsetHeight;
      const side = Math.min(mapW, mapH, 600);
      setCropSize(side);
      setCropOffset({
        x: Math.max(0, (mapW - side) / 2),
        y: Math.max(0, (mapH - side) / 2),
      });
    } catch (err) {
      toast.error('Failed to capture map');
      console.error(err);
    } finally {
      setCapturing(false);
    }
  }, [mapContainerRef]);

  useEffect(() => {
    captureMap();
  }, [captureMap]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: cropOffset.x,
      offsetY: cropOffset.y,
    };
  }, [cropOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !mapContainerRef.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const mapW = mapContainerRef.current.offsetWidth;
    const mapH = mapContainerRef.current.offsetHeight;

    setCropOffset({
      x: Math.max(0, Math.min(mapW - cropSize, dragStart.current.offsetX + dx)),
      y: Math.max(0, Math.min(mapH - cropSize, dragStart.current.offsetY + dy)),
    });
  }, [isDragging, cropSize, mapContainerRef]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const adjustSize = useCallback((delta: number) => {
    if (!mapContainerRef.current) return;
    const mapW = mapContainerRef.current.offsetWidth;
    const mapH = mapContainerRef.current.offsetHeight;
    const maxSide = Math.min(mapW, mapH);
    const newSize = Math.max(200, Math.min(maxSide, cropSize + delta));
    setCropSize(newSize);
    setCropOffset(prev => ({
      x: Math.max(0, Math.min(mapW - newSize, prev.x)),
      y: Math.max(0, Math.min(mapH - newSize, prev.y)),
    }));
  }, [cropSize, mapContainerRef]);

  const downloadScreenshot = useCallback(async () => {
    if (!previewUrl || !mapContainerRef.current) return;
    setCapturing(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = previewUrl;
      });

      const scale = img.naturalWidth / mapContainerRef.current.offsetWidth;
      const sx = cropOffset.x * scale;
      const sy = cropOffset.y * scale;
      const sSize = cropSize * scale;

      const outCanvas = document.createElement('canvas');
      outCanvas.width = 1200;
      outCanvas.height = 1200;
      const ctx = outCanvas.getContext('2d')!;
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, 1200, 1200);

      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = outCanvas.toDataURL('image/png');
      link.click();
      toast.success('Screenshot downloaded!');
      onClose();
    } catch (err) {
      toast.error('Failed to save screenshot');
      console.error(err);
    } finally {
      setCapturing(false);
    }
  }, [previewUrl, cropOffset, cropSize, filename, mapContainerRef, onClose]);

  if (!previewUrl && capturing) {
    return (
      <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center rounded-lg">
        <div className="bg-white rounded-lg p-6 flex items-center gap-3 shadow-xl">
          <div className="animate-spin w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full" />
          <span className="text-sm font-medium">Capturing map...</span>
        </div>
      </div>
    );
  }

  if (!previewUrl) return null;

  return (
    <div
      className="absolute inset-0 z-50 bg-black/60 flex flex-col"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-black/80">
        <div className="flex items-center gap-2 text-white text-sm">
          <Camera className="w-4 h-4" />
          <span className="font-medium">Map Screenshot</span>
          <span className="text-white/60 ml-2">Drag to reposition, resize with +/- buttons</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/20 h-8 w-8 p-0"
            onClick={() => adjustSize(-50)}
            data-testid="button-crop-shrink"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-white/80 text-xs min-w-[60px] text-center">{cropSize}px</span>
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/20 h-8 w-8 p-0"
            onClick={() => adjustSize(50)}
            data-testid="button-crop-grow"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            className="bg-teal-500 hover:bg-teal-600 text-white gap-1.5"
            onClick={downloadScreenshot}
            disabled={capturing}
            data-testid="button-download-screenshot"
          >
            <Download className="w-4 h-4" />
            Download
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/20 h-8 w-8 p-0"
            onClick={onClose}
            data-testid="button-close-screenshot"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <img
          src={previewUrl}
          alt="Map capture"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'brightness(0.4)' }}
          draggable={false}
        />

        <div
          className="absolute border-2 border-white shadow-2xl cursor-move"
          style={{
            left: cropOffset.x,
            top: cropOffset.y,
            width: cropSize,
            height: cropSize,
          }}
          onMouseDown={handleMouseDown}
          data-testid="screenshot-crop-area"
        >
          <img
            src={previewUrl}
            alt="Cropped area"
            className="absolute"
            style={{
              left: -cropOffset.x,
              top: -cropOffset.y,
              width: mapContainerRef.current?.offsetWidth || '100%',
              height: mapContainerRef.current?.offsetHeight || '100%',
            }}
            draggable={false}
          />
          <div className="absolute inset-0 border border-white/30 pointer-events-none">
            <div className="absolute top-0 left-1/3 w-px h-full bg-white/20" />
            <div className="absolute top-0 left-2/3 w-px h-full bg-white/20" />
            <div className="absolute left-0 top-1/3 w-full h-px bg-white/20" />
            <div className="absolute left-0 top-2/3 w-full h-px bg-white/20" />
          </div>
          <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-white" />
          <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-white" />
          <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-white" />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-white" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <Move className="w-6 h-6 text-white/60" />
          </div>
        </div>
      </div>
    </div>
  );
}
