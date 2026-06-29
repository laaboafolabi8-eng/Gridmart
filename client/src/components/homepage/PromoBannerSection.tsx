interface PromoBannerProps {
  imageUrl?: string;
  heading?: string;
  subtext?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  overlay?: number;
  textColor?: string;
}

export function PromoBannerSection({ imageUrl, heading, subtext, ctaLabel, ctaUrl, overlay = 40, textColor = '#ffffff' }: PromoBannerProps) {
  if (!imageUrl) {
    return (
      <section className="py-12 bg-muted/40 text-center border-y">
        <p className="text-sm font-medium text-muted-foreground mb-1">Promo Banner</p>
        <p className="text-xs text-muted-foreground">Add an image URL in the Homepage Builder to activate this section.</p>
      </section>
    );
  }
  return (
    <section className="relative w-full overflow-hidden" style={{ minHeight: '220px' }}>
      <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
      {overlay > 0 && (
        <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${overlay / 100})` }} />
      )}
      <div className="relative z-10 flex flex-col items-center justify-center py-16 px-6 text-center" style={{ color: textColor }}>
        {heading && <h2 className="text-2xl md:text-4xl font-bold mb-2 drop-shadow">{heading}</h2>}
        {subtext && <p className="text-base md:text-lg mb-5 opacity-90">{subtext}</p>}
        {ctaLabel && (
          <a
            href={ctaUrl || '#'}
            className="inline-block bg-white text-black font-semibold px-7 py-2.5 rounded-full text-sm hover:bg-white/90 transition-colors shadow"
          >
            {ctaLabel}
          </a>
        )}
      </div>
    </section>
  );
}
