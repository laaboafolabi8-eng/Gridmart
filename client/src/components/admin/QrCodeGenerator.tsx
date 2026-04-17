import { useState, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Copy, RefreshCw, Trash2, Plus, Image as ImageIcon, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface QrEntry {
  id: string;
  url: string;
  label: string;
  dataUrl: string | null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export default function QrCodeGenerator() {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [size, setSize] = useState(300);
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [errorCorrection, setErrorCorrection] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [centerImageSrc, setCenterImageSrc] = useState<string | null>(null);
  const [centerImageName, setCenterImageName] = useState<string>('');
  const [centerImageSize, setCenterImageSize] = useState(20);
  const [history, setHistory] = useState<QrEntry[]>(() => {
    try {
      const saved = localStorage.getItem('gridmart_qr_history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveHistory = useCallback((entries: QrEntry[]) => {
    setHistory(entries);
    localStorage.setItem('gridmart_qr_history', JSON.stringify(entries.slice(0, 50)));
  }, []);

  const generateQr = useCallback(async (targetUrl?: string) => {
    const finalUrl = (targetUrl || url).trim();
    if (!finalUrl) {
      toast({ title: 'Enter a URL', description: 'Please enter a URL to generate a QR code.', variant: 'destructive' });
      return null;
    }
    setGenerating(true);
    try {
      const ecLevel = centerImageSrc ? 'H' : errorCorrection;
      const qrDataUrl = await QRCode.toDataURL(finalUrl, {
        width: size,
        margin: 2,
        color: { dark: fgColor, light: bgColor },
        errorCorrectionLevel: ecLevel,
      });

      if (!centerImageSrc) {
        setPreviewDataUrl(qrDataUrl);
        setGenerating(false);
        return qrDataUrl;
      }

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      const qrImg = await loadImage(qrDataUrl);
      ctx.drawImage(qrImg, 0, 0, size, size);

      const logoImg = await loadImage(centerImageSrc);
      const logoSize = Math.round(size * (centerImageSize / 100));
      const logoX = Math.round((size - logoSize) / 2);
      const logoY = Math.round((size - logoSize) / 2);
      const padding = Math.round(logoSize * 0.08);

      ctx.fillStyle = bgColor;
      ctx.fillRect(logoX - padding, logoY - padding, logoSize + padding * 2, logoSize + padding * 2);

      ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);

      const finalDataUrl = canvas.toDataURL('image/png');
      setPreviewDataUrl(finalDataUrl);
      setGenerating(false);
      return finalDataUrl;
    } catch (err) {
      toast({ title: 'Generation failed', description: String(err), variant: 'destructive' });
      setGenerating(false);
      return null;
    }
  }, [url, size, fgColor, bgColor, errorCorrection, centerImageSrc, centerImageSize, toast]);

  const handleGenerate = async () => {
    const dataUrl = await generateQr();
    if (dataUrl) {
      const entry: QrEntry = { id: Date.now().toString(), url: url.trim(), label: label.trim() || url.trim(), dataUrl };
      saveHistory([entry, ...history]);
    }
  };

  const handleDownload = (dataUrl: string, filename: string) => {
    const a = downloadRef.current;
    if (!a) return;
    a.href = dataUrl;
    a.download = `${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}_qr.png`;
    a.click();
  };

  const handleCopyImage = async (dataUrl: string) => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast({ title: 'Copied', description: 'QR code copied to clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy image. Try downloading instead.', variant: 'destructive' });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file.', variant: 'destructive' });
      return;
    }
    setCenterImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCenterImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeCenterImage = () => {
    setCenterImageSrc(null);
    setCenterImageName('');
  };

  const removeFromHistory = (id: string) => {
    saveHistory(history.filter(h => h.id !== id));
  };

  const clearHistory = () => {
    saveHistory([]);
    setPreviewDataUrl(null);
  };

  return (
    <div className="space-y-6">
      <a ref={downloadRef} className="hidden" />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">QR Code Generator</CardTitle>
          <p className="text-sm text-muted-foreground">Generate QR codes for any URL. Optionally add a logo or image in the center.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="qr-url">URL *</Label>
                <Input
                  id="qr-url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                  data-testid="input-qr-url"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="qr-label">Label (optional)</Label>
                <Input
                  id="qr-label"
                  placeholder="e.g. Spring Sale Flyer"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  data-testid="input-qr-label"
                />
              </div>

              <div className="space-y-2">
                <Label>Size: {size}px</Label>
                <Slider
                  value={[size]}
                  onValueChange={([v]) => setSize(v)}
                  min={100}
                  max={1000}
                  step={50}
                  data-testid="slider-qr-size"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="qr-fg">Foreground</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      id="qr-fg"
                      value={fgColor}
                      onChange={(e) => setFgColor(e.target.value)}
                      className="w-10 h-10 rounded border cursor-pointer"
                      data-testid="input-qr-fg-color"
                    />
                    <Input value={fgColor} onChange={(e) => setFgColor(e.target.value)} className="flex-1 font-mono text-sm" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qr-bg">Background</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      id="qr-bg"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-10 h-10 rounded border cursor-pointer"
                      data-testid="input-qr-bg-color"
                    />
                    <Input value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="flex-1 font-mono text-sm" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Error Correction</Label>
                <Select value={errorCorrection} onValueChange={(v) => setErrorCorrection(v as 'L' | 'M' | 'Q' | 'H')}>
                  <SelectTrigger data-testid="select-qr-error-correction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L">Low (7%)</SelectItem>
                    <SelectItem value="M">Medium (15%)</SelectItem>
                    <SelectItem value="Q">Quartile (25%)</SelectItem>
                    <SelectItem value="H">High (30%)</SelectItem>
                  </SelectContent>
                </Select>
                {centerImageSrc && errorCorrection !== 'H' && (
                  <p className="text-xs text-amber-600">With a center image, error correction is automatically set to High for better scan reliability.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Center Image (optional)</Label>
                {centerImageSrc ? (
                  <div className="flex items-center gap-3 p-2 border rounded-lg bg-muted/30">
                    <img src={centerImageSrc} alt="Center logo" className="w-12 h-12 object-contain rounded" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{centerImageName}</p>
                      <p className="text-xs text-muted-foreground">Image size: {centerImageSize}% of QR</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={removeCenterImage} data-testid="button-remove-center-image">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-center-image"
                  >
                    <ImageIcon className="w-4 h-4 mr-2" />
                    Upload Logo / Image
                  </Button>
                )}
                {centerImageSrc && (
                  <div className="space-y-1 pt-1">
                    <Label className="text-xs">Image Size: {centerImageSize}%</Label>
                    <Slider
                      value={[centerImageSize]}
                      onValueChange={([v]) => setCenterImageSize(v)}
                      min={10}
                      max={40}
                      step={1}
                      data-testid="slider-center-image-size"
                    />
                    <p className="text-xs text-muted-foreground">Recommended: 15-25%. Larger images may affect scannability.</p>
                  </div>
                )}
              </div>

              <Button onClick={handleGenerate} disabled={generating || !url.trim()} className="w-full" data-testid="button-generate-qr">
                {generating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Generate QR Code
              </Button>
            </div>

            <div className="flex flex-col items-center justify-center">
              {previewDataUrl ? (
                <div className="space-y-4 flex flex-col items-center">
                  <div className="border rounded-lg p-4 bg-white" data-testid="qr-preview">
                    <img src={previewDataUrl} alt="QR Code Preview" style={{ width: Math.min(size, 400), height: Math.min(size, 400) }} className="mx-auto" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleDownload(previewDataUrl, label || url)} data-testid="button-download-qr">
                      <Download className="w-4 h-4 mr-1" /> Download PNG
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleCopyImage(previewDataUrl)} data-testid="button-copy-qr">
                      <Copy className="w-4 h-4 mr-1" /> Copy
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg w-full">
                  <p className="text-lg font-medium mb-1">QR Preview</p>
                  <p className="text-sm">Enter a URL and click Generate</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">History</CardTitle>
            <Button variant="ghost" size="sm" onClick={clearHistory} data-testid="button-clear-qr-history">
              <Trash2 className="w-4 h-4 mr-1" /> Clear All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {history.map((entry) => (
                <div key={entry.id} className="border rounded-lg p-3 space-y-2 bg-white" data-testid={`qr-history-${entry.id}`}>
                  {entry.dataUrl && (
                    <img src={entry.dataUrl} alt={entry.label} className="w-full aspect-square object-contain" />
                  )}
                  <p className="text-sm font-medium truncate" title={entry.label}>{entry.label}</p>
                  <p className="text-xs text-muted-foreground truncate" title={entry.url}>{entry.url}</p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => entry.dataUrl && handleDownload(entry.dataUrl, entry.label)} data-testid={`button-download-qr-${entry.id}`}>
                      <Download className="w-3 h-3 mr-1" /> Save
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => entry.dataUrl && handleCopyImage(entry.dataUrl)} data-testid={`button-copy-qr-${entry.id}`}>
                      <Copy className="w-3 h-3 mr-1" /> Copy
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs px-2" onClick={() => removeFromHistory(entry.id)} data-testid={`button-remove-qr-${entry.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
