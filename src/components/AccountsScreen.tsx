import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, UserCheck, DollarSign, TrendingUp, 
  Search, Plus, Filter, Download, Printer, 
  Trash2, Edit, X, Save, Calendar, Phone,
  FileCheck, PieChart, ArrowUpCircle, ArrowDownCircle,
  Receipt, MessageSquare, Briefcase, Wallet, Clock,
  Smartphone, Landmark, CreditCard, CheckCircle, CheckCircle2,
  XCircle, PlayCircle, PlusCircle, MinusCircle, Repeat, History, ArrowLeft,
  Shield, Eye, TrendingDown, Activity, Settings, Hash, Lock, FileText,
  Gift, ShoppingBag, Check
} from 'lucide-react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, where, getDocs, writeBatch, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import ConfirmModal from './ConfirmModal';

interface FinancialAccount {
  id: string;
  name: string;
  type: 'cash' | 'vodafone_cash' | 'bank';
  balance: number;
  lastUpdated?: any;
}

interface FinancialOperation {
  id: string;
  opNumber: string;
  type: 'income' | 'expense';
  date: string;
  amount: number;
  accountId: string;
  category: string;
  subCategory?: string;
  donorInfo?: {
    name: string;
    phone: string;
    source: string;
  };
  beneficiary?: string;
  description: string;
  proofUrl?: string;
  voucherNumber?: string;
  receivedBy?: string;
  authorizedBy?: string;
  purpose?: string;
  notes?: string;
  paymentMethod?: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  approval?: {
    requestedBy: string;
    reviewedBy?: string;
    approvedBy?: string;
    executedBy?: string;
    updatedAt?: any;
  };
  createdAt?: any;
}

interface AccountTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  notes?: string;
  createdAt: any;
}

interface MonthlyGoal {
  id: string;
  month: number;
  year: number;
  targetAmount: number;
  createdAt?: any;
}

interface AppUser {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: 'developer' | 'admin' | 'manager' | 'accountant' | 'clerk';
  permissions: string[]; // List of specific tabs like ['donors', 'operations']
  active: boolean;
  createdAt?: any;
}

interface SacrificeCoupon {
  id: string;
  donorName: string;
  phone: string;
  amount: number;
  remainingAmount?: number;
  paymentMethod?: 'cash' | 'wallet' | 'instapay' | 'bank';
  couponCount: string; // e.g., "0.5", "1", "2"
  collectorName?: string;
  donorPortion?: string;
  date: string;
  isCollected: boolean;
  isContacted: boolean;
  createdAt?: any;
}

interface RamadanDonation {
  id: string;
  donorName: string;
  phone: string;
  amount: number;
  remainingAmount?: number;
  paymentMethod?: 'cash' | 'wallet' | 'instapay' | 'bank';
  donationType: 'cash' | 'inkind';
  itemType: 'money' | 'commodity'; 
  campaignType: 'bag' | 'meals';
  date: string;
  isCollected: boolean;
  isContacted: boolean;
  createdAt?: any;
}

import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart as RePieChart, Pie, Cell, AreaChart, Area
} from 'recharts';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];

interface Donor {
  id: string;
  name: string;
  phone: string;
  email?: string;
  totalDonations: number;
  lastDonationDate: string;
  donationTypes: string[];
  campaigns: string[];
  collectionStatus: 'collected' | 'pending' | 'not_collected';
  createdAt?: any;
}

interface SponsorshipDonor {
  id: string;
  name: string;
  phone: string;
  amount: number;
  notes?: string;
  createdAt: any;
}

interface PaymentRecord {
  id: string;
  donorId: string;
  month: number;
  year: number;
  isCollected: boolean;
  amount: number;
  notes?: string;
  createdAt: any;
}

const months_ar = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

const ALL_TABS = [
  { id: 'dashboard', label: 'لوحة البيانات', icon: PieChart },
  { id: 'operations', label: 'العمليات المالية', icon: Receipt },
  { id: 'accounts', label: 'خزائن وحسابات', icon: Wallet },
  { id: 'donors', label: 'سجل المتبرعين', icon: Users },
  { id: 'sponsorships', label: 'نظام الكفالات', icon: UserCheck },
  { id: 'sacrifice', label: 'صكوك الأضاحي', icon: Gift },
  { id: 'ramadan', label: 'حملة رمضان', icon: ShoppingBag },
  { id: 'reports', label: 'التقارير الداخلية', icon: TrendingUp },
  { id: 'developer', label: 'قسم المبرمج', icon: Settings },
  { id: 'transparency', label: 'الشفافية (عام)', icon: Shield },
];

const FINANCIAL_CATEGORIES = {
  income: [
    'كفالة أيتام',
    'كفالة أسر',
    'صدقة جارية',
    'زكاة مال',
    'حالات مرضية',
    'عمليات جراحية',
    'تجهيز عرائس',
    'مشروع الخير',
    'عام'
  ],
  expense: [
    'مساعدات مالية',
    'علاج ودوية',
    'عمليات جراحية',
    'مواد غذائية',
    'رواتب وإدارة',
    'مصاريف صيانة',
    'إيجارات',
    'إعانات طارئة'
  ]
};

const PAYMENT_METHODS = [
  { id: 'cash', label: 'كاش / نقدي', icon: <Wallet className="w-4 h-4" /> },
  { id: 'vodafone_cash', label: 'فودافون كاش', icon: <Smartphone className="w-4 h-4" /> },
  { id: 'bank', label: 'تحويل بنكي', icon: <Landmark className="w-4 h-4" /> },
  { id: 'card', label: 'دفع بالبطاقة', icon: <CreditCard className="w-4 h-4" /> }
];

const OPERATION_STATUS = [
  { id: 'pending', label: 'قيد المراجعة', color: 'bg-amber-50 text-amber-600', icon: <Clock className="w-4 h-4" /> },
  { id: 'approved', label: 'تمت الموافقة', color: 'bg-blue-50 text-blue-600', icon: <CheckCircle className="w-4 h-4" /> },
  { id: 'executed', label: 'تم التنفيذ', color: 'bg-emerald-50 text-emerald-600', icon: <CheckCircle2 className="w-4 h-4" /> },
  { id: 'rejected', label: 'مرفوضة', color: 'bg-rose-50 text-rose-600', icon: <XCircle className="w-4 h-4" /> }
];

