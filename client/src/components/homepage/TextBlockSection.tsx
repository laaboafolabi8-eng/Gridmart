interface TextBlockProps {
  heading?: string;
  body?: string;
  align?: string;
  bg?: string;
  textColor?: string;
}

export function TextBlockSection({ heading, body, align = 'center', bg, textColor }: TextBlockProps) {
  const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
  return (
    <section className="py-10 px-4" style={{ background: bg || undefined, color: textColor || undefined }}>
      <div className={`max-w-3xl mx-auto ${alignClass}`}>
        {heading && <h2 className="text-2xl md:text-3xl font-bold mb-3 font-display">{heading}</h2>}
        {body && <p className="text-base leading-relaxed text-muted-foreground">{body}</p>}
      </div>
    </section>
  );
}
