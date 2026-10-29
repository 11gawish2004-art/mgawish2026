// @ts-nocheck
import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface SectionDef {
  id: string;
  label: string;
  collection: string;
  // function that, given a doc, returns array of { name, nationalId, phone? } sub-entries
  extract: (d: any) => Array<{ name: string; nationalId: string; phone?: string; subKey?: string }>;
  route: string;
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'cases',
    label: 'الحالات',
    collection: 'cases',
    route: '/cases',
    extract: (d) => [{ name: d.name || '', nationalId: d.nationalId || '', phone: d.phone || '' }],
  },
  {
    id: 'reception',
    label: 'الاستقبال',
    collection: 'reception_cases',
    route: '/reception',
    extract: (d) => [{ name: d.name || '', nationalId: d.nationalId || '', phone: d.phone || '' }],
  },
  {
    id: 'seasonal',
    label: 'الحالات الموسمية',
    collection: 'seasonal_cases',
    route: '/seasonal',
    extract: (d) => [{ name: d.name || '', nationalId: d.nationalId || '', phone: d.phone || '' }],
  },
  {
    id: 'marriage',
    label: 'حالات الزواج',
    collection: 'marriageCases',
    route: '/marriage',
    extract: (d) => [{ name: d.brideName || '', nationalId: d.brideNationalId || '', phone: d.bridePhone || d.guardianPhone || '' }],
  },
  {
    id: 'orphans',
    label: 'هيئة الأعمال',
    collection: 'orphans',
    route: '/orphans',
    extract: (d) => {
      const out: any[] = [];
      if (d.guardianName) out.push({ name: d.guardianName, nationalId: d.guardianId || '', phone: d.guardianPhone || d.phone || '', subKey: 'guardian' });
      (d.orphans || []).forEach((o: any, i: number) => {
        if (o?.name) out.push({ name: o.name, nationalId: o.id || '', phone: '', subKey: `orphan-${i}` });
      });
      return out;
    },
  },
  {
    id: 'payroll',
    label: 'كشف القبض الشهري',
    collection: 'monthly_payroll_lists',
    route: '/payroll',
    extract: (d) => (d.items || []).map((it: any, i: number) => ({
      name: it.name || '', nationalId: it.nationalId || '', phone: it.phone || '', subKey: `item-${i}`,
    })),
  },
  {
    id: 'medical',
    label: 'الحالات المرضية',
    collection: 'medicalCases',
    route: '/medical-records',
    extract: (d) => {
      const out: any[] = [];
      if (d.name) out.push({ name: d.name, nationalId: d.nationalId || '', phone: d.phone || '' });
      if (d.guardianName) out.push({ name: d.guardianName, nationalId: d.guardianNationalId || '', phone: d.guardianPhone || d.phone || '', subKey: 'guardian' });
      return out;
    },
  },
];

export interface RegistryEntry {
  sectionId: string;
  sectionLabel: string;
  collection: string;
  docId: string;
  name: string;
  nationalId: string;
  phone: string;
  subKey?: string;
  raw: any;
}