const TabButton = ({ active, onClick, icon: Icon, label }: any) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all whitespace-nowrap ${
      active 
        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' 
        : 'bg-white text-emerald-600 hover:bg-emerald-50 border border-emerald-100 uppercase tracking-tighter'
    }`}
  >
    <Icon className="w-5 h-5" />
    <span>{label}</span>
  </button>
);

export default function AccountsScreen() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'donors' | 'sponsorships' | 'operations' | 'accounts' | 'reports' | 'transparency' | 'developer' | 'sacrifice' | 'ramadan'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showDeveloperLogin, setShowDeveloperLogin] = useState(false);
  const [devPassword, setDevPassword] = useState('');

  // Data States
  const [donors, setDonors] = useState<Donor[]>([]);
  const [sponsorshipDonors, setSponsorshipDonors] = useState<SponsorshipDonor[]>([]);
  const [sponsorshipPayments, setSponsorshipPayments] = useState<PaymentRecord[]>([]);
  const [operations, setOperations] = useState<FinancialOperation[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transfers, setTransfers] = useState<AccountTransfer[]>([]);
  const [monthlyGoals, setMonthlyGoals] = useState<MonthlyGoal[]>([]);
  const [systemUsers, setSystemUsers] = useState<AppUser[]>([]);
  const [sacrificeCoupons, setSacrificeCoupons] = useState<SacrificeCoupon[]>([]);
  const [ramadanDonations, setRamadanDonations] = useState<RamadanDonation[]>([]);

  // Sponsorship View Controls
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Form Controls
  const [showOpForm, setShowOpForm] = useState(false);
  const [opFormType, setOpFormType] = useState<'income' | 'expense' | undefined>();
  const [opFormAccount, setOpFormAccount] = useState<string | undefined>();
  const [editingOp, setEditingOp] = useState<FinancialOperation | null>(null);
  const [printingOp, setPrintingOp] = useState<FinancialOperation | null>(null);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });

  useEffect(() => {
    // Listen to Donors
    const unsubDonors = onSnapshot(query(collection(db, 'donors'), orderBy('createdAt', 'desc')), (s) => 
      setDonors(s.docs.map(doc => ({ id: doc.id, ...doc.data() } as Donor)))
    );

    // Listen to Sponsorship Donors
    const unsubSponsDonors = onSnapshot(query(collection(db, 'sponsorship_donors'), orderBy('createdAt', 'desc')), (s) => 
      setSponsorshipDonors(s.docs.map(doc => ({ id: doc.id, ...doc.data() } as SponsorshipDonor)))
    );

    // Listen to Financial Accounts
    const unsubAccounts = onSnapshot(collection(db, 'financial_accounts'), (s) => {
      setAccounts(s.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialAccount)));
    });

    // Listen to Financial Operations
    const unsubOps = onSnapshot(query(collection(db, 'financial_operations'), orderBy('date', 'desc'), limit(200)), (s) => {
      setOperations(s.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialOperation)));
    });

    // Listen to Transfers
    const unsubTransfers = onSnapshot(query(collection(db, 'account_transfers'), orderBy('createdAt', 'desc'), limit(50)), (s) => {
      setTransfers(s.docs.map(doc => ({ id: doc.id, ...doc.data() } as AccountTransfer)));
    });

    // Listen to Monthly Goals
    const unsubGoals = onSnapshot(collection(db, 'monthly_goals'), (s) => {
      setMonthlyGoals(s.docs.map(doc => ({ id: doc.id, ...doc.data() } as MonthlyGoal)));
    });

    // Listen to System Users
    const unsubUsers = onSnapshot(collection(db, 'app_users'), (s) => {
      setSystemUsers(s.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser)));
    });

    // Listen to Sacrifice Coupons
    const unsubSacrifice = onSnapshot(query(collection(db, 'sacrifice_coupons'), orderBy('createdAt', 'desc')), (s) => {
      setSacrificeCoupons(s.docs.map(doc => ({ id: doc.id, ...doc.data() } as SacrificeCoupon)));
    });

    // Listen to Ramadan Campaign
    const unsubRamadan = onSnapshot(query(collection(db, 'ramadan_campaign'), orderBy('createdAt', 'desc')), (s) => {
      setRamadanDonations(s.docs.map(doc => ({ id: doc.id, ...doc.data() } as RamadanDonation)));
    });

    return () => {
      unsubDonors();
      unsubSponsDonors();
      unsubAccounts();
      unsubOps();
      unsubTransfers();
      unsubGoals();
      unsubUsers();
      unsubSacrifice();
      unsubRamadan();
    };
  }, []);

  const handleLogin = (username, password) => {
    const user = systemUsers.find(u => u.username === username && u.password === password);
    if (user) {
      if (!user.active) {
        setLoginError('هذا الحساب معطل حالياً');
        return;
      }
      setCurrentUser(user);
      setLoginError('');
      sessionStorage.setItem('app_user', JSON.stringify(user));
    } else {
      setLoginError('خطأ في اسم المستخدم أو كلمة المرور');
    }
  };

  // Improved Developer & User Session Auth
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user?.email === '11gawish2004@gmail.com') {
        const dev: AppUser = {
          id: user.uid,
          name: 'المبرمج الرئيسي',
          username: 'admin_dev',
          role: 'developer',
          active: true,
          permissions: ALL_TABS.map(t => t.id)
        };
        setCurrentUser(dev);
        sessionStorage.setItem('app_user', JSON.stringify(dev));
      } else {
        const saved = sessionStorage.getItem('app_user');
        if (saved) {
          try {
            const savedUser = JSON.parse(saved);
            const verified = systemUsers.find(u => u.id === savedUser.id && u.active);
            if (verified) setCurrentUser(verified);
            else if (savedUser.role === 'developer') setCurrentUser(savedUser); // fallback for dev
            else sessionStorage.removeItem('app_user');
          } catch (e) {
            sessionStorage.removeItem('app_user');
          }
        }
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, [systemUsers]);

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('app_user');
  };

  useEffect(() => {
    // Listen to payments for selected month/year
    const qPayments = query(
      collection(db, 'sponsorship_payments'),
      where('month', '==', selectedMonth),
      where('year', '==', selectedYear)
    );
    return onSnapshot(qPayments, (s) => 
      setSponsorshipPayments(s.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentRecord)))
    );
  }, [selectedMonth, selectedYear]);

  // --- Handlers ---

  const toggleSponsorshipPayment = async (donor: SponsorshipDonor) => {
    const payment = sponsorshipPayments.find(p => p.donorId === donor.id);
    try {
      if (payment) {
        await updateDoc(doc(db, 'sponsorship_payments', payment.id), {
          isCollected: !payment.isCollected,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'sponsorship_payments'), {
          donorId: donor.id,
          month: selectedMonth,
          year: selectedYear,
          isCollected: true,
          amount: donor.amount,
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Computed Stats ---

  const totalIncome = operations.filter(o => o.type === 'income' && o.status === 'executed').reduce((s, o) => s + o.amount, 0);
  const totalExpense = operations.filter(o => o.type === 'expense' && o.status === 'executed').reduce((s, o) => s + o.amount, 0);
  const netBalance = totalIncome - totalExpense;

  const currentGoal = monthlyGoals.find(g => g.month === (new Date().getMonth() + 1) && g.year === new Date().getFullYear());
  const monthIncome = operations.filter(o => {
    if (o.type !== 'income' || o.status !== 'executed') return false;
    const d = new Date(o.date);
    return d.getMonth() + 1 === (new Date().getMonth() + 1) && d.getFullYear() === new Date().getFullYear();
  }).reduce((s, o) => s + o.amount, 0);

  const [importing, setImporting] = useState(false);
  const [importData, setImportData] = useState<{ headers: string[], rows: any[] } | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const DONOR_MAPPING_FIELDS = [
    { id: 'name', label: 'اسم المتبرع' },
    { id: 'phone', label: 'رقم الهاتف' },
    { id: 'donationType', label: 'نوع التبرع' },
    { id: 'totalDonations', label: 'المبلغ' },
    { id: 'lastDonationDate', label: 'تاريخ التبرع' }
  ];

  const getPreviewValue = (excelHeader: string) => {
    if (!importData || !excelHeader) return '';
    return String(importData.rows[0]?.[excelHeader] || '');
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        if (data.length > 0) {
          const headers = Object.keys(data[0] as any);
          setImportData({ headers, rows: data });
          
          const initialMap: Record<string, string> = {};
          DONOR_MAPPING_FIELDS.forEach(field => {
            const match = headers.find(h => 
              h.includes(field.label) || 
              (field.id === 'name' && (h.includes('الاسم') || h.toLowerCase().includes('name'))) ||
              (field.id === 'phone' && (h.includes('هاتف') || h.includes('phone'))) ||
              (field.id === 'totalDonations' && (h.includes('مبلغ') || h.includes('قيمة') || h.toLowerCase().includes('amount')))
            );
            if (match) initialMap[field.id] = match;
          });
          setFieldMapping(initialMap);
        }
      } catch (error) {
        alert('خطأ في قراءة ملف الإكسل');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const processMappingImport = async () => {
    if (!importData) return;
    setImporting(true);
    try {
      let count = 0;
      const getVal = (row: any, fieldId: string) => fieldMapping[fieldId] ? String(row[fieldMapping[fieldId]] || '') : '';
      
      const batchSize = 50;
      for (let i = 0; i < importData.rows.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = importData.rows.slice(i, i + batchSize);
        
        chunk.forEach(row => {
          const name = getVal(row, 'name').trim();
          if (name) {
            const docRef = doc(collection(db, 'donors'));
            batch.set(docRef, {
              name,
              phone: getVal(row, 'phone'),
              donationTypes: getVal(row, 'donationType') ? [getVal(row, 'donationType')] : ['عام'],
              totalDonations: Number(getVal(row, 'totalDonations')) || 0,
              lastDonationDate: getVal(row, 'lastDonationDate') || new Date().toISOString().split('T')[0],
              collectionStatus: 'collected',
              status: 'active',
              campaigns: ['استيراد يدوي'],
              createdAt: serverTimestamp()
            });
            count++;
          }
        });
        await batch.commit();
      }
      
      alert(`تم استيراد ${count} متبرع بنجاح`);
      setImportData(null);
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء الاستيراد');
    } finally {
      setImporting(false);
    }
  };

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

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'warning'
  });

  const renderDashboard = () => {
    const monthlyData = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      const income = operations.filter(o => {
        const od = new Date(o.date);
        return o.type === 'income' && o.status === 'executed' && od.getMonth() + 1 === month && od.getFullYear() === year;
      }).reduce((s, o) => s + o.amount, 0);
      const expense = operations.filter(o => {
        const od = new Date(o.date);
        return o.type === 'expense' && o.status === 'executed' && od.getMonth() + 1 === month && od.getFullYear() === year;
      }).reduce((s, o) => s + o.amount, 0);
      return { name: `${months_ar[month - 1]}`, income, expense };
    });

    const categoryDataMap: Record<string, number> = {};
    operations.filter(o => o.type === 'income' && o.status === 'executed').forEach(o => {
      categoryDataMap[o.category] = (categoryDataMap[o.category] || 0) + o.amount;
    });
    const categoryData = Object.entries(categoryDataMap).map(([name, value]) => ({ name, value }));

    const sourceDataMap: Record<string, number> = {};
    operations.filter(o => o.type === 'income' && o.status === 'executed' && o.donorInfo?.source).forEach(o => {
      const s = o.donorInfo?.source || 'أخرى';
      sourceDataMap[s] = (sourceDataMap[s] || 0) + o.amount;
    });
    const sourceData = Object.entries(sourceDataMap).map(([name, value]) => ({ name, value }));

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="إجمالي التبرعات" value={totalIncome} color="emerald" icon={<ArrowUpCircle />} />
          <StatCard title="إجمالي المصروفات" value={totalExpense} color="rose" icon={<ArrowDownCircle />} />
          <StatCard title="صافي الرصيد" value={netBalance} color="blue" icon={<Wallet />} />
          <StatCard title="مستهدف الشهر" value={monthIncome} total={currentGoal?.targetAmount || 10000} color="amber" icon={<TrendingUp />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-[2.5rem] border border-emerald-100 shadow-sm">
            <h3 className="text-xl font-black text-emerald-900 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              تحليل الدخل والمصروفات (آخر 6 أشهر)
            </h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }} />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontFamily: 'Tajawal' }}
                    labelStyle={{ fontWeight: 900, color: '#064e3b' }}
                  />
                  <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                  <Area type="monotone" dataKey="income" name="إيرادات" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                  <Area type="monotone" dataKey="expense" name="مصروفات" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorExpense)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] border border-emerald-100 shadow-sm">
             <h3 className="text-xl font-black text-emerald-900 mb-6 flex items-center gap-2">
               <PieChart className="w-5 h-5" />
               توزيع التبرعات حسب المصدر
             </h3>
             <div className="h-80 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <RePieChart>
                    <Pie
                      data={sourceData.length > 0 ? sourceData : [{ name: 'لا توجد بيانات', value: 1 }]}
                      cx="50%" cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {sourceData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip cursor={{ fill: 'transparent' }} />
                    <Legend iconType="circle" />
                 </RePieChart>
               </ResponsiveContainer>
             </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm">
          <h3 className="text-xl font-black text-emerald-900 mb-6 flex items-center gap-2">
            <Users className="w-5 h-5" />
            أعلى الحالات دعماً
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             {operations.filter(o => o.type === 'income' && o.status === 'executed' && o.subCategory)
              .reduce((acc, curr) => {
                const existing = acc.find(a => a.name === curr.subCategory);
                if (existing) existing.value += curr.amount;
                else acc.push({ name: curr.subCategory!, value: curr.amount });
                return acc;
              }, [] as { name: string, value: number }[])
              .sort((a, b) => b.value - a.value)
              .slice(0, 3)
              .map((item, i) => (
                <div key={i} className="bg-stone-50 p-6 rounded-3xl border border-stone-100 flex flex-col items-center">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-black mb-3">
                    {i + 1}
                  </div>
                  <p className="font-black text-emerald-900 mb-1">{item.name}</p>
                  <p className="text-2xl font-black text-emerald-600 tabular-nums">{item.value.toLocaleString()} <span className="text-xs">ج.م</span></p>
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  };

  if (loading && !donors.length && !operations.length) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const allowedTabs = ALL_TABS.filter(tab => {
    if (tab.id === 'developer') return currentUser?.role === 'developer';
    if (!currentUser) return true;
    return currentUser.role === 'developer' || currentUser.role === 'admin' || currentUser.permissions?.includes(tab.id);
  });

  const isDeveloper = currentUser?.role === 'developer';

  if (!authReady) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center">
        <Clock className="w-10 h-10 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!currentUser && auth.currentUser?.email !== '11gawish2004@gmail.com') {
    return (
      <div className="min-h-screen bg-emerald-950 flex items-center justify-center p-4 font-sans" dir="rtl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-10 rounded-[3rem] w-full max-w-md shadow-2xl"
        >
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
              <Shield className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-black text-emerald-900 mb-2">تسجيل الدخول</h1>
            <p className="text-stone-500 font-bold">نظام الإدارة المالية</p>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            handleLogin(loginForm.username, loginForm.password);
          }} className="space-y-6">
            <InputField 
              label="اسم المستخدم" 
              icon={<UserCheck />} 
              value={loginForm.username} 
              onChange={(v: string) => setLoginForm({...loginForm, username: v})} 
            />
            <InputField 
              label="كلمة المرور" 
              icon={<Lock />} 
              type="password"
              value={loginForm.password} 
              onChange={(v: string) => setLoginForm({...loginForm, password: v})} 
            />
            
            {loginError && (
              <p className="text-rose-500 text-sm font-bold text-center bg-rose-50 p-3 rounded-xl">
                {loginError}
              </p>
            )}

            <button className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl text-xl shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all">
              دخول للنظام
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 p-4 md:p-10 font-sans space-y-10 max-w-[1600px] mx-auto pb-32" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-emerald-900 mb-2">النظام المحاسبي والمالي</h1>
          <p className="text-emerald-700 font-bold flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            إدارة المتبرعين، الكفالات، وكافة الحركات المالية للجمعية
          </p>
        </div>
        <div className="flex items-center gap-4">
          {currentUser ? (
            <div className="bg-white px-6 py-3 rounded-[2rem] border border-emerald-100 flex items-center gap-4 shadow-sm">
               <div className="text-right">
                  <p className="text-xs font-black text-emerald-600 leading-none mb-1">{currentUser.name}</p>
                  <p className="text-[10px] font-bold text-stone-400 leading-none">
                     {currentUser.role === 'developer' ? 'المبرمج الرئيسي' : 
                      currentUser.role === 'admin' ? 'مسؤول النظام' : 
                      currentUser.role === 'manager' ? 'مدير' :
                      currentUser.role === 'accountant' ? 'محاسب' : 'مدخل بيانات'}
                  </p>
               </div>
               <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center font-black">
                  {currentUser.name.charAt(0)}
               </div>
               <button onClick={handleLogout} className="p-2 text-rose-300 hover:text-rose-500 transition-all" title="خروج"><XCircle className="w-5 h-5" /></button>
            </div>
          ) : (
            <button 
              onClick={() => setShowDeveloperLogin(true)}
              className="bg-white px-6 py-3 rounded-2xl border border-emerald-100 text-emerald-600 font-black text-xs flex items-center gap-2 hover:bg-emerald-50 transition-all shadow-sm"
            >
              <Shield className="w-4 h-4" /> دخول المبرمج
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 no-scrollbar">
        {allowedTabs.map(tab => (
          <TabButton 
            key={`tab-${tab.id}`}
            active={activeTab === tab.id} 
            label={tab.label} 
            icon={tab.icon} 
            onClick={() => {
              if (tab.id === 'developer' && !isDeveloper) {
                setShowDeveloperLogin(true);
              } else {
                setActiveTab(tab.id as any);
              }
            }} 
          />
        ))}
      </div>

      {/* Smart Mapping Modal for Donors */}
      <AnimatePresence>
        {importData && (
          <div className="fixed inset-0 bg-emerald-950/80 backdrop-blur-md z-[70] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-4xl w-full p-8 my-8 text-right"
            >
              <div className="flex items-center justify-between mb-8 border-b border-stone-100 pb-6 shrink-0">
                <div className="text-right">
                  <h2 className="text-3xl font-black text-emerald-950">استيراد المتبرعين من إكسل</h2>
                  <p className="text-stone-500 font-bold">اربط أعمدة ملف الإكسل بالخانات المطلوبة في الموقع</p>
                </div>
                <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
                  <Download className="w-8 h-8 text-emerald-600 rotate-180" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-10 overflow-y-auto max-h-[50vh] pr-4 -mr-4 custom-scrollbar">
                {DONOR_MAPPING_FIELDS.map(field => (
                  <div key={`field-${field.id}`} className="group">
                    <label className="text-sm font-black text-stone-700 block mb-2 pr-2">
                        {field.label}
                        {['name'].includes(field.id) && <span className="text-rose-500 mr-1">*</span>}
                    </label>
                    <div className="relative">
                        <select 
                          value={fieldMapping[field.id] || ''}
                          onChange={(e) => setFieldMapping({...fieldMapping, [field.id]: e.target.value})}
                          className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right appearance-none cursor-pointer pr-4 pl-10"
                        >
                          <option value="">-- اختر من الملف --</option>
                          {importData.headers.map(h => (
                              <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                            <Filter className="w-5 h-5 text-emerald-200" />
                        </div>
                    </div>
                    {fieldMapping[field.id] && (
                        <div className="mt-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 p-2 rounded-lg flex items-center justify-end gap-2 border border-emerald-100/50">
                            <span>{getPreviewValue(fieldMapping[field.id])}</span>
                            <span className="text-emerald-400">مثال من الملف:</span>
                        </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 mb-8 flex items-start gap-4">
                <div className="flex-grow">
                  <h4 className="font-black text-amber-900 text-lg mb-1">تنبيه الاستيراد</h4>
                  <p className="text-sm text-amber-800 font-bold">
                    سيتم استيراد <span className="text-xl font-black">{importData.rows.length}</span> متبرع إلى قائمة المتبرعين العامة.
                    تأكد من اختيار الاسم الصحيح لضمان عدم وجود أخطاء في البيانات.
                  </p>
                </div>
                <Users className="w-8 h-8 text-amber-600 shrink-0" />
              </div>

              <div className="flex flex-row-reverse gap-4 shrink-0">
                <button 
                  onClick={processMappingImport}
                  disabled={importing || !fieldMapping.name}
                  className="flex-grow bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-4 disabled:bg-stone-300 disabled:shadow-none"
                >
                  {importing ? <Clock className="w-7 h-7 animate-spin" /> : <FileCheck className="w-7 h-7" />}
                  {importing ? 'جاري الاستيراد الآن...' : 'بدء عملية الاستيراد'}
                </button>
                <button 
                  onClick={() => setImportData(null)}
                  className="px-12 bg-stone-100 text-stone-500 py-5 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'donors' && <DonorsTab donors={donors} onImportExcel={handleImportExcel} onDownloadPDF={handleDownloadPDF} />}
          {activeTab === 'sponsorships' && (
            <SponsorshipsTab 
              donors={sponsorshipDonors} 
              payments={sponsorshipPayments} 
              onToggle={toggleSponsorshipPayment}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              onMonthChange={setSelectedMonth}
              onYearChange={setSelectedYear}
              onDownloadPDF={handleDownloadPDF}
            />
          )}
          {activeTab === 'operations' && <OperationsTab operations={operations} accounts={accounts} onEdit={(o) => { setEditingOp(o); setShowOpForm(true); }} currentUser={currentUser} setPrintingOp={setPrintingOp} onDownloadPDF={handleDownloadPDF} />}
          {activeTab === 'sacrifice' && <SacrificeTab sacrificeCoupons={sacrificeCoupons} />}
          {activeTab === 'ramadan' && <RamadanTab ramadanDonations={ramadanDonations} />}
          {activeTab === 'accounts' && <AccountsTab 
            accounts={accounts} 
            transfers={transfers} 
            onShowTransfer={() => setShowTransferForm(true)} 
            onAddOp={(type, accountId) => {
              setOpFormType(type);
              setOpFormAccount(accountId);
              setShowOpForm(true);
            }}
            currentUser={currentUser} 
            onDownloadPDF={handleDownloadPDF}
          />}
          {activeTab === 'reports' && <ReportsTab operations={operations} donors={donors} accounts={accounts} onDownloadPDF={handleDownloadPDF} />}
          {activeTab === 'developer' && isDeveloper && <DeveloperTab users={systemUsers} setConfirmConfig={setConfirmConfig} />}
          {activeTab === 'transparency' && <TransparencyTab operations={operations} onDownloadPDF={handleDownloadPDF} />}
        </motion.div>
      </AnimatePresence>

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        variant={confirmConfig.variant}
      />

      <AnimatePresence>
        {showOpForm && (
          <OpFormModal 
            onClose={() => { 
              setShowOpForm(false); 
              setEditingOp(null); 
              setOpFormType(undefined);
              setOpFormAccount(undefined);
            }} 
            accounts={accounts} 
            editingOp={editingOp} 
            initialType={opFormType}
            initialAccountId={opFormAccount}
          />
        )}
        {showTransferForm && (
          <TransferFormModal 
            onClose={() => setShowTransferForm(false)} 
            accounts={accounts} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {printingOp && (
          <ReceiptModal 
            op={printingOp} 
            account={accounts.find(a => a.id === printingOp.accountId)!} 
            onClose={() => setPrintingOp(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Tab Content Components ---

function DonorsTab({ donors, onImportExcel, onDownloadPDF }: { donors: Donor[], onImportExcel: (e: any) => void, onDownloadPDF: (title: string, elementId: string) => void }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'collected' | 'pending' | 'not_collected'>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    donationTypes: [] as string[],
    campaigns: [] as string[],
    collectionStatus: 'pending' as any
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'donors'), {
        ...formData,
        totalDonations: 0,
        lastDonationDate: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp()
      });
      setShowAddForm(false);
      setFormData({
        name: '', phone: '', email: '', donationTypes: [], campaigns: [], collectionStatus: 'pending'
      });
    } catch (err) { console.error(err); }
  };

  const filtered = donors.filter(d => {
    const matchesSearch = d.name.toLowerCase().includes(search.toLowerCase()) || d.phone.includes(search);
    const matchesStatus = statusFilter === 'all' || d.collectionStatus === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    const dateA = a.createdAt?.toDate?.() || new Date(a.lastDonationDate || 0);
    const dateB = b.createdAt?.toDate?.() || new Date(b.lastDonationDate || 0);
    return sortOrder === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
  });

  const DONATION_TYPES = ['نقدية', 'ذبيحة', 'ملابس', 'أجهزة', 'أثاث', 'أخرى'];
  const CAMPAIGNS = ['كرتونة رمضان', 'لحوم الأضاحي', 'كسوة الشتاء', 'شنطة المدارس', 'تجهيز عرايس', 'أخرى'];

  return (
    <div className="bg-white rounded-[32px] border border-emerald-100 shadow-sm overflow-hidden text-right">
      <div className="p-6 border-b border-emerald-50 bg-emerald-50/10 flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center gap-4 flex-grow bg-white/50 p-2 rounded-2xl border border-emerald-50">
          <Search className="w-5 h-5 text-emerald-300" />
          <input 
            type="text" placeholder="بحث باسم المتبرع أو الهاتف..."
            className="bg-transparent border-none focus:ring-0 outline-none flex-grow font-bold text-emerald-950"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select 
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="bg-white border border-emerald-100 px-4 py-3 rounded-2xl font-bold text-emerald-950 outline-none shadow-sm"
        >
          <option value="all">كل الحالات</option>
          <option value="collected">تم التحصيل</option>
          <option value="pending">انتظار</option>
          <option value="not_collected">لم يتم</option>
        </select>
        <select 
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as any)}
          className="bg-white border border-emerald-100 px-4 py-3 rounded-2xl font-bold text-emerald-950 outline-none shadow-sm"
        >
          <option value="desc">الأحدث أولاً</option>
          <option value="asc">الأقدم أولاً</option>
        </select>
        <div className="flex gap-2">
          <button 
            onClick={() => onDownloadPDF('قائمة_المتبرعين', 'donors-table')}
            className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-100 transition-all border border-emerald-100"
          >
            <FileText className="w-5 h-5" />
            تحميل PDF
          </button>
          <button 
            onClick={() => setShowAddForm(true)}
            className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
          >
            <Plus className="w-5 h-5" />
            إضافة متبرع
          </button>
          <label className="bg-white text-emerald-600 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 cursor-pointer hover:bg-emerald-50 border border-emerald-100 transition-all">
            <Download className="w-5 h-5 rotate-180" />
            استيراد إكسل
            <input type="file" className="hidden" accept=".xlsx,.xls" onChange={onImportExcel} />
          </label>
        </div>
      </div>
      <div className="max-h-[600px] overflow-y-auto custom-scrollbar sticky-table-container">
        <table id="donors-table" className="w-full text-right bg-white">
          <thead>
            <tr className="bg-emerald-50/50">
              <th className="px-6 py-4 font-black">المتبرع</th>
              <th className="px-6 py-4 font-black">التواصل</th>
              <th className="px-6 py-4 font-black">إجمالي التبرعات</th>
              <th className="px-6 py-4 font-black">آخر تاريخ</th>
              <th className="px-6 py-4 font-black">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-50">
            {filtered.map(d => (
              <tr key={`donor-${d.id}`} className="hover:bg-emerald-50/20 transition-all transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-black">
                      {d.name.charAt(0)}
                    </div>
                    <span className="font-bold text-gray-900">{d.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-bold font-mono text-gray-600 tabular-nums">{d.phone}</span>
                    <span className="text-xs text-gray-400 font-medium">{d.email || 'لا يوجد بريد'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 font-black text-emerald-700 tabular-nums">{d.totalDonations.toLocaleString()} ج.م</td>
                <td className="px-6 py-4 font-bold text-gray-500 tabular-nums text-sm">{d.lastDonationDate}</td>
                <td className="px-6 py-4">
                   <div className={`px-3 py-1 rounded-full text-[10px] font-black w-fit ${
                    d.collectionStatus === 'collected' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                  }`}>
                    {d.collectionStatus === 'collected' ? 'تم التحصيل' : 'انتظار'}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setShowAddForm(false)} className="absolute inset-0 bg-emerald-950/20 backdrop-blur-sm" />
            <motion.div initial={{scale:0.9,opacity:0,y:20}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.9,opacity:0,y:20}} className="bg-white rounded-[32px] p-8 w-full max-w-2xl z-10 relative shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black text-emerald-900">إضافة متبرع جديد</h2>
                <button onClick={() => setShowAddForm(false)} className="p-2 bg-emerald-50 rounded-full"><X /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField label="الاسم بالكثير" value={formData.name} onChange={(v: string) => setFormData({...formData, name: v})} required />
                  <InputField label="رقم الهاتف" value={formData.phone} onChange={(v: string) => setFormData({...formData, phone: v})} required />
                </div>
                <InputField label="البريد الإلكتروني" value={formData.email} onChange={(v: string) => setFormData({...formData, email: v})} />
                
                <div className="space-y-2">
                  <label className="text-sm font-bold text-emerald-800 pr-2 block">نوع التبرع (يمكن اختيار أكثر من نوع)</label>
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex flex-wrap gap-3">
                    {DONATION_TYPES.map(type => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer group">
                        <input 
                          type="checkbox"
                          className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                          checked={formData.donationTypes.includes(type)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setFormData(prev => ({
                              ...prev,
                              donationTypes: checked 
                                ? [...prev.donationTypes, type]
                                : prev.donationTypes.filter(t => t !== type)
                            }));
                          }}
                        />
                        <span className="text-xs font-bold text-emerald-900">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-emerald-800 pr-2 block">الحملات المشارك بها</label>
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex flex-wrap gap-3">
                    {CAMPAIGNS.map(camp => (
                      <label key={camp} className="flex items-center gap-2 cursor-pointer group">
                        <input 
                          type="checkbox"
                          className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                          checked={formData.campaigns.includes(camp)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setFormData(prev => ({
                              ...prev,
                              campaigns: checked 
                                ? [...prev.campaigns, camp]
                                : prev.campaigns.filter(c => c !== camp)
                            }));
                          }}
                        />
                        <span className="text-xs font-bold text-emerald-900">{camp}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-emerald-800 pr-2">حالة التحصيل المتوقعة</label>
                  <select 
                    className="w-full bg-emerald-50 border-none p-4 rounded-2xl font-bold font-sans text-right outline-none ring-1 ring-emerald-100"
                    value={formData.collectionStatus}
                    onChange={(e) => setFormData({...formData, collectionStatus: e.target.value as any})}
                  >
                    <option value="pending">انتظار (قيد التواصل)</option>
                    <option value="collected">تم التحصيل بالفعل</option>
                    <option value="not_collected">لم يتم التحصيل</option>
                  </select>
                </div>

                <button className="w-full bg-emerald-600 text-white font-black py-5 rounded-[2rem] text-xl shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all">حفظ بيانات المتبرع</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SponsorshipsTab({ donors, payments, onToggle, selectedMonth, selectedYear, onMonthChange, onYearChange, onDownloadPDF }: any) {
  const [search, setSearch] = useState('');
  const months_ar = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  
  const filtered = donors.filter((d: any) => d.name.includes(search) || d.phone.includes(search)).map((d: any) => {
    const p = payments.find((pay: any) => pay.donorId === d.id);
    return { ...d, isCollected: p?.isCollected || false };
  });

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-[32px] border border-emerald-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex gap-2">
          <select 
            value={selectedMonth} onChange={(e) => onMonthChange(Number(e.target.value))}
            className="bg-emerald-50 border-none p-3 rounded-2xl font-bold text-emerald-900 outline-none"
          >
            {months_ar.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <input 
            type="number" value={selectedYear} onChange={(e) => onYearChange(Number(e.target.value))}
            className="w-24 bg-emerald-50 border-none p-3 rounded-2xl font-bold text-emerald-900 outline-none text-center tabular-nums"
          />
        </div>
        <div className="relative flex-grow max-w-md w-full">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-300 w-5 h-5" />
          <input 
            type="text" placeholder="بحث في الكفلاء..."
            className="w-full bg-emerald-50/50 border-none p-4 pr-12 rounded-2xl font-bold outline-none ring-1 ring-emerald-100"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button 
          onClick={() => onDownloadPDF('كشف_الكفالات', 'sponsorships-table')}
          className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-100 transition-all border border-emerald-100"
        >
          <FileText className="w-5 h-5" />
          تحميل PDF
        </button>
      </div>

      <div className="bg-white rounded-[32px] border border-emerald-100 shadow-sm overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
          <table id="sponsorships-table" className="w-full text-right border-collapse bg-white">
            <thead>
              <tr className="bg-emerald-50/50">
                <th className="px-6 py-4 font-black">الكفيل</th>
                <th className="px-6 py-4 font-black">المبلغ الشهري</th>
                <th className="px-6 py-4 font-black">التواصل</th>
                <th className="px-6 py-4 font-black text-center">حالة الدفع ({months_ar[selectedMonth-1]})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50">
              {filtered.map((d: any) => (
                <tr key={`spons-${d.id}`} className="hover:bg-emerald-50/20 transition-all">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-black">
                        {d.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-black text-gray-900">{d.name}</p>
                        <p className="text-[10px] text-gray-400 font-bold">{d.notes}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-black text-emerald-600 tabular-nums">
                    {d.amount.toLocaleString()} <span className="text-[10px]">ج.م</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <a href={`tel:${d.phone}`} className="flex items-center gap-2 text-sm font-bold font-mono text-gray-600">
                        <Phone className="w-4 h-4 text-emerald-400" />
                        {d.phone}
                      </a>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button 
                      onClick={() => onToggle(d)}
                      className={`px-6 py-3 rounded-2xl font-black text-sm transition-all flex items-center gap-2 mx-auto ${
                        d.isCollected ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {d.isCollected ? <FileCheck className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                      {d.isCollected ? 'تم الاستلام' : 'انتظار التحصيل'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OperationsTab({ operations, accounts, onEdit, currentUser, setPrintingOp, onDownloadPDF }: { operations: FinancialOperation[], accounts: FinancialAccount[], onEdit: (o: FinancialOperation) => void, currentUser: any, setPrintingOp: (o: FinancialOperation) => void, onDownloadPDF: (title: string, elementId: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const filteredOps = operations.filter(o => {
    const matchType = (filter === 'all' || o.type === filter);
    const matchSearch = (o.description.includes(search) || o.category.includes(search) || o.opNumber.includes(search) || o.donorInfo?.name?.includes(search));
    const matchDate = !dateFilter || o.date === dateFilter;
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchType && matchSearch && matchDate && matchStatus;
  });

  const exportToCSV = () => {
    const data = filteredOps.map((op, index) => ({
      'م': index + 1,
      'رقم العملية': op.opNumber,
      'التاريخ': op.date,
      'النوع': op.type === 'income' ? 'إيراد' : 'مصروف',
      'الفئة': op.category,
      'الوصف': op.description,
      'المبلغ': op.amount,
      'رقم السند': op.voucherNumber || '',
      'المعتمد': op.authorizedBy || '',
      'الحالة': OPERATION_STATUS.find(s => s.id === op.status)?.label
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Financial Operations");
    XLSX.writeFile(wb, `Financial_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const deleteOp = async (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذه العملية؟')) {
      await deleteDoc(doc(db, 'financial_operations', id));
    }
  };

  const updateStatus = async (op: FinancialOperation, newStatus: FinancialOperation['status']) => {
    const updateData: any = { status: newStatus };
    const userEmail = auth.currentUser?.email || 'System';
    
    if (!op.approval) op.approval = { requestedBy: userEmail };
    
    if (newStatus === 'approved') op.approval.approvedBy = userEmail;
    if (newStatus === 'executed') op.approval.executedBy = userEmail;
    op.approval.updatedAt = serverTimestamp();
    
    updateData.approval = op.approval;
    await updateDoc(doc(db, 'financial_operations', op.id), updateData);

    // If executed, update account balance
    if (newStatus === 'executed') {
      const account = accounts.find(a => a.id === op.accountId);
      if (account) {
        const adjustment = op.type === 'income' ? op.amount : -op.amount;
        await updateDoc(doc(db, 'financial_accounts', account.id), {
          balance: (account.balance || 0) + adjustment,
          lastUpdated: serverTimestamp()
        });
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="flex bg-white rounded-2xl p-1 border border-emerald-100 shadow-sm shrink-0">
             <button onClick={() => setFilter('all')} className={`px-5 py-2 rounded-xl font-black text-xs transition-all ${filter === 'all' ? 'bg-emerald-600 text-white' : 'text-emerald-900 hover:bg-emerald-50'}`}>الكل</button>
             <button onClick={() => setFilter('income')} className={`px-5 py-2 rounded-xl font-black text-xs transition-all ${filter === 'income' ? 'bg-emerald-600 text-white' : 'text-emerald-900 hover:bg-emerald-50'}`}>إيرادات</button>
             <button onClick={() => setFilter('expense')} className={`px-5 py-2 rounded-xl font-black text-xs transition-all ${filter === 'expense' ? 'bg-emerald-600 text-white' : 'text-emerald-900 hover:bg-emerald-50'}`}>مصروفات</button>
          </div>
          
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-2xl border border-emerald-100 shadow-sm shrink-0">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <input 
              type="date" 
              className="bg-transparent text-[10px] font-bold font-sans outline-none text-emerald-900"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            {dateFilter && <button onClick={() => setDateFilter('')} className="text-rose-400"><X className="w-3 h-3" /></button>}
          </div>

          <select 
            className="bg-white border border-emerald-100 px-3 py-2 rounded-2xl text-[10px] font-black text-emerald-900 outline-none shadow-sm shrink-0"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">كل الحالات</option>
            {OPERATION_STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>

          <button onClick={exportToCSV} className="bg-white border border-emerald-100 p-2 rounded-2xl text-emerald-600 hover:bg-emerald-50 shadow-sm transition-all flex items-center gap-2 font-black text-[10px]">
            <Download className="w-4 h-4" /> تصدير
          </button>
          <button 
            onClick={() => onDownloadPDF('العمليات_المالية', 'operations-table')}
            className="bg-emerald-50 text-emerald-600 p-2 rounded-2xl hover:bg-emerald-100 transition-all border border-emerald-100 shadow-sm flex items-center gap-2 font-black text-[10px]"
          >
            <FileText className="w-4 h-4" />
            PDF
          </button>
        </div>
        
        <div className="relative w-full lg:w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 w-4 h-4" />
          <input 
            type="text" placeholder="بحث بالاسم أو الوصف..." 
            className="w-full bg-white border border-emerald-100 p-3 pr-10 rounded-2xl font-bold font-sans text-right outline-none ring-offset-2 focus:ring-2 ring-emerald-500/20 text-xs"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>

      <div className="bg-white rounded-[2.5rem] border border-emerald-100 shadow-sm overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
          <table id="operations-table" className="w-full text-right border-collapse bg-white">
          <thead>
            <tr className="bg-emerald-50/50">
              <th className="px-6 py-5 font-black text-emerald-900 text-sm">م / إذن السند</th>
              <th className="px-6 py-5 font-black text-emerald-900 text-sm">البند / التفاصيل</th>
              <th className="px-6 py-5 font-black text-emerald-900 text-sm">المبلغ</th>
              <th className="px-6 py-5 font-black text-emerald-900 text-sm">البيان / المعتمد</th>
              <th className="px-6 py-5 font-black text-emerald-900 text-sm">الحالة</th>
              <th className="px-6 py-5 font-black text-emerald-900 text-sm text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-50/50">
            {filteredOps.map(op => {
              const account = accounts.find(a => a.id === op.accountId);
              const status = OPERATION_STATUS.find(s => s.id === op.status);
              return (
                <tr key={`op-${op.id}`} className="hover:bg-emerald-50/10 transition-all font-sans">
                  <td className="px-6 py-4">
                    <p className="font-black text-xs text-emerald-600 mb-1"># {op.voucherNumber || op.opNumber}</p>
                    <p className="font-bold text-gray-400 text-[10px] tabular-nums">{op.date}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-black text-emerald-900">{op.category}</p>
                    <p className="text-[10px] font-bold text-gray-400 max-w-[150px] truncate">{op.description}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className={`font-black text-lg tabular-nums ${op.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {op.type === 'income' ? '+' : '-'}{op.amount.toLocaleString()} 
                      <span className="text-[10px] mr-1">ج.م</span>
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                       <span className="text-xs font-black text-stone-600">{op.authorizedBy || 'غير محدد'}</span>
                       <div className="flex items-center gap-1 opacity-60">
                         <Wallet className="w-2.5 h-2.5" />
                         <span className="text-[10px] font-bold">{account?.name || 'حساب محذوف'}</span>
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl w-fit ${status?.color}`}>
                      <span className="scale-75">{status?.icon}</span>
                      <span className="text-[10px] font-black">{status?.label}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1">
                      {op.status === 'pending' && (
                        <button onClick={() => updateStatus(op, 'approved')} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="موافقة">
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      )}
                      {op.status === 'approved' && (
                         <button onClick={() => updateStatus(op, 'executed')} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all" title="تنفيذ">
                           <PlayCircle className="w-5 h-5" />
                         </button>
                      )}
                      <button onClick={() => onEdit(op)} className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition-all">
                        <Edit className="w-5 h-5" />
                      </button>
                      <button onClick={() => deleteOp(op.id)} className="p-2 text-rose-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button onClick={() => setPrintingOp(op)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all" title="طباعة إيصال">
                        <Printer className="w-5 h-5" />
                      </button>
                      {op.type === 'income' && op.donorInfo?.phone && (
                        <a 
                          href={`https://wa.me/${op.donorInfo?.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`شكراً لتبرعك لجمعيتنا بقيمة ${op.amount} ج.م في تاريخ ${op.date}. رقم العملية: ${op.opNumber}`)}`}
                          target="_blank" rel="noreferrer"
                          className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all"
                          title="إرسال إيصال واتساب"
                        >
                          <MessageSquare className="w-5 h-5" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
  );
}

function AccountsTab({ accounts, transfers, onShowTransfer, onAddOp, currentUser, onDownloadPDF }: { accounts: FinancialAccount[], transfers: AccountTransfer[], onShowTransfer: () => void, onAddOp: (type: 'income' | 'expense', accId: string) => void, currentUser: any, onDownloadPDF: (title: string, elementId: string) => void }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', type: 'cash', balance: 0 });
  const canModify = true; // Anyone with tab access can modify as per user request

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    await addDoc(collection(db, 'financial_accounts'), {
      ...formData,
      balance: Number(formData.balance),
      lastUpdated: serverTimestamp()
    });
    setShowAddForm(false);
    setFormData({ name: '', type: 'cash', balance: 0 });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
          <h2 className="text-xl font-black text-emerald-900 flex items-center gap-3">
             <Landmark className="w-7 h-7 p-1.5 bg-emerald-100 text-emerald-600 rounded-xl" />
             إدارة الخزائن والحسابات البنكية
          </h2>
          <div className="flex gap-3">
            <button onClick={() => setShowAddForm(true)} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg shadow-emerald-100">
              <PlusCircle className="w-4 h-4" /> إضافة حساب
            </button>
            <button onClick={onShowTransfer} className="bg-white border border-emerald-100 text-emerald-600 px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 hover:bg-emerald-50 shadow-sm shadow-emerald-50">
              <Repeat className="w-4 h-4" /> تحويل بين الحسابات
            </button>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-h-[500px] overflow-y-auto custom-scrollbar p-2">
        {accounts.map(acc => (
          <motion.div key={`acc-${acc.id}`} whileHover={{ y: -5 }} className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm relative overflow-hidden group">
             <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500" />
             <div className="flex justify-between items-start mb-6">
                <div>
                   <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">
                      {acc.type === 'cash' ? 'خزنة نقدية' : acc.type === 'vodafone_cash' ? 'فودافون كاش' : 'حساب بنكي'}
                   </p>
                   <h3 className="text-xl font-black text-emerald-900">{acc.name}</h3>
                </div>
                <div className="flex flex-col items-end gap-2">
                   <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-all">
                     {acc.type === 'cash' ? <Wallet /> : acc.type === 'vodafone_cash' ? <Smartphone /> : <Landmark />}
                   </div>
                   <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onAddOp('income', acc.id)} className="bg-emerald-600 text-white p-2 rounded-xl text-[10px] font-black flex items-center gap-1 shadow-lg hover:bg-emerald-700" title="إيداع">
                         <PlusCircle className="w-3 h-3" />
                      </button>
                      <button onClick={() => onAddOp('expense', acc.id)} className="bg-rose-500 text-white p-2 rounded-xl text-[10px] font-black flex items-center gap-1 shadow-lg hover:bg-rose-600" title="صرف">
                         <MinusCircle className="w-3 h-3" />
                      </button>
                   </div>
                </div>
             </div>
             <div className="space-y-4">
                <p className="text-4xl font-black text-emerald-600 tabular-nums">
                   {acc.balance.toLocaleString()} <span className="text-sm font-bold text-gray-400">ج.م</span>
                </p>
                <div className="pt-4 border-t border-emerald-50 flex justify-between items-center text-[10px] font-bold text-gray-400">
                   <span>آخر تحديث:</span>
                   <span>{acc.lastUpdated?.toDate().toLocaleDateString('ar-EG') || '-'}</span>
                </div>
             </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm">
        <h3 className="text-lg font-black text-emerald-900 mb-6 flex items-center gap-2">
          <History className="w-5 h-5" /> آخر سجل التحويلات
        </h3>
        <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar p-1">
          {transfers.map(tr => {
            const from = accounts.find(a => a.id === tr.fromAccountId);
            const to = accounts.find(a => a.id === tr.toAccountId);
            return (
                  <div key={`tr-${tr.id}`} className="flex items-center justify-between p-4 bg-emerald-50/30 rounded-2xl border border-emerald-50">
                <div className="flex items-center gap-6">
                  <div className="font-bold text-emerald-900 text-sm">{from?.name}</div>
                  <div className="flex items-center gap-2">
                    <div className="h-0.5 w-8 bg-emerald-200" />
                    <ArrowLeft className="w-4 h-4 text-emerald-400" />
                    <div className="h-0.5 w-8 bg-emerald-200" />
                  </div>
                  <div className="font-bold text-emerald-900 text-sm">{to?.name}</div>
                </div>
                <div className="text-right">
                  <p className="font-black text-emerald-600 tabular-nums">{tr.amount.toLocaleString()} ج.م</p>
                  <p className="text-[10px] font-bold text-gray-400">{tr.date}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setShowAddForm(false)} className="absolute inset-0 bg-emerald-950/20 backdrop-blur-sm" />
            <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}} className="bg-white rounded-[32px] p-10 w-full max-w-md z-10 shadow-2xl">
              <h2 className="text-2xl font-black text-emerald-900 mb-8">إضافة حساب مالي</h2>
              <form onSubmit={handleAddAccount} className="space-y-6">
                <InputField label="اسم الحساب" value={formData.name} onChange={(v) => setFormData({...formData, name: v})} />
                <div className="space-y-1">
                   <label className="text-sm font-bold text-emerald-800 pr-2">نوع الحساب</label>
                   <select className="w-full bg-emerald-50 p-4 rounded-2xl font-bold font-sans text-right outline-none ring-1 ring-emerald-100" value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value as any})}>
                      <option value="cash">خزنة نقدية</option>
                      <option value="vodafone_cash">فودافون كاش</option>
                      <option value="bank">حساب بنكي</option>
                   </select>
                </div>
                <InputField label="الرصيد الافتتاحي" type="number" value={formData.balance} onChange={(v) => setFormData({...formData, balance: v})} />
                <button className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-lg">حفظ الحساب</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
function OpFormModal({ onClose, accounts, editingOp, initialType, initialAccountId }: { 
  onClose: () => void, 
  accounts: FinancialAccount[], 
  editingOp: FinancialOperation | null,
  initialType?: 'income' | 'expense',
  initialAccountId?: string
}) {
  const [formData, setFormData] = useState({
    type: editingOp?.type || initialType || 'income',
    date: editingOp?.date || new Date().toISOString().split('T')[0],
    amount: editingOp?.amount?.toString() || '',
    accountId: editingOp?.accountId || initialAccountId || accounts[0]?.id || '',
    category: editingOp?.category || (editingOp?.type === 'expense' || initialType === 'expense' ? FINANCIAL_CATEGORIES.expense[0] : FINANCIAL_CATEGORIES.income[0]),
    subCategory: editingOp?.subCategory || '',
    description: editingOp?.description || '',
    donorInfo: {
      name: editingOp?.donorInfo?.name || '',
      phone: editingOp?.donorInfo?.phone || '',
      source: editingOp?.donorInfo?.source || 'واتساب'
    },
    beneficiary: editingOp?.beneficiary || '',
    voucherNumber: editingOp?.voucherNumber || '',
    receivedBy: editingOp?.receivedBy || '',
    authorizedBy: editingOp?.authorizedBy || '',
    paymentMethod: 'cash',
    notes: editingOp?.notes || ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const uniqueSerial = `TRX-${Date.now().toString().slice(-8)}`;
      const data = {
        ...formData,
        amount: Number(formData.amount),
        status: editingOp ? editingOp.status : 'pending',
        opNumber: editingOp ? editingOp.opNumber : uniqueSerial,
        voucherNumber: formData.voucherNumber || (editingOp ? editingOp.voucherNumber : uniqueSerial),
        createdAt: editingOp ? editingOp.createdAt : serverTimestamp(),
        approval: editingOp ? editingOp.approval : {
          requestedBy: auth.currentUser?.email || 'Unknown',
          updatedAt: serverTimestamp()
        }
      };

      if (editingOp) {
        await updateDoc(doc(db, 'financial_operations', editingOp.id), data);
      } else {
        await addDoc(collection(db, 'financial_operations'), data);
      }
      onClose();
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ العملية');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose} className="absolute inset-0 bg-emerald-950/20 backdrop-blur-sm" />
      <motion.div initial={{scale:0.9,opacity:0,y:20}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.9,opacity:0,y:20}} className="bg-white rounded-[40px] p-10 w-full max-w-2xl z-10 relative shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-black text-emerald-900">{editingOp ? 'تعديل عملية مالية' : 'إضافة عملية مالية جديدة'}</h2>
          <button onClick={onClose} className="p-2 bg-emerald-50 rounded-full hover:bg-emerald-100"><X /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 bg-emerald-50 p-2 rounded-2xl mb-6">
            <button 
              type="button" onClick={() => setFormData({...formData, type: 'income', category: FINANCIAL_CATEGORIES.income[0]})}
              className={`py-3 rounded-xl font-black transition-all ${formData.type === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-emerald-400'}`}
            >إيداع / إيراد</button>
            <button 
              type="button" onClick={() => setFormData({...formData, type: 'expense', category: FINANCIAL_CATEGORIES.expense[0]})}
              className={`py-3 rounded-xl font-black transition-all ${formData.type === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-emerald-400'}`}
            >صرف / مصروف</button>
          </div>

          <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex items-center gap-4 mb-4">
             <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl">
                <FileCheck className="w-6 h-6" />
             </div>
             <div>
                <p className="text-xs font-black text-amber-800 uppercase leading-none mb-1">بيانات التصريح / الإذن</p>
                <p className="text-[10px] font-bold text-amber-600">يرجى تحري الدقة في إدخال بيانات السند المالي</p>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <InputField label="رقم السند / الإذن" icon={<Hash className="w-4 h-4" />} value={formData.voucherNumber} onChange={(v: string) => setFormData({...formData, voucherNumber: v})} placeholder="رقم إذن الصرف أو الإيداع الورقي" />
             <InputField label="المبلغ" icon={<DollarSign />} type="number" value={formData.amount} onChange={(v) => setFormData({...formData, amount: v})} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <InputField label="التاريخ" icon={<Calendar />} type="date" value={formData.date} onChange={(v) => setFormData({...formData, date: v})} />
             <InputField label="اسم المعتمد / المندوب" icon={<CheckCircle2 className="w-4 h-4" />} value={formData.authorizedBy} onChange={(v: string) => setFormData({...formData, authorizedBy: v})} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-1">
                <label className="text-sm font-bold text-emerald-800 pr-2">الحساب / الخزنة</label>
                <select className="w-full bg-emerald-50 p-4 rounded-2xl font-black text-right outline-none ring-1 ring-emerald-100" value={formData.accountId} onChange={(e) => setFormData({...formData, accountId: e.target.value})}>
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.balance.toLocaleString()} ج.م)</option>)}
                </select>
             </div>
             <div className="space-y-1">
                <label className="text-sm font-bold text-emerald-800 pr-2">طريقة الدفع</label>
                <select className="w-full bg-emerald-50 p-4 rounded-2xl font-black text-right outline-none ring-1 ring-emerald-100" value={formData.paymentMethod} onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})}>
                  {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-1">
                <label className="text-sm font-bold text-emerald-800 pr-2">الفئة الرئيسية</label>
                <select className="w-full bg-emerald-50 p-4 rounded-2xl font-black text-right outline-none ring-1 ring-emerald-100" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})}>
                   {FINANCIAL_CATEGORIES[formData.type as 'income' | 'expense'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
             </div>
             <InputField label="مستلم المبلغ / البيان" icon={<UserCheck className="w-4 h-4" />} value={formData.receivedBy} onChange={(v: string) => setFormData({...formData, receivedBy: v})} />
          </div>

          <InputField label="رابط إثبات الدفع / صورة الإيصال" icon={<Eye />} value={formData.proofUrl || ''} onChange={(v: string) => setFormData({...formData, proofUrl: v})} />
          
          <div className="p-6 bg-emerald-50/50 rounded-3xl border border-emerald-50 space-y-4">
            <h4 className="font-black text-emerald-900 border-b border-emerald-100 pb-2 flex items-center gap-2">
              <History className="w-4 h-4" /> الملاحظات والبيان
            </h4>
            <div className="space-y-1">
               <label className="text-sm font-bold text-emerald-800 pr-2">التفاصيل والبيان بالكامل</label>
               <textarea 
                 className="w-full bg-white p-4 rounded-2xl font-bold min-h-[100px] outline-none ring-1 ring-emerald-100 text-right"
                 value={formData.description}
                 onChange={(e) => setFormData({...formData, description: e.target.value})}
                 placeholder="شرح كامل للعملية المالية والغرض منها..."
               />
            </div>

            <div className="space-y-1">
               <label className="text-sm font-bold text-emerald-800 pr-2">ملاحظات إضافية (القديمة)</label>
               <textarea 
                 className="w-full bg-white p-4 rounded-2xl font-bold outline-none ring-1 ring-emerald-100 text-right" 
                 rows={2} value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} 
               />
            </div>
          </div>

          <InputField label="الفئة الفرعية / رقم الحالة / المشروع" icon={<Activity />} value={formData.subCategory} onChange={(v: string) => setFormData({...formData, subCategory: v})} />

          {formData.type === 'income' ? (
            <div className="p-6 bg-emerald-50/50 rounded-3xl border border-emerald-50 space-y-4">
              <h4 className="font-black text-emerald-900 border-b border-emerald-100 pb-2 flex items-center gap-2">
                <Users className="w-4 h-4" /> بيانات المتبرع
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField label="الاسم" icon={<Users />} value={formData.donorInfo.name} onChange={(v) => setFormData({...formData, donorInfo: {...formData.donorInfo, name: v}})} />
                <InputField label="الهاتف" icon={<Phone />} value={formData.donorInfo.phone} onChange={(v) => setFormData({...formData, donorInfo: {...formData.donorInfo, phone: v}})} />
              </div>
              <div className="space-y-1">
                 <label className="text-sm font-bold text-emerald-800 pr-2">مصدر التبرع</label>
                 <select className="w-full bg-white p-4 rounded-2xl font-black text-right outline-none ring-1 ring-emerald-100" value={formData.donorInfo.source} onChange={(e) => setFormData({...formData, donorInfo: {...formData.donorInfo, source: e.target.value}})}>
                   <option>فيسبوك</option>
                   <option>واتساب</option>
                   <option>موقع إلكتروني</option>
                   <option>حملة محددة</option>
                   <option>مكتب الجمعية</option>
                 </select>
              </div>
            </div>
          ) : (
            <InputField label="المستفيد / الجهة" icon={<Users />} value={formData.beneficiary} onChange={(v) => setFormData({...formData, beneficiary: v})} />
          )}

          <div className="space-y-1">
             <label className="text-sm font-bold text-emerald-800 pr-2">وصف العملية / ملاحظات</label>
             <textarea className="w-full bg-emerald-50 p-4 rounded-2xl font-bold text-right outline-none ring-1 ring-emerald-100" rows={3} value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />
          </div>

          <button className="w-full bg-emerald-600 text-white font-black py-5 rounded-3xl text-xl shadow-xl shadow-emerald-100 hover:bg-emerald-700 active:scale-95 transition-all">حفظ العملية المالية</button>
        </form>
      </motion.div>
    </div>
  );
}

function TransferFormModal({ onClose, accounts }: { onClose: () => void, accounts: FinancialAccount[] }) {
  const [formData, setFormData] = useState({
    from: accounts[0]?.id || '',
    to: accounts[1]?.id || '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.from === formData.to) return alert('لا يمكن التحويل لنفس الحساب');
    const amount = Number(formData.amount);
    const fromAcc = accounts.find(a => a.id === formData.from);
    if (!fromAcc || fromAcc.balance < amount) return alert('الرصيد غير كافٍ في حساب المصدر');

    try {
      await addDoc(collection(db, 'account_transfers'), {
        fromAccountId: formData.from,
        toAccountId: formData.to,
        amount,
        date: formData.date,
        notes: formData.notes,
        createdAt: serverTimestamp()
      });

      // Update balances
      await updateDoc(doc(db, 'financial_accounts', formData.from), {
        balance: fromAcc.balance - amount,
        lastUpdated: serverTimestamp()
      });
      const toAcc = accounts.find(a => a.id === formData.to);
      if (toAcc) {
        await updateDoc(doc(db, 'financial_accounts', formData.to), {
          balance: toAcc.balance + amount,
          lastUpdated: serverTimestamp()
        });
      }

      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose} className="absolute inset-0 bg-emerald-950/20 backdrop-blur-sm" />
      <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}} className="bg-white rounded-[40px] p-10 w-full max-w-md z-10 shadow-2xl">
        <h2 className="text-2xl font-black text-emerald-900 mb-8">تحويل نقدي بين الحسابات</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
           <div className="space-y-1">
              <label className="text-sm font-bold text-emerald-800 pr-2">من حساب</label>
              <select className="w-full bg-emerald-50 p-4 rounded-2xl font-black text-right outline-none ring-1 ring-emerald-100" value={formData.from} onChange={(e) => setFormData({...formData, from: e.target.value})}>
                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.balance.toLocaleString()} ج.م)</option>)}
              </select>
           </div>
           <div className="flex justify-center -my-3 relative z-10">
              <div className="bg-white p-2 rounded-full border border-emerald-100 shadow-sm text-emerald-600">
                <ArrowDownCircle className="w-6 h-6" />
              </div>
           </div>
           <div className="space-y-1">
              <label className="text-sm font-bold text-emerald-800 pr-2">إلى حساب</label>
              <select className="w-full bg-emerald-50 p-4 rounded-2xl font-black text-right outline-none ring-1 ring-emerald-100" value={formData.to} onChange={(e) => setFormData({...formData, to: e.target.value})}>
                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
              </select>
           </div>
           <InputField label="المبلغ المحول" icon={<DollarSign />} type="number" value={formData.amount} onChange={(v) => setFormData({...formData, amount: v})} />
           <InputField label="تاريخ التحويل" icon={<Calendar />} type="date" value={formData.date} onChange={(v) => setFormData({...formData, date: v})} />
           <button className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-lg mt-4">تنفيذ التحويل</button>
        </form>
      </motion.div>
    </div>
  );
}

