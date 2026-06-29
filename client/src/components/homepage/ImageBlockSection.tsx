interface ImageBlockProps {
  imageUrl?: string;
  caption?: string;
  height?: string;
  fullBleed?: boolean;
  objectFit?: 'cover' | 'contain';
}

export function ImageBlockSection({
  imageUrl,
  caption,
  height = '400',
  fullBleed = true,
  objectFit = 'cover',
}: ImageBlockProps) {
  if (!imageUrl) {
    return (
      <section className="py-12 bg-muted/40 text-center border-y">
        <p className="text-sm font-medium text-muted-foreground mb-1">Image Block</p>
        <p className="text-xs text-muted-foreground">Add an image URL in the Homepage Builder to activate this section.</p>
      </section>
    );
  }

  return (
    <section className={fullBleed ? 'w-full' : 'max-w-4xl mx-auto px-4'}>
      <div className="w-full overflow-hidden" style={{ height: `${height}px` }}>
        <img
          src={imageUrl}
          alt={caption || ''}
          className="w-full h-full"
          style={{ objectFit }}
          loading="lazy"
          decoding="async"
        />
      </div>
      {caption && (
        <p className="text-center text-sm text-muted-foreground mt-2 px-4">{caption}</p>
      )}
    </section>
  );
}
