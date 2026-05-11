// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, MapPin, Phone, User, FileText, Printer, Download, Trash2, Edit, X, Save, CheckCircle2, AlertCircle, FileCheck, ClipboardList, Users, Clock, DollarSign, Briefcase, GraduationCap, ArrowRightLeft, FileUp, Filter, Loader2, UploadCloud } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, serverTimestamp, deleteDoc, writeBatch, getDocs, limit } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { uploadToGoogleDrive } from '../lib/driveUpload';
import ConfirmModal from './ConfirmModal';
import FileUploadSlot, { FileAttachment } from './FileUploadSlot';

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

interface FamilyMember {
  name: string;
  age: string;
  workOrSchool: string;
}

interface Child {
  name: string;
  age: string;
  gender: string;
  education: string;
}

interface ReceptionCase {
  id: string;
  serialNumber: number;
  name: string;
  nationalId: string;
  phone: string;
  address: string;
  village: string;
  familyCount: number;
  spouseName: string;
  caseType: 'orphan' | 'widow' | 'sick' | 'divorced' | 'needing' | 'other';
  researchResult: 'accepted' | 'rejected' | 'in_progress';
  incomeSource: 'pension' | 'insurance' | 'salary' | 'other' | 'none';
  incomeSourceOther?: string;
  monthlyIncome: number;
  monthlyExpenses: {
    living: number;
    school: number;
    medical: number;
    other: number;
  };
  familyMembers: FamilyMember[];
  children: Child[];
  notes: string;
  receptionistEvaluation: number;
  status: 'pending' | 'referred';
  attachments?: FileAttachment[];
  createdAt: any;
}

