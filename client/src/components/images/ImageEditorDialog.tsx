import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RotateCcw, Eraser, ChevronLeft, ChevronRight, Sparkles, Crop, Layers, Move, Trash2, Upload } from 'lucide-react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Overlay {
  id: string;
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  opacity: number;
}

interface OverlayData {
  originalImageUrl: string;
  overlays: Overlay[];
}

interface ImageEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  onSave: (newImageUrl: string, overlayData?: OverlayData | null) => void;
  allImages?: string[];
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
  initialOverlayData?: OverlayData | null;
}

const getProxiedUrl = (url: string): string => {
  if (!url) return url;
  if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  return `/api/images/proxy?url=${encodeURIComponent(url)}`;
};

const createCroppedImage = async (imageSrc: string, pixelCrop: Area): Promise<string> => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  
  return new Promise((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );
      
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = imageSrc;
  });
};

const mergeImageWithOverlays = async (baseImageUrl: string, overlays: Overlay[], containerWidth: number, containerHeight: number, renderedImageRect: { x: number, y: number, width: number, height: number }): Promise<string> => {
  return new Promise((resolve, reject) => {
    const baseImage = new Image();
    baseImage.crossOrigin = 'anonymous';
    
    baseImage.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = baseImage.width;
      canvas.height = baseImage.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      ctx.drawImage(baseImage, 0, 0);
      
      const scaleX = baseImage.width / renderedImageRect.width;
      const scaleY = baseImage.height / renderedImageRect.height;
      
      for (const overlay of overlays) {
        const overlayImg = new Image();
        overlayImg.crossOrigin = 'anonymous';
        
        await new Promise<void>((resolveOverlay, rejectOverlay) => {
          overlayImg.onload = () => {
            const x = (overlay.x - renderedImageRect.x) * scaleX;
            const y = (overlay.y - renderedImageRect.y) * scaleY;
            const width = overlay.width * scaleX;
            const height = overlay.height * scaleY;
            ctx.globalAlpha = overlay.opacity ?? 1;
            ctx.drawImage(overlayImg, x, y, width, height);
            ctx.globalAlpha = 1;
            resolveOverlay();
          };
          overlayImg.onerror = () => rejectOverlay(new Error('Failed to load overlay'));
          overlayImg.src = overlay.imageUrl;
        });
      }
      
      resolve(canvas.toDataURL('image/png'));
    };
    
    baseImage.onerror = () => reject(new Error('Failed to load base image'));
    baseImage.src = baseImageUrl;
  });
};

