// @ts-nocheck
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Heart, ClipboardList, Menu, X, PlusCircle, LogIn, LogOut, UserCheck, Megaphone, Shield, ChevronUp, ChevronDown, Newspaper, Download, Terminal, DollarSign, MessageCircle, Lock, Box, UserPlus, Stethoscope, PartyPopper, Building, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { db, auth, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signOut, type User as FirebaseUser, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, limit, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import CasesScreen from './components/CasesScreen';
import AccountsScreen from './components/AccountsScreen';
import PartiesScreen from './components/PartiesScreen';
import ActivitiesScreen from './components/ActivitiesScreen';
import VolunteersScreen from './components/VolunteersScreen';
import CampaignsScreen from './components/CampaignsScreen';
import NewsScreen from './components/NewsScreen';
import LogsScreen from './components/LogsScreen';
import DeveloperScreen from './components/DeveloperScreen';
import OrphansScreen from './components/OrphansScreen';
import MarriageCasesScreen from './components/MarriageCasesScreen';
import MedicalRecordsScreen from './components/MedicalRecordsScreen';
import WhatsAppListScreen from './components/WhatsAppListScreen';
import ReceptionScreen from './components/ReceptionScreen';
import SeasonalCasesScreen from './components/SeasonalCasesScreen';
import AboutScreen from './components/AboutScreen';
import Logo from './components/Logo';
import VoiceAssistant from './components/VoiceAssistant';
import MonthlyPayrollScreen from './components/MonthlyPayrollScreen';

const DEVELOPER_EMAIL = '11gawish2004@gmail.com';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Login Screen
const Login = () => {
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-blocked') {
        setError('عذراً، تم حظر النافذة المنبثقة. يرجى تفعيل السماح بالنوافذ المنبثقة في المتصفح أو فتح التطبيق في علامة تبويب جديدة.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        setError('تم إلغاء عملية الدخول. يرجى المحاولة مرة أخرى.');
      } else if (err.message?.includes('INTERNAL ASSERTION FAILED')) {
        setError('خطأ داخلي في المتصفح. يرجى تحديث الصفحة أو فتح التطبيق في علامة تبويب مستقلة.');
      } else {
        setError('حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-right font-sans" dir="rtl">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-12 rounded-3xl shadow-2xl border border-emerald-100 max-w-md w-full text-center"
      >
        <Logo className="w-24 h-24 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-emerald-900 mb-2 font-sans">بصمة خير</h1>
        <p className="text-emerald-700/60 mb-10 font-sans">نظام إدارة الجمعية الخيرية</p>
        
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs font-bold leading-relaxed">
            {error}
          </div>
        )}
        
        <button 
          onClick={handleLogin}
          disabled={isLoggingIn}
          className={cn(
            "w-full flex items-center justify-center gap-3 border-2 px-6 py-4 rounded-xl font-bold transition-all shadow-sm",
            isLoggingIn ? "bg-stone-50 border-stone-100 text-stone-400 cursor-not-allowed" : "bg-white border-emerald-100 text-emerald-900 hover:bg-emerald-50"
          )}
        >
          {isLoggingIn ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>جاري التحميل...</span>
            </>
          ) : (
            <>
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
              <span>الدخول باستخدام جوجل</span>
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
};

// Placeholder Screens
const Dashboard = ({ isDeveloper }: { isDeveloper: boolean }) => {
  const [stats, setStats] = useState({ cases: 0, donors: 0, volunteers: 0, campaigns: 0 });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  useEffect(() => {
    const unsubCases = onSnapshot(collection(db, 'cases'), (snap) => {
      setStats(prev => ({ ...prev, cases: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cases'));

    const unsubDonors = onSnapshot(collection(db, 'donors'), (snap) => {
      setStats(prev => ({ ...prev, donors: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'donors'));

    const unsubVolunteers = onSnapshot(collection(db, 'volunteers'), (snap) => {
      setStats(prev => ({ ...prev, volunteers: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'volunteers'));

    const unsubCampaigns = onSnapshot(collection(db, 'campaigns'), (snap) => {
      setStats(prev => ({ ...prev, campaigns: snap.size }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'campaigns'));
    
    // Listen to real activity logs
    const qLogs = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(10));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      setRecentLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'logs'));

    return () => {
      unsubCases();
      unsubDonors();
      unsubVolunteers();
      unsubCampaigns();
      unsubLogs();
    };
  }, []);

  return (
    <div className="p-6 space-y-8 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-emerald-900 min-h-[350px] flex items-center p-8 md:p-12 text-white shadow-2xl"
      >
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&q=80&w=1200" 
            alt="Charity" 
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-linear-to-r from-emerald-900 via-emerald-900/80 to-transparent" />
        </div>

        <div className="relative z-10 max-w-2xl text-right">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">مرحباً بك في بصمة خير</h1>
          <p className="text-emerald-100/80 text-lg leading-relaxed">
            نحن هنا لنجعل العطاء أسهل وأكثر تنظيماً. يمكنك من خلال هذه اللوحة متابعة كافة أنشطة الجمعية وإدارة الموارد بفعالية لنصل لكل محتاج.
          </p>
          <div className="mt-8 flex flex-wrap gap-4 justify-end">
            <Link to="/campaigns" className="bg-white text-emerald-900 px-6 py-3 rounded-xl font-bold hover:bg-emerald-50 transition-all flex items-center gap-2">
              <Megaphone className="w-5 h-5" />
              <span>الحملات الجديدة</span>
            </Link>
            <Link to="/volunteers" className="bg-emerald-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all border border-emerald-700 flex items-center gap-2">
              <UserCheck className="w-5 h-5" />
              <span>فريق التطوع</span>
            </Link>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="إجمالي الحالات" value={stats.cases.toString()} icon={<Users className="w-6 h-6 text-emerald-600" />} color="bg-white" />
        <StatCard title="المتبرعين" value={stats.donors.toString()} icon={<Heart className="w-6 h-6 text-rose-600" />} color="bg-white" />
        <StatCard title="المتطوعين" value={stats.volunteers.toString()} icon={<UserCheck className="w-6 h-6 text-blue-600" />} color="bg-white" />
        <StatCard title="الحملات" value={stats.campaigns.toString()} icon={<Megaphone className="w-6 h-6 text-amber-600" />} color="bg-white" />
      </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {isDeveloper && (
        <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
             <Link to="/logs" className="text-xs text-emerald-600 font-bold hover:underline">عرض الكل</Link>
             <h3 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
                <Shield className="w-5 h-5" />
                سجل النشاط
             </h3>
          </div>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {recentLogs.length > 0 ? recentLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-4 p-4 bg-stone-50 rounded-2xl border border-transparent hover:border-emerald-50 text-right transition-all group">
                <div className="flex-grow">
                  <div className="flex items-center justify-between mb-1">
                     <span className="text-[10px] text-emerald-400 font-bold tabular-nums">
                       {log.timestamp?.toDate() ? new Date(log.timestamp.toDate()).toLocaleTimeString('ar-EG') : 'الان'}
                     </span>
                     <p className="font-bold text-emerald-900 text-sm">{log.userEmail}</p>
                  </div>
                  <p className="text-xs text-emerald-700 bg-emerald-100/50 inline-block px-2 py-0.5 rounded-md mb-2">{log.action}</p>
                  <p className="text-[10px] text-stone-400 line-clamp-1 opacity-0 group-hover:opacity-100 transition-opacity">{log.device}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-emerald-600 font-bold shrink-0">
                  <LogIn className="w-5 h-5 opacity-40" />
                </div>
              </div>
            )) : (
              <div className="py-20 text-center text-emerald-300 italic">لا توجد سجلات بعد</div>
            )}
          </div>
        </div>
      )}
      
      <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white">
              <ClipboardList className="w-6 h-6" />
           </div>
           <div className="text-right">
              <h4 className="font-bold text-amber-900 leading-tight">تنبيهات المتابعة</h4>
              <p className="text-sm text-amber-700/70">لديك حالات حرجة (تقييم 9+) تحتاج لمراجعة عاجلة هذا الشهر.</p>
           </div>
        </div>
        <Link to="/cases" className="bg-amber-500 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-sm whitespace-nowrap">مراجعة الحالات</Link>
      </div>

      {isDeveloper && (
        <div className="bg-emerald-50 p-8 rounded-3xl flex flex-col items-center justify-center text-center space-y-4 border border-emerald-100">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl">
            <PlusCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-emerald-900">هل لديك نشاط جديد؟</h3>
          <p className="text-emerald-800/60 max-w-xs">وثق أعمال الجمعية وشارك الصور مع الفريق والداعمين.</p>
          <Link to="/activities" className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all">إضافة نشاط</Link>
        </div>
      )}
    </div>

    <footer className="mt-12 py-8 border-t border-emerald-100 text-center">
      <p className="text-emerald-700/40 text-xs font-medium tracking-wide">
        نظام الإدارة الإلكتروني لجمعية بصمة خير نبروه
      </p>
      <p className="text-emerald-800/60 mt-1 text-sm font-bold">
        تم التطوير بواسطة م/ محمود جاويش (Mahmoud Gawish) © {new Date().getFullYear()}
      </p>
    </footer>
  </div>
  );
};

const StatCard = ({ title, value, icon, color }: { title: string; value: string; icon: ReactNode; color: string }) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className={cn("p-6 rounded-2xl shadow-sm border border-emerald-100 flex items-center justify-between font-sans", color)}
  >
    <div className="text-right">
      <p className="text-emerald-800/70 text-sm font-medium">{title}</p>
      <p className="text-3xl font-bold text-emerald-900 mt-1 tabular-nums">{value}</p>
    </div>
    {icon}
  </motion.div>
);

const SidebarLink = ({ to, icon, label, active, onClick }: { to: string; icon: ReactNode; label: string; active: boolean; onClick?: () => void, key?: string }) => (
  <Link
    to={to}
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-right font-sans",
      active ? "bg-emerald-600 text-white shadow-lg" : "text-emerald-800 hover:bg-emerald-50"
    )}
  >
    {icon}
    <span className="font-medium">{label}</span>
  </Link>
);

function NavLinks({ onLinkClick, userConfig }: { onLinkClick?: () => void, userConfig: any }) {
  const location = useLocation();
  const perms = userConfig?.permissions || [];
  const isAdmin = userConfig?.isAdmin || userConfig?.email === DEVELOPER_EMAIL;

  const links = [
    { to: "/", icon: <LayoutDashboard className="w-5 h-5" />, label: "لوحة التحكم", id: 'dashboard' },
    { to: "/reception", icon: <UserPlus className="w-5 h-5" />, label: "الاستقبال", id: 'reception' },
    { to: "/cases", icon: <Users className="w-5 h-5" />, label: "الحالات", id: 'cases' },
    { to: "/seasonal", icon: <Box className="w-5 h-5" />, label: "الحالات الموسمية", id: 'seasonal' },
    { to: "/medical", icon: <Stethoscope className="w-5 h-5" />, label: "السجلات الطبية", id: 'medical' },
    { to: "/whatsapp", icon: <MessageCircle className="w-5 h-5" />, label: "قائمة واتساب", id: 'whatsapp' },
    { to: "/marriage", icon: <PartyPopper className="w-5 h-5" />, label: "حالات الزواج", id: 'marriage' },
    { to: "/about", icon: <Building className="w-5 h-5" />, label: "عن الجمعية", id: 'about' },
    { to: "/accounts", icon: <DollarSign className="w-5 h-5" />, label: "الحسابات والماليات", id: 'accounts' },
    { to: "/parties", icon: <PartyPopper className="w-5 h-5" />, label: "الحفلات والفعاليات", id: 'parties' },
    { to: "/campaigns", icon: <Megaphone className="w-5 h-5" />, label: "الحملات", id: 'campaigns' },
    { to: "/news", icon: <Newspaper className="w-5 h-5" />, label: "أخبار الجمعية", id: 'news' },
    { to: "/volunteers", icon: <UserCheck className="w-5 h-5" />, label: "المتطوعون", id: 'volunteers' },
    { to: "/logs", icon: <Shield className="w-5 h-5" />, label: "سجل الأمان", id: 'logs' },
    { to: "/activities", icon: <ClipboardList className="w-5 h-5" />, label: "الأنشطة", id: 'activities' },
    { to: "/orphans", icon: <Heart className="w-5 h-5" />, label: "هيئة الأعمال", id: 'orphans' },
    { to: "/developer", icon: <Terminal className="w-5 h-5" />, label: "المبرمج", id: 'developer' },
  ];

  return (
    <>
      {links.filter(link => isAdmin || perms.includes(link.id)).map(link => (
        <SidebarLink key={link.to} to={link.to} icon={link.icon} label={link.label} active={location.pathname === link.to} onClick={onLinkClick} />
      ))}
      <div className="pt-4 mt-4 border-t border-emerald-50">
        <button 
          onClick={() => signOut(auth)}
          className="w-full flex items-center gap-3 px-4 py-3 text-rose-600 hover:bg-rose-50 rounded-xl transition-all font-bold justify-start font-sans group"
        >
          <LogOut className="w-5 h-5 text-rose-500" />
          <span>خروج من النظام</span>
        </button>
      </div>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isSiteLocked, setIsSiteLocked] = useState(false);
  const [lockSchedule, setLockSchedule] = useState<{ start: string; end: string } | null>(null);

  useEffect(() => {
    // Site Locking Logic
    const unsubSettings = onSnapshot(doc(db, 'settings', 'site_config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setIsSiteLocked(data.isLocked || false);
        setLockSchedule(data.lockSchedule || null);
      }
    }, (err) => {
      console.warn("Site config loading failed (possibly not initialized):", err);
    });
    return () => unsubSettings();
  }, []);

  const [userConfig, setUserConfig] = useState<{email: string, permissions: string[], isAdmin: boolean} | null>(null);

  useEffect(() => {
    if (!user) {
      setUserConfig(null);
      return;
    }

    // Developer always has all permissions
    if (user.email === DEVELOPER_EMAIL) {
      setUserConfig({
        email: user.email,
        permissions: ['dashboard', 'reception', 'cases', 'seasonal', 'medical', 'whatsapp', 'marriage', 'accounts', 'parties', 'campaigns', 'news', 'volunteers', 'logs', 'activities', 'orphans', 'payroll', 'developer'],
        isAdmin: true
      });
      return;
    }

    // Listen to current user config
    const unsub = onSnapshot(doc(db, 'users_config', user.email?.toLowerCase() || ''), (snap) => {
      if (snap.exists()) {
        setUserConfig(snap.data() as any);
      } else {
        // Fallback for unauthorized users - maybe they only have basic dashboard access?
        // Or we keep it null to show they have no extra permissions
        setUserConfig(null);
      }
    });
    return () => unsub();
  }, [user]);

  const isAccessAllowed = () => {
    if (user?.email === DEVELOPER_EMAIL) return true;
    if (isSiteLocked) return false;
    
    if (lockSchedule && lockSchedule.start && lockSchedule.end) {
      const now = new Date();
      const current = now.getHours() * 60 + now.getMinutes();
      
      const [sH, sM] = lockSchedule.start.split(':').map(Number);
      const [eH, eM] = lockSchedule.end.split(':').map(Number);
      
      const start = sH * 60 + sM;
      const end = eH * 60 + eM;
      
      if (start < end) {
        if (current >= start && current <= end) return false;
      } else {
        if (current >= start || current <= end) return false;
      }
    }
    return true;
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        // Log sign-in if it's a new session
        // We check if we already have the user in state to avoid redundant logs
        // Since this effect runs only once on mount, we can check a ref or just rely on the u being present
        addDoc(collection(db, 'logs'), {
          userEmail: u.email,
          action: 'دخول للنظام',
          device: navigator.userAgent,
          timestamp: serverTimestamp()
        }).catch(err => console.error("Logging failed:", err));
      }
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []); // Empty dependency array is critical to avoid infinite loops with auth listeners

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-stone-50">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [1, 0.7, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <Logo className="w-20 h-20" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const accessAllowed = isAccessAllowed();

  if (!accessAllowed) {
    return (
      <div className="h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-right font-sans" dir="rtl">
        <div className="bg-white p-12 rounded-[2.5rem] shadow-2xl border border-rose-100 max-w-lg w-full text-center">
          <div className="w-24 h-24 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-8">
            <Lock className="w-12 h-12 text-rose-500" />
          </div>
          <h1 className="text-3xl font-black text-rose-950 mb-4">الموقع مغلق الآن</h1>
          <p className="text-stone-500 font-bold mb-8 leading-relaxed">
            عذراً، الموقع مغلق حالياً بقرار من الإدارة أو ضمن مواعيد الإغلاق المقررة.
            برجاء المحاولة في وقت لاحق.
          </p>
          <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100 mb-8">
             <p className="text-sm font-bold text-stone-400 mb-2">مواعيد العمل المجدولة</p>
             <p className="text-emerald-600 font-black">يفتح الموقع تلقائياً من {lockSchedule?.end || '8:00'} صباحاً حتى {lockSchedule?.start || '12:00'} ليلاً</p>
          </div>
          <button 
           onClick={() => signOut(auth)}
           className="w-full bg-stone-100 text-stone-500 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-stone-200"
          >
            <LogOut className="w-5 h-5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-stone-50 font-sans text-emerald-950 overflow-hidden" dir="rtl">
        {/* Sidebar for Desktop */}
        <aside className="hidden lg:flex flex-col w-72 bg-white border-l border-emerald-100 p-6 shadow-2xl z-20 overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-3 mb-10 px-2 justify-end group cursor-pointer">
            <Logo className="w-10 h-10 transition-transform group-hover:scale-110" />
            <h2 className="text-xl font-bold text-emerald-900 tracking-tight font-sans transition-colors group-hover:text-emerald-600">بصمة خير</h2>
          </div>
          
          <nav className="space-y-1 flex-grow">
            <NavLinks userConfig={userConfig} />
            {deferredPrompt && (
              <button 
                onClick={handleInstallClick}
                className="w-full flex items-center gap-3 px-4 py-3 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-all font-bold justify-start font-sans mt-4 border border-emerald-100 shadow-sm"
              >
                <Download className="w-5 h-5" />
                <span>تثبيت التطبيق</span>
              </button>
            )}
          </nav>

          <div className="mt-8 pt-6 border-t border-emerald-50">
            <div className="flex items-center gap-3 mb-4 px-2 bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100/50">
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt="profile" />
              <div className="text-right flex-grow overflow-hidden">
                <p className="text-sm font-bold truncate text-emerald-950">{user.displayName}</p>
                <p className="text-[10px] text-emerald-600/70 truncate">{user.email}</p>
              </div>
            </div>
            <button 
              onClick={() => signOut(auth)}
              className="w-full flex items-center gap-3 px-4 py-3 text-rose-600 hover:bg-rose-50 rounded-xl transition-all font-bold justify-end font-sans group"
            >
              <span className="group-hover:translate-x-1 transition-transform">تسجيل الخروج</span>
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </aside>

        {/* Mobile Header */}
        <header className="lg:hidden fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-emerald-100 px-6 py-4 flex items-center justify-between z-30">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-emerald-900">
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
          <div className="flex items-center gap-2">
            <Logo className="w-8 h-8" />
            <span className="font-bold font-sans">بصمة خير</span>
          </div>
        </header>

        {/* Mobile Sidebar Overlay */}
          <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, x: 200 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 200 }}
              className="lg:hidden fixed inset-0 bg-white z-40 p-6 pt-20"
            >
              <nav className="space-y-4">
                <NavLinks userConfig={userConfig} onLinkClick={() => setMobileMenuOpen(false)} />
                {deferredPrompt && (
                  <button 
                    onClick={() => {
                      handleInstallClick();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-600 text-white rounded-xl transition-all font-bold justify-center font-sans mt-4 shadow-lg"
                  >
                    <Download className="w-5 h-5" />
                    <span>تثبيت التطبيق على الجهاز</span>
                  </button>
                )}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <main id="main-content" className="flex-grow overflow-y-auto pt-20 lg:pt-0 custom-scrollbar relative scroll-smooth">
          <div className="max-w-7xl mx-auto">
            <Routes>
              <Route path="/" element={<Dashboard isDeveloper={userConfig?.isAdmin || user.email === DEVELOPER_EMAIL} />} />
              <Route path="/reception" element={<ReceptionScreen />} />
              <Route path="/cases" element={<CasesScreen />} />
              <Route path="/seasonal" element={<SeasonalCasesScreen />} />
              <Route path="/medical" element={<MedicalRecordsScreen />} />
              <Route path="/marriage" element={<MarriageCasesScreen />} />
              <Route path="/whatsapp" element={<WhatsAppListScreen />} />
              <Route path="/about" element={<AboutScreen />} />
              <Route path="/accounts" element={<AccountsScreen />} />
              <Route path="/parties" element={<PartiesScreen />} />
              <Route path="/activities" element={<ActivitiesScreen />} />
              <Route path="/volunteers" element={<VolunteersScreen />} />
              <Route path="/campaigns" element={<CampaignsScreen />} />
              <Route path="/news" element={<NewsScreen />} />
              {(userConfig?.isAdmin || user.email === DEVELOPER_EMAIL || userConfig?.permissions?.includes('logs')) && (
                <Route path="/logs" element={<LogsScreen />} />
              )}
              {(userConfig?.isAdmin || user.email === DEVELOPER_EMAIL || userConfig?.permissions?.includes('activities')) && (
                <Route path="/activities" element={<ActivitiesScreen />} />
              )}
              {(userConfig?.isAdmin || user.email === DEVELOPER_EMAIL || userConfig?.permissions?.includes('developer')) && (
                <Route path="/developer" element={<DeveloperScreen />} />
              )}
              {(userConfig?.isAdmin || user.email === DEVELOPER_EMAIL || userConfig?.permissions?.includes('orphans')) && (
                <Route path="/orphans" element={<OrphansScreen />} />
              )}
            </Routes>
          </div>

          {/* Global Floating Scroll Sidebar */}
          <div className="fixed bottom-10 left-6 flex flex-col gap-3 z-50">
            <a 
              href="https://wa.me/201021761633" 
              target="_blank" 
              rel="noreferrer"
              className="p-3 bg-[#25D366] text-white rounded-2xl shadow-2xl hover:bg-[#128C7E] transition-all border-2 border-white/20 group flex items-center justify-center"
              title="تواصل عبر واتساب"
            >
              <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
            </a>
            <button 
              onClick={() => document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' })}
              className="p-3 bg-emerald-600 text-white rounded-2xl shadow-2xl hover:bg-emerald-700 transition-all border-2 border-white/20 group"
              title="للأعلى"
            >
              <ChevronUp className="w-6 h-6 group-hover:-translate-y-1 transition-transform" />
            </button>
            <button 
              onClick={() => {
                const el = document.getElementById('main-content');
                el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
              }}
              className="p-3 bg-emerald-600 text-white rounded-2xl shadow-2xl hover:bg-emerald-700 transition-all border-2 border-white/20 group"
              title="للأسفل"
            >
              <ChevronDown className="w-6 h-6 group-hover:translate-y-1 transition-transform" />
            </button>
          </div>
          <VoiceAssistant />
        </main>
      </div>
    </BrowserRouter>
  );
}