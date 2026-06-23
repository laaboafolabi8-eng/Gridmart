import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import type { ContentSection, ContentSectionType, SpecRow } from '@/lib/mockData';

export type { ContentSection, ContentSectionType, SpecRow };

const DEFAULTS: ContentSection[] = [
  { id: 'details', name: 'Product Details', type: 'text', content: '' },
  { id: 'features', name: 'Features', type: 'bullets', content: [] },
  { id: 'specs', name: 'Specifications', type: 'specs', content: [] },
];

function genId() { return Math.random().toString(36).slice(2, 9); }

interface Props {
  value: ContentSection[] | null | undefined;
  initialDescription?: string;
  onChange: (sections: ContentSection[]) => void;
}

export function ContentSectionsEditor({ value, initialDescription, onChange }: Props) {
  const initRef = useRef(false);

  const sections: ContentSection[] = value?.length
    ? value
    : DEFAULTS.map(s => s.id === 'details' ? { ...s, content: initialDescription || '' } : { ...s });

  useEffect(() => {
    if (!value?.length && !initRef.current) {
      initRef.current = true;
      onChange(sections);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ContentSectionType>('text');
  const [showAdd, setShowAdd] = useState(false);

  const updateSection = (id: string, patch: Partial<ContentSection>) =>
    onChange(sections.map(s => s.id === id ? { ...s, ...patch } : s));

  const removeSection = (id: string) =>
    onChange(sections.filter(s => s.id !== id));

  const move = (id: string, dir: -1 | 1) => {
    const idx = sections.findIndex(s => s.id === id);
    if (idx + dir < 0 || idx + dir >= sections.length) return;
    const copy = [...sections];
    [copy[idx], copy[idx + dir]] = [copy[idx + dir], copy[idx]];
    onChange(copy);
  };

  const addSection = () => {
    if (!newName.trim()) return;
    const emptyContent: string | string[] = newType === 'text' ? '' : [];
    onChange([...sections, { id: genId(), name: newName.trim(), type: newType, content: emptyContent }]);
    setNewName('');
    setNewType('text');
    setShowAdd(false);
  };

  return (
    <div className="space-y-2">
      {sections.map((section, idx) => (
        <SectionCard
          key={section.id}
          section={section}
          isFirst={idx === 0}
          isLast={idx === sections.length - 1}
          onUpdate={patch => updateSection(section.id, patch)}
          onRemove={() => removeSection(section.id)}
          onMove={dir => move(section.id, dir)}
        />
      ))}

      {showAdd ? (
        <div className="border rounded-lg p-3 bg-muted/20 flex flex-wrap items-center gap-2">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSection()}
            placeholder="Section name..."
            className="h-8 text-sm flex-1 min-w-36"
            autoFocus
          />
          <Select value={newType} onValueChange={v => setNewType(v as ContentSectionType)}>
            <SelectTrigger className="h-8 w-28 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="bullets">Bullets</SelectItem>
              <SelectItem value="specs">Specs</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" size="sm" className="h-8" onClick={addSection}>Add</Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => { setShowAdd(false); setNewName(''); }}>Cancel</Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-dashed h-8 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Custom Section
        </Button>
      )}
    </div>
  );
}

const TYPE_BADGE: Record<ContentSectionType, string> = {
  text: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  bullets: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  specs: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

interface SectionCardProps {
  section: ContentSection;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (patch: Partial<ContentSection>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

function SectionCard({ section, isFirst, isLast, onUpdate, onRemove, onMove }: SectionCardProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b">
        <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
        <Input
          value={section.name}
          onChange={e => onUpdate({ name: e.target.value })}
          className="h-7 text-sm font-medium border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 flex-1 min-w-0"
        />
        <Select
          value={section.type}
          onValueChange={v => {
            const type = v as ContentSectionType;
            const content: string | string[] = type === 'text' ? '' : [];
            onUpdate({ type, content });
          }}
        >
          <SelectTrigger className="h-6 w-auto border-0 bg-transparent shadow-none px-1 shrink-0 focus:ring-0">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_BADGE[section.type]}`}>
              {section.type.toUpperCase()}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="bullets">Bullets</SelectItem>
            <SelectItem value="specs">Specs</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center shrink-0 gap-0">
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 p-0" onClick={() => onMove(-1)} disabled={isFirst}>
            <ChevronUp className="w-3 h-3" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 p-0" onClick={() => onMove(1)} disabled={isLast}>
            <ChevronDown className="w-3 h-3" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="p-3">
        {section.type === 'text' && (
          <textarea
            value={section.content as string}
            onChange={e => onUpdate({ content: e.target.value })}
            placeholder="Enter details as a paragraph..."
            className="w-full min-h-[100px] resize-y text-sm p-2 border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        )}
        {section.type === 'bullets' && (
          <BulletsEditor
            value={section.content as string[]}
            onChange={bullets => onUpdate({ content: bullets })}
          />
        )}
        {section.type === 'specs' && (
          <SpecsEditor
            value={section.content as SpecRow[]}
            onChange={rows => onUpdate({ content: rows })}
          />
        )}
      </div>
    </div>
  );
}

function BulletsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-1.5">One bullet per line — blank lines are removed on save</p>
      <textarea
        value={value.join('\n')}
        onChange={e => onChange(e.target.value.split('\n'))}
        onBlur={e => onChange(e.target.value.split('\n').filter(l => l.trim()))}
        placeholder={"Rechargeable 2000mAh battery\n5-year warranty\nCompatible with iOS and Android"}
        className="w-full min-h-[100px] resize-y text-sm p-2 border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

function SpecsEditor({ value, onChange }: { value: SpecRow[]; onChange: (v: SpecRow[]) => void }) {
  const add = () => onChange([...value, { key: '', value: '' }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<SpecRow>) =>
    onChange(value.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="grid grid-cols-[1fr_1fr_32px] gap-2 px-1 mb-1">
          <span className="text-[10px] text-muted-foreground font-semibold tracking-wide">SPEC</span>
          <span className="text-[10px] text-muted-foreground font-semibold tracking-wide">VALUE</span>
        </div>
      )}
      {value.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
          <Input value={row.key} onChange={e => update(i, { key: e.target.value })} placeholder="e.g. Weight" className="h-8 text-sm" />
          <Input value={row.value} onChange={e => update(i, { value: e.target.value })} placeholder="e.g. 250g" className="h-8 text-sm" />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(i)}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ))}
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground py-1 px-1">No specs yet.</p>
      )}
      <Button type="button" variant="outline" size="sm" className="w-full h-8 text-xs border-dashed mt-1" onClick={add}>
        <Plus className="w-3 h-3 mr-1" />
        Add Row
      </Button>
    </div>
  );
}
