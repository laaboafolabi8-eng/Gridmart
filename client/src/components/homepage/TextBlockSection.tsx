interface TextBlockProps {
  heading?: string;
  body?: string;
  align?: string;
  bg?: string;
  textColor?: string;
  headingColor?: string;
  bodyColor?: string;
  maxWidth?: 'narrow' | 'medium' | 'wide' | 'full';
}

const MAX_WIDTH_CLASS: Record<string, string> = {
  narrow: 'max-w-xl',
  medium: 'max-w-3xl',
  wide: 'max-w-5xl',
  full: 'max-w-none',
};

export function TextBlockSection({ heading, body, align = 'center', bg, textColor, headingColor, bodyColor, maxWidth = 'medium' }: TextBlockProps) {
  const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
  const resolvedHeadingColor = headingColor || textColor || undefined;
  const resolvedBodyColor = bodyColor || textColor || undefined;
  const widthClass = MAX_WIDTH_CLASS[maxWidth] || MAX_WIDTH_CLASS.medium;
  return (
    <section className="py-10 px-4" style={{ background: bg || undefined }}>
      <div className={`${widthClass} mx-auto ${alignClass}`}>
        {heading && <h2 className="text-2xl md:text-3xl font-bold mb-3 font-display" style={{ color: resolvedHeadingColor }}>{heading}</h2>}
        {body && <p className="text-base leading-relaxed text-muted-foreground" style={{ color: resolvedBodyColor }}>{body}</p>}
      </div>
    </section>
  );
}
