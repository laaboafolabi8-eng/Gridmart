interface TextBlockProps {
  heading?: string;
  body?: string;
  align?: string;
  bg?: string;
  textColor?: string;
  headingColor?: string;
  bodyColor?: string;
}

export function TextBlockSection({ heading, body, align = 'center', bg, textColor, headingColor, bodyColor }: TextBlockProps) {
  const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
  const resolvedHeadingColor = headingColor || textColor || undefined;
  const resolvedBodyColor = bodyColor || textColor || undefined;
  return (
    <section className="py-10 px-4" style={{ background: bg || undefined }}>
      <div className={`max-w-3xl mx-auto ${alignClass}`}>
        {heading && <h2 className="text-2xl md:text-3xl font-bold mb-3 font-display" style={{ color: resolvedHeadingColor }}>{heading}</h2>}
        {body && <p className="text-base leading-relaxed text-muted-foreground" style={{ color: resolvedBodyColor }}>{body}</p>}
      </div>
    </section>
  );
}