const normalizeName = (s: string) =>
  (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const normalizeNid = (s: string) => (s || '').replace(/[^0-9]/g, '');

// ============ Shared singleton registry (one live subscription set for all consumers) ============
let cachedEntries: RegistryEntry[] | null = null;
let cachedLoading = true;
const listeners = new Set<(entries: RegistryEntry[], loading: boolean) => void>();
const unsubs: Array<() => void> = [];
let refCount = 0;

function ensureSubscribed() {
  if (refCount++ > 0) return;
  let loaded = 0;
  SECTIONS.forEach((s) => {
    const u = onSnapshot(
      collection(db, s.collection),
      (snap) => {
        const arr = snap.docs.map((d) => ({ __id: d.id, ...(d.data() as any) }));
        sectionDocs.set(s.id, arr);
        loaded++;
        if (loaded >= SECTIONS.length) { cachedLoading = false; }
        rebuild();
      },
      (e) => { console.warn('registry sub error', s.id, e); loaded++; if (loaded >= SECTIONS.length) { cachedLoading = false; rebuild(); } }
    );
    unsubs.push(u);
  });
}

function releaseSubscription() {
  if (--refCount > 0) return;
  unsubs.forEach((u) => u());
  unsubs.length = 0;
  cachedEntries = null;
  cachedLoading = true;
  sectionDocs.clear();
}

const sectionDocs = new Map<string, any[]>();

function rebuild() {
  const bySection: Record<string, any[]> = {};
  sectionDocs.forEach((v, k) => { bySection[k] = v; });
  const out: RegistryEntry[] = [];
  SECTIONS.forEach((s) => {
    (bySection[s.id] || []).forEach((d: any) => {
      s.extract(d).forEach((e) => {
        if (!e.name && !e.nationalId) return;
        out.push({
          sectionId: s.id,
          sectionLabel: s.label,
          collection: s.collection,
          docId: d.__id,
          name: e.name,
          nationalId: e.nationalId,
          phone: e.phone || '',
          subKey: e.subKey,
          raw: d,
        });
      });
    });
  });
  cachedEntries = out;
  listeners.forEach((l) => l(out, cachedLoading));
}

// subscribe to the shared registry; recomputes only when entries array identity changes
export function useRegistryEntries(): { entries: RegistryEntry[]; loading: boolean } {
  const [state, setState] = useState<{ entries: RegistryEntry[]; loading: boolean }>(() => ({
    entries: cachedEntries || [], loading: cachedLoading,
  }));
  useEffect(() => {
    ensureSubscribed();
    const listener = (entries: RegistryEntry[], loading: boolean) => setState({ entries, loading });
    listeners.add(listener);
    if (cachedEntries) setState({ entries: cachedEntries, loading: cachedLoading });
    return () => { listeners.delete(listener); releaseSubscription(); };
  }, []);
  return state;
}

// Legacy hook kept for DuplicatesScreen — now shares the singleton subscription
export function useDuplicateRegistry() {
  const { entries, loading } = useRegistryEntries();

  const bySection = useMemo(() => {
    const m: Record<string, any[]> = {};
    entries.forEach((e) => {
      if (!m[e.sectionId]) m[e.sectionId] = [];
      if (!m[e.sectionId].some((d: any) => d.__id === e.docId)) m[e.sectionId].push(e.raw);
    });
    return m;
  }, [entries]);

  const duplicateGroups = useMemo(() => {
    const byNid = new Map<string, RegistryEntry[]>();
    const byName = new Map<string, RegistryEntry[]>();
    entries.forEach((e) => {
      const nid = normalizeNid(e.nationalId);
      const nm = normalizeName(e.name);
      if (nid && nid.length >= 6) {
        if (!byNid.has(nid)) byNid.set(nid, []);
        byNid.get(nid)!.push(e);
      }
      if (nm && nm.length >= 4) {
        if (!byName.has(nm)) byName.set(nm, []);
        byName.get(nm)!.push(e);
      }
    });
    const groups: { type: 'nid' | 'name'; key: string; entries: RegistryEntry[] }[] = [];
    byNid.forEach((arr, key) => { if (arr.length > 1) groups.push({ type: 'nid', key, entries: arr }); });
    byName.forEach((arr, key) => {
      if (arr.length > 1) {
        const sameNid = arr.every((e) => e.nationalId && arr[0].nationalId && normalizeNid(e.nationalId) === normalizeNid(arr[0].nationalId));
        if (!sameNid) groups.push({ type: 'name', key, entries: arr });
      }
    });
    return groups;
  }, [entries]);

  const lookup = (name: string, nationalId: string, excludeDocId?: string): RegistryEntry[] => {
    const nid = normalizeNid(nationalId);
    const nm = normalizeName(name);
    return entries.filter((e) => {
      if (e.docId === excludeDocId) return false;
      if (nid && nid.length >= 6 && normalizeNid(e.nationalId) === nid) return true;
      if (nm && nm.length >= 4 && normalizeName(e.name) === nm) return true;
      return false;
    });
  };

  return { entries, duplicateGroups, lookup, loading, bySection };
}

export const normalizeNameForMatch = normalizeName;
export const normalizeNidForMatch = normalizeNid;

// ============ Person lookup helpers for fast data entry ============

export interface PersonFields {
  name: string;
  nationalId: string;
  phone: string;
  address: string;
  village: string;
  entry: RegistryEntry;
}

export function personFieldsFromEntry(e: RegistryEntry): PersonFields {
  const raw = e.raw || {};
  return {
    name: e.name || raw.name || raw.brideName || raw.guardianName || '',
    nationalId: e.nationalId || raw.nationalId || raw.brideNationalId || raw.guardianId || '',
    phone: e.phone || raw.phone || raw.guardianPhone || raw.bridePhone || '',
    address: raw.address || '',
    village: raw.village || '',
    entry: e,
  };
}

// merge person fields into a form object, only filling fields that are still empty
export function mergePersonFields<T extends Record<string, any>>(form: T, f: Partial<PersonFields>): T {
  const out: any = { ...form };
  for (const k of ['name', 'phone', 'village', 'address'] as const) {
    if (f[k] && !out[k]) out[k] = f[k];
  }
  return out;
}

// move a case (entry.raw) into another section; copies common fields, deletes source if move=true
export async function transferEntry(
  entry: RegistryEntry,
  targetSectionId: string,
  mode: 'copy' | 'move'
): Promise<void> {
  const target = SECTIONS.find((s) => s.id === targetSectionId);
  if (!target) throw new Error('قسم غير معروف');

  const base: any = {
    createdAt: serverTimestamp(),
    transferredFrom: entry.sectionId,
    transferredAt: new Date().toISOString(),
  };

  // map fields per target schema
  if (target.id === 'marriage') {
    base.brideName = entry.name;
    base.brideNationalId = entry.nationalId;
    base.bridePhone = entry.phone;
  } else if (target.id === 'orphans') {
    base.guardianName = entry.name;
    base.guardianId = entry.nationalId;
    base.guardianPhone = entry.phone;
    base.orphans = [];
  } else if (target.id === 'payroll') {
    // append to a new list
    base.title = `كشف منقول من ${entry.sectionLabel}`;
    base.date = new Date().toISOString().slice(0, 10);
    base.items = [{
      id: Math.random().toString(36).slice(2, 10),
      name: entry.name,
      nationalId: entry.nationalId,
      phone: entry.phone,
      maritalStatus: '',
      amount: 0,
    }];
  } else {
    base.name = entry.name;
    base.nationalId = entry.nationalId;
    base.phone = entry.phone;
    base.status = 'pending';
  }

  await addDoc(collection(db, target.collection), base);
  if (mode === 'move') {
    // only delete if source entry IS a top-level doc (not a sub-item like payroll item or orphan child)
    if (!entry.subKey || entry.subKey === 'guardian') {
      await deleteDoc(doc(db, entry.collection, entry.docId));
    }
  }
}
