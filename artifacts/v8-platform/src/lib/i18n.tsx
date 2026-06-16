import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'ar' | 'en';

interface I18nContextType {
  lang: Language;
  toggleLang: () => void;
  t: (key: string) => string;
}

const translations = {
  ar: {
    'login.title': 'بوابة الدخول للنظام',
    'login.button': 'الدخول للنظام',
    'login.username': 'اسم المستخدم',
    'login.password': 'كلمة المرور',
    'login.credit': 'تم التطوير بواسطة عمر الزهراني',
    'nav.dashboard': 'لوحة القيادة',
    'nav.scans': 'عمليات الفحص',
    'nav.tools': 'الأدوات',
    'nav.proxies': 'البروكسي',
    'nav.vulnerabilities': 'الثغرات',
    'nav.reports': 'التقارير',
    'nav.logout': 'تسجيل الخروج',
    'dashboard.total_scans': 'إجمالي الفحوصات',
    'dashboard.active_scans': 'الفحوصات النشطة',
    'dashboard.total_vulns': 'إجمالي الثغرات',
    'dashboard.threads': 'الخيوط النشطة',
    'dashboard.proxy_pool': 'تجمع البروكسي',
    'dashboard.tools_active': 'الأدوات النشطة',
    'dashboard.live_feed': 'بث السجلات المباشر',
    'dashboard.quick_actions': 'إجراءات سريعة',
    'action.new_scan': 'فحص جديد',
    'action.add_proxy': 'إضافة بروكسي',
    'action.install_tool': 'تثبيت أداة',
    'action.generate_report': 'إنشاء تقرير',
  },
  en: {
    'login.title': 'SYSTEM LOGIN PORTAL',
    'login.button': 'SYSTEM LOGIN',
    'login.username': 'USERNAME',
    'login.password': 'PASSWORD',
    'login.credit': 'DEVELOPED BY OMAR ALZAHRANI',
    'nav.dashboard': 'DASHBOARD',
    'nav.scans': 'SCANS',
    'nav.tools': 'TOOLS',
    'nav.proxies': 'PROXIES',
    'nav.vulnerabilities': 'VULNERABILITIES',
    'nav.reports': 'REPORTS',
    'nav.logout': 'LOGOUT',
    'dashboard.total_scans': 'TOTAL SCANS',
    'dashboard.active_scans': 'ACTIVE SCANS',
    'dashboard.total_vulns': 'TOTAL VULNERABILITIES',
    'dashboard.threads': 'ACTIVE THREADS',
    'dashboard.proxy_pool': 'PROXY POOL',
    'dashboard.tools_active': 'ACTIVE TOOLS',
    'dashboard.live_feed': 'LIVE LOG FEED',
    'dashboard.quick_actions': 'QUICK ACTIONS',
    'action.new_scan': 'NEW SCAN',
    'action.add_proxy': 'ADD PROXY',
    'action.install_tool': 'INSTALL TOOL',
    'action.generate_report': 'GENERATE REPORT',
  }
};

const I18nContext = createContext<I18nContextType>({
  lang: 'ar',
  toggleLang: () => {},
  t: () => '',
});

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<Language>('ar');

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleLang = () => setLang(l => (l === 'ar' ? 'en' : 'ar'));

  const t = (key: string) => {
    return (translations[lang] as any)[key] || key;
  };

  return (
    <I18nContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