function ReportsTab({ operations, donors, accounts, onDownloadPDF }: any) {
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [selectedCase, setSelectedCase] = useState('all');

  const filtered = operations.filter((o: any) => {
    if (o.status !== 'executed') return false;
    if (selectedCase !== 'all' && o.category !== selectedCase) return false;
    if (dateFilter.start && o.date < dateFilter.start) return false;
    if (dateFilter.end && o.date > dateFilter.end) return false;
    return true;
  });

  const totalDonations = filtered.filter((o: any) => o.type === 'income').reduce((s: number, o: any) => s + o.amount, 0);
  const totalExpenses = filtered.filter((o: any) => o.type === 'expense').reduce((s: number, o: any) => s + o.amount, 0);

  const printReport = async () => {
    const reportElement = document.getElementById('internal-report-content');
    if (!reportElement) return;
    
    const canvas = await html2canvas(reportElement);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`financial-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-8">
       <div className="bg-white p-10 rounded-[3rem] border border-emerald-100">
         <h3 className="text-xl font-black text-emerald-900 mb-8 flex items-center gap-3">
           <Filter className="w-6 h-6 text-emerald-600" /> فلترة التقارير الداخلية
         </h3>
         <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
            <div className="space-y-2">
               <label className="text-sm font-black text-emerald-800 pr-2">من تاريخ</label>
               <input 
                type="date" className="w-full bg-emerald-50 p-4 rounded-2xl outline-none ring-1 ring-emerald-100 font-sans"
                value={dateFilter.start} onChange={(e) => setDateFilter({...dateFilter, start: e.target.value})}
               />
            </div>
            <div className="space-y-2">
               <label className="text-sm font-black text-emerald-800 pr-2">إلى تاريخ</label>
               <input 
                type="date" className="w-full bg-emerald-50 p-4 rounded-2xl outline-none ring-1 ring-emerald-100 font-sans"
                value={dateFilter.end} onChange={(e) => setDateFilter({...dateFilter, end: e.target.value})}
               />
            </div>
            <div className="space-y-2">
               <label className="text-sm font-black text-emerald-800 pr-2">نوع الحالة / الفئة</label>
               <select 
                className="w-full bg-emerald-50 p-4 rounded-2xl outline-none ring-1 ring-emerald-100 font-sans font-bold"
                value={selectedCase} onChange={(e) => setSelectedCase(e.target.value)}
               >
                 <option value="all">كل الفئات</option>
                 {Array.from(new Set([...FINANCIAL_CATEGORIES.income, ...FINANCIAL_CATEGORIES.expense])).map(c => <option key={c} value={c}>{c}</option>)}
               </select>
            </div>
            <div className="flex items-end">
               <button 
                onClick={printReport}
                className="w-full h-14 bg-emerald-600 text-white font-black rounded-2xl shadow-lg flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all"
               >
                 <Printer className="w-5 h-5" /> طباعة تقرير PDF
               </button>
            </div>
         </div>
       </div>

       <div id="internal-report-content" className="space-y-8 p-4">
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-emerald-600 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
               <div className="relative z-10">
                  <p className="text-sm font-bold opacity-80 mb-2">إجمالي التبرعات (وارد)</p>
                  <h3 className="text-4xl font-black tabular-nums">{totalDonations.toLocaleString()} <span className="text-sm">ج.م</span></h3>
               </div>
               <ArrowUpCircle className="absolute -right-4 -bottom-4 w-32 h-32 text-white/10" />
            </div>
            <div className="bg-rose-500 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
               <div className="relative z-10">
                  <p className="text-sm font-bold opacity-80 mb-2">إجمالي المصروفات (صادر)</p>
                  <h3 className="text-4xl font-black tabular-nums">{totalExpenses.toLocaleString()} <span className="text-sm">ج.م</span></h3>
               </div>
               <ArrowDownCircle className="absolute -right-4 -bottom-4 w-32 h-32 text-white/10" />
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm relative overflow-hidden">
               <div className="relative z-10">
                  <p className="text-sm font-bold text-emerald-600 mb-2 text-right">صافي الرصيد</p>
                  <h3 className="text-4xl font-black text-emerald-900 tabular-nums text-right">{(totalDonations - totalExpenses).toLocaleString()} <span className="text-sm text-emerald-500">ج.م</span></h3>
               </div>
            </div>
         </div>

         <div className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm">
            <h3 className="text-xl font-black text-emerald-900 mb-6 text-right">تفاصيل العمليات المختارة</h3>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
               <table className="w-full text-right border-collapse">
                  <thead>
                     <tr className="bg-emerald-50/50">
                        <th className="px-4 py-3 font-black text-xs">التاريخ</th>
                        <th className="px-4 py-3 font-black text-xs">الفئة</th>
                        <th className="px-4 py-3 font-black text-xs">الوصف</th>
                        <th className="px-4 py-3 font-black text-xs">المبلغ</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-50">
                     {filtered.slice(0, 50).map((op: any) => (
                        <tr key={`report-op-${op.id}`}>
                           <td className="px-4 py-3 text-xs font-bold tabular-nums">{op.date}</td>
                           <td className="px-4 py-3 text-xs font-bold">{op.category}</td>
                           <td className="px-4 py-3 text-xs text-gray-500">{op.description}</td>
                           <td className={`px-4 py-3 text-sm font-black tabular-nums ${op.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {op.type === 'income' ? '+' : '-'}{op.amount.toLocaleString()}
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
               {filtered.length > 50 && <p className="text-center p-4 text-xs font-bold text-gray-400">لعرض كافة العمليات يرجى مراجعة صفحة العمليات</p>}
            </div>
         </div>
       </div>
    </div>
  );
}

function DeveloperTab({ users, setConfirmConfig }: { users: AppUser[], setConfirmConfig: React.Dispatch<React.SetStateAction<any>> }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState<Partial<AppUser>>({
    name: '',
    username: '',
    password: '',
    role: 'clerk',
    active: true,
    permissions: []
  });

  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await updateDoc(doc(db, 'app_users', editingUser.id), {
          ...formData,
          permissions: formData.permissions || []
        });
        setEditingUser(null);
      } else {
        await addDoc(collection(db, 'app_users'), {
          ...formData,
          permissions: formData.permissions || [],
          createdAt: serverTimestamp()
        });
      }
      setShowAddModal(false);
      setFormData({ name: '', username: '', password: '', role: 'clerk', active: true, permissions: [] });
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ المستخدم');
    }
  };

  const startEditUser = (user: AppUser) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      username: user.username,
      password: user.password || '',
      role: user.role,
      active: user.active,
      permissions: user.permissions || []
    });
    setShowAddModal(true);
  };

  const togglePermission = (tabId: string) => {
    const current = formData.permissions || [];
    if (current.includes(tabId)) {
      setFormData({ ...formData, permissions: current.filter(id => id !== tabId) });
    } else {
      setFormData({ ...formData, permissions: [...current, tabId] });
    }
  };

  const deleteUser = async (user: AppUser) => {
    setConfirmConfig({
      isOpen: true,
      title: 'حذف مستخدم',
      message: `هل أنت متأكد من حذف المستخدم "${user.name}"؟ سيفقد كافة صلاحيات الدخول للنظام نهائياً.`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          await deleteDoc(doc(db, 'app_users', user.id));
        } catch (err) {
          console.error(err);
          alert('فشل في حذف المستخدم');
        }
      }
    });
  };

  const APP_MODULES = [
    { id: 'dashboard', label: 'لوحة التحكم' },
    { id: 'accounts', label: 'الحسابات البنكية' },
    { id: 'operations', label: 'إدارة العمليات (إذن صرف/إيداع)' },
    { id: 'donors', label: 'سجل المتبرعين' },
    { id: 'sponsorships', label: 'نظام الكفالات' },
    { id: 'reports', label: 'التقارير المالية' },
    { id: 'transparency', label: 'صفحة الشفافية' },
    { id: 'developer', label: 'إدارة المستخدمين' }
  ];

  const roles_ar: Record<string, string> = {
    developer: 'المبرمج (تحكم كامل)',
    admin: 'مسؤول النظام',
    manager: 'مدير',
    accountant: 'محاسب',
    clerk: 'مدخل بيانات'
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <div className="flex justify-between items-center bg-white p-6 rounded-[2.5rem] border border-emerald-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-emerald-950">إدارة المستخدمين والصلاحيات</h2>
          <p className="text-stone-500 font-bold">يمكنك إضافة أعضاء الفريق وتحديد صلاحياتهم في الموقع</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-emerald-100 flex items-center gap-3 hover:bg-emerald-700 transition-all"
        >
          <PlusCircle className="w-5 h-5" /> إضافة مستخدم جديد
        </button>
      </div>

      <div className="max-h-[600px] overflow-y-auto custom-scrollbar p-2">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {users.map(user => (
          <div key={`user-${user.id}`} className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm relative group overflow-hidden">
            <div className={`absolute top-0 left-0 w-16 h-16 ${user.active ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'} rounded-br-[2.5rem] flex items-center justify-center`}>
              <Shield className="w-6 h-6" />
            </div>
            
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-xl font-black">
                {user.name.charAt(0)}
              </div>
              <div>
                <h3 className="font-black text-emerald-950 text-lg">{user.name}</h3>
                <p className="text-xs font-bold text-gray-400">@{user.username}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                <p className="text-[10px] font-black text-stone-400 uppercase mb-1 text-right">الدور الوظيفي</p>
                <p className="font-black text-emerald-700 text-right">{roles_ar[user.role]}</p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-stone-50">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${user.active ? 'bg-emerald-500 animate-pulse' : 'bg-rose-300'}`} />
                  <span className="text-xs font-bold text-gray-500">{user.active ? 'نشط' : 'معطل'}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEditUser(user)} className="p-2 text-amber-500 hover:bg-amber-50 rounded-xl transition-all" title="تعديل">
                    <Edit className="w-5 h-5" />
                  </button>
                  <button onClick={() => deleteUser(user)} className="p-2 text-rose-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all active:scale-95 group/btn">
                    <Trash2 className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>

    <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setShowAddModal(false)} className="absolute inset-0 bg-emerald-950/20 backdrop-blur-sm" />
            <motion.div 
               initial={{scale:0.9,opacity:0,y:20}} 
               animate={{scale:1,opacity:1,y:0}} 
               exit={{scale:0.9,opacity:0,y:20}} 
               className="bg-white rounded-[40px] p-10 w-full max-w-md z-10 shadow-2xl relative"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black text-emerald-900 font-sans">{editingUser ? 'تعديل بيانات مستخدم' : 'مستخدم جديد'}</h2>
                <button onClick={() => { setShowAddModal(false); setEditingUser(null); }} className="p-2 bg-emerald-50 rounded-full hover:bg-emerald-100 text-emerald-600 transition-all">
                  <X />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="space-y-5">
                <InputField 
                  label="الاسم بالكامل" 
                  icon={<Users />} 
                  value={formData.name} 
                  onChange={(v: string) => setFormData({...formData, name: v})} 
                  required 
                />
                <InputField 
                  label="اسم المستخدم" 
                  icon={<UserCheck />} 
                  value={formData.username} 
                  onChange={(v: string) => setFormData({...formData, username: v})} 
                  required 
                />
                <InputField 
                  label="كلمة المرور" 
                  icon={<Shield />} 
                  type="password"
                  value={formData.password} 
                  onChange={(v: string) => setFormData({...formData, password: v})} 
                  required 
                />
                
                <div className="space-y-1">
                  <label className="text-sm font-black text-emerald-800 pr-2">الدور / الصلاحية</label>
                  <select 
                    className="w-full bg-emerald-50 p-4 rounded-2xl font-black text-right outline-none ring-1 ring-emerald-100 font-sans" 
                    value={formData.role} 
                    onChange={(e) => setFormData({...formData, role: e.target.value as any, permissions: e.target.value === 'admin' ? APP_MODULES.map(m => m.id) : formData.permissions})}
                  >
                    <option value="clerk">مدخل بيانات</option>
                    <option value="accountant">محاسب</option>
                    <option value="manager">مدير</option>
                    <option value="admin">مسؤول نظام (كل الصلاحيات)</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-black text-emerald-800 pr-2">الأقسام المسموح بدخولها</label>
                  <div className="grid grid-cols-2 gap-2">
                    {APP_MODULES.map(mod => (
                      <button
                        key={`mod-${mod.id}`}
                        type="button"
                        onClick={() => togglePermission(mod.id)}
                        className={`p-3 rounded-xl text-xs font-black text-right border transition-all ${
                          formData.permissions?.includes(mod.id) 
                            ? 'bg-emerald-100 border-emerald-200 text-emerald-700' 
                            : 'bg-white border-stone-100 text-stone-400'
                        }`}
                      >
                        {mod.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                  <p className="text-[10px] font-black text-amber-800 flex items-center gap-2">
                    <Shield className="w-3 h-3" /> ملاحظة أمنية
                  </p>
                  <p className="text-[10px] font-bold text-amber-700">تأكد من اختيار كلمة مرور قوية وتذكير المستخدم بتغييرها دورياً لضمان سلامة البيانات.</p>
                </div>

                <button className="w-full bg-emerald-600 text-white font-black py-5 rounded-[2rem] text-xl shadow-xl shadow-emerald-200 hover:bg-emerald-700 transition-all mt-4 text-center">
                  {editingUser ? 'حفظ التعديلات' : 'إنشاء حساب المستخدم'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TransparencyTab({ operations }: any) {
  const executed = operations.filter((o: any) => o.status === 'executed');
  const income = executed.filter((o: any) => o.type === 'income').reduce((s: number, o: any) => s + o.amount, 0);
  const expense = executed.filter((o: any) => o.type === 'expense').reduce((s: number, o: any) => s + o.amount, 0);
  
  const expenseRatio = ((expense / (income || 1)) * 100).toFixed(1);

  const downloadTransparencyReport = async () => {
    const element = document.getElementById('transparency-report');
    if (!element) return;
    const canvas = await html2canvas(element, { backgroundColor: '#064e3b' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`transparency-report-${new Date().getMonth() + 1}-${new Date().getFullYear()}.pdf`);
  };

  return (
    <div id="transparency-report" className="p-10 bg-emerald-900 rounded-[3rem] text-white space-y-12 shadow-2xl relative overflow-hidden">
       <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-800 rounded-full blur-3xl opacity-50 -mr-32 -mt-32" />
       
       <div className="relative z-10 text-center max-w-2xl mx-auto space-y-4">
          <Shield className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-4xl font-black tracking-tight">صفحة الشفافية المالية</h2>
          <p className="text-emerald-200 font-bold leading-relaxed">
             نؤمن بأن الثقة هي أساس العمل الخيري. هنا نعرض لك كيف تُدار أموال تبرعاتك بكل أمانة ووضوح.
          </p>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10 text-right">
          <div className="text-center space-y-2">
             <p className="text-5xl font-black tabular-nums">{income.toLocaleString()}</p>
             <p className="text-sm font-bold text-emerald-400">إجمالي التبرعات المحصلة</p>
          </div>
          <div className="text-center space-y-2">
             <p className="text-5xl font-black tabular-nums">{expense.toLocaleString()}</p>
             <p className="text-sm font-bold text-emerald-400">إجمالي ما تم إنفاقه</p>
          </div>
          <div className="text-center space-y-2">
             <p className="text-5xl font-black tabular-nums">{expenseRatio}%</p>
             <p className="text-sm font-bold text-emerald-400">نسبة الإنفاق على الحالات</p>
          </div>
       </div>

       <div className="bg-white/10 backdrop-blur-xl rounded-[2.5rem] p-10 border border-white/10">
          <h3 className="text-2xl font-black mb-8 text-emerald-300">أين تذهب أموالك؟</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
             <div className="space-y-6">
                {FINANCIAL_CATEGORIES.expense.map((cat, i) => {
                  const val = executed.filter((o: any) => o.category === cat).reduce((s: number, o: any) => s + o.amount, 0);
                  const perc = (val / (expense || 1)) * 100;
                  if (val === 0) return null;
                  return (
                    <div key={cat} className="space-y-2">
                       <div className="flex justify-between text-sm font-bold">
                          <span>{cat}</span>
                          <span className="tabular-nums">{val.toLocaleString()} ج.م ({perc.toFixed(1)}%)</span>
                       </div>
                       <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                          <motion.div initial={{width: 0}} animate={{width: `${perc}%`}} transition={{duration: 1, delay: i * 0.1}} className="h-full bg-emerald-400" />
                       </div>
                    </div>
                  );
                })}
             </div>
             <div className="h-64 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-emerald-700/50 rounded-[2rem]">
                <Download className="w-10 h-10 text-emerald-400 mb-4" />
                <p className="font-black mb-2">تنزيل التقرير المالي الشهري</p>
                <p className="text-xs font-bold text-emerald-300 mb-4 opacity-60">ملف PDF يحتوي على كافة التفاصيل البنكية والورقية</p>
                <button 
                  onClick={downloadTransparencyReport}
                  className="bg-emerald-400 text-emerald-950 px-8 py-3 rounded-2xl font-black shadow-lg shadow-emerald-400/20 active:scale-95 transition-all"
                >
                  تحميل التقرير
                </button>
             </div>
          </div>
       </div>
    </div>
  );
}

// --- Receipt Component ---
function ReceiptModal({ op, account, onClose }: { op: FinancialOperation, account: FinancialAccount, onClose: () => void }) {
  const printRef = React.useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const status = OPERATION_STATUS.find(s => s.id === op.status);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm print:p-0 print:bg-white">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl print:shadow-none print:max-w-full"
      >
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 print:hidden">
          <div className="flex gap-2">
            <button onClick={handlePrint} className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg">
              <Printer className="w-4 h-4" /> طباعة
            </button>
            <button onClick={onClose} className="bg-gray-200 text-gray-700 px-6 py-2 rounded-xl font-bold">إغلاق</button>
          </div>
          <h3 className="font-black text-emerald-900">معاينة الإيصال</h3>
        </div>

        <div ref={printRef} className="p-10 text-right font-sans print:p-0">
          <div className="border-[3px] border-emerald-900 p-8 rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-emerald-900" />
            
            <div className="flex justify-between items-start mb-8 border-b-2 border-dashed border-emerald-100 pb-6">
              <div className="text-right">
                <h1 className="text-2xl font-black text-emerald-900 mb-1">جمعية البر والتقوى</h1>
                <p className="text-xs font-bold text-gray-500">نظام الإدارة المالية المتكامل</p>
              </div>
              <div className="text-left font-mono">
                <p className="text-xs font-black text-emerald-600 mb-1">NO: {op.voucherNumber || op.opNumber}</p>
                <p className="text-[10px] font-bold text-gray-400">{op.date}</p>
              </div>
            </div>

            <div className="text-center py-4 mb-8 bg-emerald-50 rounded-2xl border border-emerald-100">
               <h2 className="text-2xl font-black text-emerald-900">
                 {op.type === 'income' ? 'إيصال استلام نقدية' : 'إذن صرف نقدية'}
               </h2>
            </div>

            <div className="space-y-6 text-lg font-bold text-emerald-950">
               <div className="flex items-center gap-4 border-b border-emerald-50 pb-2">
                  <span className="text-stone-400 w-32 shrink-0">وصلنا من السيد:</span>
                  <span className="flex-grow">{op.donorInfo?.name || op.receivedBy || '................................'}</span>
               </div>
               
               <div className="flex items-center gap-4 border-b border-emerald-50 pb-2">
                  <span className="text-stone-400 w-32 shrink-0">مبلغ وقدره:</span>
                  <span className="flex-grow text-2xl font-black text-emerald-600">{op.amount.toLocaleString()} ج.م</span>
               </div>

               <div className="flex items-center gap-4 border-b border-emerald-50 pb-2">
                  <span className="text-stone-400 w-32 shrink-0">وذلك عن:</span>
                  <span className="flex-grow">{op.category} - {op.subCategory || op.description}</span>
               </div>

               <div className="flex items-center gap-4 border-b border-emerald-50 pb-2">
                  <span className="text-stone-400 w-32 shrink-0">طريقة الدفع:</span>
                  <span className="flex-grow">{PAYMENT_METHODS.find(p => p.id === op.paymentMethod)?.label || account.name}</span>
               </div>

               <div className="grid grid-cols-2 gap-12 mt-12 pt-8">
                  <div className="text-center space-y-4">
                     <p className="text-stone-400 text-sm">توقيع المستلم</p>
                     <div className="h-12 border-b border-stone-200 border-dashed" />
                  </div>
                  <div className="text-center space-y-4">
                     <p className="text-stone-400 text-sm">الختم والاعتماد</p>
                     <div className="mt-2 border-4 border-emerald-700/20 rounded-[2rem] py-4 px-12 transform -rotate-2 flex flex-col items-center justify-center relative overflow-hidden backdrop-blur-[1px]">
                        <span className="text-emerald-800/40 font-black text-lg">ختم الجمعية المعتمد</span>
                        <span className="text-[10px] text-emerald-800/30 font-bold uppercase tracking-tighter">Certified Official Seal</span>
                        <div className="absolute -right-2 -bottom-2 opacity-5">
                           <Shield className="w-16 h-16" />
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            <div className="mt-12 pt-6 border-t border-emerald-50 flex justify-between items-center opacity-40">
               <p className="text-[10px] font-bold">تم الاستخراج بواسطة: {op.approval?.executedBy || auth.currentUser?.email}</p>
               <div className="flex items-center gap-2">
                 <Shield className="w-3 h-3" />
                 <span className="text-[10px] font-black italic">Verified Transaction Ledger</span>
               </div>
            </div>
          </div>
        </div>
      </motion.div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-receipt, .print-receipt * { visibility: visible; }
          .print-receipt { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

// --- Helpers ---

// --- Sacrifice Coupons Tab ---
function SacrificeTab({ sacrificeCoupons }: { sacrificeCoupons: SacrificeCoupon[] }) {
   const [showForm, setShowForm] = useState(false);
   const [editing, setEditing] = useState<SacrificeCoupon | null>(null);
   const [search, setSearch] = useState('');
   const [statusFilter, setStatusFilter] = useState<'all' | 'collected' | 'pending'>('all');
   const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
   const [form, setForm] = useState<Partial<SacrificeCoupon>>({
      donorName: '',
      phone: '',
      amount: 0,
      remainingAmount: 0,
      paymentMethod: 'cash',
      couponCount: '1',
      collectorName: '',
      donorPortion: 'لحم كبدة',
      date: new Date().toISOString().split('T')[0],
      isCollected: false,
      isContacted: false
   });

   const filteredItems = sacrificeCoupons.filter(c => {
      const matchesSearch = c.donorName.includes(search) || c.phone.includes(search);
      const matchesStatus = statusFilter === 'all' ? true : 
                          statusFilter === 'collected' ? c.isCollected : !c.isCollected;
      return matchesSearch && matchesStatus;
   }).sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(a.date);
      const dateB = b.createdAt?.toDate?.() || new Date(b.date);
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
   });

   const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
         if (editing) {
            await updateDoc(doc(db, 'sacrifice_coupons', editing.id), {
               ...form,
               updatedAt: serverTimestamp()
            });
         } else {
            await addDoc(collection(db, 'sacrifice_coupons'), {
               ...form,
               createdAt: serverTimestamp()
            });
         }
         setShowForm(false);
         setEditing(null);
         setForm({
            donorName: '',
            phone: '',
            amount: 0,
            remainingAmount: 0,
            paymentMethod: 'cash',
            couponCount: '1',
            collectorName: '',
            donorPortion: 'لحم كبدة',
            date: new Date().toISOString().split('T')[0],
            isCollected: false,
            isContacted: false
         });
      } catch (error) {
         console.error("Error saving sacrifice coupon:", error);
      }
   };

   const handleDownloadList = async () => {
      const element = document.createElement('div');
      element.style.padding = '30px';
      element.style.direction = 'rtl';
      element.style.fontFamily = 'Amiri, serif';
      element.style.backgroundColor = '#ffffff';
      element.style.width = '297mm'; // A4 Landscape
      element.style.position = 'fixed';
      element.style.left = '-9999px';

      element.innerHTML = `
         <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #065f46; margin: 0;">جمعية بصمة خير بنبروه</h1>
            <h2 style="margin: 10px 0;">كشف متبرعي صكوك الأضاحي</h2>
            <p>بتاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
         </div>
         <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
               <tr style="background-color: #f0fdf4; border: 1px solid #065f46;">
                  <th style="padding: 12px; border: 1px solid #065f46;">م</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">اسم المتبرع</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">التليفون</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">المبلغ</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">المتبقي</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">عدد الصكوك</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">طريقة التحصيل</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">التاريخ</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">الحالة</th>
               </tr>
            </thead>
            <tbody>
               ${filteredItems.map((c, i) => `
                  <tr style="border: 1px solid #065f46; text-align: center;">
                     <td style="padding: 10px; border: 1px solid #065f46;">${i + 1}</td>
                     <td style="padding: 10px; border: 1px solid #065f46; font-weight: bold;">${c.donorName}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${c.phone}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${c.amount.toLocaleString()}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${c.remainingAmount?.toLocaleString() || 0}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${c.couponCount}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${c.paymentMethod || 'كاش'}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${c.date}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${c.isCollected ? 'محصل' : 'لم يحصل'}</td>
                  </tr>
               `).join('')}
            </tbody>
         </table>
      `;

      document.body.appendChild(element);
      try {
         const canvas = await html2canvas(element, { scale: 2 });
         const imgData = canvas.toDataURL('image/png');
         const pdf = new jsPDF('l', 'mm', 'a4');
         const pdfWidth = pdf.internal.pageSize.getWidth();
         const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
         pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
         pdf.save(`كشف_صكوك_الأضاحي_${new Date().toISOString().split('T')[0]}.pdf`);
      } finally {
         document.body.removeChild(element);
      }
   };

   const handleDownloadReceipt = async (c: SacrificeCoupon) => {
      const receiptElement = document.createElement('div');
      receiptElement.style.padding = '40px';
      receiptElement.style.direction = 'rtl';
      receiptElement.style.fontFamily = 'Amiri, serif';
      receiptElement.style.backgroundColor = '#ffffff';
      receiptElement.style.width = '210mm';
      receiptElement.style.position = 'fixed';
      receiptElement.style.left = '-9999px';

      const methodNames = { cash: 'كاش', wallet: 'محفظة إلكترونية', instapay: 'إنستا باي', bank: 'تحويل بنكي' };
      const meatWeight = Number(c.couponCount) * 12;
      const liverWeight = Number(c.couponCount) * 1;

      receiptElement.innerHTML = `
         <div style="border: 8px double #065f46; padding: 40px; position: relative; background: #fff;">
            <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #065f46; padding-bottom: 20px; margin-bottom: 30px;">
               <div style="text-align: right;">
                  <h1 style="color: #065f46; margin: 0; font-size: 28px;">جمعية بصمة خير بنبروه</h1>
                  <p style="margin: 5px 0; font-weight: bold; color: #1e293b;">المشهرة برقم 2510 لسنة 2015</p>
                  <p style="margin: 5px 0; font-weight: bold; font-size: 20px; background: #f0fdf4; padding: 5px 15px; display: inline-block; border-radius: 8px;">إيصال تبرع (صكوك الأضاحي)</p>
               </div>
               <div style="text-align: left;">
                  <p style="margin: 5px 0;">التاريخ: ${c.date}</p>
                  <p style="margin: 5px 0;">الرقم المرجعي: <span style="font-family: monospace; font-weight: bold;">${c.id.substring(0, 8).toUpperCase()}</span></p>
               </div>
            </div>

            <div style="margin-bottom: 40px; font-size: 18px; line-height: 2;">
               <p>استلمنا من السيد/ <span style="font-weight: 900; border-bottom: 1px dotted #000; padding: 0 20px;">${c.donorName}</span></p>
               <p>مبلغاً وقدره: <span style="font-weight: 900; border-bottom: 1px dotted #000; padding: 0 20px;">${c.amount.toLocaleString()} جنيهاً مصرياً لا غير</span></p>
               <p>المبلغ المتبقي: <span style="font-weight: 900; border-bottom: 1px dotted #000; padding: 0 20px;">${c.remainingAmount || 0} جنيهاً</span></p>
               <p>وذلك مقابل حجز عدد: <span style="font-weight: 900; border-bottom: 1px dotted #000; padding: 0 20px;">${c.couponCount === '0.5' ? 'نصف صك' : `${c.couponCount} صك`}</span> أضحية.</p>
               <p>نصيب المضحي: <span style="font-weight: 900; border-bottom: 1px dotted #000; padding: 0 20px;">${c.donorPortion || 'لحم كبدة'}</span></p>
               <p>طريقة السداد: <span style="font-weight: bold;">${methodNames[c.paymentMethod || 'cash']}</span></p>
               <p>المحصل: <span style="font-weight: bold;">${c.collectorName || 'جمعية بصمة خير'}</span></p>
               
               <div style="background: #f8fafc; border: 2px dashed #065f46; border-radius: 12px; padding: 20px; margin-top: 20px;">
                  <h4 style="margin: 0 0 10px 0; color: #065f46;">الأوزان المذكورة (تقديرية):</h4>
                  <div style="display: flex; gap: 40px; font-weight: 900; font-size: 22px;">
                     <p>🥩 ${meatWeight} كيلو لحم</p>
                     <p>🧊 ${liverWeight} كيلو كبدة</p>
                  </div>
               </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 60px; text-align: center;">
               <div style="z-index: 10;">
                  <p style="font-weight: bold; margin-bottom: 40px;">أمين الصندوق</p>
                  <p style="font-size: 18px; color: #1e293b;">علي سرور الغلبان</p>
                  <p>....................</p>
               </div>
               <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;">
                  <div style="width: 260px; height: 130px; border: 3px solid #065f46; border-radius: 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #065f46; font-weight: bold; font-size: 18px; text-align: center; background: rgba(6, 95, 70, 0.05); transform: rotate(-3deg);">
                     <p style="margin: 2px 0;">جمعية بصمة خير</p>
                     <p style="margin: 2px 0;">بنبروه</p>
                     <hr style="width: 80%; border-color: #065f46; margin: 6px 0;">
                     <p style="margin: 2px 0; font-size: 12px;">المشهرة برقم 2510</p>
                     <p style="margin: 2px 0; font-size: 12px;">لسنة 2015</p>
                  </div>
                  <p style="margin-top: 10px; font-size: 12px; font-weight: bold;">ختم الجمعية</p>
               </div>
               <div style="z-index: 10;">
                  <p style="font-weight: bold; margin-bottom: 40px;">رئيس مجلس الإدارة</p>
                  <p style="font-size: 18px; color: #1e293b;">عبدالرحمن عبدالغني</p>
                  <p>....................</p>
               </div>
            </div>
         </div>
      `;

      document.body.appendChild(receiptElement);
      try {
         const canvas = await html2canvas(receiptElement, { scale: 3 });
         const imgData = canvas.toDataURL('image/png');
         const pdf = new jsPDF('p', 'mm', 'a4');
         const pdfWidth = pdf.internal.pageSize.getWidth();
         const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
         pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
         pdf.save(`Sacrifice-Receipt-${c.donorName}.pdf`);
      } finally {
         document.body.removeChild(receiptElement);
      }
   };

   const handleDelete = async (id: string) => {
      if (window.confirm('هل أنت متأكد من حذف هذا الصك؟')) {
         await deleteDoc(doc(db, 'sacrifice_coupons', id));
      }
   };

   return (
      <div className="space-y-6">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-[2rem] border border-emerald-100 shadow-sm gap-4">
            <div>
               <h2 className="text-2xl font-black text-emerald-950 mb-1">صكوك الأضاحي</h2>
               <p className="text-emerald-600 font-bold">إدارة تبرعات وحجوزات صكوك الأضحية</p>
            </div>
            <div className="flex flex-wrap gap-3">
               <button 
                  onClick={handleDownloadList}
                  className="bg-blue-600 text-white px-6 py-4 rounded-2xl font-black flex items-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
               >
                  <Download className="w-5 h-5" /> تحميل الكشف
               </button>
               <button 
                  onClick={() => { setEditing(null); setShowForm(true); }}
                  className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200"
               >
                  <Plus className="w-5 h-5" /> إضافة متبرع بالصك
               </button>
            </div>
         </div>

         <div className="bg-white p-6 rounded-[2rem] border border-stone-100 shadow-sm flex flex-col md:flex-row gap-4">
            <div className="relative flex-grow">
               <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
               <input 
                  type="text" 
                  placeholder="بحث باسم المتبرع أو رقم التليفون..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-stone-50 border-2 border-stone-50 pr-12 pl-4 py-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
               />
            </div>
            <select 
               value={sortOrder}
               onChange={(e) => setSortOrder(e.target.value as any)}
               className="bg-stone-50 border-2 border-stone-50 px-6 py-4 rounded-2xl font-bold outline-none focus:border-emerald-500 text-right"
            >
               <option value="desc">الأحدث أولاً (تنازلي)</option>
               <option value="asc">الأقدم أولاً (تصاعدي)</option>
            </select>
            <select 
               value={statusFilter}
               onChange={(e) => setStatusFilter(e.target.value as any)}
               className="bg-stone-50 border-2 border-stone-50 px-6 py-4 rounded-2xl font-bold outline-none focus:border-emerald-500 text-right"
            >
               <option value="all">كل الحالات</option>
               <option value="collected">تم التحصيل</option>
               <option value="pending">لم يحصل بعد</option>
            </select>
         </div>

         {/* Form Modal */}
         <AnimatePresence>
            {showForm && (
               <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-emerald-950/20 backdrop-blur-sm">
                  <motion.div 
                     initial={{ opacity: 0, scale: 0.95 }}
                     animate={{ opacity: 1, scale: 1 }}
                     className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl text-right"
                  >
                     <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                        <button onClick={() => setShowForm(false)} className="p-2 hover:bg-white rounded-full transition-all text-stone-400 hover:text-stone-600"><X /></button>
                        <h3 className="text-xl font-black text-emerald-950">{editing ? 'تعديل السجل' : 'إضافة سجل جديد'}</h3>
                     </div>
                     <form onSubmit={handleSubmit} className="p-8 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <InputField label="اسم المتبرع" required value={form.donorName} onChange={(v: string) => setForm({...form, donorName: v})} />
                           <InputField label="رقم التليفون" required value={form.phone} onChange={(v: string) => setForm({...form, phone: v})} />
                           <InputField label="المبلغ المدفوع" type="number" required value={form.amount} onChange={(v: string) => setForm({...form, amount: Number(v)})} />
                           <InputField label="المبلغ المتبقي" type="number" value={form.remainingAmount} onChange={(v: string) => setForm({...form, remainingAmount: Number(v)})} />
                           <InputField label="اسم الحصل" value={form.collectorName} onChange={(v: string) => setForm({...form, collectorName: v})} />
                           <InputField label="نصيب المضحي" placeholder="مثال: لحم كبدة" value={form.donorPortion} onChange={(v: string) => setForm({...form, donorPortion: v})} />
                           
                           <div className="space-y-2">
                              <label className="text-sm font-black text-stone-700 block mb-2 pr-2">طريقة التحصيل</label>
                              <select 
                                 value={form.paymentMethod} 
                                 onChange={(e) => setForm({...form, paymentMethod: e.target.value as any})}
                                 className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
                              >
                                 <option value="cash">كاش</option>
                                 <option value="wallet">محفظة إلكترونية</option>
                                 <option value="instapay">إنستا باي</option>
                                 <option value="bank">تحويل بنكي</option>
                              </select>
                           </div>

                           <div className="space-y-2">
                              <label className="text-sm font-black text-stone-700 block mb-2 pr-2">عدد الصكوك</label>
                              <select 
                                 value={form.couponCount} 
                                 onChange={(e) => setForm({...form, couponCount: e.target.value})}
                                 className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
                              >
                                 <option value="0.5">نصف صك</option>
                                 <option value="1">صك واحد</option>
                                 <option value="1.5">صك ونصف</option>
                                 <option value="2">2 صك</option>
                                 <option value="3">3 صكوك</option>
                                 <option value="4">4 صكوك</option>
                                 <option value="5">5 صكوك</option>
                                 <option value="6">6 صكوك</option>
                                 <option value="7">7 صكوك</option>
                                 <option value="8">8 صكوك</option>
                                 <option value="9">9 صكوك</option>
                                 <option value="10">10 صكوك</option>
                              </select>
                           </div>
                           <InputField label="التاريخ" type="date" value={form.date} onChange={(v: string) => setForm({...form, date: v})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <button 
                              type="button"
                              onClick={() => setForm({...form, isCollected: !form.isCollected})}
                              className={`p-4 rounded-2xl font-bold flex items-center justify-center gap-2 border-2 transition-all ${form.isCollected ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-stone-100 text-stone-400'}`}
                           >
                              {form.isCollected ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                              تم التحصيل
                           </button>
                           <button 
                              type="button"
                              onClick={() => setForm({...form, isContacted: !form.isContacted})}
                              className={`p-4 rounded-2xl font-bold flex items-center justify-center gap-2 border-2 transition-all ${form.isContacted ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-stone-100 text-stone-400'}`}
                           >
                              {form.isContacted ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                              تم التواصل
                           </button>
                        </div>
                        <button type="submit" className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100">حفظ البيانات</button>
                     </form>
                  </motion.div>
               </div>
            )}
         </AnimatePresence>

         <div className="bg-white rounded-[2.5rem] border border-emerald-100 shadow-sm overflow-hidden overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-right border-collapse">
               <thead>
                  <tr className="bg-emerald-50/50">
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">اسم المتبرع</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">التليفون</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">المبلغ</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">المتبقي</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">طريقة السداد</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">عدد الصكوك</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">التاريخ</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">الحالة</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">إجراءات</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-emerald-50">
                  {filteredItems.map((c, idx) => (
                     <tr key={`sacrifice-${c.id}-${idx}`} className="hover:bg-emerald-50/20 transition-colors">
                        <td className="px-6 py-4 font-bold text-stone-700">{c.donorName}</td>
                        <td className="px-6 py-4 font-mono text-stone-500">{c.phone}</td>
                        <td className="px-6 py-4 font-black text-emerald-600 tabular-nums">{c.amount.toLocaleString()} ج.م</td>
                        <td className="px-6 py-4 font-bold text-rose-600 tabular-nums">{c.remainingAmount?.toLocaleString() || 0} ج.م</td>
                        <td className="px-6 py-4 font-bold text-stone-600">{c.paymentMethod === 'wallet' ? 'محفظة' : c.paymentMethod === 'instapay' ? 'InstaPay' : c.paymentMethod === 'bank' ? 'بنك' : 'كاش'}</td>
                        <td className="px-6 py-4 font-bold text-stone-600">{c.couponCount === '0.5' ? 'نصف صك' : `${c.couponCount} صك`}</td>
                        <td className="px-6 py-4 text-stone-500 tabular-nums">{c.date}</td>
                        <td className="px-6 py-4">
                           <div className="flex gap-2">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black ${c.isCollected ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                 {c.isCollected ? 'مُحصل' : 'لم يُحصل'}
                              </span>
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black ${c.isContacted ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-700'}`}>
                                 {c.isContacted ? 'تم التواصل' : 'لم يتم التواصل'}
                              </span>
                           </div>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex gap-2 justify-end">
                              <button 
                                 onClick={() => handleDownloadReceipt(c)}
                                 className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                 title="طباعة إيصال"
                              >
                                 <Printer className="w-5 h-5" />
                              </button>
                              <button 
                                 onClick={() => { setEditing(c); setForm(c); setShowForm(true); }}
                                 className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                              >
                                 <Edit className="w-5 h-5" />
                              </button>
                              <button 
                                 onClick={() => handleDelete(c.id)}
                                 className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                              >
                                 <Trash2 className="w-5 h-5" />
                              </button>
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
   );
}

// --- Ramadan Campaign Tab ---
function RamadanTab({ ramadanDonations }: { ramadanDonations: RamadanDonation[] }) {
   const [showForm, setShowForm] = useState(false);
   const [editing, setEditing] = useState<RamadanDonation | null>(null);
   const [search, setSearch] = useState('');
   const [statusFilter, setStatusFilter] = useState<'all' | 'collected' | 'pending'>('all');
   const [form, setForm] = useState<Partial<RamadanDonation>>({
      donorName: '',
      phone: '',
      amount: 0,
      remainingAmount: 0,
      paymentMethod: 'cash',
      donationType: 'cash',
      itemType: 'money',
      campaignType: 'bag',
      date: new Date().toISOString().split('T')[0],
      isCollected: false,
      isContacted: false
   });

   const filteredItems = ramadanDonations.filter(d => {
      const matchesSearch = d.donorName.includes(search) || d.phone.includes(search);
      const matchesStatus = statusFilter === 'all' ? true : 
                          statusFilter === 'collected' ? d.isCollected : !d.isCollected;
      return matchesSearch && matchesStatus;
   });

   const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
         if (editing) {
            await updateDoc(doc(db, 'ramadan_campaign', editing.id), {
               ...form,
               updatedAt: serverTimestamp()
            });
         } else {
            await addDoc(collection(db, 'ramadan_campaign'), {
               ...form,
               createdAt: serverTimestamp()
            });
         }
         setShowForm(false);
         setEditing(null);
         setForm({
            donorName: '',
            phone: '',
            amount: 0,
            remainingAmount: 0,
            paymentMethod: 'cash',
            donationType: 'cash',
            itemType: 'money',
            campaignType: 'bag',
            date: new Date().toISOString().split('T')[0],
            isCollected: false,
            isContacted: false
         });
      } catch (error) {
         console.error("Error saving ramadan record:", error);
      }
   };

   const handleDownloadList = async () => {
      const element = document.createElement('div');
      element.style.padding = '30px';
      element.style.direction = 'rtl';
      element.style.fontFamily = 'Amiri, serif';
      element.style.backgroundColor = '#ffffff';
      element.style.width = '297mm'; // A4 Landscape
      element.style.position = 'fixed';
      element.style.left = '-9999px';

      element.innerHTML = `
         <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #065f46; margin: 0;">جمعية بصمة خير بنبروه</h1>
            <h2 style="margin: 10px 0;">كشف متبرعي حملة رمضان</h2>
            <p>بتاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
         </div>
         <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
               <tr style="background-color: #f0fdf4; border: 1px solid #065f46;">
                  <th style="padding: 12px; border: 1px solid #065f46;">م</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">اسم المتبرع</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">التليفون</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">المبلغ</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">المتبقي</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">طريقة التحصيل</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">نوع الحملة</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">التاريخ</th>
                  <th style="padding: 12px; border: 1px solid #065f46;">الحالة</th>
               </tr>
            </thead>
            <tbody>
               ${filteredItems.map((d, i) => `
                  <tr style="border: 1px solid #065f46; text-align: center;">
                     <td style="padding: 10px; border: 1px solid #065f46;">${i + 1}</td>
                     <td style="padding: 10px; border: 1px solid #065f46; font-weight: bold;">${d.donorName}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${d.phone}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${d.amount.toLocaleString()}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${d.remainingAmount?.toLocaleString() || 0}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${d.paymentMethod || 'كاش'}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${d.campaignType === 'bag' ? 'شنطة' : 'إفطار'}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${d.date}</td>
                     <td style="padding: 10px; border: 1px solid #065f46;">${d.isCollected ? 'محصل' : 'لم يحصل'}</td>
                  </tr>
               `).join('')}
            </tbody>
         </table>
      `;

      document.body.appendChild(element);
      try {
         const canvas = await html2canvas(element, { scale: 2 });
         const imgData = canvas.toDataURL('image/png');
         const pdf = new jsPDF('l', 'mm', 'a4');
         const pdfWidth = pdf.internal.pageSize.getWidth();
         const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
         pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
         pdf.save(`كشف_تبرعات_رمضان_${new Date().toISOString().split('T')[0]}.pdf`);
      } finally {
         document.body.removeChild(element);
      }
   };

   const handleDelete = async (id: string) => {
      if (window.confirm('هل أنت متأكد من حذف هذا السجل؟')) {
         await deleteDoc(doc(db, 'ramadan_campaign', id));
      }
   };

   const handleDownloadReceipt = async (d: RamadanDonation) => {
      const receiptElement = document.createElement('div');
      receiptElement.style.padding = '40px';
      receiptElement.style.direction = 'rtl';
      receiptElement.style.fontFamily = 'Amiri, serif';
      receiptElement.style.backgroundColor = '#ffffff';
      receiptElement.style.width = '210mm';
      receiptElement.style.position = 'fixed';
      receiptElement.style.left = '-9999px';

      const campaignName = d.campaignType === 'bag' ? 'شنطة رمضان' : 'إفطار صائم';
      const itemDescription = d.itemType === 'money' ? 'مبلغا ماليا' : 'سلعا تموينية';
      const methodNames = { cash: 'كاش', wallet: 'محفظة إلكترونية', instapay: 'إنستا باي', bank: 'تحويل بنكي' };

      receiptElement.innerHTML = `
         <div style="border: 8px double #065f46; padding: 40px; position: relative; background: #fff;">
            <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #065f46; padding-bottom: 20px; margin-bottom: 30px;">
               <div style="text-align: right;">
                  <h1 style="color: #065f46; margin: 0; font-size: 28px;">جمعية بصمة خير بنبروه</h1>
                  <p style="margin: 5px 0; font-weight: bold; color: #1e293b;">المشهرة برقم 2510 لسنة 2015</p>
                  <p style="margin: 5px 0; font-weight: bold; font-size: 20px; background: #f0fdf4; padding: 5px 15px; display: inline-block; border-radius: 8px;">إيصال تبرع (حملة رمضان)</p>
               </div>
               <div style="text-align: left;">
                  <p style="margin: 5px 0;">التاريخ: ${d.date}</p>
                  <p style="margin: 5px 0;">الرقم المرجعي: <span style="font-family: monospace; font-weight: bold;">${d.id.substring(0, 8).toUpperCase()}</span></p>
               </div>
            </div>

            <div style="margin-bottom: 40px; font-size: 18px; line-height: 2;">
               <p>استلمنا من السيد/ <span style="font-weight: 900; border-bottom: 1px dotted #000; padding: 0 20px;">${d.donorName}</span></p>
               <p>تبرعاً قيمته: <span style="font-weight: 900; border-bottom: 1px dotted #000; padding: 0 20px;">${d.amount.toLocaleString()} جنيهاً مصرياً</span></p>
               <p>المبلغ المتبقي: <span style="font-weight: 900; border-bottom: 1px dotted #000; padding: 0 20px;">${d.remainingAmount || 0} جنيهاً</span></p>
               <p>وذلك لصالح حملة: <span style="font-weight: 900; padding: 5px 10px; background: #f0fdf4; border-radius: 5px;">${campaignName}</span></p>
               <p>طريقة السداد: <span style="font-weight: bold;">${methodNames[d.paymentMethod || 'cash']}</span></p>
               <p>نوع التبرع: <span style="font-weight: bold;">${d.donationType === 'cash' ? 'نقدي' : 'عيني'} (${itemDescription})</span></p>
               <p>رقم الهاتف: <span style="font-weight: bold;">${d.phone}</span></p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 60px; text-align: center;">
               <div>
                  <p style="font-weight: bold; margin-bottom: 40px;">أمين الصندوق</p>
                  <p style="font-size: 18px; color: #1e293b;">علي سرور الغلبان</p>
                  <p>....................</p>
               </div>
               <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;">
                  <div style="width: 260px; height: 130px; border: 3px solid #065f46; border-radius: 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #065f46; font-weight: bold; font-size: 18px; text-align: center; background: rgba(6, 95, 70, 0.05); transform: rotate(-3deg);">
                     <p style="margin: 2px 0;">جمعية بصمة خير</p>
                     <p style="margin: 2px 0;">بنبروه</p>
                     <hr style="width: 80%; border-color: #065f46; margin: 6px 0;">
                     <p style="margin: 2px 0; font-size: 12px;">المشهرة برقم 2510</p>
                     <p style="margin: 2px 0; font-size: 12px;">لسنة 2015</p>
                  </div>
                  <p style="margin-top: 10px; font-size: 12px; font-weight: bold;">ختم الجمعية</p>
               </div>
               <div>
                  <p style="font-weight: bold; margin-bottom: 40px;">رئيس مجلس الإدارة</p>
                  <p style="font-size: 18px; color: #1e293b;">عبدالرحمن عبدالغني</p>
                  <p>....................</p>
               </div>
            </div>
         </div>
      `;

      document.body.appendChild(receiptElement);
      try {
         const canvas = await html2canvas(receiptElement, { scale: 3 });
         const imgData = canvas.toDataURL('image/png');
         const pdf = new jsPDF('p', 'mm', 'a4');
         const pdfWidth = pdf.internal.pageSize.getWidth();
         const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
         pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
         pdf.save(`Ramadan-Receipt-${d.donorName}.pdf`);
      } finally {
         document.body.removeChild(receiptElement);
      }
   };

   return (
      <div className="space-y-6">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-[2rem] border border-emerald-100 shadow-sm gap-4">
            <div>
               <h2 className="text-2xl font-black text-emerald-950 mb-1">حملة رمضان</h2>
               <p className="text-emerald-600 font-bold">إدارة تبرعات الشنط الرمضانية ووجبات الإفطار</p>
            </div>
            <div className="flex flex-wrap gap-3">
               <button 
                  onClick={handleDownloadList}
                  className="bg-blue-600 text-white px-6 py-4 rounded-2xl font-black flex items-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
               >
                  <Download className="w-5 h-5" /> تحميل الكشف
               </button>
               <button 
                  onClick={() => { setEditing(null); setShowForm(true); }}
                  className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200"
               >
                  <Plus className="w-5 h-5" /> إضافة تبرع جديد
               </button>
            </div>
         </div>

         <div className="bg-white p-6 rounded-[2rem] border border-stone-100 shadow-sm flex flex-col md:flex-row gap-4">
            <div className="relative flex-grow">
               <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
               <input 
                  type="text" 
                  placeholder="بحث باسم المتبرع أو رقم التليفون..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-stone-50 border-2 border-stone-50 pr-12 pl-4 py-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
               />
            </div>
            <select 
               value={statusFilter}
               onChange={(e) => setStatusFilter(e.target.value as any)}
               className="bg-stone-50 border-2 border-stone-50 px-6 py-4 rounded-2xl font-bold outline-none focus:border-emerald-500 text-right"
            >
               <option value="all">كل الحالات</option>
               <option value="collected">تم التحصيل</option>
               <option value="pending">لم يحصل بعد</option>
            </select>
         </div>

         {/* Form Modal */}
         <AnimatePresence>
            {showForm && (
               <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-emerald-950/20 backdrop-blur-sm">
                  <motion.div 
                     initial={{ opacity: 0, scale: 0.95 }}
                     animate={{ opacity: 1, scale: 1 }}
                     className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl text-right"
                  >
                     <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                        <button onClick={() => setShowForm(false)} className="p-2 hover:bg-white rounded-full transition-all text-stone-400 hover:text-stone-600"><X /></button>
                        <h3 className="text-xl font-black text-emerald-950">{editing ? 'تعديل تبرع' : 'إضافة تبرع رمضان'}</h3>
                     </div>
                     <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto max-h-[80vh] custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <InputField label="اسم المتبرع" required value={form.donorName} onChange={(v: string) => setForm({...form, donorName: v})} />
                           <InputField label="رقم التليفون" required value={form.phone} onChange={(v: string) => setForm({...form, phone: v})} />
                           <InputField label="المبلغ المدفوع" type="number" required value={form.amount} onChange={(v: string) => setForm({...form, amount: Number(v)})} />
                           <InputField label="المبلغ المتبقي" type="number" value={form.remainingAmount} onChange={(v: string) => setForm({...form, remainingAmount: Number(v)})} />
                           <InputField label="اسم الحصل" value={form.collectorName} onChange={(v: string) => setForm({...form, collectorName: v})} />
                           <InputField label="نصيب المضحي" placeholder="مثال: لحم كبدة" value={form.donorPortion} onChange={(v: string) => setForm({...form, donorPortion: v})} />
                           
                           <div className="space-y-2">
                              <label className="text-sm font-black text-stone-700 block mb-2 pr-2">طريقة التحصيل</label>
                              <select 
                                 value={form.paymentMethod} 
                                 onChange={(e) => setForm({...form, paymentMethod: e.target.value as any})}
                                 className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
                              >
                                 <option value="cash">كاش</option>
                                 <option value="wallet">محفظة إلكترونية</option>
                                 <option value="instapay">إنستا باي</option>
                                 <option value="bank">تحويل بنكي</option>
                              </select>
                           </div>

                           <div className="space-y-2">
                              <label className="text-sm font-black text-stone-700 block mb-2 pr-2">نوع الحملة</label>
                              <select 
                                 value={form.campaignType} 
                                 onChange={(e) => setForm({...form, campaignType: e.target.value as any})}
                                 className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
                              >
                                 <option value="bag">شنطة رمضان</option>
                                 <option value="meals">إفطار صائم</option>
                              </select>
                           </div>

                           <div className="space-y-2">
                              <label className="text-sm font-black text-stone-700 block mb-2 pr-2">نوع التبرع</label>
                              <select 
                                 value={form.donationType} 
                                 onChange={(e) => setForm({...form, donationType: e.target.value as any})}
                                 className="w-full bg-stone-50 border-2 border-emerald-50 p-4 rounded-2xl focus:border-emerald-500 outline-none font-bold text-right"
                              >
                                 <option value="cash">نقدي</option>
                                 <option value="inkind">عيني</option>
                              </select>
                           </div>
                           <InputField label="التاريخ" type="date" value={form.date} onChange={(v: string) => setForm({...form, date: v})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <button 
                              type="button"
                              onClick={() => setForm({...form, isCollected: !form.isCollected})}
                              className={`p-4 rounded-2xl font-bold flex items-center justify-center gap-2 border-2 transition-all ${form.isCollected ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-stone-100 text-stone-400'}`}
                           >
                              {form.isCollected ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                              تم التحصيل
                           </button>
                           <button 
                              type="button"
                              onClick={() => setForm({...form, isContacted: !form.isContacted})}
                              className={`p-4 rounded-2xl font-bold flex items-center justify-center gap-2 border-2 transition-all ${form.isContacted ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-stone-100 text-stone-400'}`}
                           >
                              {form.isContacted ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                              تم التواصل
                           </button>
                        </div>
                        <button type="submit" className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100">حفظ البيانات</button>
                     </form>
                  </motion.div>
               </div>
            )}
         </AnimatePresence>

         <div className="bg-white rounded-[2.5rem] border border-emerald-100 shadow-sm overflow-hidden overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-right border-collapse">
               <thead>
                  <tr className="bg-emerald-50/50">
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">اسم المتبرع</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">التليفون</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">المبلغ</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">المتبقي</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">طريقة السداد</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">نوع الحملة</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">التاريخ</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">الحالة</th>
                     <th className="px-6 py-5 text-sm font-black text-emerald-900 border-b border-emerald-100">إجراءات</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-emerald-50">
                  {filteredItems.map((d, idx) => (
                     <tr key={`ramadan-${d.id}-${idx}`} className="hover:bg-emerald-50/20 transition-colors">
                        <td className="px-6 py-4 font-bold text-stone-700">{d.donorName}</td>
                        <td className="px-6 py-4 font-mono text-stone-500">{d.phone}</td>
                        <td className="px-6 py-4 font-black text-emerald-600 tabular-nums">{d.amount.toLocaleString()} ج.م</td>
                        <td className="px-6 py-4 font-bold text-rose-600 tabular-nums">{d.remainingAmount?.toLocaleString() || 0} ج.م</td>
                        <td className="px-6 py-4 font-bold text-stone-600">{d.paymentMethod === 'wallet' ? 'محفظة' : d.paymentMethod === 'instapay' ? 'InstaPay' : d.paymentMethod === 'bank' ? 'بنك' : 'كاش'}</td>
                        <td className="px-6 py-4">
                           <span className={`px-3 py-1 rounded-full text-[10px] font-black ${d.donationType === 'cash' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                              {d.campaignType === 'bag' ? 'شنطة' : 'إفطار'}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-stone-500 tabular-nums">{d.date}</td>
                        <td className="px-6 py-4">
                           <div className="flex gap-2">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black ${d.isCollected ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                 {d.isCollected ? 'مُحصل' : 'لم يُحصل'}
                              </span>
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black ${d.isContacted ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-700'}`}>
                                 {d.isContacted ? 'تم التواصل' : 'لم يتم التواصل'}
                              </span>
                           </div>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex gap-2 justify-end">
                              <button 
                                 onClick={() => handleDownloadReceipt(d)}
                                 className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                 title="طباعة إيصال"
                              >
                                 <Printer className="w-5 h-5" />
                              </button>
                              <button 
                                 onClick={() => { setEditing(d); setForm(d); setShowForm(true); }}
                                 className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                              >
                                 <Edit className="w-5 h-5" />
                              </button>
                              <button 
                                 onClick={() => handleDelete(d.id)}
                                 className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                              >
                                 <Trash2 className="w-5 h-5" />
                              </button>
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
   );
}


function StatCard({ title, value, total, color, icon }: any) {
  const colors: any = {
    emerald: 'bg-emerald-600 shadow-emerald-100',
    rose: 'bg-rose-500 shadow-rose-100',
    blue: 'bg-blue-600 shadow-blue-100',
    amber: 'bg-amber-500 shadow-amber-100'
  };

  return (
    <div className={`${colors[color]} p-6 rounded-[32px] text-white shadow-xl relative overflow-hidden group`}>
      <div className="absolute -right-4 -bottom-4 w-24 h-24 text-white/10 group-hover:scale-125 transition-transform duration-500">
        {icon}
      </div>
      <div className="relative z-10 space-y-1">
        <p className="text-[10px] font-black opacity-80 uppercase tracking-widest leading-none text-right">{title}</p>
        <div className="flex items-end gap-2 leading-none justify-end">
          <span className="text-sm font-bold opacity-60">ج.م</span>
          <h3 className="text-2xl font-black tabular-nums">{value.toLocaleString()}</h3>
        </div>
        {total !== undefined && (
          <div className="pt-2">
            <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white transition-all duration-1000" 
                style={{ width: `${(value / (total || 1)) * 100}%` }}
              />
            </div>
            <p className="text-[10px] mt-1 font-bold opacity-60 text-right">المستهدف: {total.toLocaleString()} ج.م</p>
          </div>
        )}
      </div>
    </div>
  );
}

function InputField({ label, icon, value, onChange, type = 'text', required, placeholder }: any) {
  return (
    <div className="space-y-1 text-right">
      <label className="text-sm font-bold text-emerald-800 pr-2">
        {label}
        {required && <span className="text-rose-500 mr-1">*</span>}
      </label>
      <div className="bg-emerald-50 p-4 rounded-2xl flex items-center gap-3 ring-1 ring-emerald-100 focus-within:ring-2 ring-emerald-500/20 transition-all">
        <span className="text-emerald-400">{icon}</span>
        <input 
          type={type} 
          value={value ?? ''} 
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          className="bg-transparent border-none focus:ring-0 flex-grow text-emerald-950 font-bold font-sans text-right outline-none tabular-nums"
        />
      </div>
    </div>
  );
}
