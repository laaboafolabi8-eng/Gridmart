import { useState, useRef, useCallback } from 'react';
import { Bold, Italic, Underline, List } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  'data-testid'?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Enter text...',
  className,
  minHeight = '100px',
  'data-testid': testId,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!value);

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    updateContent();
  }, []);

  const updateContent = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const textContent = editorRef.current.textContent || '';
      setIsEmpty(!textContent.trim());
      onChange(html);
    }
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    updateContent();
  }, [updateContent]);

  return (
    <div className={cn('border rounded-md', className)}>
      <div className="flex items-center gap-1 p-1 border-b bg-muted/30">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('bold')}
          title="Bold"
          data-testid={testId ? `${testId}-bold` : undefined}
        >
          <Bold className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('italic')}
          title="Italic"
          data-testid={testId ? `${testId}-italic` : undefined}
        >
          <Italic className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('underline')}
          title="Underline"
          data-testid={testId ? `${testId}-underline` : undefined}
        >
          <Underline className="w-4 h-4" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('insertUnorderedList')}
          title="Bullet List"
          data-testid={testId ? `${testId}-list` : undefined}
        >
          <List className="w-4 h-4" />
        </Button>
      </div>
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          className={cn(
            'p-3 outline-none prose prose-sm max-w-none',
            '[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4',
            '[&_b]:font-bold [&_strong]:font-bold',
            '[&_i]:italic [&_em]:italic',
            '[&_u]:underline'
          )}
          style={{ minHeight }}
          onInput={updateContent}
          onBlur={updateContent}
          onPaste={handlePaste}
          dangerouslySetInnerHTML={{ __html: value }}
          data-testid={testId}
        />
        {isEmpty && (
          <div className="absolute top-3 left-3 text-muted-foreground pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}

interface FormattedTextProps {
  html: string;
  className?: string;
}

export function FormattedText({ html, className }: FormattedTextProps) {
  if (!html) return null;
  
  return (
    <span
      className={cn(
        '[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4',
        '[&_b]:font-bold [&_strong]:font-bold',
        '[&_i]:italic [&_em]:italic',
        '[&_u]:underline',
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}