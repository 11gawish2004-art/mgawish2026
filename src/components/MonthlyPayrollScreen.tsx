// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Printer, FileUp, FileDown, ArrowUpDown, Search, X, Loader2, Edit3, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import Logo from './Logo';
import ConfirmModal from './ConfirmModal';

interface PayrollItem {
  id: string;
  name: string;
  nationalId: string;
  phone: string;
  maritalStatus: string;
  amount: number;
}
interface PayrollList {
  id: string;
  title: string;
  date: string;
  items: PayrollItem[];
  createdAt?: any;
}

const COMMITTEE = [
  'صالح محمود صالح',
  'محمد السيد راغب',
  'عيشة عبدالقادر علام',
];
const MARITAL_OPTIONS = ['أرملة', 'مطلقة', 'متزوجة', 'عزباء', 'أعزب', 'متزوج', 'مطلق', 'أرمل'];
const ROWS_PER_PAGE = 13;
const toArabicDigits = (v: any) => String(v ?? '').replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
const COLUMNS: { key: keyof PayrollItem; label: string }[] = [
  { key: 'name', label: 'الاسم' },
  { key: 'nationalId', label: 'الرقم القومي' },
  { key: 'phone', label: 'رقم التليفون' },
  { key: 'maritalStatus', label: 'الحالة الاجتماعية' },
  { key: 'amount', label: 'المبلغ' },
];

const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n: number) => toArabicDigits((Number(n) || 0).toLocaleString('en-US'));

