import { imgSrc, imgSrcSet } from '@/lib/imgSrc';

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
  if (!imageUrl) return null;

  return (
    <section className={fullBleed ? 'w-full' : 'max-w-4xl mx-auto px-4'}>
      <div className="w-full overflow-hidden" style={{ height: `${height}px` }}>
        <img
          src={imgSrc(imageUrl, 1400)}
          srcSet={imgSrcSet(imageUrl, [800, 1400])}
          sizes="(max-width: 768px) 100vw, 896px"
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
