// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Phone, User, FileText, MapPin, Printer, Download, Trash2, Edit, X, Save, CheckCircle2, AlertCircle, FileCheck, ClipboardList, ListChecks, Heart, Share2, Users, Clock, Shield, UploadCloud, ArrowRightLeft, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, serverTimestamp, deleteDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import ConfirmModal from './ConfirmModal';
import { uploadToGoogleDrive } from '../lib/driveUpload';
import FileUploadSlot, { FileAttachment } from './FileUploadSlot';

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

interface OrphanCase {
  id: string;
  caseCode?: string;
  guardianName: string;
  guardianId: string;
  orphans: {
    name: string;
    id: string;
    birthDate?: string;
    schoolStage?: string;
    schoolGrade?: string;
    semester?: string;
  }[];
  isSponsored: boolean;
  sponsorshipAmount?: number;
  phone1: string;
  phone2: string;
  markaz: string;
  village: string;
  address: string;
  filesStatus: 'registered' | 'not_registered';
  researchFormStatus: 'registered' | 'not_registered';
  submissionStatus: 'done' | 'processing';
  registrationPlace: 'council' | 'hayatem' | 'medical' | 'none';
  requiredDocs: string[];
  attachments?: FileAttachment[];
  createdAt: any;
}

// Agency display names + case-code prefixes per registrationPlace
const AGENCY_NAMES: Record<string, string> = {
  council: 'المجلس الإسلامي للدعوة والإغاثة',
  hayatem: 'مؤسسة هيئة الأعمال الخيرية - فرع الهياتم',
  medical: 'قسم الحالات المرضية - هيئة الأعمال الخيرية',
  none: 'هيئة الأعمال الخيرية',
};
const AGENCY_PREFIX: Record<string, string> = {
  council: 'MID',
  hayatem: 'HAY',
  medical: 'MED',
  none: 'GEN',
};
const generateCaseCode = (place: string, existing: OrphanCase[]) => {
  const prefix = AGENCY_PREFIX[place] || 'GEN';
  const year = new Date().getFullYear();
  const sameYear = existing.filter((o) => (o.caseCode || '').startsWith(`${prefix}-${year}-`));
  const next = String(sameYear.length + 1).padStart(4, '0');
  return `${prefix}-${year}-${next}`;
};

const REQUIRED_DOCS_LIST = [
  'بطاقة المعيل',
  'شهادة الوفاة',
  'شهادات الميلاد',
  'صورة المعيل',
  'صور الايتام',
  'إفادات مدرسية',
  'برينت تأميني',
  'بحث اجتماعي معتمد من الشؤون الاجتماعية'
];

interface PeriodicResearch {
  id: string;
  date?: any;
  createdAt?: any;
  researchNumber?: string;
  researchDate?: string;
  targetOrphanIndex?: number; // which orphan in the case this research is for
  targetOrphanName?: string;
  targetSchoolGrade?: string; // grade at time of research
  isAlive: boolean;
  housingType: 'owned' | 'rent';
  rentAmount?: number;
  hasChanged: boolean;
  expenses: {
    school: number;
    living: number;
    other: number;
  };
  income: {
    pension: number;
    insurance: number;
    salary: number;
    other: number;
  };
  notes: string;
}

const SCHOOL_STAGES = [
  'رياض الأطفال',
  'الابتدائي',
  'الاعدادي',
  'الثانوي',
  'الثانوي الفني',
  'الجامعة',
  'أنهى الدراسة',
  'معهد فني',
  'دراسات عليا',
  'متسرب من التعليم'
];

const SEMESTERS = [
  'الفصل الدراسي الأول',
  'الفصل الدراسي الثاني'
];