export function ImageEditorDialog({ open, onOpenChange, imageUrl, onSave, allImages, currentIndex, onIndexChange, initialOverlayData }: ImageEditorDialogProps) {
  const baseImageUrl = initialOverlayData?.originalImageUrl || imageUrl;
  const [currentImage, setCurrentImage] = useState(baseImageUrl);
  const [isProcessing, setIsProcessing] = useState(false);
  const [originalImage, setOriginalImage] = useState(baseImageUrl);
  const [aiPrompt, setAiPrompt] = useState('');
  
  const [isCropMode, setIsCropMode] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.5);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  
  const [overlays, setOverlays] = useState<Overlay[]>(initialOverlayData?.overlays || []);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [isOverlayMode, setIsOverlayMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ width: 0, height: 0, x: 0, y: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (open) {
      const base = initialOverlayData?.originalImageUrl || imageUrl;
      setCurrentImage(base);
      setOriginalImage(base);
      setAiPrompt('');
      setIsCropMode(false);
      setIsOverlayMode(false);
      setCrop({ x: 0, y: 0 });
      setZoom(0.5);
      setOverlays(initialOverlayData?.overlays || []);
      setSelectedOverlayId(null);
    }
  }, [open, imageUrl, initialOverlayData]);

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleApplyCrop = async () => {
    if (!croppedAreaPixels) return;
    
    setIsProcessing(true);
    try {
      const croppedImageUrl = await createCroppedImage(getProxiedUrl(currentImage), croppedAreaPixels);
      setCurrentImage(croppedImageUrl);
      setIsCropMode(false);
      setCrop({ x: 0, y: 0 });
      setZoom(0.5);
      setOverlays([]);
      toast.success('Image cropped');
    } catch (error: any) {
      toast.error(error.message || 'Failed to crop image');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveBackground = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/images/remove-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ imageUrl: currentImage }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove background');
      }
      
      const result = await response.json();
      setCurrentImage(result.imageUrl);
      toast.success('Background removed');
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove background');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    const base = initialOverlayData?.originalImageUrl || imageUrl;
    setCurrentImage(base);
    setOriginalImage(base);
    setIsCropMode(false);
    setIsOverlayMode(false);
    setCrop({ x: 0, y: 0 });
    setZoom(0.5);
    setOverlays(initialOverlayData?.overlays || []);
    setSelectedOverlayId(null);
  };

  const handleAiEdit = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Please enter an AI prompt');
      return;
    }
    setIsProcessing(true);
    try {
      const response = await fetch('/api/images/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ imageUrl: currentImage, prompt: aiPrompt }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to edit image with AI');
      }
      
      const result = await response.json();
      setCurrentImage(result.imageUrl);
      setAiPrompt('');
      toast.success('Image edited with AI');
    } catch (error: any) {
      toast.error(error.message || 'Failed to edit image with AI');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOverlayUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      
      const img = new Image();
      img.onload = () => {
        const containerRect = containerRef.current?.getBoundingClientRect();
        const containerWidth = containerRect?.width || 400;
        const containerHeight = containerRect?.height || 300;
        
        let overlayWidth = img.width;
        let overlayHeight = img.height;
        
        const maxWidth = containerWidth * 0.5;
        const maxHeight = containerHeight * 0.5;
        
        if (overlayWidth > maxWidth) {
          const ratio = maxWidth / overlayWidth;
          overlayWidth = maxWidth;
          overlayHeight = overlayHeight * ratio;
        }
        if (overlayHeight > maxHeight) {
          const ratio = maxHeight / overlayHeight;
          overlayHeight = maxHeight;
          overlayWidth = overlayWidth * ratio;
        }
        
        const newOverlay: Overlay = {
          id: `overlay-${Date.now()}`,
          imageUrl: dataUrl,
          x: (containerWidth - overlayWidth) / 2,
          y: (containerHeight - overlayHeight) / 2,
          width: overlayWidth,
          height: overlayHeight,
          originalWidth: img.width,
          originalHeight: img.height,
          opacity: 1,
        };
        
        setOverlays(prev => [...prev, newOverlay]);
        setSelectedOverlayId(newOverlay.id);
        setIsOverlayMode(true);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    
    if (overlayInputRef.current) {
      overlayInputRef.current.value = '';
    }
  };

  const handleOverlayMouseDown = (e: React.MouseEvent, overlayId: string, action: 'drag' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    
    const overlay = overlays.find(o => o.id === overlayId);
    if (!overlay) return;
    
    setSelectedOverlayId(overlayId);
    
    if (action === 'drag') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - overlay.x, y: e.clientY - overlay.y });
    } else {
      setIsResizing(true);
      setResizeStart({ width: overlay.width, height: overlay.height, x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!selectedOverlayId) return;
    
    if (isDragging) {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      
      const overlay = overlays.find(o => o.id === selectedOverlayId);
      if (!overlay) return;
      
      let newX = e.clientX - dragStart.x;
      let newY = e.clientY - dragStart.y;
      
      newX = Math.max(0, Math.min(newX, containerRect.width - overlay.width));
      newY = Math.max(0, Math.min(newY, containerRect.height - overlay.height));
      
      setOverlays(prev => prev.map(o => 
        o.id === selectedOverlayId ? { ...o, x: newX, y: newY } : o
      ));
    } else if (isResizing) {
      const overlay = overlays.find(o => o.id === selectedOverlayId);
      if (!overlay) return;
      
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;
      
      const aspectRatio = overlay.originalWidth / overlay.originalHeight;
      let newWidth = Math.max(50, resizeStart.width + deltaX);
      let newHeight = newWidth / aspectRatio;
      
      if (newHeight < 50) {
        newHeight = 50;
        newWidth = newHeight * aspectRatio;
      }
      
      setOverlays(prev => prev.map(o => 
        o.id === selectedOverlayId ? { ...o, width: newWidth, height: newHeight } : o
      ));
    }
  }, [isDragging, isResizing, selectedOverlayId, dragStart, resizeStart, overlays]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      const handleGlobalMouseUp = () => {
        setIsDragging(false);
        setIsResizing(false);
      };
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isDragging, isResizing]);

  const deleteOverlay = (overlayId: string) => {
    setOverlays(prev => prev.filter(o => o.id !== overlayId));
    if (selectedOverlayId === overlayId) {
      setSelectedOverlayId(null);
    }
  };

  const handleSave = async () => {
    if (overlays.length > 0 && containerRef.current && imageRef.current) {
      setIsProcessing(true);
      try {
        const containerRect = containerRef.current.getBoundingClientRect();
        const imageRect = imageRef.current.getBoundingClientRect();
        
        const renderedImageRect = {
          x: imageRect.left - containerRect.left,
          y: imageRect.top - containerRect.top,
          width: imageRect.width,
          height: imageRect.height
        };
        
        const mergedImage = await mergeImageWithOverlays(
          getProxiedUrl(currentImage),
          overlays,
          containerRect.width,
          containerRect.height,
          renderedImageRect
        );
        onSave(mergedImage, { originalImageUrl: currentImage, overlays });
      } catch (error: any) {
        toast.error('Failed to merge overlays');
        onSave(currentImage, { originalImageUrl: currentImage, overlays });
      } finally {
        setIsProcessing(false);
      }
    } else {
      onSave(currentImage, overlays.length > 0 ? { originalImageUrl: currentImage, overlays } : null);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Image</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div 
            ref={containerRef}
            className="relative rounded-lg overflow-hidden flex items-center justify-center bg-[#f5f5f5]"
            style={{
              backgroundImage: 'linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)',
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
              minHeight: '300px',
              height: isCropMode ? '400px' : 'auto'
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={() => {
              if (!isDragging && !isResizing) {
                setSelectedOverlayId(null);
              }
            }}
          >
            {isProcessing && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-30">
                <div className="flex flex-col items-center gap-2 text-white">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span>Processing...</span>
                </div>
              </div>
            )}
            
            {isCropMode ? (
              <Cropper
                image={getProxiedUrl(currentImage)}
                crop={crop}
                zoom={zoom}
                minZoom={0.5}
                maxZoom={3}
                aspect={undefined}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                objectFit="contain"
                restrictPosition={false}
              />
            ) : (
              <>
                {allImages && allImages.length > 1 && currentIndex !== undefined && onIndexChange && (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-background/80 hover:bg-background shadow-md"
                      onClick={() => onIndexChange(currentIndex === 0 ? allImages.length - 1 : currentIndex - 1)}
                      disabled={isProcessing}
                      data-testid="button-prev-image"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-background/80 hover:bg-background shadow-md"
                      onClick={() => onIndexChange(currentIndex === allImages.length - 1 ? 0 : currentIndex + 1)}
                      disabled={isProcessing}
                      data-testid="button-next-image"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                  </>
                )}
                
                <img 
                  ref={imageRef}
                  src={getProxiedUrl(currentImage)} 
                  alt="Edit preview" 
                  className="max-w-full max-h-[400px] object-contain"
                  draggable={false}
                />
                
                {overlays.map(overlay => (
                  <div
                    key={overlay.id}
                    className={`absolute cursor-move select-none ${selectedOverlayId === overlay.id ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    style={{
                      left: overlay.x,
                      top: overlay.y,
                      width: overlay.width,
                      height: overlay.height,
                      opacity: overlay.opacity ?? 1,
                    }}
                    onMouseDown={(e) => handleOverlayMouseDown(e, overlay.id, 'drag')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedOverlayId(overlay.id);
                    }}
                  >
                    <img
                      src={overlay.imageUrl}
                      alt="Overlay"
                      className="w-full h-full object-contain pointer-events-none"
                      draggable={false}
                    />
                    
                    {selectedOverlayId === overlay.id && (
                      <>
                        <div
                          className="absolute -bottom-2 -right-2 w-5 h-5 bg-primary rounded-full cursor-se-resize flex items-center justify-center shadow-md"
                          onMouseDown={(e) => handleOverlayMouseDown(e, overlay.id, 'resize')}
                        >
                          <Move className="w-3 h-3 text-white rotate-45" />
                        </div>
                        <button
                          className="absolute -top-2 -right-2 w-5 h-5 bg-destructive rounded-full flex items-center justify-center shadow-md hover:bg-destructive/90"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteOverlay(overlay.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3 text-white" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
          
          {allImages && allImages.length > 1 && currentIndex !== undefined && !isCropMode && (
            <p className="text-xs text-center text-muted-foreground">
              Image {currentIndex + 1} of {allImages.length}
            </p>
          )}
          
          {isCropMode && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Zoom:</span>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm w-12">{zoom.toFixed(1)}x</span>
            </div>
          )}

          {selectedOverlayId && !isCropMode && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Opacity:</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={overlays.find(o => o.id === selectedOverlayId)?.opacity ?? 1}
                onChange={(e) => {
                  const newOpacity = Number(e.target.value);
                  setOverlays(prev => prev.map(o => 
                    o.id === selectedOverlayId ? { ...o, opacity: newOpacity } : o
                  ));
                }}
                className="flex-1"
              />
              <span className="text-sm w-12">{Math.round((overlays.find(o => o.id === selectedOverlayId)?.opacity ?? 1) * 100)}%</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {isCropMode ? (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleApplyCrop}
                  disabled={isProcessing}
                  data-testid="button-apply-crop"
                >
                  <Crop className="w-4 h-4 mr-2" />
                  Apply Crop
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsCropMode(false);
                    setCrop({ x: 0, y: 0 });
                    setZoom(0.5);
                  }}
                  disabled={isProcessing}
                  data-testid="button-cancel-crop"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCropMode(true)}
                  disabled={isProcessing}
                  data-testid="button-start-crop"
                >
                  <Crop className="w-4 h-4 mr-2" />
                  Crop
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveBackground}
                  disabled={isProcessing}
                  data-testid="button-remove-background"
                >
                  <Eraser className="w-4 h-4 mr-2" />
                  Remove Background (AI)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => overlayInputRef.current?.click()}
                  disabled={isProcessing}
                  data-testid="button-add-overlay"
                >
                  <Layers className="w-4 h-4 mr-2" />
                  Add Overlay
                </Button>
                <input
                  ref={overlayInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleOverlayUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  disabled={isProcessing || (currentImage === originalImage && overlays.length === 0)}
                  data-testid="button-reset-image"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
              </>
            )}
          </div>
          
          {overlays.length > 0 && !isCropMode && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <Label className="text-xs font-medium flex items-center gap-2">
                <Layers className="w-3 h-3" />
                Overlays ({overlays.length})
              </Label>
              <div className="flex flex-wrap gap-2">
                {overlays.map((overlay, idx) => (
                  <div
                    key={overlay.id}
                    className={`relative group cursor-pointer rounded border-2 ${selectedOverlayId === overlay.id ? 'border-primary' : 'border-transparent'}`}
                    onClick={() => setSelectedOverlayId(overlay.id)}
                  >
                    <img
                      src={overlay.imageUrl}
                      alt={`Overlay ${idx + 1}`}
                      className="w-12 h-12 object-contain bg-white rounded"
                    />
                    <button
                      className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteOverlay(overlay.id);
                      }}
                    >
                      <Trash2 className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Click overlay to select, drag to move, use corner handle to resize</p>
            </div>
          )}
          
          {!isCropMode && (
            <div className="flex gap-2">
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe how to edit the image (e.g., make it brighter, add blur, change colors)"
                className="flex-1"
                disabled={isProcessing}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isProcessing && aiPrompt.trim()) {
                    handleAiEdit();
                  }
                }}
                data-testid="input-ai-prompt"
              />
              <Button
                onClick={handleAiEdit}
                disabled={isProcessing || !aiPrompt.trim()}
                data-testid="button-ai-edit"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                AI Edit
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isProcessing || isCropMode}
              data-testid="button-save-image"
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