export default function ReceptionScreen() {
  const [cases, setCases] = useState<ReceptionCase[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCaseType, setFilterCaseType] = useState<string>('all');
  const [filterResearchResult, setFilterResearchResult] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCase, setEditingCase] = useState<ReceptionCase | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const initialForm = {
    name: '',
    nationalId: '',
    phone: '',
    address: '',
    village: '',
    familyCount: 1,
    spouseName: '',
    caseType: 'needing' as const,
    researchResult: 'in_progress' as const,
    incomeSource: 'none' as const,
    incomeSourceOther: '',
    monthlyIncome: 0,
    monthlyExpenses: {
      living: 0,
      school: 0,
      medical: 0,
      other: 0,
    },
    familyMembers: [] as FamilyMember[],
    children: [] as Child[],
    notes: '',
    receptionistEvaluation: 5,
    attachments: [] as FileAttachment[],
    status: 'pending' as const
  };

  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    const q = query(collection(db, 'reception_cases'), orderBy('serialNumber', sortOrder));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReceptionCase));
      setCases(data);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'reception_cases'));

    return () => unsubscribe();
  }, []);

  const getNextSerialNumber = () => {
    if (cases.length === 0) return 1;
    return Math.max(...cases.map(c => c.serialNumber)) + 1;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCase) {
        await updateDoc(doc(db, 'reception_cases', editingCase.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        alert('تم تحديث البيانات بنجاح');
      } else {
        const serial = getNextSerialNumber();
        await addDoc(collection(db, 'reception_cases'), {
          ...formData,
          serialNumber: serial,
          createdAt: serverTimestamp()
        });
        
        // Also add to global cases collection as requested
        await addDoc(collection(db, 'cases'), {
           name: formData.name,
           nationalId: formData.nationalId,
           phone: formData.phone,
           address: formData.address,
           familyCount: formData.familyCount,
           spouseName: formData.spouseName,
           description: `تم الإضافة من قسم الاستقبال. ${formData.notes}`,
           status: 'pending',
           categories: ['أخرى'],
           children: formData.children,
           attachments: { 'مستندات الاستقبال': formData.attachments || [] },
           createdAt: serverTimestamp()
        });

        alert('تم تسجيل الحالة بنجاح وإضافتها لكشف الحالات العام');
      }
      setFormData(initialForm);
      setShowAddForm(false);
      setEditingCase(null);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, editingCase ? `reception_cases/${editingCase.id}` : 'reception_cases');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'حذف حالة رقمية',
      message: `هل أنت متأكد من حذف بيانات الحالة: ${name}؟ سيتم حذفها نهائياً.`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'reception_cases', id));
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `reception_cases/${id}`);
        }
      }
    });
  };

  const handleTransfer = async (c: ReceptionCase, destination: 'orphans' | 'cases') => {
    setConfirmConfig({
      isOpen: true,
      title: 'نقل الحالة',
      message: `هل تريد نقل بيانات ${c.name} إلى قسم ${destination === 'orphans' ? 'الأيتام' : 'قاعدة البيانات العامة'}؟`,
      onConfirm: async () => {
        try {
          const targetCollection = destination === 'orphans' ? 'orphans' : 'cases';
          const payload: any = {
            name: c.name,
            nationalId: c.nationalId,
            phone: c.phone,
            address: c.address,
            village: c.village,
            familyCount: c.familyCount,
            spouseName: c.spouseName,
            status: 'active',
            attachments: destination === 'cases' ? { 'مستندات الاستقبال': c.attachments || [] } : (c.attachments || []),
            createdAt: serverTimestamp(),
            fromReception: true,
          };

          if (destination === 'cases') {
            payload.categories = [c.caseType === 'orphan' ? 'أيتام' : 'أخرى'];
            payload.description = `منقول من الاستقبال. تاريخ الطلب: ${c.createdAt?.toDate().toLocaleDateString('ar-EG')}`;
          }

          await addDoc(collection(db, targetCollection), payload);
          await updateDoc(doc(db, 'reception_cases', c.id), { status: 'referred' });
          
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          alert('تم نقل الحالة بنجاح');
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, destination);
        }
      }
    });
  };

  const addFamilyMember = () => {
    setFormData(prev => ({
      ...prev,
      familyMembers: [...prev.familyMembers, { name: '', age: '', workOrSchool: '' }]
    }));
  };

  const removeFamilyMember = (index: number) => {
    setFormData(prev => ({
      ...prev,
      familyMembers: prev.familyMembers.filter((_, i) => i !== index)
    }));
  };

  const updateFamilyMember = (index: number, field: keyof FamilyMember, value: string) => {
    setFormData(prev => {
      const newMembers = [...prev.familyMembers];
      newMembers[index] = { ...newMembers[index], [field]: value };
      return { ...prev, familyMembers: newMembers };
    });
  };

  const addChild = () => {
    setFormData(prev => ({
      ...prev,
      children: [...prev.children, { name: '', age: '', gender: 'ذكر', education: '' }]
    }));
  };

  const removeChild = (index: number) => {
    setFormData(prev => ({
      ...prev,
      children: prev.children.filter((_, i) => i !== index)
    }));
  };

  const updateChild = (index: number, field: keyof Child, value: string) => {
    setFormData(prev => {
      const newChildren = [...prev.children];
      newChildren[index] = { ...newChildren[index], [field]: value };
      return { ...prev, children: newChildren };
    });
  };

  const exportToExcel = () => {
    const data = cases.map(c => ({
      'مسلسل': c.serialNumber,
      'الاسم': c.name,
      'الرقم القومي': c.nationalId,
      'الهاتف': c.phone,
      'القرية': c.village,
      'العنوان': c.address,
      'نوع الحالة': c.caseType,
      'نتيجة البحث': c.researchResult,
      'الدخل الشهري': c.monthlyIncome,
      'مصدر الدخل': c.incomeSource === 'other' ? c.incomeSourceOther : c.incomeSource,
      'مصاريف المعيشة': c.monthlyExpenses.living,
      'مصاريف الدراسة': c.monthlyExpenses.school,
      'الحالة': c.status === 'pending' ? 'قيد الانتظار' : 'تم التحويل',
      'عدد الأطفال': c.children.length,
      'ملاحظات': c.notes
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reception");
    XLSX.writeFile(wb, "سجل_الاستقبال.xlsx");
  };

  const printCase = (c: ReceptionCase) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const content = `
      <html>
        <head>
          <title>استمارة استقبال - ${c.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
            body { font-family: 'Amiri', serif; direction: rtl; padding: 40px; line-height: 1.6; }
            .header { text-align: center; border-bottom: 2px solid #059669; padding-bottom: 20px; margin-bottom: 30px; }
            .section { margin-bottom: 25px; border: 1px solid #eee; padding: 15px; border-radius: 10px; }
            .section-title { font-weight: bold; color: #059669; border-bottom: 1px solid #eee; margin-bottom: 15px; padding-bottom: 5px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 13px; }
            th { background: #f9f9f9; }
            .case-badge { display: inline-block; padding: 5px 15px; border-radius: 5px; background: #f0fdf4; color: #166534; font-weight: bold; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>استمارة استقبال حالة جديدة</h1>
            <p><strong>مسلسل رقم: #${c.serialNumber}</strong></p>
            <div class="case-badge">نوع الحالة: ${c.caseType} - نتيجة البحث: ${c.researchResult}</div>
          </div>
          <div class="section">
            <div class="section-title">البيانات الأساسية</div>
            <div class="grid">
              <p><strong>الاسم:</strong> ${c.name}</p>
              <p><strong>الرقم القومي:</strong> ${c.nationalId}</p>
              <p><strong>الهاتف:</strong> ${c.phone}</p>
              <p><strong>القرية:</strong> ${c.village}</p>
              <p><strong>العنوان:</strong> ${c.address}</p>
              <p><strong>اسم الزوج/الزوجة:</strong> ${c.spouseName}</p>
              <p><strong>عدد أفراد الأسرة:</strong> ${c.familyCount}</p>
            </div>
          </div>
          <div class="section">
            <div class="section-title">أفراد الأسرة</div>
            ${c.familyMembers.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>العمر</th>
                    <th>العمل/المدرسة</th>
                  </tr>
                </thead>
                <tbody>
                  ${c.familyMembers.map(m => `
                    <tr>
                      <td>${m.name}</td>
                      <td>${m.age}</td>
                      <td>${m.workOrSchool}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<p>لا يوجد أفراد أسرة مسجلين</p>'}
          </div>
          <div class="section">
            <div class="section-title">الوضع المالي (شهرياً)</div>
            <div class="grid">
              <p><strong>مصدر الدخل:</strong> ${c.incomeSource === 'other' ? c.incomeSourceOther : c.incomeSource}</p>
              <p><strong>القيمة:</strong> ${c.monthlyIncome} ج.م</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>معيشة</th>
                  <th>دراسة</th>
                  <th>علاج</th>
                  <th>أخرى</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>${c.monthlyExpenses.living}</td>
                  <td>${c.monthlyExpenses.school}</td>
                  <td>${c.monthlyExpenses.medical}</td>
                  <td>${c.monthlyExpenses.other}</td>
                  <td>${Object.values(c.monthlyExpenses).reduce((a, b) => a + b, 0)} ج.م</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="section">
            <div class="section-title">الأبناء</div>
            ${c.children.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>العمر</th>
                    <th>الجنس</th>
                    <th>المرحلة التعليمية</th>
                  </tr>
                </thead>
                <tbody>
                  ${c.children.map(child => `
                    <tr>
                      <td>${child.name}</td>
                      <td>${child.age}</td>
                      <td>${child.gender}</td>
                      <td>${child.education}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<p>لا يوجد أبناء مسجلين</p>'}
          </div>
          <div class="section">
            <div class="section-title">ملاحظات إضافية</div>
            <p>${c.notes || 'لا يوجد'}</p>
          </div>
          <div style="margin-top: 50px; display: flex; justify-content: space-between;">
            <p>توقيع موظف الاستقبال: ...........................</p>
            <p>توقيع الباحث: ...........................</p>
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const filteredCases = cases.filter(c => {
    const matchesSearch = c.name.includes(searchQuery) || 
      c.nationalId.includes(searchQuery) || 
      c.phone.includes(searchQuery) ||
      String(c.serialNumber).includes(searchQuery);
    
    const matchesType = filterCaseType === 'all' || c.caseType === filterCaseType;
    const matchesResult = filterResearchResult === 'all' || c.researchResult === filterResearchResult;

    return matchesSearch && matchesType && matchesResult;
  });

  return (
    <div className="p-6 space-y-6 text-right font-sans" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-emerald-50">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-600 p-4 rounded-2xl shadow-lg">
            <Users className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-emerald-950">قسم الاستقبال</h1>
            <p className="text-emerald-600 font-bold text-sm">تسجيل ومتابعة الحالات الجديدة</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportToExcel} className="p-3 bg-white border border-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-50">
            <Download className="w-5 h-5" />
          </button>
          <button 
            onClick={() => { setEditingCase(null); setFormData(initialForm); setShowAddForm(true); }}
            className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all"
          >
            <Plus className="w-5 h-5" />
            <span>تسجيل حالة جديدة</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-emerald-50 shadow-sm flex items-center justify-between">
          <div className="text-right">
            <p className="text-xs font-bold text-stone-400 mb-1">إجمالي المسجلين</p>
            <p className="text-2xl font-black text-emerald-900">{cases.length}</p>
          </div>
          <Users className="w-8 h-8 text-emerald-100" />
        </div>
        <div className="bg-white p-6 rounded-2xl border border-emerald-50 shadow-sm flex items-center justify-between">
          <div className="text-right">
            <p className="text-xs font-bold text-stone-400 mb-1">حالات قيد الانتظار</p>
            <p className="text-2xl font-black text-amber-600">{cases.filter(c => c.status === 'pending').length}</p>
          </div>
          <Clock className="w-8 h-8 text-amber-100" />
        </div>
        <div className="bg-white p-6 rounded-2xl border border-emerald-50 shadow-sm flex items-center justify-between">
          <div className="text-right">
            <p className="text-xs font-bold text-stone-400 mb-1">متوسط الدخل</p>
            <p className="text-2xl font-black text-emerald-900">
              {cases.length > 0 ? Math.round(cases.reduce((acc, c) => acc + c.monthlyIncome, 0) / cases.length) : 0} ج.م
            </p>
          </div>
          <DollarSign className="w-8 h-8 text-emerald-100" />
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-6 rounded-3xl border border-emerald-50 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-grow">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-300 w-5 h-5" />
            <input 
              type="text" 
              placeholder="ابحث بالاسم، الرقم القومي، الهاتف أو رقم المسلسل..."
              className="w-full bg-stone-50 border border-emerald-50 pr-12 pl-6 py-4 rounded-2xl outline-none focus:border-emerald-500 font-bold"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select 
            className="bg-stone-50 border border-emerald-50 px-6 py-4 rounded-2xl font-bold outline-none focus:border-emerald-500 text-right"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
          >
            <option value="desc">الأحدث أولاً</option>
            <option value="asc">الأقدم أولاً</option>
          </select>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2 bg-stone-50 p-2 rounded-2xl border border-stone-100">
            <Filter className="w-5 h-5 text-emerald-600 mr-2" />
            <select 
              className="bg-transparent font-bold outline-none flex-grow text-right"
              value={filterCaseType}
              onChange={(e) => setFilterCaseType(e.target.value)}
            >
              <option value="all">كل أنواع الحالات</option>
              <option value="needing">محتاج</option>
              <option value="orphan">يتيم</option>
              <option value="widow">أرملة</option>
              <option value="sick">مريض</option>
              <option value="divorced">مطلقة</option>
              <option value="other">أخرى</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-stone-50 p-2 rounded-2xl border border-stone-100">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mr-2" />
            <select 
              className="bg-transparent font-bold outline-none flex-grow text-right"
              value={filterResearchResult}
              onChange={(e) => setFilterResearchResult(e.target.value)}
            >
              <option value="all">كل نتائج البحث</option>
              <option value="in_progress">جاري البحث</option>
              <option value="accepted">قبول</option>
              <option value="rejected">رفض</option>
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCases.map(c => (
          <motion.div 
            layout
            key={c.id}
            className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-16 h-16 bg-stone-50 text-stone-300 flex items-center justify-center font-black text-xl rounded-bl-3xl">
              {c.serialNumber}
            </div>
            <div className="flex justify-between items-start mb-4">
              <div className="flex gap-2">
                <button onClick={() => { setEditingCase(c); setFormData(c); setShowAddForm(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl" title="تعديل"><Edit className="w-4 h-4"/></button>
                <button onClick={() => printCase(c)} className="p-2 text-stone-600 hover:bg-stone-50 rounded-xl" title="طباعة"><Printer className="w-4 h-4"/></button>
                <button 
                  onClick={() => handleTransfer(c, c.caseType === 'orphan' ? 'orphans' : 'cases')} 
                  className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl" 
                  title="نقل للقسم المختص"
                >
                  <ArrowRightLeft className="w-4 h-4"/>
                </button>
                <button onClick={() => handleDelete(c.id, c.name)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl" title="حذف"><Trash2 className="w-4 h-4"/></button>
              </div>
              <div className="text-right">
                 <h3 className="font-black text-lg text-emerald-950 mt-4">{c.name}</h3>
                 <p className="text-xs font-bold text-stone-400">{c.nationalId}</p>
              </div>
            </div>

            <div className="space-y-3 mt-6">
              <div className="flex items-center gap-2 text-sm justify-end">
                <span className="font-bold text-emerald-900">{c.phone}</span>
                <Phone className="w-4 h-4 text-emerald-300" />
              </div>
              <div className="flex items-center gap-2 text-sm justify-end text-stone-500">
                <span className="truncate">{c.address}</span>
                <MapPin className="w-4 h-4 text-stone-300" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6">
               <div className="bg-emerald-50 p-2 rounded-xl text-center">
                  <p className="text-[10px] font-bold text-emerald-600">الدخل</p>
                  <p className="font-black text-emerald-900">{c.monthlyIncome} ج.م</p>
               </div>
               <div className="bg-rose-50 p-2 rounded-xl text-center">
                  <p className="text-[10px] font-bold text-rose-600">المصاريف</p>
                  <p className="font-black text-rose-900">{Object.values(c.monthlyExpenses).reduce((a, b) => Number(a) + Number(b), 0)} ج.م</p>
               </div>
            </div>

            <div className="mt-6 pt-4 border-t border-stone-50 flex items-center justify-between">
              <span className={`text-[10px] px-2 py-1 rounded-lg font-bold ${c.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                {c.status === 'pending' ? 'قيد البحث' : 'تم التحويل'}
              </span>
              <div className="flex items-center gap-1">
                <span className={`text-[10px] font-bold ${
                  c.receptionistEvaluation >= 8 ? 'text-emerald-600' :
                  c.receptionistEvaluation >= 5 ? 'text-amber-600' :
                  'text-rose-600'
                }`}>تقييم: {c.receptionistEvaluation ?? 5}/10</span>
                <span className="text-[10px] font-bold text-stone-400 mx-1">|</span>
                <span className="text-[10px] font-bold text-stone-400">{c.children.length} أطفال</span>
                <Users className="w-3 h-3 text-stone-300" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] shadow-2xl p-8 custom-scrollbar scroll-smooth"
            >
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-stone-100 sticky top-0 bg-white z-10">
                <button onClick={() => setShowAddForm(false)} className="p-3 bg-stone-50 text-stone-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all">
                  <X className="w-6 h-6" />
                </button>
                <div className="text-right">
                  <h2 className="text-2xl font-black text-emerald-950">{editingCase ? 'تعديل بيانات الحالة' : 'تسجيل حالة استقبال جديدة'}</h2>
                  <p className="text-stone-400 font-bold">يرجى ملء كافة البيانات المطلوبة لتقييم الحالة</p>
                </div>
              </div>

              <form onSubmit={handleSave} className="space-y-10">
                {/* Basic Info */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2 justify-end border-r-4 border-emerald-500 pr-3">
                    <h3 className="text-lg font-black text-emerald-950">البيانات الشخصية</h3>
                    <User className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-stone-500 pr-2">الاسم رباعي</label>
                       <input 
                         required
                         type="text"
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold"
                         value={formData.name}
                         onChange={(e) => setFormData({...formData, name: e.target.value})}
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-stone-500 pr-2">الرقم القومي (١٤ رقم)</label>
                       <input 
                         required
                         type="text"
                         maxLength={14}
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold"
                         value={formData.nationalId}
                         onChange={(e) => setFormData({...formData, nationalId: e.target.value})}
                       />
                    </div>
                    <div className="space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">رقم الهاتف</label>
                       <input 
                         required
                         type="tel"
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
                         value={formData.phone}
                         onChange={(e) => setFormData({...formData, phone: e.target.value})}
                       />
                    </div>
                    <div className="space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">القرية</label>
                       <input 
                         required
                         type="text"
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
                         value={formData.village}
                         onChange={(e) => setFormData({...formData, village: e.target.value})}
                       />
                    </div>
                    <div className="col-span-full md:col-span-2 space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">العنوان بالتفصيل</label>
                       <input 
                         required
                         type="text"
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
                         value={formData.address}
                         onChange={(e) => setFormData({...formData, address: e.target.value})}
                       />
                    </div>
                    <div className="space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">نوع الحالة</label>
                       <select 
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none font-bold text-right"
                         value={formData.caseType}
                         onChange={(e) => setFormData({...formData, caseType: e.target.value as any})}
                       >
                         <option value="needing">محتاج</option>
                         <option value="orphan">يتيم</option>
                         <option value="widow">أرملة</option>
                         <option value="sick">مريض</option>
                         <option value="divorced">مطلقة</option>
                         <option value="other">أخرى</option>
                       </select>
                    </div>
                    <div className="space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">نتيجة البحث</label>
                       <select 
                         className="w-full bg-stone-50 border border-stone-100 p-4 rounded-2xl outline-none font-bold text-right"
                         value={formData.researchResult}
                         onChange={(e) => setFormData({...formData, researchResult: e.target.value as any})}
                       >
                         <option value="in_progress">جاري البحث</option>
                         <option value="accepted">قبول</option>
                         <option value="rejected">رفض</option>
                       </select>
                    </div>
                    <div className="space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">تقييم موظف الاستقبال (0-10)</label>
                       <div className="flex items-center gap-4 bg-stone-50 p-3 rounded-2xl border border-stone-100">
                          <input 
                            type="range"
                            min="0"
                            max="10"
                            step="1"
                            className="flex-grow accent-emerald-600 h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer"
                            value={formData.receptionistEvaluation}
                            onChange={(e) => setFormData({...formData, receptionistEvaluation: Number(e.target.value)})}
                          />
                          <span className="w-10 h-10 flex items-center justify-center bg-white border border-emerald-100 rounded-xl font-black text-emerald-900 shadow-sm">
                            {formData.receptionistEvaluation}
                          </span>
                       </div>
                    </div>
                  </div>
                </div>

                {/* Financial Section */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2 justify-end border-r-4 border-amber-500 pr-3">
                    <h3 className="text-lg font-black text-emerald-950">الوضع المالي</h3>
                    <DollarSign className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-stone-50/50 p-6 rounded-3xl border border-stone-100">
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-stone-500 pr-2">مصدر الدخل الأساسي</label>
                       <select 
                         className="w-full bg-white border border-stone-100 p-4 rounded-2xl outline-none font-bold text-right"
                         value={formData.incomeSource}
                         onChange={(e) => setFormData({...formData, incomeSource: e.target.value as any})}
                       >
                         <option value="none">لا يوجد</option>
                         <option value="pension">معاش</option>
                         <option value="insurance">تأمين</option>
                         <option value="salary">راتب/عمل</option>
                         <option value="other">أخرى</option>
                       </select>
                    </div>
                    {formData.incomeSource === 'other' && (
                      <div className="space-y-2">
                         <label className="text-xs font-bold text-stone-500 pr-2">حدد المصدر</label>
                         <input 
                           type="text"
                           className="w-full bg-white border border-stone-100 p-4 rounded-2xl outline-none font-bold"
                           value={formData.incomeSourceOther}
                           onChange={(e) => setFormData({...formData, incomeSourceOther: e.target.value})}
                         />
                      </div>
                    )}
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-stone-500 pr-2">قيمة الدخل الشهري (ج.م)</label>
                       <input 
                         type="number"
                         className="w-full bg-white border border-stone-100 p-4 rounded-2xl outline-none font-bold"
                         value={formData.monthlyIncome}
                         onChange={(e) => setFormData({...formData, monthlyIncome: Number(e.target.value)})}
                       />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-right">
                       <label className="text-[10px] font-bold text-stone-400 block mb-1">مصاريف معيشة</label>
                       <input 
                         type="number"
                         className="w-full bg-transparent font-black text-lg outline-none text-right"
                         value={formData.monthlyExpenses.living}
                         onChange={(e) => setFormData({...formData, monthlyExpenses: {...formData.monthlyExpenses, living: Number(e.target.value)}})}
                       />
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-right">
                       <label className="text-[10px] font-bold text-stone-400 block mb-1">مصاريف دراسة</label>
                       <input 
                         type="number"
                         className="w-full bg-transparent font-black text-lg outline-none text-right"
                         value={formData.monthlyExpenses.school}
                         onChange={(e) => setFormData({...formData, monthlyExpenses: {...formData.monthlyExpenses, school: Number(e.target.value)}})}
                       />
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-right">
                       <label className="text-[10px] font-bold text-stone-400 block mb-1">مصاريف علاج</label>
                       <input 
                         type="number"
                         className="w-full bg-transparent font-black text-lg outline-none text-right"
                         value={formData.monthlyExpenses.medical}
                         onChange={(e) => setFormData({...formData, monthlyExpenses: {...formData.monthlyExpenses, medical: Number(e.target.value)}})}
                       />
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-right">
                       <label className="text-[10px] font-bold text-stone-400 block mb-1">مصاريف أخرى</label>
                       <input 
                         type="number"
                         className="w-full bg-transparent font-black text-lg outline-none text-right"
                         value={formData.monthlyExpenses.other}
                         onChange={(e) => setFormData({...formData, monthlyExpenses: {...formData.monthlyExpenses, other: Number(e.target.value)}})}
                       />
                    </div>
                  </div>
                </div>

                {/* Family Members Section */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-r-4 border-emerald-500 pr-3">
                    <button 
                      type="button" 
                      onClick={addFamilyMember}
                      className="text-xs bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-bold hover:bg-emerald-100"
                    >
                      + إضافة فرد
                    </button>
                    <div className="flex items-center gap-2">
                       <h3 className="text-lg font-black text-emerald-950">بيانات أفراد الأسرة</h3>
                       <Users className="w-5 h-5 text-emerald-600" />
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {formData.familyMembers.map((member, idx) => (
                      <div key={idx} className="bg-stone-50 p-6 rounded-3xl border border-stone-100 relative group">
                        <button 
                          type="button" 
                          onClick={() => removeFamilyMember(idx)}
                          className="absolute -top-3 -left-3 bg-white text-rose-500 p-2 rounded-full shadow-md hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-right">
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-stone-400 pr-2">الاسم</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-stone-100 p-3 rounded-xl outline-none font-bold text-right"
                                value={member.name}
                                onChange={(e) => updateFamilyMember(idx, 'name', e.target.value)}
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-stone-400 pr-2">العمر</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-stone-100 p-3 rounded-xl outline-none font-bold text-right"
                                value={member.age}
                                onChange={(e) => updateFamilyMember(idx, 'age', e.target.value)}
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-stone-400 pr-2">العمل / المدرسة</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-stone-100 p-3 rounded-xl outline-none font-bold text-right"
                                value={member.workOrSchool}
                                onChange={(e) => updateFamilyMember(idx, 'workOrSchool', e.target.value)}
                              />
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Children Section */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-r-4 border-blue-500 pr-3">
                    <button 
                      type="button" 
                      onClick={addChild}
                      className="text-xs bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-bold hover:bg-blue-100"
                    >
                      + إضافة ابن
                    </button>
                    <div className="flex items-center gap-2">
                       <h3 className="text-lg font-black text-emerald-950">بيانات الأبناء</h3>
                       <Users className="w-5 h-5 text-blue-600" />
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {formData.children.map((child, idx) => (
                      <div key={idx} className="bg-slate-50 p-6 rounded-3xl border border-slate-200 relative group animate-in slide-in-from-right duration-300">
                        <button 
                          type="button" 
                          onClick={() => removeChild(idx)}
                          className="absolute -top-3 -left-3 bg-white text-rose-500 p-2 rounded-full shadow-md hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 pr-2">الاسم</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-slate-100 p-3 rounded-xl outline-none font-bold text-right"
                                value={child.name}
                                onChange={(e) => updateChild(idx, 'name', e.target.value)}
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 pr-2">العمر</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-slate-100 p-3 rounded-xl outline-none font-bold text-right"
                                value={child.age}
                                onChange={(e) => updateChild(idx, 'age', e.target.value)}
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 pr-2">المرحلة الدراسية</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-slate-100 p-3 rounded-xl outline-none font-bold text-right"
                                value={child.education}
                                onChange={(e) => updateChild(idx, 'education', e.target.value)}
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 pr-2">الجنس</label>
                              <select 
                                className="w-full bg-white border border-slate-100 p-3 rounded-xl outline-none font-bold text-right"
                                value={child.gender}
                                onChange={(e) => updateChild(idx, 'gender', e.target.value)}
                              >
                                <option value="ذكر">ذكر</option>
                                <option value="أنثى">أنثى</option>
                              </select>
                           </div>
                        </div>
                      </div>
                    ))}
                    {formData.children.length === 0 && (
                      <div className="text-center py-8 bg-stone-50 rounded-3xl border-2 border-dashed border-stone-100 text-stone-400 italic font-bold">
                        لم يتم إضافة أبناء لهذه الحالة بعد
                      </div>
                    )}
                  </div>
                </div>

                {/* Documents Section */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2 justify-end border-r-4 border-emerald-500 pr-3">
                    <h3 className="text-lg font-black text-emerald-950">المستندات والصور</h3>
                    <UploadCloud className="w-5 h-5 text-emerald-600" />
                  </div>
                  <FileUploadSlot 
                    label="رفع صورة البطاقة أو أي مستندات ورقية"
                    caseName={formData.name || 'حالة_استقبال'}
                    storagePath="reception/docs"
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

                {/* Notes */}
                <div className="space-y-4">
                  <label className="text-sm font-black text-emerald-900 block text-right pr-2">ملاحظات موظف الاستقبال</label>
                  <textarea 
                    className="w-full bg-stone-50 border border-stone-100 p-6 rounded-[2rem] min-h-[150px] outline-none focus:border-emerald-500 font-bold text-right"
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="اكتب أي معلومات إضافية عن الحالة والبحث السريع..."
                  />
                </div>

                {/* Footer Actions */}
                <div className="flex flex-row-reverse gap-4 pt-8">
                   <button 
                    type="submit"
                    className="flex-grow bg-emerald-600 text-white py-5 rounded-[2rem] font-black text-xl hover:bg-emerald-700 shadow-xl shadow-emerald-200 transition-all"
                   >
                     {editingCase ? 'حفظ التعديلات' : 'تأكيد وحفظ بيانات الحالة'}
                   </button>
                   <button 
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-12 bg-stone-100 text-stone-500 py-5 rounded-[2rem] font-bold hover:bg-stone-200"
                   >
                     إلغاء
                   </button>
                </div>
              </form>
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