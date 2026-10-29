// @ts-nocheck
import { useMemo } from 'react';
import { AlertTriangle, Wand2, ArrowLeft } from 'lucide-react';
import {
  useRegistryEntries,
  personFieldsFromEntry,
  mergePersonFields,
  normalizeNameForMatch,
  normalizeNidForMatch,
  type RegistryEntry,
  type PersonFields,
} from '../lib/duplicateRegistry';

export { mergePersonFields };

export function useFieldMatches(
  matchBy: 'nid' | 'name',
  value: string,
  excludeDocId?: string
): RegistryEntry[] {
  const { entries } = useRegistryEntries();
  return useMemo(() => {
    const v = (value || '').trim();
    if (matchBy === 'nid') {
      const digits = normalizeNidForMatch(v);
      if (digits.length < 6) return [];
      return entries.filter(
        (e) => e.docId !== excludeDocId && normalizeNidForMatch(e.nationalId) === digits
      );
    }
    const nm = normalizeNameForMatch(v);
    if (nm.length < 4) return [];
    return entries.filter(
      (e) => e.docId !== excludeDocId && normalizeNameForMatch(e.name) === nm
    );
  }, [entries, matchBy, value, excludeDocId]);
}

export function DupStrip({ matches, onPick }: { matches: RegistryEntry[]; onPick?: (f: PersonFields) => void }) {
  if (!matches.length) return null;
  const labels = Array.from(new Set(matches.map((m) => m.sectionLabel)));
  return (
    <div className="flex flex-wrap items-center gap-2 mt-1 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 text-[11px] font-bold text-amber-800">
      <span className="flex items-center gap-1 shrink-0">
        <AlertTriangle className="w-3.5 h-3.5" />
        مسجل من قبل في:
      </span>
      {labels.map((l) => (
        <span key={l} className="bg-amber-200/70 text-amber-900 rounded-lg px-2 py-0.5">{l}</span>
      ))}
      {onPick && (
        <button
          type="button"
          onClick={() => onPick(personFieldsFromEntry(matches[0]))}
          className="flex items-center gap-1 text-emerald-700 hover:text-emerald-900 underline decoration-emerald-300 decoration-2 underline-offset-2 mr-auto shrink-0"
        >
          <Wand2 className="w-3.5 h-3.5" />
          تعبئة تلقائية للبيانات
          <ArrowLeft className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function hasDup(matches: RegistryEntry[]) {
  return matches.length > 0;
}

const cn = (...cls: any[]) => cls.filter(Boolean).join(' ');

// Standalone smart input: renders the input plus the duplicate/autofill strip.
// Used where screens keep their own label structure.
export function SmartInput({
  value,
  onChange,
  matchBy,
  excludeDocId,
  onPick,
  className,
  required,
  maxLength,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  matchBy: 'nid' | 'name';
  excludeDocId?: string;
  onPick?: (f: PersonFields) => void;
  className?: string;
  required?: boolean;
  maxLength?: number;
  type?: string;
}) {
  const matches = useFieldMatches(matchBy, value, excludeDocId);
  return (
    <div className="w-full">
      <input
        type={type}
        required={required}
        maxLength={maxLength}
        className={cn(className, matches.length > 0 && 'border-amber-400! bg-amber-50!')}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
      <DupStrip matches={matches} onPick={onPick} />
    </div>
  );
}