export default function OrphansScreen() {
  const [orphans, setOrphans] = useState<OrphanCase[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [placeFilter, setPlaceFilter] = useState<'all' | 'council' | 'hayatem' | 'medical'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCase, setEditingCase] = useState<OrphanCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPeriodicResearch, setShowPeriodicResearch] = useState<OrphanCase | null>(null);
  const [researchList, setResearchList] = useState<PeriodicResearch[]>([]);
  const [showAddResearch, setShowAddResearch] = useState(false);
  const [editingResearch, setEditingResearch] = useState<PeriodicResearch | null>(null);
  const [viewingResearch, setViewingResearch] = useState<PeriodicResearch | null>(null);

  const initialForm = {
    guardianName: '',
    guardianId: '',
    orphans: [{ name: '', id: '', birthDate: '', schoolStage: '', schoolGrade: '', semester: '' }],
    isSponsored: false,
    sponsorshipAmount: 0,
    phone1: '',
    phone2: '',
    markaz: 'نبروه',
    village: '',
    address: '',
    filesStatus: 'not_registered' as const,
    researchFormStatus: 'not_registered' as const,
    submissionStatus: 'processing' as const,
    registrationPlace: 'none' as const,
    requiredDocs: [] as string[],
    attachments: [] as FileAttachment[]
  };

  const [researchForm, setResearchForm] = useState({
    researchNumber: '',
    researchDate: new Date().toISOString().split('T')[0],
    isAlive: true,
    housingType: 'owned' as const,
    rentAmount: 0,
    hasChanged: false,
    expenses: { school: 0, living: 0, other: 0 },
    income: { pension: 0, insurance: 0, salary: 0, other: 0 },
    notes: ''
  });

  const [formData, setFormData] = useState(initialForm);
  const [sortBy, setSortBy] = useState<'orphanName' | 'guardianName' | 'village' | 'address'>('orphanName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [showConfirmDeleteAll, setShowConfirmDeleteAll] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [importing, setImporting] = useState(false);
  const [columnFilters, setColumnFilters] = useState({
    orphanName: '',
    orphanId: '',
    guardianName: '',
    village: ''
  });
  const [selectedOrphanIds, setSelectedOrphanIds] = useState<string[]>([]);
  const [importData, setImportData] = useState<{ headers: string[], rows: any[] } | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

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

  const getPreviewValue = (excelHeader: string) => {
    if (!importData || !excelHeader) return '';
    return String(importData.rows[0]?.[excelHeader] || '');
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        if (data.length > 0) {
          setImporting(true);
          const headers = Object.keys(data[0] as any);
          
          const mapping = {
            orphanName: headers.find(h => h.includes('اسم اليتيم') || h.includes('اليتيم')) || '',
            orphanId: headers.find(h => h.includes('الرقم القومي') || h.includes('قومي اليتيم')) || '',
            guardianName: headers.find(h => h.includes('المعيل') || h.includes('اسم الام')) || '',
            guardianId: headers.find(h => h.includes('قومي المعيل')) || '',
            phone1: headers.find(h => h.includes('تليفون') || h.includes('موبايل')) || '',
            markaz: headers.find(h => h.includes('المركز')) || '',
            village: headers.find(h => h.includes('القرية')) || '',
            address: headers.find(h => h.includes('العنوان')) || ''
          };

          if (!mapping.orphanName || !mapping.orphanId) {
            alert('يجب أن يحتوي ملف الإكسل على أعمدة "اسم اليتيم" و"الرقم القومي لليتيم" فضلًا');
            setImporting(false);
            return;
          }

          let count = 0;
          const batchSize = 50;
          for (let i = 0; i < data.length; i += batchSize) {
            const batch = writeBatch(db);
            const chunk = data.slice(i, i + batchSize);
            
          chunk.forEach((row: any) => {
            const orphanName = String(row[mapping.orphanName] || '').trim();
            const orphanId = String(row[mapping.orphanId] || '').trim();
            
            if (orphanName && orphanId.length === 14) {
               const docRef = doc(collection(db, 'orphans'));
               batch.set(docRef, {
                  orphans: [{
                    name: orphanName,
                    id: orphanId
                  }],
                  isSponsored: false,
                  sponsorshipAmount: 0,
                  registrationPlace: 'none',
                  guardianName: String(row[mapping.guardianName] || ''),
                  guardianId: String(row[mapping.guardianId] || '00000000000000').substring(0, 14),
                  phone1: String(row[mapping.phone1] || ''),
                    phone2: '',
                    markaz: String(row[mapping.markaz] || 'نبروه'),
                    village: String(row[mapping.village] || ''),
                    address: String(row[mapping.address] || ''),
                    filesStatus: 'not_registered',
                    researchFormStatus: 'not_registered',
                    submissionStatus: 'processing',
                    requiredDocs: [],
                    createdAt: serverTimestamp()
                 });
                 count++;
              }
            });
            await batch.commit();
          }
          alert(`تم استيراد ${count} حالة بنجاح`);
        }
      } catch (err) {
        console.error(err);
        alert('خطأ في قراءة ملف الإكسل');
      } finally {
        setImporting(false);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  useEffect(() => {
    const q = query(collection(db, 'orphans'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrphanCase));
      setOrphans(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (showPeriodicResearch) {
      const q = query(
        collection(db, 'orphans', showPeriodicResearch.id, 'periodic_research'),
        orderBy('createdAt', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setResearchList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PeriodicResearch)));
      });
      return () => unsubscribe();
    }
  }, [showPeriodicResearch]);

  const handleEdit = (o: OrphanCase) => {
    setEditingCase(o);
    setFormData({
      guardianName: o.guardianName,
      guardianId: o.guardianId,
      orphans: (o.orphans || []).map(child => ({
        name: child.name || '',
        id: child.id || '',
        birthDate: child.birthDate || '',
        schoolStage: child.schoolStage || '',
        schoolGrade: child.schoolGrade || '',
        semester: child.semester || ''
      })),
      isSponsored: o.isSponsored || false,
      sponsorshipAmount: o.sponsorshipAmount || 0,
      registrationPlace: o.registrationPlace || 'none',
      phone1: o.phone1,
      phone2: o.phone2,
      markaz: o.markaz,
      village: o.village,
      address: o.address,
      filesStatus: o.filesStatus,
      researchFormStatus: o.researchFormStatus,
      submissionStatus: o.submissionStatus,
      requiredDocs: o.requiredDocs || [],
      attachments: o.attachments || []
    });
    setShowAddForm(true);
  };

  const handleToggleAddResearch = () => {
    if (!showAddResearch && researchList.length > 0) {
      // Pre-fill from the most recent research
      const last = researchList[0];
      setResearchForm({
        researchNumber: '', // Keep empty for new
        researchDate: new Date().toISOString().split('T')[0],
        isAlive: last.isAlive ?? true,
        housingType: last.housingType || 'owned',
        rentAmount: last.rentAmount || 0,
        hasChanged: false,
        expenses: { ...last.expenses },
        income: { ...last.income },
        notes: ''
      });
    } else {
      setResearchForm({
        researchNumber: '',
        researchDate: new Date().toISOString().split('T')[0],
        isAlive: true,
        housingType: 'owned',
        rentAmount: 0,
        hasChanged: false,
        expenses: { school: 0, living: 0, other: 0 },
        income: { pension: 0, insurance: 0, salary: 0, other: 0 },
        notes: ''
      });
    }
    setShowAddResearch(!showAddResearch);
    if (showAddResearch) {
      setEditingResearch(null);
    }
  };

  const handleEditResearch = (res: PeriodicResearch) => {
    setEditingResearch(res);
    setResearchForm({
      researchNumber: res.researchNumber || '',
      researchDate: res.researchDate || (res.createdAt?.toDate() ? new Date(res.createdAt.toDate()).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
      isAlive: res.isAlive ?? true,
      housingType: res.housingType || 'owned',
      rentAmount: res.rentAmount || 0,
      hasChanged: res.hasChanged || false,
      expenses: { ...res.expenses },
      income: { ...res.income },
      notes: res.notes || ''
    });
    setShowAddResearch(true);
  };

  const handleAddResearch = async () => {
    if (!showPeriodicResearch) return;
    
    setConfirmConfig({
      isOpen: true,
      title: editingResearch ? 'تأكيد تعديل البحث الدوري' : 'تأكيد حفظ البحث الدوري للأيتام',
      message: editingResearch 
        ? `هل أنت متأكد من حفظ التعديلات على البحث رقم: ${editingResearch.researchNumber || 'الحالي'}؟`
        : `هل أنت متأكد من حفظ التحديث الدوري لبيانات اليتيم: ${showPeriodicResearch.orphans?.[0]?.name || 'بيانات اليتيم'}؟`,
      onConfirm: async () => {
        try {
          if (editingResearch) {
            await updateDoc(doc(db, 'orphans', showPeriodicResearch.id, 'periodic_research', editingResearch.id), {
              ...researchForm,
              updatedAt: serverTimestamp()
            });
            setEditingResearch(null);
          } else {
            await addDoc(collection(db, 'orphans', showPeriodicResearch.id, 'periodic_research'), {
              ...researchForm,
              createdAt: serverTimestamp()
            });
          }
          setShowAddResearch(false);
          setResearchForm({
            researchNumber: '',
            researchDate: new Date().toISOString().split('T')[0],
            isAlive: true,
            housingType: 'owned',
            rentAmount: 0,
            hasChanged: false,
            expenses: { school: 0, living: 0, other: 0 },
            income: { pension: 0, insurance: 0, salary: 0, other: 0 },
            notes: ''
          });
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          alert(editingResearch ? 'تمت عملية التعديل بنجاح' : 'تم حفظ البحث الدوري بنجاح');
        } catch (err) {
          alert('فشل في حفظ البحث الدوري');
        }
      }
    });
  };

  const handleConfirmSave = async () => {
    try {
      if (editingCase) {
        await updateDoc(doc(db, 'orphans', editingCase.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        setEditingCase(null);
      } else {
        await addDoc(collection(db, 'orphans'), {
          ...formData,
          createdAt: serverTimestamp()
        });
        setShowAddForm(false);
      }
      setFormData(initialForm);
      setShowConfirmSave(false);
      alert('تم حفظ البيانات بنجاح');
    } catch (err) {
      console.error("Save Error:", err);
      alert('حدث خطأ أثناء الحفظ. يرجى التأكد من اتصال الإنترنت.');
    }
  };

  const handleDownloadOrphanPDF = async (o: OrphanCase) => {
    const reportElement = document.createElement('div');
    reportElement.style.padding = '40px';
    reportElement.style.direction = 'rtl';
    reportElement.style.fontFamily = 'Amiri, serif';
    reportElement.style.backgroundColor = '#ffffff';
    reportElement.style.width = '210mm';
    reportElement.style.position = 'fixed';
    reportElement.style.left = '-9999px';

    reportElement.innerHTML = `
      <div style="border: 4px solid #065f46; padding: 30px; border-radius: 20px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #065f46; padding-bottom: 20px; margin-bottom: 30px;">
          <div style="text-align: right;">
            <h1 style="color: #065f46; margin: 0; font-size: 28px;">جمعية بصمة خير</h1>
            <p style="margin: 5px 0; font-weight: bold;">تقرير بيانات يتيم وشامل</p>
          </div>
          <div style="text-align: left;">
            <p>التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
          </div>
        </div>

        <div style="grid-template-columns: 1fr 1fr; display: grid; gap: 20px; text-align: right; margin-bottom: 30px;">
          <div style="padding: 15px; background: #f0fdf4; border-radius: 12px; grid-column: span 2;">
            <p style="color: #065f46; margin-bottom: 5px; font-weight: bold;">أسماء الأيتام:</p>
            <p style="font-size: 20px; font-weight: 800;">${o.orphans.map(c => c.name).join(' - ') || 'غير مسجل'}</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">ولي الأمر:</p>
            <p style="font-weight: bold;">${o.guardianName}</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">رقم تليفون 1:</p>
            <p style="font-weight: bold;">${o.phone1}</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">العنوان:</p>
            <p style="font-weight: bold;">${o.village} - ${o.address}</p>
          </div>
          <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <p style="color: #64748b; margin-bottom: 5px;">حالة الكفالة:</p>
            <p style="font-weight: bold;">${o.isSponsored ? `مكفول بمبلغ ${o.sponsorshipAmount} ج.م` : 'غير مكفول'}</p>
          </div>
        </div>

        <div style="text-align: right; margin-bottom: 30px;">
          <h3 style="color: #065f46; border-bottom: 1px solid #f0fdf4; padding-bottom: 10px;">ملاحظات إضافية:</h3>
          <p style="line-height: 1.8; padding: 10px; background: #f8fafc; border-radius: 12px;">تقرير شامل لبيانات الأسرة المسجلة في المركز.</p>
        </div>

        <div style="margin-top: 50px; display: flex; justify-content: space-around; text-align: center;">
          <div>
            <p>توقيع المسؤول</p>
            <p>....................</p>
          </div>
          <div>
            <p>ختم الجمعية</p>
            <div style="width: 80px; height: 80px; border: 2px dashed #065f46; border-radius: 50%; margin: 10px auto; opacity: 0.3;"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(reportElement);
    try {
      const canvas = await html2canvas(reportElement, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Orphan-${o.guardianName}.pdf`);
    } finally {
      document.body.removeChild(reportElement);
    }
  };

  const handleDelete = async () => {
    if (!showConfirmDelete) return;
    try {
      await deleteDoc(doc(db, 'orphans', showConfirmDelete));
      setShowConfirmDelete(null);
    } catch (err) {
      alert('حدث خطأ أثناء الحذف');
    }
  };

  const handleDeleteAll = async () => {
    try {
      const batch = writeBatch(db);
      orphans.forEach(o => {
        batch.delete(doc(db, 'orphans', o.id));
      });
      await batch.commit();
      setShowConfirmDeleteAll(false);
      alert('تم حذف جميع الحالات بنجاح');
    } catch (err) {
      alert('حدث خطأ أثناء الحذف الجماعي');
    }
  };

  const toggleDoc = (docName: string) => {
    setFormData(prev => ({
      ...prev,
      requiredDocs: prev.requiredDocs.includes(docName)
        ? prev.requiredDocs.filter(d => d !== docName)
        : [...prev.requiredDocs, docName]
    }));
  };

  const filteredOrphans = orphans
    .filter(o => 
      (o.orphans?.some(child => child.name.includes(searchQuery) || child.id.includes(searchQuery)) || 
      o.guardianName.includes(searchQuery) ||
      o.village.includes(searchQuery) ||
      o.address.includes(searchQuery)) &&
      (o.orphans?.some(child => child.name.toLowerCase().includes(columnFilters.orphanName.toLowerCase())) || columnFilters.orphanName === '') &&
      (o.orphans?.some(child => child.id.includes(columnFilters.orphanId)) || columnFilters.orphanId === '') &&
      o.guardianName.toLowerCase().includes(columnFilters.guardianName.toLowerCase()) &&
      o.village.toLowerCase().includes(columnFilters.village.toLowerCase())
    )
    .sort((a, b) => {
      let result = 0;
      if (sortBy === 'orphanName') {
        const nameA = a.orphans?.[0]?.name || a.orphanName || '';
        const nameB = b.orphans?.[0]?.name || b.orphanName || '';
        result = nameA.localeCompare(nameB, 'ar');
      }
      else if (sortBy === 'guardianName') result = (a.guardianName || '').localeCompare(b.guardianName || '', 'ar');
      else if (sortBy === 'village') result = (a.village || '').localeCompare(b.village || '', 'ar');
      else if (sortBy === 'address') result = (a.address || '').localeCompare(b.address || '', 'ar');
      
      return sortOrder === 'desc' ? -result : result;
    });

  const toggleSelectAll = () => {
    if (selectedOrphanIds.length === filteredOrphans.length) {
      setSelectedOrphanIds([]);
    } else {
      setSelectedOrphanIds(filteredOrphans.map(o => o.id));
    }
  };

  const toggleSelectOrphan = (id: string) => {
    setSelectedOrphanIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const exportToExcel = () => {
    const data = filteredOrphans.map((o, idx) => ({
      'مسلسل': idx + 1,
      'أسماء الأيتام': o.orphans?.map(child => child.name).join(' - '),
      'الأرقام القومية للأيتام': o.orphans?.map(child => child.id).join(' - '),
      'المرحلة الدراسية': o.orphans?.map(child => `${child.name}: ${child.schoolStage || 'غير محدد'}`).join(' | '),
      'الصف الدراسي': o.orphans?.map(child => `${child.name}: ${child.schoolGrade || 'غير محدد'}`).join(' | '),
      'الفصل الدراسي': o.orphans?.map(child => `${child.name}: ${child.semester || 'غير محدد'}`).join(' | '),
      'اسم الأم / القائم بالرعاية': o.guardianName,
      'مكان التسجيل': o.registrationPlace === 'council' ? 'المجلس الإسلامي للدعوة' : o.registrationPlace === 'hayatem' ? 'الهياتم' : 'ليست مسجلة',
      'الرقم القومي للمعيل': o.guardianId,
      'هل تم الكفالة؟': o.isSponsored ? 'نعم' : 'لا',
      'قيمة الكفالة': o.isSponsored ? o.sponsorshipAmount : 0,
      'رقم التواصل الرئيسي': o.phone1,
      'رقم التواصل البديل': o.phone2,
      'المركز': o.markaz,
      'القرية / المنطقة': o.village,
      'العنوان بالتفصيل': o.address,
      'اكتمال ملف الأوراق': o.filesStatus === 'registered' ? 'مكتمل' : 'نقص بالملف',
      'الحالة الإدارية': o.submissionStatus === 'done' ? 'تم الإرسال للهيئة' : 'جاري التجهيز',
      'قائمة المستندات': o.requiredDocs.join(' - ')
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "سجل الأيتام");
    XLSX.writeFile(wb, `كشف_الأيتام_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const printSingleResearch = (res: PeriodicResearch, orphanCase: OrphanCase) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html dir="rtl">
        <head>
          <title>بحث دوري - ${orphanCase.guardianName}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
            body { font-family: 'Tajawal', sans-serif; padding: 30px; color: #111827; line-height: 1.5; background: #fff; }
            .header { text-align: center; border-bottom: 3px solid #059669; padding-bottom: 15px; margin-bottom: 25px; }
            .header h1 { margin: 0; font-size: 20px; font-weight: 900; color: #064e3b; }
            .section { margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
            .section-title { background: #f0fdf4; padding: 8px 15px; font-weight: 900; color: #065f46; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; }
            .item { padding: 10px 15px; border-bottom: 1px solid #f3f4f6; border-left: 1px solid #f3f4f6; }
            .label { font-weight: bold; color: #6b7280; font-size: 12px; display: block; margin-bottom: 2px; }
            .value { font-weight: 800; color: #111827; }
            .full { grid-column: span 2; border-left: none; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: right; font-size: 13px; }
            th { background: #f9fafb; font-weight: 800; }
            .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #eee; padding-top: 15px; }
            @media print { .no-print { display: none; } }
            .print-btn { background: #059669; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 900; font-family: 'Tajawal'; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>استمارة البحث الدوري للأيتام</h1>
            <p style="margin: 5px 0; color: #059669; font-weight: bold;">مؤسسة هيئة الأعمال الخيرية - فرع الهياتم</p>
          </div>

          <div class="section">
            <div class="section-title">بيانات أساسية</div>
            <div class="grid">
              <div class="item"><span class="label">اسم المعيل:</span> <span class="value">${orphanCase.guardianName}</span></div>
              <div class="item"><span class="label">رقم البحث:</span> <span class="value">${res.researchNumber || 'غير مسجل'}</span></div>
              <div class="item"><span class="label">تاريخ البحث:</span> <span class="value">${res.researchDate || 'غير مسجل'}</span></div>
              <div class="item"><span class="label">حالة الحياة:</span> <span class="value">${res.isAlive ? 'على قيد الحياة' : 'متوفى'}</span></div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">الحالة المعيشية</div>
            <div class="grid">
              <div class="item"><span class="label">نوع السكن:</span> <span class="value">${res.housingType === 'rent' ? 'إيجار' : 'ملك / سكن'}</span></div>
              <div class="item"><span class="label">قيمة الإيجار:</span> <span class="value">${res.rentAmount || 0} ج.م</span></div>
              <div class="item"><span class="label">تغيرات الحالة:</span> <span class="value">${res.hasChanged ? 'نعم، حدث تغيير' : 'مستقرة'}</span></div>
               <div class="item"><span class="label">كود اليتيم:</span> <span class="value">${orphanCase.id.slice(0, 8)}</span></div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div class="section">
              <div class="section-title">المصروفات الشهرية</div>
              <table>
                <tr><td>شئون تعليمية</td><td>${res.expenses.school} ج.م</td></tr>
                <tr><td>متطلبات معيشية</td><td>${res.expenses.living} ج.م</td></tr>
                <tr><td>مصروفات أخرى</td><td>${res.expenses.other} ج.م</td></tr>
                <tr style="font-weight: 800; background: #fefce8;"><td>الإجمالي</td><td>${Object.values(res.expenses).reduce((a, b) => a + b, 0) + (res.rentAmount || 0)} ج.م</td></tr>
              </table>
            </div>
            <div class="section">
              <div class="section-title">مصادر الدخل</div>
              <table>
                <tr><td>المعاش</td><td>${res.income.pension} ج.م</td></tr>
                <tr><td>تأمين اجتماعي</td><td>${res.income.insurance} ج.م</td></tr>
                <tr><td>راتب / عمل</td><td>${res.income.salary} ج.م</td></tr>
                <tr><td>أخرى</td><td>${res.income.other} ج.م</td></tr>
                <tr style="font-weight: 800; background: #f0fdfa;"><td>الإجمالي</td><td>${Object.values(res.income).reduce((a, b) => a + b, 0)} ج.م</td></tr>
              </table>
            </div>
          </div>

          <div class="section">
            <div class="section-title">ملاحظات والتوصيات</div>
            <div style="padding: 15px; font-size: 13px; min-height: 60px;">${res.notes || 'لا توجد ملاحظات إضافية مسجلة.'}</div>
          </div>

          <div class="footer">
            جميع البيانات تم جمعها بواسطة الباحث الميداني المختص وتعتبر سرية<br>
            نظام إدارة بصمة خير &copy; ${new Date().getFullYear()}
          </div>

          <div class="no-print" style="text-align: center;">
            <button class="print-btn" onclick="window.print()">طباعة الآن</button>
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleTransferToCentral = async (o: OrphanCase) => {
    setConfirmConfig({
      isOpen: true,
      title: 'نقل إلى قاعدة البيانات العامة',
      message: `هل أنت متأكد من نقل بيانات ${o.orphans?.[0]?.name || 'الحالة'} إلى قاعدة البيانات العامة؟ سيبقى مسجلاً هنا أيضاً.`,
      onConfirm: async () => {
        try {
          await addDoc(collection(db, 'cases'), {
            name: o.orphans?.[0]?.name || o.guardianName,
            nationalId: o.orphans?.[0]?.id || o.guardianId,
            phone: o.phone1,
            address: `${o.village} - ${o.address}`,
            categories: ['أيتام'],
            status: 'active',
            familyCount: o.orphans?.length || 1,
            spouseName: o.guardianName,
            requestDate: new Date().toISOString().split('T')[0],
            description: `تم النقل من قسم كفالة الأيتام. قائمة الأيتام: ${o.orphans?.map(child => child.name).join('، ')}. الرقم القومي للمعيل: ${o.guardianId}`,
            createdAt: serverTimestamp()
          });
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          alert('تم النقل بنجاح إلى قاعدة البيانات العامة');
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'cases');
        }
      }
    });
  };

  const printVouchers = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <html>
        <head>
          <title>بونات هيئة الأعمال الخيرية</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
            body { font-family: 'Amiri', serif; direction: rtl; padding: 10px; }
            .voucher-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            .voucher { border: 2px dashed #059669; padding: 15px; border-radius: 10px; position: relative; height: 220px; box-sizing: border-box; }
            .v-header { text-align: center; border-bottom: 1px solid #eee; margin-bottom: 10px; padding-bottom: 5px; }
            .v-header h2 { margin: 0; font-size: 16px; color: #059669; }
            .v-body p { margin: 5px 0; font-size: 14px; font-weight: bold; }
            .v-footer { margin-top: 15px; display: flex; justify-content: space-between; font-size: 11px; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="voucher-grid">
            ${filteredOrphans.map(o => `
              <div class="voucher">
                <div class="v-header">
                  <h2>بصمة خير - هيئة الأعمال الخيرية</h2>
                  <p style="font-size: 10px;">بون استلام اليتيم</p>
                </div>
                <div class="v-body">
                  <p>المعيل: ${o.guardianName}</p>
                  <p>عدد الأيتام: ${o.orphans?.length || 0}</p>
                  <p>أسماء الأيتام: ${o.orphans?.map(child => child.name).join(' - ')}</p>
                  <p>العنوان: ${o.markaz} - ${o.village}</p>
                  <p>الحالة: ${o.isSponsored ? 'مكفول ' + o.sponsorshipAmount + ' ج.م' : 'غير مكفول'}</p>
                  <p>التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
                </div>
                <div class="v-footer">
                  <span>توقيع اللجنة: ............</span>
                  <span style="font-size: 8px;">ID: ${o.id.slice(0, 8)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const printReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const content = `
      <html>
        <head>
          <title>كشف هيئة الأعمال الخيرية</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Amiri&display=swap');
            body { font-family: 'Amiri', serif; direction: rtl; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 12px; }
            th { background-color: #f4f4f4; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #059669; padding-bottom: 10px; }
          </style>
        </head>
        <body>
        <div class="header">
            <h1 style="margin: 0; color: #059669;">كشف حالات هيئة الأعمال الخيرية</h1>
            <p style="margin: 5px 0;">جمعية بصمة خير نبروه</p>
            <p style="font-size: 12px; color: #666;">التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>أسماء الأيتام</th>
                <th>الأرقام القومية</th>
                <th>المرحلة الدراسية</th>
                <th>الصف الدراسي</th>
                <th>اسم المعيل</th>
                <th>جهة التسجيل</th>
                <th>المركز / القرية</th>
                <th>التليفون</th>
                <th>حالة الكفالة</th>
              </tr>
            </thead>
            <tbody>
              ${filteredOrphans.map(o => `
                <tr>
                  <td>${o.orphans?.map(child => child.name).join('<br>')}</td>
                  <td>${o.orphans?.map(child => child.id).join('<br>')}</td>
                  <td>${o.orphans?.map(child => child.schoolStage || '-').join('<br>')}</td>
                  <td>${o.orphans?.map(child => child.schoolGrade || '-').join('<br>')}</td>
                  <td>${o.guardianName}</td>
                  <td>${o.registrationPlace === 'council' ? 'المجلس الإسلامي' : o.registrationPlace === 'hayatem' ? 'الهياتم' : 'غير مسجلة'}</td>
                  <td>${o.markaz} - ${o.village}</td>
                  <td>${o.phone1}</td>
                  <td>${o.isSponsored ? 'مكفول (' + o.sponsorshipAmount + ' ج.م)' : 'غير مكفول'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-8 rounded-3xl shadow-sm border border-emerald-50">
        <div className="flex items-center gap-5">
          <div className="bg-emerald-600 p-4 rounded-2xl shadow-lg shadow-emerald-200">
            <Heart className="w-8 h-8 text-white" />
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-black text-emerald-950">هيئة الأعمال الخيرية</h1>
            <p className="text-emerald-600 font-bold text-sm">إدارة شؤون الأيتام والمطالبات</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleDownloadPDF('كشف_الأيتام', 'orphans-table-full')}
            className="p-3 bg-white border-2 border-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all shadow-sm flex items-center gap-2"
          >
            <FileText className="w-5 h-5" />
            <span className="text-xs font-bold">تحميل PDF</span>
          </button>
          {orphans.length > 0 && (
            <button 
              onClick={() => setShowConfirmDeleteAll(true)}
              className="p-3 bg-white border-2 border-rose-100 text-rose-500 rounded-xl hover:bg-rose-50 transition-all shadow-sm flex items-center gap-2"
            >
              <Trash2 className="w-5 h-5" />
              <span className="text-xs font-bold">حذف الكل</span>
            </button>
          )}
          <label className="p-3 bg-white border-2 border-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all shadow-sm cursor-pointer">
            <UploadCloud className={`w-5 h-5 ${importing ? 'animate-bounce' : ''}`} />
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} disabled={importing} />
          </label>
          <button onClick={exportToExcel} className="p-3 bg-white border-2 border-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all shadow-sm">
            <Download className="w-5 h-5" />
          </button>
          <button onClick={printVouchers} className="p-3 bg-white border-2 border-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all shadow-sm flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            <span className="text-xs font-bold">بونات الاستلام</span>
          </button>
          <button onClick={printReport} className="p-3 bg-white border-2 border-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all shadow-sm">
            <Printer className="w-5 h-5" />
          </button>
          <button 
            onClick={() => { setShowAddForm(true); setEditingCase(null); setFormData(initialForm); }}
            className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة يتيم جديد</span>
          </button>
        </div>
      </div>

      {/* Stats Quick View */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-emerald-50 p-6 rounded-3xl border-2 border-emerald-100 flex items-center justify-between">
            <div className="text-right">
              <p className="text-emerald-600 font-bold text-xs mb-1">إجمالي الحالات</p>
              <p className="text-2xl font-black text-emerald-900">{orphans.length}</p>
            </div>
            <Users className="w-8 h-8 text-emerald-200" />
        </div>
        <div className="bg-blue-50 p-6 rounded-3xl border-2 border-blue-100 flex items-center justify-between">
            <div className="text-right">
              <p className="text-blue-600 font-bold text-xs mb-1">تم الإرسال</p>
              <p className="text-2xl font-black text-blue-900">{orphans.filter(o => o.submissionStatus === 'done').length}</p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-blue-200" />
        </div>
        <div className="bg-amber-50 p-6 rounded-3xl border-2 border-amber-100 flex items-center justify-between">
            <div className="text-right">
              <p className="text-amber-600 font-bold text-xs mb-1">جاري التسجيل</p>
              <p className="text-2xl font-black text-amber-900">{orphans.filter(o => o.submissionStatus === 'processing').length}</p>
            </div>
            <Clock className="w-8 h-8 text-amber-200" />
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-3xl border border-emerald-50 relative">
        <div className="relative flex-grow">
          <Search className="w-5 h-5 text-emerald-300 absolute right-4 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="ابحث باسم اليتيم أو الرقم القومي أو اسم المعيل أو القرية..."
            className="w-full bg-stone-50 border-2 border-emerald-50 pr-12 pl-6 py-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 bg-emerald-50/50 p-1.5 rounded-2xl border border-emerald-100 flex-wrap">
           <span className="text-[10px] font-bold text-emerald-600 px-3">ترتيب حسب:</span>
           {[
             { id: 'orphanName', label: 'اسم اليتيم' },
             { id: 'guardianName', label: 'المعيل' },
             { id: 'village', label: 'القرية' },
             { id: 'address', label: 'العنوان' }
           ].map(btn => (
             <button 
               key={btn.id}
               onClick={() => setSortBy(btn.id as any)}
               className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${sortBy === btn.id ? 'bg-emerald-600 text-white shadow-md' : 'text-emerald-700 hover:bg-white'}`}
             >
               {btn.label}
             </button>
           ))}
        </div>
      </div>

      {/* Orphans Table */}
      <div className="bg-white rounded-[2.5rem] border border-emerald-50 shadow-xl overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto custom-scrollbar sticky-table-container">
          <table id="orphans-table-full" className="w-full text-right border-collapse min-w-[1200px] bg-white" dir="rtl">
            <thead>
              <tr className="bg-emerald-50/50">
                <th className="px-6 py-4 text-center border-b border-emerald-100">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                    checked={filteredOrphans.length > 0 && selectedOrphanIds.length === filteredOrphans.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">مسلسل</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">أسماء الأيتام</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">المعيل (الأم)</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">جهة التسجيل</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">حالة الكفالة</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">الهاتف</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100">القرية</th>
                <th className="p-5 text-emerald-900 font-black text-sm border-b border-emerald-100 text-center">الإجراءات</th>
              </tr>
              <tr className="bg-stone-50/50 border-b border-emerald-100">
                <td className="px-4 py-2"></td>
                <td className="px-4 py-2"></td>
                <td className="px-6 py-2">
                  <input 
                    type="text" 
                    placeholder="فلترة بالاسم..."
                    className="text-[10px] w-full px-2 py-1 bg-white border border-emerald-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 font-normal"
                    value={columnFilters.orphanName}
                    onChange={(e) => setColumnFilters(prev => ({ ...prev, orphanName: e.target.value }))}
                  />
                </td>
                <td className="px-6 py-2">
                  <input 
                    type="text" 
                    placeholder="فلترة بالرقم القومي..."
                    className="text-[10px] w-full px-2 py-1 bg-white border border-emerald-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 font-normal tabular-nums"
                    value={columnFilters.orphanId}
                    onChange={(e) => setColumnFilters(prev => ({ ...prev, orphanId: e.target.value }))}
                  />
                </td>
                <td className="px-6 py-2">
                  <input 
                    type="text" 
                    placeholder="فلترة بالمعيل..."
                    className="text-[10px] w-full px-2 py-1 bg-white border border-emerald-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 font-normal"
                    value={columnFilters.guardianName}
                    onChange={(e) => setColumnFilters(prev => ({ ...prev, guardianName: e.target.value }))}
                  />
                </td>
                <td className="px-6 py-2"></td>
                <td className="px-6 py-2">
                   <input 
                    type="text" 
                    placeholder="فلترة بالقرية..."
                    className="text-[10px] w-full px-2 py-1 bg-white border border-emerald-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 font-normal"
                    value={columnFilters.village}
                    onChange={(e) => setColumnFilters(prev => ({ ...prev, village: e.target.value }))}
                  />
                </td>
                <td className="px-6 py-2"></td>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {filteredOrphans.map((o, index) => (
                <tr key={o.id} className="hover:bg-emerald-50/20 transition-colors group">
                  <td className="px-6 py-4 text-center border-l border-emerald-50/50">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                      checked={selectedOrphanIds.includes(o.id)}
                      onChange={() => toggleSelectOrphan(o.id)}
                    />
                  </td>
                  <td className="p-5 text-stone-400 font-bold text-xs tabular-nums">{index + 1}</td>
                  <td className="p-5">
                    <div className="flex flex-col gap-1">
                      {o.orphans?.map((child, idx) => (
                        <div key={idx} className="flex flex-col border-b border-stone-50 last:border-0 pb-1">
                          <span className="font-black text-emerald-950 text-sm">{child.name}</span>
                          <span className="text-[9px] text-stone-400 tabular-nums">{child.id}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="p-5">
                     <span className="text-sm font-bold text-emerald-800">{o.guardianName}</span>
                  </td>
                  <td className="p-5">
                    <div className={`px-3 py-1 rounded-full inline-flex items-center gap-1.5 ${o.registrationPlace !== 'none' ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-500'}`}>
                      {o.registrationPlace !== 'none' ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      <span className="text-[10px] font-black">
                        {o.registrationPlace === 'council' ? 'المجلس الإسلامي' : o.registrationPlace === 'hayatem' ? 'الهياتم' : 'غير مسجلة'}
                      </span>
                    </div>
                  </td>
                  <td className="p-5">
                    <div className={`px-3 py-1 rounded-full inline-flex flex-col items-center gap-0.5 ${o.isSponsored ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      <span className="text-[10px] font-black">{o.isSponsored ? 'مكفول' : 'غير مكفول'}</span>
                      {o.isSponsored && <span className="text-[9px] font-bold tabular-nums">{o.sponsorshipAmount} ج.م</span>}
                    </div>
                  </td>
                  <td className="p-5">
                    <a href={`tel:${o.phone1}`} className="text-xs font-black text-emerald-600 tabular-nums hover:underline">{o.phone1}</a>
                  </td>
                  <td className="p-5">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-emerald-900">{o.village}</span>
                      <span className="text-[9px] text-stone-400 font-bold truncate max-w-[150px]">{o.address}</span>
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex justify-center gap-1">
                        <button 
                          onClick={() => handleTransferToCentral(o)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          title="نقل لقاعدة البيانات العامة"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setShowPeriodicResearch(o)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                          title="البحث الدوري"
                        >
                          <ClipboardList className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDownloadOrphanPDF(o)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                          title="تحميل كارت اليتيم PDF"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleEdit(o)}
                          className="p-2 text-stone-600 hover:bg-stone-50 rounded-xl transition-all"
                          title="تعديل"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            const printWindow = window.open('', '_blank');
                            if (printWindow) {
                              const html = `
                                <html dir="rtl">
                                  <head>
                                    <title>تقرير حالة - ${o.guardianName}</title>
                                    <style>
                                      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
                                      @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
                                      body { font-family: 'Tajawal', sans-serif; padding: 40px; color: #1a2e05; line-height: 1.6; background: #fff; }
                                      .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #059669; padding-bottom: 20px; margin-bottom: 30px; }
                                      .header-title { text-align: center; flex-grow: 1; }
                                      .header-title h1 { margin: 0; font-size: 24px; font-weight: 900; color: #065f46; }
                                      .header-title p { margin: 5px 0 0; color: #059669; font-weight: bold; }
                                      .section { margin-bottom: 30px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
                                      .section-header { background-color: #f0fdf4; padding: 10px 20px; border-bottom: 1px solid #e5e7eb; font-weight: 900; color: #065f46; border-right: 6px solid #059669; font-size: 16px; }
                                      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
                                      .grid-item { padding: 12px 20px; border-bottom: 1px solid #f3f4f6; border-left: 1px solid #f3f4f6; display: flex; justify-content: space-between; }
                                      .grid-item:nth-last-child(1), .grid-item:nth-last-child(2) { border-bottom: none; }
                                      .label { font-weight: bold; color: #6b7280; font-size: 14px; }
                                      .value { font-weight: 900; color: #111827; }
                                      table { width: 100%; border-collapse: collapse; }
                                      th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: right; }
                                      th { background: #f9fafb; font-weight: 900; font-size: 13px; color: #374151; }
                                      td { font-size: 14px; color: #111827; }
                                      .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 20px; }
                                      .no-print { display: flex; gap: 10px; justify-content: center; margin-top: 30px; }
                                      .print-btn { background: #059669; color: white; border: none; padding: 12px 30px; border-radius: 10px; cursor: pointer; font-weight: 900; font-family: 'Tajawal'; font-size: 16px; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
                                      .print-btn:hover { background: #047857; transform: translateY(-1px); }
                                      @media print { .no-print { display: none; } body { padding: 20px; } }
                                    </style>
                                  </head>
                                  <body>
                                    <div class="header">
                                      <div class="header-title">
                                        <h1>تقرير شامل لبيانات حالة أيتام</h1>
                                        <p>مؤسسة هيئة الأعمال الخيرية - فرع الهياتم</p>
                                      </div>
                                      <div style="font-size:12px; font-weight:bold; text-align: left;">
                                        تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}<br>
                                        كود الملف: ${o.id.substring(0, 8)}
                                      </div>
                                    </div>

                                    <div class="section">
                                      <div class="section-header">بيانات الأسرة والضامن</div>
                                      <div class="grid">
                                        <div class="grid-item"><span class="label">اسم الأم / المعيل:</span> <span class="value">${o.guardianName}</span></div>
                                        <div class="grid-item"><span class="label">الرقم القومي:</span> <span class="value">${o.guardianId}</span></div>
                                        <div class="grid-item"><span class="label">جهة التسجيل:</span> <span class="value">${o.registrationPlace === 'council' ? 'المجلس الإسلامي للدعوة' : o.registrationPlace === 'hayatem' ? 'الهياتم' : 'ليست مسجلة'}</span></div>
                                        <div class="grid-item"><span class="label">حالة الكفالة:</span> <span class="value">${o.isSponsored ? `مكفول (${o.sponsorshipAmount} ج.م)` : 'غير مكفول'}</span></div>
                                        <div class="grid-item"><span class="label">رقم الهاتف:</span> <span class="value">${o.phone1}</span></div>
                                        <div class="grid-item"><span class="label">العنوان المنزلي:</span> <span class="value">${o.markaz} - ${o.village}</span></div>
                                        <div class="grid-item" style="grid-column: span 2; border-left: none;"><span class="label">العنوان بالتفصيل:</span> <span class="value">${o.address}</span></div>
                                      </div>
                                    </div>

                                    <div class="section">
                                      <div class="section-header">بيانات الأيتام المسجلين</div>
                                      <table>
                                        <thead>
                                          <tr>
                                            <th>م</th>
                                            <th style="width: 35%">الاسم الكامل</th>
                                            <th>الرقم القومي</th>
                                            <th>المرحلة الدراسية</th>
                                            <th>الصف الدراسي</th>
                                            <th>الفصل</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          ${o.orphans?.map((c, i) => `
                                            <tr>
                                              <td style="text-align:center;">${i + 1}</td>
                                              <td style="font-weight: 900">${c.name}</td>
                                              <td>${c.id}</td>
                                              <td>${c.schoolStage || '-'}</td>
                                              <td>${c.schoolGrade || '-'}</td>
                                              <td>${c.semester || '-'}</td>
                                            </tr>
                                          `).join('')}
                                        </tbody>
                                      </table>
                                    </div>

                                    ${o.researchList?.length ? `
                                      <div class="section">
                                        <div class="section-header">آخر نتائج البحث الميداني</div>
                                        <div class="grid">
                                          <div class="grid-item"><span class="label">تاريخ آخر بحث:</span> <span class="value font-sans">${new Date(o.researchList[0].researchDate || o.researchList[0].createdAt?.toDate()).toLocaleDateString('ar-EG')}</span></div>
                                          <div class="grid-item"><span class="label">رقم البحث:</span> <span class="value">${o.researchList[0].researchNumber || '-'}</span></div>
                                          <div class="grid-item"><span class="label">سلامة الحالة:</span> <span class="value">${o.researchList[0].isAlive ? 'على قيد الحياة' : 'متوفى'}</span></div>
                                          <div class="grid-item"><span class="label">نظام السكن:</span> <span class="value">${o.researchList[0].housingType === 'rent' ? `إيجار شهري (${o.researchList[0].rentAmount} ج.م)` : 'سكن / ملك'}</span></div>
                                          <div class="grid-item"><span class="label">إجمالي الدخل الشهري:</span> <span class="value">${Object.values(o.researchList[0].income).reduce((a, b) => (a as number) + (b as number), 0)} ج.م</span></div>
                                          <div class="grid-item"><span class="label">إجمالي المصروفات:</span> <span class="value">${Object.values(o.researchList[0].expenses).reduce((a, b) => (a as number) + (b as number), 0) + (o.researchList[0].rentAmount || 0)} ج.م</span></div>
                                          <div class="grid-item" style="grid-column: span 2; border-left: none; border-bottom: none;"><span class="label">التوصيات والملحوظات:</span> <span class="value">${o.researchList[0].notes || 'لا يوجد'}</span></div>
                                        </div>
                                      </div>
                                    ` : `
                                      <div class="section" style="padding: 20px; text-align: center; color: #9ca3af; font-weight: bold;">
                                        لا توجد أبحاث دورية مسجلة لهذه الحالة بعد.
                                      </div>
                                    `}

                                    <div class="footer">
                                      تم استخراج هذا التقرير آلياً عبر نظام إدارة هيئة الأعمال الخيرية - الهياتم<br>
                                      جميع البيانات المسجلة هي عهدة الباحث المختص &copy; ${new Date().getFullYear()}
                                    </div>
                                    
                                    <div class="no-print">
                                      <button class="print-btn" onclick="window.print()">طباعة التقرير</button>
                                      <button class="print-btn" style="background: #6b7280;" onclick="window.close()">إغلاق</button>
                                    </div>
                                  </body>
                                </html>
                              `;
                              printWindow.document.write(html);
                              printWindow.document.close();
                            }
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded-xl transition-all shadow-sm"
                          title="تقرير الحالة"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setShowConfirmDelete(o.id)}
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

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] shadow-2xl p-8 custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-emerald-50 sticky top-0 bg-white z-10">
                <button onClick={() => setShowAddForm(false)} className="p-3 hover:bg-rose-50 text-rose-500 rounded-2xl transition-all">
                  <X className="w-6 h-6" />
                </button>
                <div className="text-right">
                  <h2 className="text-3xl font-black text-emerald-950">بيانات كفالة اليتيم</h2>
                  <p className="text-emerald-600 font-bold">يرجى استيفاء كافة البيانات بدقة</p>
                </div>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); setShowConfirmSave(true); }} className="space-y-10">
                {/* Guardian Section */}
                <div className="space-y-6">
                  <h3 className="text-lg font-black text-emerald-800 flex items-center gap-2 justify-end">
                    <span>بيانات الام / المعيل</span>
                    <Shield className="w-5 h-5" />
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">اسم الام / المعيل</label>
                      <input 
                        type="text" required
                        value={formData.guardianName}
                        onChange={(e) => setFormData({...formData, guardianName: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">الرقم القومي للمعيل</label>
                      <input 
                        type="text" required maxLength={14}
                        value={formData.guardianId}
                        onChange={(e) => setFormData({...formData, guardianId: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                  </div>
                </div>

                {/* Orphan Section */}
                <div className="space-y-6">
                   <div className="flex items-center justify-between border-b border-emerald-50 pb-4">
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, orphans: [...formData.orphans, { name: '', id: '', birthDate: '', schoolStage: '' }]})}
                      className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-bold hover:bg-emerald-100 transition-all text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة يتيم للأسرة</span>
                    </button>
                    <h3 className="text-lg font-black text-emerald-800 flex items-center gap-2">
                      <span>بيانات الأيتام</span>
                      <Heart className="w-5 h-5" />
                    </h3>
                  </div>
                  
                  <div className="space-y-6">
                    {formData.orphans.map((orphan, index) => (
                      <div key={index} className="p-6 bg-stone-50 rounded-3xl border-2 border-stone-100 relative group space-y-4">
                        {formData.orphans.length > 1 && (
                          <button 
                            type="button"
                            onClick={() => setFormData({...formData, orphans: formData.orphans.filter((_, i) => i !== index)})}
                            className="absolute -left-2 -top-2 w-8 h-8 bg-white border-2 border-rose-100 text-rose-500 rounded-full flex items-center justify-center hover:bg-rose-50 transition-all shadow-sm"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2 text-right">
                            <label className="text-xs font-bold text-stone-500 pr-2">اسم اليتيم ({index + 1})</label>
                            <input 
                              type="text" required
                              value={orphan.name}
                              onChange={(e) => {
                                const newOrphans = [...formData.orphans];
                                newOrphans[index].name = e.target.value;
                                setFormData({...formData, orphans: newOrphans});
                              }}
                              className="w-full bg-white border-2 border-stone-50 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                            />
                          </div>
                          <div className="space-y-2 text-right">
                            <label className="text-xs font-bold text-stone-500 pr-2">الرقم القومي لليتيم</label>
                            <input 
                              type="text" required maxLength={14}
                              value={orphan.id}
                              onChange={(e) => {
                                const newOrphans = [...formData.orphans];
                                newOrphans[index].id = e.target.value;
                                setFormData({...formData, orphans: newOrphans});
                              }}
                              className="w-full bg-white border-2 border-stone-50 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-right tabular-nums"
                            />
                          </div>
                          <div className="space-y-2 text-right">
                            <label className="text-xs font-bold text-stone-500 pr-2">المرحلة الدراسية</label>
                            <select 
                              value={orphan.schoolStage}
                              onChange={(e) => {
                                const newOrphans = [...formData.orphans];
                                newOrphans[index].schoolStage = e.target.value;
                                setFormData({...formData, orphans: newOrphans});
                              }}
                              className="w-full bg-white border-2 border-stone-50 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                            >
                              <option value="">اختار المرحلة</option>
                              {SCHOOL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div className="space-y-2 text-right">
                            <label className="text-xs font-bold text-stone-500 pr-2">الفصل الدراسي</label>
                            <select 
                              value={orphan.semester}
                              onChange={(e) => {
                                const newOrphans = [...formData.orphans];
                                newOrphans[index].semester = e.target.value;
                                setFormData({...formData, orphans: newOrphans});
                              }}
                              className="w-full bg-white border-2 border-stone-50 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                            >
                              <option value="">اختار الفصل</option>
                              {SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div className="space-y-2 text-right">
                            <label className="text-xs font-bold text-stone-500 pr-2">الصف الدراسي</label>
                            <input 
                              type="text"
                              value={orphan.schoolGrade}
                              onChange={(e) => {
                                const newOrphans = [...formData.orphans];
                                newOrphans[index].schoolGrade = e.target.value;
                                setFormData({...formData, orphans: newOrphans});
                              }}
                              placeholder="مثل: الصف الأول / تانية ميكانيكا"
                              className="w-full bg-white border-2 border-stone-50 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                            />
                          </div>
                          <div className="space-y-2 text-right">
                            <label className="text-xs font-bold text-stone-500 pr-2">تاريخ الميلاد (اختياري)</label>
                            <input 
                              type="date"
                              value={orphan.birthDate}
                              onChange={(e) => {
                                const newOrphans = [...formData.orphans];
                                newOrphans[index].birthDate = e.target.value;
                                setFormData({...formData, orphans: newOrphans});
                              }}
                              className="w-full bg-white border-2 border-stone-50 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-bold text-right font-sans"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sponsorship and Council Section */}
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-6">
                    {/* Registration Status */}
                    <div className="p-8 bg-blue-50/50 rounded-3xl border-2 border-blue-100 space-y-6">
                      <h3 className="text-lg font-black text-blue-800 flex items-center gap-2 justify-end">
                        <span>الحالة مسجلة في؟</span>
                        <Shield className="w-5 h-5" />
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button 
                          type="button"
                          onClick={() => setFormData({...formData, registrationPlace: 'council'})}
                          className={`flex items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all font-black ${formData.registrationPlace === 'council' ? 'bg-white border-blue-600 text-blue-700 shadow-lg scale-[1.02]' : 'bg-white/50 border-stone-100 text-stone-400 hover:bg-white'}`}
                        >
                          <CheckCircle2 className={`w-6 h-6 ${formData.registrationPlace === 'council' ? 'text-blue-600' : 'text-stone-300'}`} />
                          <span className="text-xl">المجلس الإسلامي للدعوة</span>
                        </button>

                        <button 
                          type="button"
                          onClick={() => setFormData({...formData, registrationPlace: 'hayatem'})}
                          className={`flex items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all font-black ${formData.registrationPlace === 'hayatem' ? 'bg-white border-sky-600 text-sky-700 shadow-lg scale-[1.02]' : 'bg-white/50 border-stone-100 text-stone-400 hover:bg-white'}`}
                        >
                          <CheckCircle2 className={`w-6 h-6 ${formData.registrationPlace === 'hayatem' ? 'text-sky-600' : 'text-stone-300'}`} />
                          <span className="text-xl">الهياتم</span>
                        </button>

                        <button 
                          type="button"
                          onClick={() => setFormData({...formData, registrationPlace: 'none'})}
                          className={`flex items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all font-black ${formData.registrationPlace === 'none' ? 'bg-white border-rose-500 text-rose-600 shadow-sm' : 'bg-white/50 border-stone-100 text-stone-400 hover:bg-white'}`}
                        >
                          <X className={`w-6 h-6 ${formData.registrationPlace === 'none' ? 'text-rose-500' : 'text-stone-300'}`} />
                          <span className="text-xl">ليست مسجلة</span>
                        </button>
                      </div>
                    </div>

                    {/* Sponsorship Status */}
                    <div className="p-8 bg-emerald-50/50 rounded-3xl border-2 border-emerald-100 space-y-4">
                      <h3 className="text-lg font-black text-emerald-800 flex items-center gap-2 justify-end">
                        <span>حالة الكفالة</span>
                        <Clock className="w-5 h-5" />
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-end gap-4 p-4 bg-white rounded-2xl border-2 border-stone-50">
                           <span className={`text-sm font-black ${formData.isSponsored ? 'text-emerald-600' : 'text-stone-400'}`}>
                             {formData.isSponsored ? 'تم الكفالة' : 'غير مكفول حالياً'}
                           </span>
                           <button 
                             type="button"
                             onClick={() => setFormData({...formData, isSponsored: !formData.isSponsored})}
                             className={`w-14 h-8 rounded-full transition-all relative ${formData.isSponsored ? 'bg-emerald-500' : 'bg-stone-200'}`}
                           >
                             <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${formData.isSponsored ? 'right-7' : 'right-1'}`} />
                           </button>
                        </div>
                        {formData.isSponsored && (
                          <div className="space-y-2 text-right animate-in slide-in-from-right duration-300">
                            <label className="text-xs font-bold text-stone-500 pr-2">قيمة الكفالة الشهرية (ج.م)</label>
                            <input 
                              type="number" required
                              value={formData.sponsorshipAmount}
                              onChange={(e) => setFormData({...formData, sponsorshipAmount: Number(e.target.value)})}
                              className="w-full bg-white border-2 border-emerald-100 p-3 rounded-xl focus:border-emerald-500 outline-none transition-all font-black text-center text-lg text-emerald-700"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contact and Address */}
                <div className="space-y-6">
                  <h3 className="text-lg font-black text-emerald-800 flex items-center gap-2 justify-end">
                    <span>التواصل والعنوان</span>
                    <MapPin className="w-5 h-5" />
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">رقم التليفون ١</label>
                      <input 
                        type="tel" required
                        value={formData.phone1}
                        onChange={(e) => setFormData({...formData, phone1: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">رقم التليفون ٢ (اختياري)</label>
                      <input 
                        type="tel"
                        value={formData.phone2}
                        onChange={(e) => setFormData({...formData, phone2: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">المركز</label>
                      <input 
                        type="text" required
                        value={formData.markaz}
                        onChange={(e) => setFormData({...formData, markaz: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">القرية</label>
                      <input 
                        type="text" required
                        value={formData.village}
                        onChange={(e) => setFormData({...formData, village: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                    <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-stone-500 pr-2">العنوان بالتفصيل</label>
                      <input 
                        type="text" required
                        value={formData.address}
                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                        className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-right"
                      />
                    </div>
                  </div>
                </div>

                {/* Status Checks */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-8 bg-emerald-50 rounded-3xl border-2 border-emerald-100">
                   <div className="space-y-3 text-right">
                      <label className="text-sm font-black text-emerald-900 block">الملفات</label>
                      <select 
                        value={formData.filesStatus}
                        onChange={(e) => setFormData({...formData, filesStatus: e.target.value as any})}
                        className="w-full p-4 rounded-2xl bg-white border-2 border-emerald-100 font-bold outline-none"
                      >
                         <option value="not_registered">لم تسجل</option>
                         <option value="registered">تم التسجيل</option>
                      </select>
                   </div>
                   <div className="space-y-3 text-right">
                      <label className="text-sm font-black text-emerald-900 block">استمارة البحث</label>
                      <select 
                        value={formData.researchFormStatus}
                        onChange={(e) => setFormData({...formData, researchFormStatus: e.target.value as any})}
                        className="w-full p-4 rounded-2xl bg-white border-2 border-emerald-100 font-bold outline-none"
                      >
                         <option value="not_registered">لم تسجل</option>
                         <option value="registered">تم التسجيل</option>
                      </select>
                   </div>
                   <div className="space-y-3 text-right">
                      <label className="text-sm font-black text-emerald-900 block">إرسال الحالة</label>
                      <select 
                        value={formData.submissionStatus}
                        onChange={(e) => setFormData({...formData, submissionStatus: e.target.value as any})}
                        className="w-full p-4 rounded-2xl bg-white border-2 border-emerald-100 font-bold outline-none"
                      >
                         <option value="processing">جاري التسجيل</option>
                         <option value="done">تم</option>
                      </select>
                   </div>
                </div>

                {/* Required Documents Checklist */}
                <div className="space-y-6">
                <h3 className="text-lg font-black text-emerald-800 flex items-center gap-2 justify-end">
                    <span>الأوراق المطلوبة والمتوفرة</span>
                    <ListChecks className="w-5 h-5" />
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                     {REQUIRED_DOCS_LIST.map((docName) => (
                       <button
                         key={docName}
                         type="button"
                         onClick={() => toggleDoc(docName)}
                         className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all font-bold ${
                           formData.requiredDocs.includes(docName)
                           ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100'
                           : 'bg-white border-stone-100 text-stone-500 hover:border-emerald-200'
                         }`}
                       >
                         {formData.requiredDocs.includes(docName) ? <CheckCircle2 className="w-5 h-5" /> : <div className="w-5 h-5 rounded-full border-2 border-stone-100" />}
                         <span>{docName}</span>
                       </button>
                     ))}
                  </div>
                </div>

                <div className="space-y-6">
                <h3 className="text-lg font-black text-emerald-800 flex items-center gap-2 justify-end">
                    <span>بيانات المستندات المرفوعة</span>
                    <UploadCloud className="w-5 h-5" />
                  </h3>
                  <FileUploadSlot 
                    label="رفع صور المستندات (شهادات ميلاد، شهادة وفاة، إلخ)"
                    caseName={formData.orphans?.[0]?.name || 'يتيم_بدون_اسم'}
                    storagePath="orphans/docs"
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

                <div className="pt-8 flex items-center gap-4">
                  <button type="submit" className="flex-grow bg-emerald-600 text-white py-5 rounded-[2rem] font-black text-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-3">
                    <Save className="w-6 h-6" />
                    <span>حفظ بيانات الحالة</span>
                  </button>
                  <button type="button" onClick={() => setShowAddForm(false)} className="px-10 py-5 text-rose-500 font-bold hover:bg-rose-50 rounded-[2rem] transition-all">إلغاء</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Periodic Research Modal */}
      <AnimatePresence>
        {showPeriodicResearch && (
          <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl p-8 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-stone-100 sticky top-0 bg-white z-10 font-sans">
                <button onClick={() => setShowPeriodicResearch(null)} className="p-3 bg-stone-50 text-stone-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all font-sans">
                  <X className="w-6 h-6" />
                </button>
                <div className="text-right">
                  <h2 className="text-2xl font-black text-emerald-950 font-sans">البحث الدوري للحالة</h2>
                  <p className="text-stone-400 font-bold font-sans">{showPeriodicResearch.orphanName}</p>
                </div>
              </div>

              <div className="space-y-8">
                <div className="flex justify-between items-center bg-emerald-50 p-4 rounded-2xl">
                   <button 
                    onClick={handleToggleAddResearch}
                    className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2"
                   >
                     {showAddResearch ? 'إلغاء' : 'إضافة تحديث جديد'}
                   </button>
                   <p className="text-emerald-900 font-black">{editingResearch ? `تعديل البحث رقم: ${editingResearch.researchNumber || 'الحالي'}` : 'سجل التحديثات الدورية'}</p>
                </div>

                {showAddResearch && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="bg-stone-50 p-6 rounded-3xl border-2 border-dashed border-emerald-200 space-y-6"
                  >
                    {/* Basic Meta Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2 text-right">
                        <label className="text-xs font-bold text-stone-500 pr-2">رقم البحث</label>
                        <input 
                          type="text"
                          value={researchForm.researchNumber}
                          onChange={(e) => setResearchForm({...researchForm, researchNumber: e.target.value})}
                          className="w-full p-4 rounded-xl border border-stone-200 outline-none font-bold text-right"
                          placeholder="مثال: 123/2024"
                        />
                      </div>
                      <div className="space-y-2 text-right">
                        <label className="text-xs font-bold text-stone-500 pr-2">تاريخ البحث</label>
                        <input 
                          type="date"
                          value={researchForm.researchDate}
                          onChange={(e) => setResearchForm({...researchForm, researchDate: e.target.value})}
                          className="w-full p-4 rounded-xl border border-stone-200 outline-none font-bold text-center font-sans"
                        />
                      </div>
                      <div className="space-y-2 text-right">
                        <label className="text-xs font-bold text-stone-500 pr-2">هل الحالة على قيد الحياة؟</label>
                        <button 
                          onClick={() => setResearchForm({...researchForm, isAlive: !researchForm.isAlive})}
                          className={`w-full p-4 rounded-xl border-2 transition-all font-black flex items-center justify-center gap-2 ${researchForm.isAlive ? 'border-emerald-500 bg-white text-emerald-600' : 'border-rose-500 bg-rose-50 text-rose-600'}`}
                        >
                          {researchForm.isAlive ? <CheckCircle2 className="w-5 h-5" /> : <X className="w-5 h-5" />}
                          <span>{researchForm.isAlive ? 'نعم، على قيد الحياة' : 'لا (متوفى)'}</span>
                        </button>
                      </div>
                      <div className="space-y-2 text-right">
                        <label className="text-xs font-bold text-stone-500 pr-2">تغير في الحالة؟</label>
                        <select 
                          className="w-full p-4 rounded-xl border border-stone-200 outline-none font-bold text-right"
                          value={researchForm.hasChanged ? 'yes' : 'no'}
                          onChange={(e) => setResearchForm({...researchForm, hasChanged: e.target.value === 'yes'})}
                        >
                          <option value="no">لا يوجد تغيير</option>
                          <option value="yes">نعم، حدث تغيير</option>
                        </select>
                      </div>
                    </div>

                    {/* Housing Info */}
                    <div className="p-6 bg-white rounded-2xl border border-stone-100 space-y-4">
                       <h4 className="text-sm font-black text-blue-900 border-r-4 border-blue-500 pr-2">بيانات السكن</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="flex bg-stone-50 p-1 rounded-xl gap-1">
                            <button 
                              onClick={() => setResearchForm({...researchForm, housingType: 'rent'})}
                              className={`flex-grow py-3 rounded-lg font-bold transition-all ${researchForm.housingType === 'rent' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-400'}`}
                            >إيجار</button>
                            <button 
                              onClick={() => setResearchForm({...researchForm, housingType: 'owned'})}
                              className={`flex-grow py-3 rounded-lg font-bold transition-all ${researchForm.housingType === 'owned' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-400'}`}
                            >ملك / سكن</button>
                         </div>
                         {researchForm.housingType === 'rent' && (
                           <div className="space-y-1 animate-in zoom-in-95 duration-200">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">قيمة الإيجار الشهري</label>
                             <input 
                               type="number" className="w-full p-4 rounded-xl border-2 border-blue-50 outline-none font-bold text-center text-blue-600 text-lg"
                               value={researchForm.rentAmount}
                               onChange={(e) => setResearchForm({...researchForm, rentAmount: Number(e.target.value)})}
                             />
                           </div>
                         )}
                       </div>
                    </div>

                    <div className="space-y-4">
                       <h4 className="text-sm font-black text-emerald-900 border-r-4 border-emerald-500 pr-2">المصاريف الشهرية</h4>
                       <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">دراسة</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.expenses.school}
                               onChange={(e) => setResearchForm({...researchForm, expenses: {...researchForm.expenses, school: Number(e.target.value)}})}
                             />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">معيشة</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.expenses.living}
                               onChange={(e) => setResearchForm({...researchForm, expenses: {...researchForm.expenses, living: Number(e.target.value)}})}
                             />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">أخرى</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.expenses.other}
                               onChange={(e) => setResearchForm({...researchForm, expenses: {...researchForm.expenses, other: Number(e.target.value)}})}
                             />
                          </div>
                       </div>
                    </div>

                    <div className="space-y-4">
                       <h4 className="text-sm font-black text-amber-900 border-r-4 border-amber-500 pr-2">مصادر الدخل الشهري</h4>
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">معاش</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.income.pension}
                               onChange={(e) => setResearchForm({...researchForm, income: {...researchForm.income, pension: Number(e.target.value)}})}
                             />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">تأمين</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.income.insurance}
                               onChange={(e) => setResearchForm({...researchForm, income: {...researchForm.income, insurance: Number(e.target.value)}})}
                             />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">راتب</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.income.salary}
                               onChange={(e) => setResearchForm({...researchForm, income: {...researchForm.income, salary: Number(e.target.value)}})}
                             />
                          </div>
                          <div className="space-y-1">
                             <label className="text-[10px] font-bold text-stone-400 block text-right pr-2">أخرى</label>
                             <input 
                               type="number" className="w-full p-3 rounded-xl border border-stone-200 outline-none font-bold text-center"
                               value={researchForm.income.other}
                               onChange={(e) => setResearchForm({...researchForm, income: {...researchForm.income, other: Number(e.target.value)}})}
                             />
                          </div>
                       </div>
                    </div>

                    <div className="space-y-2 text-right">
                       <label className="text-xs font-bold text-stone-500 pr-2">ملاحظات البحث</label>
                       <textarea 
                        className="w-full p-4 rounded-xl border border-stone-200 outline-none font-bold text-right min-h-[100px]"
                        value={researchForm.notes}
                        onChange={(e) => setResearchForm({...researchForm, notes: e.target.value})}
                       />
                    </div>

                    <button 
                      onClick={handleAddResearch}
                      className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-emerald-100"
                    >
                      حفظ البحث الدوري
                    </button>
                  </motion.div>
                )}

                <div className="space-y-4">
                   {researchList.map((res) => (
                     <div key={res.id} className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm text-right space-y-4">
                        <div className="flex justify-between items-center border-b border-stone-50 pb-3">
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => {
                                  setConfirmConfig({
                                    isOpen: true,
                                    title: 'حذف البحث الدوري',
                                    message: 'هل أنت متأكد من حذف هذا البحث الدوري للأيتام نهائياً؟',
                                    onConfirm: async () => {
                                      try {
                                        await deleteDoc(doc(db, 'orphans', showPeriodicResearch.id, 'periodic_research', res.id));
                                        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                                        alert('تم حذف البحث الدوري بنجاح');
                                      } catch (err) {
                                        alert('فشل في حذف البحث الدوري');
                                      }
                                    }
                                  });
                                }}
                                className="p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                title="حذف"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleEditResearch(res)}
                                className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title="تعديل"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => printSingleResearch(res, showPeriodicResearch)}
                                className="p-2 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                title="طباعة"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setViewingResearch(res)}
                                className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded-lg transition-all"
                                title="معاينة"
                              >
                                <Search className="w-4 h-4" />
                              </button>
                              <span className={`px-2 py-1 rounded-lg text-[10px] font-black mr-2 ${res.hasChanged ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                {res.hasChanged ? 'حدث تغيير' : 'مستقرة'}
                              </span>
                             {res.isAlive === false && (
                               <span className="px-2 py-1 rounded-lg text-[10px] font-black bg-rose-100 text-rose-600">
                                 الحالة متوفية
                               </span>
                             )}
                           </div>
                           <div className="text-left">
                             <p className="text-[10px] font-bold text-emerald-600">{res.researchNumber ? `بحث رقم: ${res.researchNumber}` : 'بدون رقم بحث'}</p>
                             <span className="text-xs font-bold text-stone-400 font-sans">
                               {res.researchDate 
                                 ? new Date(res.researchDate).toLocaleDateString('ar-EG')
                                 : res.createdAt?.toDate() 
                                   ? new Date(res.createdAt.toDate()).toLocaleDateString('ar-EG') 
                                   : res.date?.toDate() 
                                     ? new Date(res.date.toDate()).toLocaleDateString('ar-EG') 
                                     : 'تاريخ غير متوفر'}
                             </span>
                           </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                           <div className="space-y-2">
                              <p className="text-[10px] font-black text-rose-600">إجمالي المصاريف</p>
                              <p className="font-black text-emerald-950 text-xl tabular-nums">{(Object.values(res.expenses) as number[]).reduce((a, b) => a + b, 0) + (res.rentAmount || 0)} ج.م</p>
                              <div className="flex gap-2 text-[8px] font-bold text-stone-400">
                                 <span>دراسة: {res.expenses.school}</span>
                                 <span>معيشة: {res.expenses.living}</span>
                                 {res.rentAmount! > 0 && <span>إيجار: {res.rentAmount}</span>}
                              </div>
                           </div>
                           <div className="space-y-2">
                              <p className="text-[10px] font-black text-emerald-600">إجمالي الدخل</p>
                              <p className="font-black text-emerald-950 text-xl tabular-nums">{(Object.values(res.income) as number[]).reduce((a, b) => a + b, 0)} ج.م</p>
                              <div className="flex gap-2 text-[8px] font-bold text-stone-400">
                                 <span>معاش: {res.income.pension}</span>
                                 <span>راتب: {res.income.salary}</span>
                              </div>
                           </div>
                           <div className="space-y-2">
                              <p className="text-[10px] font-black text-blue-600">بيانات السكن</p>
                              <p className="font-black text-emerald-950 text-lg">
                                {res.housingType === 'rent' ? 'إيجار' : 'ملك / سكن'}
                              </p>
                              {res.rentAmount! > 0 && <span className="text-[10px] font-bold text-stone-400">قيمة الإيجار: {res.rentAmount} ج.م</span>}
                           </div>
                        </div>
                        {res.notes && (
                          <p className="text-xs text-stone-500 bg-stone-50 p-3 rounded-xl border border-stone-100 italic">
                            {res.notes}
                          </p>
                        )}
                     </div>
                   ))}
                   {researchList.length === 0 && !showAddResearch && (
                     <div className="py-20 text-center text-stone-300 font-bold italic">
                        لا توجد أبحاث دورية مسجلة لهذه الحالة بعد
                     </div>
                   )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Viewing Research Modal (Preview) */}
      <AnimatePresence>
        {viewingResearch && (
          <div className="fixed inset-0 bg-emerald-950/60 backdrop-blur-md z-[70] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden text-right"
            >
              <div className="bg-emerald-600 p-6 text-white flex justify-between items-center">
                 <button onClick={() => setViewingResearch(null)} className="p-2 hover:bg-emerald-700 rounded-lg"><X /></button>
                 <h3 className="text-xl font-black">معاينة تفاصيل البحث الدوري</h3>
              </div>
              
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-6 text-right">
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <p className="text-xs text-stone-400 font-bold mb-1">رقم البحث</p>
                    <p className="font-black text-emerald-900">{viewingResearch.researchNumber || 'غير مسجل'}</p>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <p className="text-xs text-stone-400 font-bold mb-1">تاريخ البحث</p>
                    <p className="font-black text-emerald-900 font-sans">{viewingResearch.researchDate || 'غير مسجل'}</p>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <p className="text-xs text-stone-400 font-bold mb-1">حالة الحياة</p>
                    <p className="font-black text-emerald-900">{viewingResearch.isAlive ? 'على قيد الحياة' : 'متوفى'}</p>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <p className="text-xs text-stone-400 font-bold mb-1">نوع السكن</p>
                    <p className="font-black text-emerald-900">
                      {viewingResearch.housingType === 'rent' ? `إيجار (${viewingResearch.rentAmount} ج.م)` : 'ملك / سكن'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-black text-emerald-800 border-r-4 border-emerald-500 pr-2">المصاريف والدخل</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-emerald-100 p-4 rounded-xl">
                      <p className="text-xs font-bold text-emerald-600 mb-2">إجمالي المصروفات</p>
                      <p className="text-2xl font-black tabular-nums">
                        {Object.values(viewingResearch.expenses).reduce((a, b) => (a as number) + (b as number), 0) + (viewingResearch.rentAmount || 0)} ج.م
                      </p>
                    </div>
                    <div className="border border-amber-100 p-4 rounded-xl">
                      <p className="text-xs font-bold text-amber-600 mb-2">إجمالي الدخل</p>
                      <p className="text-2xl font-black tabular-nums">
                        {Object.values(viewingResearch.income).reduce((a, b) => (a as number) + (b as number), 0)} ج.م
                      </p>
                    </div>
                  </div>
                </div>

                {viewingResearch.notes && (
                  <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100">
                    <p className="text-xs font-black text-stone-400 mb-2">ملاحظات البحث</p>
                    <p className="font-bold text-stone-700 leading-relaxed italic">"{viewingResearch.notes}"</p>
                  </div>
                )}
              </div>

              <div className="p-6 bg-stone-50 border-t border-stone-100 flex gap-4">
                 <button 
                  onClick={() => {
                    if (showPeriodicResearch) printSingleResearch(viewingResearch, showPeriodicResearch);
                  }}
                  className="flex-grow bg-emerald-600 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2"
                 >
                   <Printer className="w-5 h-5" />
                   <span>طباعة التقرير</span>
                 </button>
                 <button 
                  onClick={() => setViewingResearch(null)}
                  className="px-8 bg-white border border-stone-200 text-stone-500 py-3 rounded-xl font-bold"
                 >إغلاق</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmSave && (
          <div className="fixed inset-0 bg-emerald-950/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               className="bg-white p-8 rounded-[2rem] shadow-2xl max-w-sm w-full text-center"
            >
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-black text-emerald-950 mb-3">تأكيد الحفظ</h3>
              <p className="text-stone-500 font-bold mb-8">هل أنت متأكد من رغبتك في حفظ بيانات هذه الحالة في الكشف؟</p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleConfirmSave}
                  className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                >
                  نعم، تأكيد الحفظ
                </button>
                <button 
                  onClick={() => setShowConfirmSave(false)}
                  className="w-full bg-stone-100 text-stone-500 py-4 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  لا، مراجعة البيانات
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Single Confirmation */}
      <AnimatePresence>
        {showConfirmDelete && (
          <div className="fixed inset-0 bg-rose-950/40 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               className="bg-white p-8 rounded-[2rem] shadow-2xl max-w-sm w-full text-center"
            >
              <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-10 h-10 text-rose-600" />
              </div>
              <h3 className="text-2xl font-black text-stone-900 mb-3">حذف الحالة</h3>
              <p className="text-stone-500 font-bold mb-8">هل أنت متأكد من حذف هذه الحالة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.</p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleDelete}
                  className="w-full bg-rose-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
                >
                  نعم، احذف نهائياً
                </button>
                <button 
                  onClick={() => setShowConfirmDelete(null)}
                  className="w-full bg-stone-100 text-stone-500 py-4 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete All Confirmation */}
      <AnimatePresence>
        {showConfirmDeleteAll && (
          <div className="fixed inset-0 bg-rose-950/60 backdrop-blur-lg z-[60] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               className="bg-white p-8 rounded-[2rem] shadow-2xl max-w-md w-full text-center"
            >
              <div className="w-24 h-24 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-12 h-12 text-rose-600" />
              </div>
              <h3 className="text-3xl font-black text-rose-950 mb-3">حذف الكشف بالكامل!</h3>
              <p className="text-stone-500 font-bold mb-8 text-lg">
                أنت على وشك مسح <span className="text-rose-600">{orphans.length}</span> حالة من الكشف.
                <br />
                هل أنت متأكد تماماً من هذا القرار؟
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleDeleteAll}
                  className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-rose-700 transition-all shadow-xl shadow-rose-200"
                >
                  نعم، امسح كل الحالات
                </button>
                <button 
                  onClick={() => setShowConfirmDeleteAll(false)}
                  className="w-full bg-stone-100 text-stone-500 py-4 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  تراجع، لا تحذف
                </button>
              </div>
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