export default function MonthlyPayrollScreen() {
  const [lists, setLists] = useState<PayrollList[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // editor state
  const [search, setSearch] = useState('');
  const [filterCol, setFilterCol] = useState<string>('');
  const [sort1, setSort1] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [sort2, setSort2] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);

  // import dialog
  const [importData, setImportData] = useState<any[][] | null>(null);
  const [importMap, setImportMap] = useState<Record<string, number>>({});
  const [importHasHeader, setImportHasHeader] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'monthly_payroll_lists'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setLists(data);
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });
    return () => unsub();
  }, []);

  const active = lists.find((l) => l.id === activeId) || null;

  const createList = async () => {
    setCreating(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const ref = await addDoc(collection(db, 'monthly_payroll_lists'), {
        title: `كشف شهر ${new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}`,
        date: today,
        items: [],
        createdAt: serverTimestamp(),
      });
      setActiveId(ref.id);
    } finally { setCreating(false); }
  };

  const updateActive = async (patch: Partial<PayrollList>) => {
    if (!active) return;
    await updateDoc(doc(db, 'monthly_payroll_lists', active.id), patch as any);
  };

  const removeList = async (id: string) => {
    await deleteDoc(doc(db, 'monthly_payroll_lists', id));
    if (activeId === id) setActiveId(null);
  };

  // ---------- items ops ----------
  const addItem = () => {
    if (!active) return;
    const items = [...(active.items || []), { id: uid(), name: '', nationalId: '', phone: '', maritalStatus: '', amount: 0 }];
    updateActive({ items });
  };
  const updItem = (id: string, patch: Partial<PayrollItem>) => {
    if (!active) return;
    const items = active.items.map((it) => (it.id === id ? { ...it, ...patch } : it));
    updateActive({ items });
  };
  const delItem = (id: string) => {
    if (!active) return;
    updateActive({ items: active.items.filter((it) => it.id !== id) });
  };

  // ---------- view (filter + sort) ----------
  const view = useMemo(() => {
    if (!active) return [];
    let arr = [...active.items];
    if (search.trim()) {
      const s = search.trim();
      arr = arr.filter((it) => {
        if (filterCol) return String((it as any)[filterCol] ?? '').includes(s);
        return COLUMNS.some((c) => String((it as any)[c.key] ?? '').includes(s));
      });
    }
    const cmp = (a: any, b: any, col: string, dir: 'asc' | 'desc') => {
      const av = a[col]; const bv = b[col];
      const an = typeof av === 'number' ? av : parseFloat(av);
      const bn = typeof bv === 'number' ? bv : parseFloat(bv);
      let r: number;
      if (!isNaN(an) && !isNaN(bn)) r = an - bn;
      else r = String(av ?? '').localeCompare(String(bv ?? ''), 'ar');
      return dir === 'asc' ? r : -r;
    };
    if (sort1) arr.sort((a, b) => cmp(a, b, sort1.col, sort1.dir) || (sort2 ? cmp(a, b, sort2.col, sort2.dir) : 0));
    else if (sort2) arr.sort((a, b) => cmp(a, b, sort2.col, sort2.dir));
    return arr;
  }, [active, search, filterCol, sort1, sort2]);

  const grandTotal = useMemo(() => view.reduce((s, it) => s + (Number(it.amount) || 0), 0), [view]);

  // ---------- excel ----------
  const exportExcel = () => {
    if (!active) return;
    const rows = view.map((it, i) => ({
      'م': i + 1,
      'الاسم': it.name,
      'الرقم القومي': it.nationalId,
      'رقم التليفون': it.phone,
      'الحالة الاجتماعية': it.maritalStatus,
      'المبلغ': it.amount,
    }));
    rows.push({ 'م': '', 'الاسم': 'الإجمالي', 'الرقم القومي': '', 'رقم التليفون': '', 'الحالة الاجتماعية': '', 'المبلغ': grandTotal } as any);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'كشف القبض');
    XLSX.writeFile(wb, `${active.title || 'كشف_القبض'}.xlsx`);
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const arr = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      if (!arr.length) return;
      // auto-detect mapping by header row
      const header = arr[0].map((h) => String(h || '').trim());
      const guess: Record<string, number> = {};
      const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
      guess.name = find('اسم', 'الاسم');
      guess.nationalId = find('قومي', 'الرقم');
      guess.phone = find('تليفون', 'هاتف', 'موبايل');
      guess.maritalStatus = find('اجتماعي', 'الحالة');
      guess.amount = find('مبلغ', 'قيمة');
      setImportMap(guess);
      setImportData(arr);
      setImportHasHeader(true);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const confirmImport = () => {
    if (!active || !importData) return;
    const start = importHasHeader ? 1 : 0;
    const newItems: PayrollItem[] = [];
    for (let i = start; i < importData.length; i++) {
      const row = importData[i];
      if (!row || row.every((c) => c == null || c === '')) continue;
      newItems.push({
        id: uid(),
        name: String(row[importMap.name] ?? '').trim(),
        nationalId: String(row[importMap.nationalId] ?? '').trim(),
        phone: String(row[importMap.phone] ?? '').trim(),
        maritalStatus: String(row[importMap.maritalStatus] ?? '').trim(),
        amount: Number(row[importMap.amount]) || 0,
      });
    }
    updateActive({ items: [...(active.items || []), ...newItems] });
    setImportData(null); setImportMap({});
  };

  // ---------- print ----------
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open('', '_blank', 'width=1200,height=900');
    if (!w) return;
    const styles = `
      <style>
        @page { size: A4; margin: 10mm; }
        * { box-sizing: border-box; font-family: 'Cairo','Tajawal',Arial,sans-serif; }
        body { margin: 0; direction: rtl; color: #111; }
        .page { page-break-after: always; padding: 6mm; }
        .page:last-child { page-break-after: auto; }
        .hdr { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #047857; padding-bottom: 6px; }
        .hdr .right { text-align: right; font-size: 12px; line-height: 1.7; font-weight: 700; }
        .hdr .left img { width: 80px; height: 80px; object-fit: contain; }
        .title { text-align: center; margin: 8px 0; font-weight: 800; font-size: 14px; }
        .prev { text-align: left; font-weight: 700; font-size: 12px; margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
        th, td { border: 1px solid #333; padding: 5px 4px; text-align: center; }
        th { background: #ecfdf5; font-weight: 800; }
        .totals { margin-top: 8px; font-weight: 800; font-size: 12px; display:flex; justify-content: space-between; border-top: 2px dashed #047857; padding-top: 6px; }
        .committee { margin-top: 12px; font-size: 12px; }
        .committee .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #999; }
      </style>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8">${styles}</head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  const pages = useMemo(() => {
    const out: { items: PayrollItem[]; prev: number; total: number }[] = [];
    let prev = 0;
    for (let i = 0; i < view.length; i += ROWS_PER_PAGE) {
      const chunk = view.slice(i, i + ROWS_PER_PAGE);
      const total = chunk.reduce((s, it) => s + (Number(it.amount) || 0), 0);
      out.push({ items: chunk, prev, total });
      prev += total;
    }
    if (out.length === 0) out.push({ items: [], prev: 0, total: 0 });
    return out;
  }, [view]);

  const logoUrl = (typeof window !== 'undefined' && localStorage.getItem('app_logo_url')) || 'https://i.ibb.co/L6V2yq9/logo.png';

  // ---------- UI ----------
  if (!active) {
    return (
      <div className="p-6 lg:p-10" dir="rtl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl lg:text-3xl font-black text-emerald-900">كشف القبض الشهري</h1>
          <button onClick={createList} disabled={creating} className="bg-emerald-600 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-200 disabled:opacity-50">
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />} كشف جديد
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-emerald-400"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
        ) : lists.length === 0 ? (
          <div className="bg-emerald-50/40 border border-emerald-100 rounded-3xl p-16 text-center text-emerald-700">
            <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-emerald-400" />
            <p className="font-bold mb-2">لا توجد كشوف بعد</p>
            <p className="text-sm text-emerald-600/70">ابدأ بإنشاء كشف جديد لإدارة المساعدات الشهرية</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lists.map((l) => (
              <motion.div key={l.id} whileHover={{ y: -3 }} className="bg-white border border-emerald-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-black text-emerald-900">{l.title}</h3>
                    <p className="text-xs text-stone-500">{l.date}</p>
                  </div>
                  <button onClick={() => setConfirmDelete(l.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="text-sm text-stone-600 mb-3">عدد الحالات: <span className="font-bold text-emerald-700">{l.items?.length || 0}</span></div>
                <div className="text-sm text-stone-600 mb-4">الإجمالي: <span className="font-bold text-emerald-700">{fmt((l.items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0))} ج.م</span></div>
                <button onClick={() => setActiveId(l.id)} className="w-full bg-emerald-50 text-emerald-700 py-2 rounded-xl font-bold hover:bg-emerald-100 flex items-center justify-center gap-2">
                  <Edit3 className="w-4 h-4" /> فتح وتحرير
                </button>
              </motion.div>
            ))}
          </div>
        )}

        <ConfirmModal
          isOpen={!!confirmDelete}
          title="حذف الكشف"
          message="هل أنت متأكد من حذف الكشف نهائياً؟"
          onConfirm={() => { removeList(confirmDelete!); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      </div>
    );
  }

  // ---------- editor ----------
  return (
    <div className="p-4 lg:p-8" dir="rtl">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button onClick={() => setActiveId(null)} className="px-4 py-2 bg-stone-100 text-stone-700 rounded-xl font-bold">رجوع</button>
        <input value={active.title} onChange={(e) => updateActive({ title: e.target.value })} className="flex-1 min-w-[200px] px-4 py-2 border border-emerald-100 rounded-xl font-bold text-emerald-900" />
        <input type="date" value={active.date} onChange={(e) => updateActive({ date: e.target.value })} className="px-4 py-2 border border-emerald-100 rounded-xl" />
      </div>

      <div className="bg-white border border-emerald-100 rounded-2xl p-4 mb-4 flex flex-wrap gap-2 items-center">
        <button onClick={addItem} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2"><Plus className="w-4 h-4" />إضافة حالة</button>
        <button onClick={() => fileRef.current?.click()} className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl font-bold flex items-center gap-2"><FileUp className="w-4 h-4" />استيراد Excel</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImportFile} />
        <button onClick={exportExcel} className="bg-amber-50 text-amber-700 px-4 py-2 rounded-xl font-bold flex items-center gap-2"><FileDown className="w-4 h-4" />تصدير Excel</button>
        <button onClick={handlePrint} className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl font-bold flex items-center gap-2"><Printer className="w-4 h-4" />طباعة</button>

        <div className="flex-1" />

        <div className="flex items-center gap-2 bg-stone-50 px-3 py-2 rounded-xl border border-stone-100">
          <Search className="w-4 h-4 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="bg-transparent outline-none text-sm" />
          <select value={filterCol} onChange={(e) => setFilterCol(e.target.value)} className="bg-transparent text-xs outline-none">
            <option value="">كل الخانات</option>
            {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>

        <SortPicker label="ترتيب 1" value={sort1} onChange={setSort1} />
        <SortPicker label="ترتيب 2" value={sort2} onChange={setSort2} />
      </div>

      <div className="bg-white border border-emerald-100 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-emerald-50">
            <tr>
              <th className="p-3 font-bold text-emerald-900">م</th>
              {COLUMNS.map((c) => <th key={c.key} className="p-3 font-bold text-emerald-900 text-right">{c.label}</th>)}
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr><td colSpan={COLUMNS.length + 2} className="text-center py-10 text-stone-400">لا توجد بيانات. اضغط "إضافة حالة" أو استورد Excel.</td></tr>
            )}
            {view.map((it, i) => (
              <tr key={it.id} className="border-t border-emerald-50 hover:bg-emerald-50/30">
                <td className="p-2 text-center font-bold text-emerald-700 tabular-nums">{i + 1}</td>
                <td className="p-1"><input value={it.name} onChange={(e) => updItem(it.id, { name: e.target.value })} className="w-full px-2 py-2 rounded-lg border border-transparent focus:border-emerald-200 outline-none" /></td>
                <td className="p-1"><input value={it.nationalId} onChange={(e) => updItem(it.id, { nationalId: e.target.value })} className="w-full px-2 py-2 rounded-lg border border-transparent focus:border-emerald-200 outline-none tabular-nums" /></td>
                <td className="p-1"><input value={it.phone} onChange={(e) => updItem(it.id, { phone: e.target.value })} className="w-full px-2 py-2 rounded-lg border border-transparent focus:border-emerald-200 outline-none tabular-nums" /></td>
                <td className="p-1">
                  <input list="marital-opts" value={it.maritalStatus} onChange={(e) => updItem(it.id, { maritalStatus: e.target.value })} className="w-full px-2 py-2 rounded-lg border border-transparent focus:border-emerald-200 outline-none" />
                </td>
                <td className="p-1"><input type="number" value={it.amount} onChange={(e) => updItem(it.id, { amount: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-2 rounded-lg border border-transparent focus:border-emerald-200 outline-none tabular-nums" /></td>
                <td className="p-2"><button onClick={() => delItem(it.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-lg"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-emerald-50/50">
            <tr>
              <td colSpan={5} className="p-3 text-left font-black text-emerald-900">الإجمالي</td>
              <td className="p-3 text-center font-black text-emerald-900 tabular-nums">{fmt(grandTotal)} ج.م</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <datalist id="marital-opts">{MARITAL_OPTIONS.map((o) => <option key={o} value={o} />)}</datalist>
      </div>

      {/* hidden print template */}
      <div className="hidden"><div ref={printRef}>
        {pages.map((pg, idx) => (
          <div key={idx} className="page">
            <div className="hdr">
              <div className="right">
                مديرية الشئون الإجتماعية بالدقهلية<br />
                إدارة الشئون الإجتماعية بنبروه<br />
                جمعية بصمة خير بنبروه<br />
                المشهرة برقم 2510 لسنة 2015
              </div>
              <div className="left"><img src={logoUrl} alt="logo" /></div>
            </div>
            <div className="title">
              كشف بأسماء الحالات المستحقة للمساعدة بالجمعية عبارة عن كفالة شهرية بقيمة 100 جنيهات لكل أسرة بتاريخ {active.date || '__/__/20__'}
            </div>
            <div className="prev">الإجمالي السابق: {fmt(pg.prev)} ج.م &nbsp; | &nbsp; صفحة {idx + 1} من {pages.length}</div>
            <table>
              <thead>
                <tr>
                  <th>م</th><th>الاسم</th><th>الرقم القومي</th><th>رقم التليفون</th><th>الحالة الاجتماعية</th><th>المبلغ</th><th>التوقيع</th>
                </tr>
              </thead>
              <tbody>
                {pg.items.map((it, i) => (
                  <tr key={it.id}>
                    <td>{idx * ROWS_PER_PAGE + i + 1}</td>
                    <td>{it.name}</td>
                    <td>{it.nationalId}</td>
                    <td>{it.phone}</td>
                    <td>{it.maritalStatus}</td>
                    <td>{fmt(it.amount)}</td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="totals">
              <span>إجمالي الصفحة: {fmt(pg.total)} ج.م</span>
              <span>الإجمالي التراكمي: {fmt(pg.prev + pg.total)} ج.م</span>
            </div>
            <div className="committee">
              <div style={{ fontWeight: 800, marginBottom: 6 }}>لجنة التوزيع:</div>
              {COMMITTEE.map((n, i) => (
                <div key={i} className="row"><span>{i + 1}- {n}</span><span>التوقيع ............................</span></div>
              ))}
            </div>
          </div>
        ))}
      </div></div>

      {/* import dialog */}
      <AnimatePresence>
        {importData && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" dir="rtl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-black text-emerald-900">استيراد من Excel</h3>
                <button onClick={() => setImportData(null)} className="p-2 hover:bg-stone-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-stone-600 mb-4">حدد رقم العمود لكل خانة من البيانات (الأعمدة مرقمة من 0):</p>
              <label className="flex items-center gap-2 mb-4 text-sm">
                <input type="checkbox" checked={importHasHeader} onChange={(e) => setImportHasHeader(e.target.checked)} />
                الملف يحتوي على صف رؤوس (سيتم تجاهله)
              </label>
              <div className="grid grid-cols-2 gap-3">
                {COLUMNS.map((c) => (
                  <div key={c.key}>
                    <label className="block text-xs font-bold text-stone-600 mb-1">{c.label}</label>
                    <select value={importMap[c.key] ?? -1} onChange={(e) => setImportMap({ ...importMap, [c.key]: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-stone-200 rounded-lg">
                      <option value={-1}>(تجاهل)</option>
                      {(importData[0] || []).map((h: any, i: number) => (
                        <option key={i} value={i}>عمود {i} — {String(h ?? '').slice(0, 30)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-6 bg-stone-50 rounded-xl p-3 text-xs">
                <div className="font-bold mb-2">معاينة أول 3 صفوف:</div>
                <div className="overflow-x-auto">
                  <table className="text-xs"><tbody>
                    {importData.slice(0, 3).map((r, i) => (
                      <tr key={i}>{r.map((c: any, j: number) => <td key={j} className="border px-2 py-1">{String(c ?? '')}</td>)}</tr>
                    ))}
                  </tbody></table>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={confirmImport} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold">استيراد</button>
                <button onClick={() => setImportData(null)} className="px-6 bg-stone-100 text-stone-700 py-3 rounded-xl font-bold">إلغاء</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SortPicker({ label, value, onChange }: { label: string; value: any; onChange: (v: any) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="px-3 py-2 bg-stone-50 border border-stone-100 rounded-xl text-xs font-bold flex items-center gap-1">
        <ArrowUpDown className="w-3 h-3" />{label}{value ? `: ${COLUMNS.find((c) => c.key === value.col)?.label} ${value.dir === 'asc' ? '↑' : '↓'}` : ''}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 bg-white border border-stone-200 rounded-xl shadow-lg z-30 p-2 w-48">
          <button onClick={() => { onChange(null); setOpen(false); }} className="w-full text-right px-3 py-1.5 text-xs hover:bg-stone-50 rounded">بدون ترتيب</button>
          {COLUMNS.map((c) => (
            <div key={c.key} className="flex">
              <button onClick={() => { onChange({ col: c.key, dir: 'asc' }); setOpen(false); }} className="flex-1 text-right px-3 py-1.5 text-xs hover:bg-emerald-50 rounded">{c.label} ↑</button>
              <button onClick={() => { onChange({ col: c.key, dir: 'desc' }); setOpen(false); }} className="flex-1 text-right px-3 py-1.5 text-xs hover:bg-emerald-50 rounded">{c.label} ↓</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
