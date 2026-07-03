import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Slide {
  imageUrl: string;
  caption?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

interface SlideshowProps {
  slides?: Slide[];
  autoplayMs?: number;
  showDots?: boolean;
  height?: string | number;
}

export function SlideshowSection({ slides = [], autoplayMs = 4000, showDots = true, height = '400' }: SlideshowProps) {
  const valid = slides.filter(s => s.imageUrl);
  const [current, setCurrent] = useState(0);

  const next = useCallback(() => setCurrent(c => (c + 1) % valid.length), [valid.length]);
  const prev = () => setCurrent(c => (c - 1 + valid.length) % valid.length);

  useEffect(() => {
    if (valid.length < 2 || !autoplayMs) return;
    const t = setInterval(next, autoplayMs);
    return () => clearInterval(t);
  }, [next, valid.length, autoplayMs]);

  if (!valid.length) {
    return (
      <section
        className="bg-muted/40 border-y flex items-center justify-center text-center"
        style={{ height: `${height}px` }}
      >
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">Slideshow</p>
          <p className="text-xs text-muted-foreground">Add image URLs in the Homepage Builder to activate this section.</p>
        </div>
      </section>
    );
  }

  const slide = valid[current];
  return (
    <section className="relative w-full overflow-hidden select-none" style={{ height: `${height}px` }}>
      {valid.map((s, i) => (
        <img
          key={i}
          src={s.imageUrl}
          srcSet={s.imageUrl?.startsWith('/api/') ? `${s.imageUrl}?w=800 800w, ${s.imageUrl}?w=1400 1400w` : undefined}
          sizes="100vw"
          alt=""
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === current ? 'opacity-100' : 'opacity-0'}`}
          loading={i === 0 ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={i === 0 ? 'high' : undefined}
        />
      ))}
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full text-white text-center px-8 gap-3">
        {slide.caption && (
          <p className="text-xl md:text-3xl font-bold drop-shadow">{slide.caption}</p>
        )}
        {slide.ctaLabel && (
          <a
            href={slide.ctaUrl || '#'}
            className="bg-white text-black px-6 py-2 rounded-full text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            {slide.ctaLabel}
          </a>
        )}
      </div>
      {valid.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/60 text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/60 text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
      {showDots && valid.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
          {valid.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`rounded-full transition-all duration-300 h-2 ${i === current ? 'w-4 bg-white' : 'w-2 bg-white/50'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
