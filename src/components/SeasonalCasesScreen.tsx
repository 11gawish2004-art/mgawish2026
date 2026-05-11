import React, { useState, useEffect } from 'react';
import { Plus, Search, MapPin, Phone, Trash2, Edit, X, Download, Filter, Calendar, Utensils, Gift, Box, Heart, Printer, CheckCircle2, ChevronDown, ListFilter, Users, ClipboardList, Info, ArrowRight, Save, Clock, Loader2, FileCheck, UploadCloud } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, serverTimestamp, deleteDoc, writeBatch } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import ConfirmModal from './ConfirmModal';
import { useRef } from 'react';
import { uploadToGoogleDrive } from '../lib/driveUpload';
import FileUploadSlot, { FileAttachment } from './FileUploadSlot';

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

const ORGANIZATIONS = [
  'هيئة الاعمال الخيرية',
  'رابطة العالم الاسلامي',
  'مؤسسة مصر الخير',
  'بنك الطعام',
  'كرتونة/ شنطة الجمعية',
  'مؤسسة اكرام',
  'مؤسسة العناني',
  'شركة عمان',
  'آخر'
];

const DISTRIBUTION_TYPES = [
  'إطعام',
  'أضاحي',
  'شنط رمضان',
  'كراتين رمضان'
];

interface SeasonalCase {
  id: string;
  name: string;
  nationalId: string;
  phone: string;
  village: string;
  organization: string;
  otherOrgName?: string;
  distType: string;
  quantity: number;
  deliveryDate: string;
  collected: boolean;
  notes: string;
  createdAt: any;
}

interface ResearchRecord {
  id: string;
  date: string;
  hasChanged: boolean;
  schoolExpenses: number;
  livingExpenses: number;
  otherExpenses: number;
  incomePension: number;
  incomeInsurance: number;
  incomeSalary: number;
  incomeOther: number;
  notes: string;
  createdAt: any;
}

export default function SeasonalCasesScreen() {
  const [items, setItems] = useState<SeasonalCase[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<SeasonalCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterOrg, setFilterOrg] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // Periodic Research State
  const [showResearchModal, setShowResearchModal] = useState(false);
  const [researchCase, setResearchCase] = useState<SeasonalCase | null>(null);
  const [researchRecords, setResearchRecords] = useState<ResearchRecord[]>([]);
  const [showAddResearch, setShowAddResearch] = useState(false);
  const [researchFormData, setResearchFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    hasChanged: false,
    schoolExpenses: 0,
    livingExpenses: 0,
    otherExpenses: 0,
    incomePension: 0,
    incomeInsurance: 0,
    incomeSalary: 0,
    incomeOther: 0,
    notes: ''
  });

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const initialForm = {
    name: '',
    nationalId: '',
    phone: '',
    village: '',
    organization: ORGANIZATIONS[0],
    otherOrgName: '',
    distType: DISTRIBUTION_TYPES[0],
    quantity: 1,
    deliveryDate: new Date().toISOString().split('T')[0],
    collected: false,
    notes: '',
    attachments: [] as FileAttachment[]
  };

  const [formData, setFormData] = useState(initialForm);

  const handleDownloadPDF = async (title: string, elementId: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '210mm';
    container.style.direction = 'rtl';
    container.style.padding = '20px';
    container.style.background = '#ffffff';
    container.style.fontFamily = "'Amiri', serif";
    
    const clone = element.cloneNode(true) as HTMLElement;
    container.appendChild(clone);
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${title}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      document.body.removeChild(container);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'seasonal_cases'), orderBy('createdAt', sortOrder));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SeasonalCase));
      setItems(data);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'seasonal_cases'));

    return () => unsubscribe();
  }, [sortOrder]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await updateDoc(doc(db, 'seasonal_cases', editingItem.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'seasonal_cases'), {
          ...formData,
          createdAt: serverTimestamp()
        });
      }
      setShowAddForm(false);
      setFormData(initialForm);
      setEditingItem(null);
      alert('تم حفظ البيانات بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'seasonal_cases');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'حذف سجل توزيع',
      message: `هل أنت متأكد من حذف سجل التوزيع الخاص بـ "${name}"؟`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'seasonal_cases', id));
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `seasonal_cases/${id}`);
        }
      }
    });
  };

  const exportToExcel = () => {
    const data = items.map(c => ({
      'الاسم': c.name,
      'الرقم القومي': c.nationalId,
      'الهاتف': c.phone,
      'القرية': c.village,
      'الهيئة': c.organization === 'آخر' ? c.otherOrgName : c.organization,
      'النوع': c.distType,
      'الكمية': c.quantity,
      'تاريخ الاستلام': c.deliveryDate,
      'الحالة': c.collected ? 'تم الاستلام' : 'لم يستلم بعد',
      'ملاحظات': c.notes
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Seasonal");
    XLSX.writeFile(wb, "الحالات_الموسمية.xlsx");
  };

  const printVouchers = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <html>
        <head>
          <title>بونات التوزيع الموسمي</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
            body { font-family: 'Amiri', serif; direction: rtl; padding: 10px; background: #fff; }
            .voucher-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .voucher { border: 2px dashed #d97706; padding: 20px; border-radius: 15px; position: relative; height: 300px; box-sizing: border-box; background: #fffbeb; }
            .v-header { text-align: center; border-bottom: 2px solid #fde68a; margin-bottom: 15px; padding-bottom: 10px; }
            .v-header h2 { margin: 0; font-size: 18px; color: #92400e; }
            .v-body p { margin: 8px 0; font-size: 15px; font-weight: bold; color: #451a03; }
            .v-footer { margin-top: 20px; border-top: 1px solid #fde68a; pt: 10px; display: flex; justify-content: space-between; font-size: 12px; color: #92400e; }
            .stamp { position: absolute; bottom: 40px; left: 40px; transform: rotate(-15deg); border: 2px solid #ef4444; color: #ef4444; padding: 5px 10px; font-weight: bold; opacity: 0.2; border-radius: 5px; }
            @media print { .no-print { display: none; } body { padding: 0; } .voucher { page-break-inside: avoid; } }
          </style>
        </head>
        <body>
          <div class="voucher-grid">
            ${filteredItems.map((item, index) => `
              <div class="voucher">
                <div class="v-header">
                  <h2>جمعية بصمة خير - كشف التوزيع</h2>
                  <p style="font-size: 12px; margin: 0; color: #b45309;">${item.distType} - ${item.organization === 'آخر' ? item.otherOrgName : item.organization}</p>
                </div>
                <div class="v-body">
                  <p>الاسم: ${item.name}</p>
                  <p>الرقم القومي: ${item.nationalId}</p>
                  <p>القرية: ${item.village}</p>
                  <p>الكمية: ${item.quantity}</p>
                  <p>تاريخ الاستلام: ${item.deliveryDate}</p>
                </div>
                <div class="stamp">بصمة خير نبروه</div>
                <div class="v-footer">
                  <span>مسلسل: #${(index + 1).toString().padStart(3, '0')}</span>
                  <span>التوقيع: ....................</span>
                </div>
              </div>
            `).join('')}
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const filteredItems = items.filter(i => {
    const matchesSearch = i.name.includes(searchQuery) || i.nationalId.includes(searchQuery);
    const matchesOrg = filterOrg === 'all' || i.organization === filterOrg;
    const matchesType = filterType === 'all' || i.distType === filterType;
    return matchesSearch && matchesOrg && matchesType;
  });

  useEffect(() => {
    if (researchCase && showResearchModal) {
      const q = query(
        collection(db, 'seasonal_cases', researchCase.id, 'periodic_research'), 
        orderBy('createdAt', 'desc')
      );
      
      const unsubscribe = onSnapshot(q, (snap) => {
        setResearchRecords(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ResearchRecord)));
      }, (error) => handleFirestoreError(error, OperationType.LIST, `seasonal_cases/${researchCase.id}/periodic_research`));

      return () => unsubscribe();
    }
  }, [researchCase, showResearchModal]);

  const openResearch = (item: SeasonalCase) => {
    setResearchCase(item);
    setShowResearchModal(true);
    setResearchRecords([]);
  };

  const handleAddResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!researchCase) return;

    setConfirmConfig({
      isOpen: true,
      title: 'تأكيد حفظ بحث الحالة الموسمية',
      message: `هل أنت متأكد من حفظ التحديث الدوري لبيانات الحالة: ${researchCase.name}؟`,
      onConfirm: async () => {
        try {
          await addDoc(collection(db, 'seasonal_cases', researchCase.id, 'periodic_research'), {
            ...researchFormData,
            createdAt: serverTimestamp()
          });
          setShowAddResearch(false);
          setResearchFormData({
            date: new Date().toISOString().split('T')[0],
            hasChanged: false,
            schoolExpenses: 0,
            livingExpenses: 0,
            otherExpenses: 0,
            incomePension: 0,
            incomeInsurance: 0,
            incomeSalary: 0,
            incomeOther: 0,
            notes: ''
          });
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          alert('تم إضافة التحديث الدوري لبيانات الحالة');
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `seasonal_cases/${researchCase.id}/periodic_research`);
        }
      }
    });
  };

  return (
    <div className="p-6 space-y-6 text-right font-sans" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-emerald-50">
        <div className="flex items-center gap-4">
          <div className="bg-amber-500 p-4 rounded-2xl shadow-lg">
            <Gift className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-emerald-950">الحالات الموسمية</h1>
            <p className="text-amber-600 font-bold text-sm">إدارة توزيعات الإطعام والأضاحي وشنط رمضان</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => handleDownloadPDF('كشف_الحالات_الموسمية', 'seasonal-table-full')}
            className="p-3 bg-white border-2 border-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all shadow-sm flex items-center gap-2"
          >
            <FileText className="w-5 h-5" />
            <span className="text-xs font-bold">تحميل PDF</span>
          </button>
          <button onClick={exportToExcel} className="p-3 bg-white border border-amber-100 text-amber-600 rounded-xl hover:bg-amber-50">
            <Download className="w-5 h-5" />
          </button>
          <button onClick={printVouchers} className="p-3 bg-white border border-amber-100 text-amber-600 rounded-xl hover:bg-amber-50 flex items-center gap-2">
            <Printer className="w-5 h-5" />
            <span className="text-xs font-bold">طباعة البونات</span>
          </button>
          <button 
            onClick={() => { setEditingItem(null); setFormData(initialForm); setShowAddForm(true); }}
            className="bg-amber-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-amber-700 transition-all shadow-lg shadow-amber-200"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة توزيع جديد</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
        <div className="md:col-span-2 relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-300 w-5 h-5" />
          <input 
            type="text" 
            placeholder="ابحث بالاسم أو الرقم القومي..."
            className="w-full bg-stone-50 border border-stone-100 pr-12 pl-6 py-3 rounded-xl outline-none focus:border-amber-500 font-bold"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div>
           <select 
            className="w-full bg-stone-50 border border-stone-100 p-3 rounded-xl outline-none font-bold text-right"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
           >
             <option value="desc">الأحدث أولاً</option>
             <option value="asc">الأقدم أولاً</option>
           </select>
        </div>
        <div>
           <select 
            className="w-full bg-stone-50 border border-stone-100 p-3 rounded-xl outline-none font-bold text-right"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
           >
             <option value="all">كل أنواع التوزيع</option>
             {DISTRIBUTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
           </select>
        </div>
        <div>
           <select 
            className="w-full bg-stone-50 border border-stone-100 p-3 rounded-xl outline-none font-bold text-right"
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value)}
           >
             <option value="all">كل الهيئات</option>
             {ORGANIZATIONS.map(o => <option key={o} value={o}>{o}</option>)}
           </select>
        </div>
      </div>

      {/* Table View Component */}
      <div className="bg-white rounded-[2.5rem] border border-emerald-50 shadow-xl overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto custom-scrollbar sticky-table-container">
          <table id="seasonal-table-full" className="w-full text-right border-collapse min-w-[1000px] bg-white" dir="rtl">
            <thead>
              <tr className="bg-emerald-50/50">
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">مسلسل</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">اسم المستفيد</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">الرقم القومي</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">الهاتف</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">الهيئة المانحة</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100 font-arabic-bold text-amber-600">نوع التوزيع</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">القرية</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">الحالة</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50 text-right">
              {filteredItems.map((item, index) => (
                <tr key={item.id} className="hover:bg-emerald-50/20 transition-colors group">
                  <td className="p-5 text-stone-400 font-bold text-xs tabular-nums text-right">{index + 1}</td>
                  <td className="p-5 text-right">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4 text-emerald-600" />
                      </div>
                      <span className="font-black text-emerald-950 text-sm whitespace-nowrap">{item.name}</span>
                    </div>
                  </td>
                  <td className="p-5 text-stone-600 font-bold text-xs tabular-nums text-right">{item.nationalId}</td>
                  <td className="p-5 text-right">
                    <a href={`tel:${item.phone}`} className="text-xs font-black text-emerald-600 tabular-nums hover:underline">{item.phone}</a>
                  </td>
                  <td className="p-5 text-right">
                    <div className="flex items-center gap-2">
                       <Heart className="w-3 h-3 text-rose-400" />
                       <span className="text-sm font-bold text-emerald-800">{item.organization === 'آخر' ? item.otherOrgName : item.organization}</span>
                    </div>
                  </td>
                  <td className="p-5 text-right">
                    <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black">{item.distType}</span>
                  </td>
                  <td className="p-5 text-right font-bold text-stone-600 px-10 text-xs">{item.village}</td>
                  <td className="p-5 text-right">
                    {item.collected ? (
                      <span className="flex items-center gap-1 text-emerald-600 text-[10px] font-black">
                        <CheckCircle2 className="w-4 h-4" />
                        تم الاستلام
                      </span>
                    ) : (
                      <button 
                        onClick={async () => await updateDoc(doc(db, 'seasonal_cases', item.id), { collected: true })}
                        className="text-[10px] font-black text-amber-700 bg-amber-100 px-3 py-1.5 rounded-xl hover:bg-amber-200 transition-colors whitespace-nowrap"
                      >
                        تأكيد الاستلام
                      </button>
                    )}
                  </td>
                  <td className="p-5 text-center">
                    <div className="flex justify-center gap-1">
                        <button 
                          onClick={() => openResearch(item)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                          title="البحث الدوري"
                        >
                          <ClipboardList className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => { setEditingItem(item); setFormData(item); setShowAddForm(true); }}
                          className="p-2 text-stone-600 hover:bg-stone-50 rounded-xl transition-all"
                          title="تعديل"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id, item.name)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Form Modal */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl p-8 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-stone-100 sticky top-0 bg-white z-10">
                <button onClick={() => setShowAddForm(false)} className="p-3 bg-stone-50 text-stone-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all">
                  <X className="w-6 h-6" />
                </button>
                <div className="text-right">
                  <h2 className="text-2xl font-black text-emerald-950">{editingItem ? 'تعديل بيانات التوزيع' : 'إضافة توزيع موسمي جديد'}</h2>
                  <p className="text-stone-400 font-bold">يرجى تسجيل بيانات المستفيد ونوع التوزيع</p>
                </div>
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-1">
                      <label className="text-xs font-black text-stone-500 pr-2">اسم المستفيد</label>
                      <input 
                        required type="text"
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none focus:border-amber-500 font-bold text-right"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs font-black text-stone-500 pr-2">الرقم القومي</label>
                      <input 
                        required type="text" maxLength={14}
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none focus:border-amber-500 font-bold text-right"
                        value={formData.nationalId}
                        onChange={(e) => setFormData({...formData, nationalId: e.target.value})}
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs font-black text-stone-500 pr-2">رقم الهاتف</label>
                      <input 
                        type="tel"
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none focus:border-amber-500 font-bold text-right"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs font-black text-stone-500 pr-2">القرية</label>
                      <input 
                        type="text"
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none focus:border-amber-500 font-bold text-right"
                        value={formData.village}
                        onChange={(e) => setFormData({...formData, village: e.target.value})}
                      />
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-1">
                      <label className="text-xs font-black text-stone-500 pr-2">الهيئة المانحة</label>
                      <select 
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none font-bold text-right"
                        value={formData.organization}
                        onChange={(e) => setFormData({...formData, organization: e.target.value})}
                      >
                        {ORGANIZATIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                   </div>
                   {formData.organization === 'آخر' && (
                     <div className="space-y-1">
                        <label className="text-xs font-black text-stone-500 pr-2">اسم الهيئة</label>
                        <input 
                          type="text"
                          className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-amber-500 outline-none font-bold"
                          value={formData.otherOrgName}
                          onChange={(e) => setFormData({...formData, otherOrgName: e.target.value})}
                        />
                     </div>
                   )}
                   <div className="space-y-1">
                      <label className="text-xs font-black text-stone-500 pr-2">نوع التوزيع</label>
                      <select 
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none font-bold text-right"
                        value={formData.distType}
                        onChange={(e) => setFormData({...formData, distType: e.target.value})}
                      >
                        {DISTRIBUTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-1">
                      <label className="text-xs font-black text-stone-500 pr-2">الكمية</label>
                      <input 
                        type="number" min={1}
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none focus:border-amber-500 font-bold text-right"
                        value={formData.quantity}
                        onChange={(e) => setFormData({...formData, quantity: Number(e.target.value)})}
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs font-black text-stone-500 pr-2">تاريخ الاستلام</label>
                      <input 
                        type="date"
                        className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none focus:border-amber-500 font-bold text-right"
                        value={formData.deliveryDate}
                        onChange={(e) => setFormData({...formData, deliveryDate: e.target.value})}
                      />
                   </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-black text-emerald-800 pr-1">صور ومستندات الحالة</label>
                  <FileUploadSlot 
                    label="رفع صور البطاقة أو إيصالات الاستلام"
                    caseName={formData.name || 'حالة_موسمية'}
                    storagePath="seasonal/docs"
                    values={formData.attachments}
                    onUpload={(updater) => {
                      if (typeof updater === 'function') {
                        setFormData(prev => ({ ...prev, attachments: updater(prev.attachments || []) }));
                      } else {
                        setFormData(prev => ({ ...prev, attachments: updater }));
                      }
                    }}
                  />
                </div>

                <div className="pt-8">
                   <button type="submit" className="w-full bg-amber-600 text-white py-5 rounded-[2rem] font-black text-xl hover:bg-amber-700 shadow-xl shadow-amber-200 transition-all">
                     {editingItem ? 'حفظ التعديلات' : 'تأكيد الحفظ والإضافة'}
                   </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Periodic Research Modal */}
      <AnimatePresence>
        {showResearchModal && researchCase && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] shadow-2xl p-8"
            >
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-stone-100 sticky top-0 bg-white z-10">
                <button onClick={() => setShowResearchModal(false)} className="p-3 bg-stone-50 text-stone-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all">
                  <X className="w-6 h-6" />
                </button>
                <div className="text-right">
                  <h2 className="text-2xl font-black text-emerald-950">البحث الدوري - {researchCase.name}</h2>
                  <p className="text-stone-400 font-bold text-sm">متابعة الدخل والمصاريف وتغير الحالة</p>
                </div>
              </div>

              {!showAddResearch ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-center bg-emerald-50 p-6 rounded-3xl border border-emerald-100 shadow-sm">
                    <div className="text-right">
                      <p className="text-emerald-900 font-black text-lg">سجل الزيارات والبحث</p>
                      <p className="text-emerald-600 text-xs font-bold">إجمالي الأبحاث المسجلة: {researchRecords.length}</p>
                    </div>
                    <button 
                      onClick={() => setShowAddResearch(true)}
                      className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة بحث جديد</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {researchRecords.map((record) => (
                      <div key={record.id} className="bg-stone-50 p-6 rounded-3xl border border-stone-100 hover:border-emerald-200 transition-all">
                        <div className="flex justify-between items-start mb-4">
                           <div className="flex items-center gap-2">
                             <button 
                               onClick={() => {
                                 setConfirmConfig({
                                   isOpen: true,
                                   title: 'حذف التحديث الدوري',
                                   message: 'هل أنت متأكد من حذف هذا التحديث الدوري نهائياً؟',
                                   onConfirm: async () => {
                                     try {
                                       await deleteDoc(doc(db, 'seasonal_cases', researchCase.id, 'periodic_research', record.id));
                                       setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                                       alert('تم حذف التحديث بنجاح');
                                     } catch (err) {
                                       alert('فشل في حذف التحديث');
                                     }
                                   }
                                 });
                               }}
                               className="p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                               title="حذف التحديث"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                             <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-stone-100">
                               <Calendar className="w-3 h-3 text-emerald-600" />
                               <span className="text-[10px] font-bold text-stone-600">{record.date}</span>
                             </div>
                           </div>
                           {record.hasChanged && (
                             <div className="flex items-center gap-1 bg-rose-50 text-rose-600 px-3 py-1 rounded-full border border-rose-100 text-[10px] font-bold">
                               <Info className="w-3 h-3" />
                               حدث تغير في الحالة
                             </div>
                           )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                             <p className="text-[10px] font-black text-stone-400 text-right pr-2">المصاريف الشهرية</p>
                             <div className="bg-white p-3 rounded-2xl flex flex-col gap-1 text-right">
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-bold text-emerald-700">{record.schoolExpenses} ج.م</span>
                                 <span className="text-stone-500">تعليم:</span>
                                </div>
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-bold text-emerald-700">{record.livingExpenses} ج.م</span>
                                 <span className="text-stone-500">معيشة:</span>
                               </div>
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-bold text-emerald-700">{record.otherExpenses} ج.م</span>
                                 <span className="text-stone-500">أخرى:</span>
                               </div>
                               <div className="border-t border-emerald-50 mt-1 pt-1 flex justify-between text-xs">
                                 <span className="font-black text-emerald-950">{(record.schoolExpenses || 0) + (record.livingExpenses || 0) + (record.otherExpenses || 0)} ج.م</span>
                                 <span className="font-black text-stone-700">الإجمالي:</span>
                               </div>
                             </div>
                          </div>

                          <div className="space-y-2">
                             <p className="text-[10px] font-black text-stone-400 text-right pr-2">مصادر الدخل</p>
                             <div className="bg-white p-3 rounded-2xl flex flex-col gap-1 text-right">
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-semibold text-emerald-700">{record.incomePension} ج.م</span>
                                 <span className="text-stone-500">معاش:</span>
                               </div>
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-semibold text-emerald-700">{record.incomeInsurance} ج.م</span>
                                 <span className="text-stone-500">تأمين:</span>
                               </div>
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-semibold text-emerald-700">{record.incomeSalary} ج.م</span>
                                 <span className="text-stone-500">راتب:</span>
                               </div>
                               <div className="flex justify-between text-[11px]">
                                 <span className="font-semibold text-emerald-700">{record.incomeOther} ج.م</span>
                                 <span className="text-stone-500">أخرى:</span>
                               </div>
                               <div className="border-t border-emerald-50 mt-1 pt-1 flex justify-between text-xs">
                                 <span className="font-black text-emerald-950">{(record.incomePension || 0) + (record.incomeInsurance || 0) + (record.incomeSalary || 0) + (record.incomeOther || 0)} ج.م</span>
                                 <span className="font-black text-stone-700">الإجمالي:</span>
                               </div>
                             </div>
                          </div>
                        </div>

                        {record.notes && (
                          <div className="mt-4 bg-white p-4 rounded-2xl border border-stone-100">
                             <p className="text-[10px] font-black text-emerald-800 text-right mb-1">ملاحظات البحث:</p>
                             <p className="text-xs text-stone-600 text-right leading-relaxed">{record.notes}</p>
                          </div>
                        )}
                      </div>
                    ))}

                    {researchRecords.length === 0 && (
                      <div className="text-center py-20 bg-stone-50 rounded-3xl border-2 border-dashed border-stone-200">
                        <ClipboardList className="w-16 h-16 mx-auto mb-4 opacity-20 text-emerald-900" />
                        <p className="text-stone-400 font-bold">لا توجد سجلات بحث دوري لهذه الحالة حتى الآن</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleAddResearch} className="space-y-8 animate-in slide-in-from-left duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="space-y-4">
                        <h4 className="text-sm font-black text-rose-600 text-right pr-2">بيانات المصاريف (ج.م)</h4>
                        <div className="bg-stone-50 p-6 rounded-[2rem] border border-stone-100 space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">مصاريف مدارس/جامعات</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.schoolExpenses}
                              onChange={(e) => setResearchFormData({...researchFormData, schoolExpenses: Number(e.target.value)})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">مصاريف معيشة</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.livingExpenses}
                              onChange={(e) => setResearchFormData({...researchFormData, livingExpenses: Number(e.target.value)})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">مصاريف أخرى</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.otherExpenses}
                              onChange={(e) => setResearchFormData({...researchFormData, otherExpenses: Number(e.target.value)})}
                            />
                          </div>
                        </div>
                     </div>

                     <div className="space-y-4">
                        <h4 className="text-sm font-black text-emerald-700 text-right pr-2">بيانات الدخل (ج.م)</h4>
                        <div className="bg-stone-50 p-6 rounded-[2rem] border border-stone-100 space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">معاش (تضامن/تكافل..)</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.incomePension}
                              onChange={(e) => setResearchFormData({...researchFormData, incomePension: Number(e.target.value)})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">تأمينات</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.incomeInsurance}
                              onChange={(e) => setResearchFormData({...researchFormData, incomeInsurance: Number(e.target.value)})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">مرتب/دخل عمل</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.incomeSalary}
                              onChange={(e) => setResearchFormData({...researchFormData, incomeSalary: Number(e.target.value)})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">دخل إضافي</label>
                            <input 
                              type="number"
                              className="w-full p-3 rounded-xl border border-stone-200 outline-none focus:border-emerald-500 font-bold text-right"
                              value={researchFormData.incomeOther}
                              onChange={(e) => setResearchFormData({...researchFormData, incomeOther: Number(e.target.value)})}
                            />
                          </div>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <input 
                            type="date"
                            className="bg-stone-50 border border-stone-200 p-2 rounded-xl text-xs font-bold outline-none"
                            value={researchFormData.date}
                            onChange={(e) => setResearchFormData({...researchFormData, date: e.target.value})}
                          />
                          <label className="text-xs font-bold text-stone-500">تاريخ الزيارة:</label>
                        </div>
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setResearchFormData({...researchFormData, hasChanged: !researchFormData.hasChanged})}>
                           <span className="text-xs font-black text-rose-600">هل حدث تغير في الحالة؟</span>
                           <div className={`w-10 h-6 rounded-full p-1 transition-all ${researchFormData.hasChanged ? 'bg-rose-500' : 'bg-stone-200'}`}>
                              <div className={`w-4 h-4 bg-white rounded-full transition-all ${researchFormData.hasChanged ? 'mr-4' : 'mr-0'}`} />
                           </div>
                        </div>
                     </div>

                     <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-500 pr-2 block text-right">ملاحظات إضافية وتفاصيل البحث</label>
                        <textarea 
                          className="w-full p-4 bg-stone-50 border border-stone-100 rounded-[2rem] h-32 outline-none focus:border-emerald-500 font-bold text-right"
                          placeholder="اكتب هنا كافة تفاصيل الحالة وما استجد من ظروف..."
                          value={researchFormData.notes}
                          onChange={(e) => setResearchFormData({...researchFormData, notes: e.target.value})}
                        />
                     </div>
                  </div>

                  <div className="flex gap-4 pt-4 sticky bottom-0 bg-white py-4 border-t border-stone-50">
                     <button 
                       type="button"
                       onClick={() => setShowAddResearch(false)}
                       className="flex-1 bg-stone-100 text-stone-600 py-4 rounded-2xl font-black hover:bg-stone-200 transition-all"
                     >
                       إلغاء وتراجع
                     </button>
                     <button 
                       type="submit"
                       className="flex-[2] bg-emerald-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-emerald-700 shadow-xl shadow-emerald-200 transition-all"
                     >
                       <Save className="w-5 h-5" />
                       حفظ البحث في ملف الحالة
                     </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
