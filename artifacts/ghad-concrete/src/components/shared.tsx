import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, Archive, CalendarDays, CircleHelp, Truck } from 'lucide-react';
import type { Mixer } from '@workspace/api-client-react';

export type Notice = { id: number; message: string; error?: boolean };

export function Toasts({ notices, dismiss }: { notices: Notice[]; dismiss: (id: number) => void }) {
  useEffect(() => {
    if (!notices.length) return;
    const id = notices[0].id;
    const timer = window.setTimeout(() => dismiss(id), 3800);
    return () => window.clearTimeout(timer);
  }, [notices, dismiss]);
  return <div className="toast-stack" aria-live="polite">{notices.map((n) => <div key={n.id} className={`toast${n.error ? ' error' : ''}`} data-testid={`status-toast-${n.id}`}>{n.message}</div>)}</div>;
}

export function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const links = [
    { href: '/', label: 'الميزان المباشر', Icon: Activity },
    { href: '/archive', label: 'أرشيف العمليات', Icon: Archive },
    { href: '/mixers', label: 'إدارة الخلاطات', Icon: Truck },
  ];
  const today = new Intl.DateTimeFormat('ar-JO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  return <div className="app-shell" dir="rtl">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">غ</div><div><div className="brand-title">الغد للباطون الجاهز</div><div className="brand-sub">مكتب الوزن والتشغيل</div></div></div>
      <div className="nav-caption">مساحة التشغيل / ٠١</div>
      <nav className="nav-list" aria-label="التنقل الرئيسي">{links.map(({ href, label, Icon }) => <Link key={href} href={href} className={`nav-link${path === href ? ' active' : ''}`} data-testid={`link-${href === '/' ? 'weighing' : href.slice(1)}`}><Icon /><span>{label}</span></Link>)}</nav>
      <div className="side-note"><strong>دقة كل رحلة تبدأ من هنا</strong>وزنٌ واضح الآن، وسجلٌّ موثوق عند الرجوع إليه.</div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><div className="topbar-label">الغد للباطون الجاهز <span className="mini-mark">/ OPERATIONS</span></div><div className="topbar-title">{path === '/' ? 'محطة حساب الوزن' : path === '/archive' ? 'سجل الرحلات المؤرشفة' : 'أسطول الخلاطات'}</div></div><div className="today-chip"><CalendarDays />{today}</div></header>
      <div className="content fade-in">{children}</div>
    </main>
    <nav className="mobile-nav" aria-label="التنقل">{links.map(({ href, label, Icon }) => <Link key={href} href={href} className={`nav-link${path === href ? ' active' : ''}`} data-testid={`mobile-link-${href === '/' ? 'weighing' : href.slice(1)}`}><Icon /><span>{label}</span></Link>)}</nav>
  </div>;
}

export function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="page-description">{description}</p></div>{children}</div>;
}

export function ErrorBox({ retry, text = 'تعذّر تحميل البيانات من الخادم.' }: { retry: () => void; text?: string }) {
  return <div className="error-box" role="alert" data-testid="status-api-error"><span>{text}</span><button type="button" onClick={retry} data-testid="button-retry">إعادة المحاولة</button></div>;
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return <div className="grid" aria-label="جارٍ التحميل">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" />)}</div>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state" data-testid="status-empty"><div className="empty-mark"><CircleHelp size={21} /></div><strong>{title}</strong><p>{detail}</p></div>;
}

export function MixerOption({ mixer }: { mixer: Mixer }) {
  return <>{mixer.vehicleNumber} — {mixer.driverName}</>;
}

export function kg(value: number) {
  return new Intl.NumberFormat('ar-JO', { maximumFractionDigits: 0 }).format(value);
}
export function tonnes(value: number) {
  return new Intl.NumberFormat('ar-JO', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value / 1000);
}
export function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ar-JO', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}
export function localDateInput(value?: string) {
  const date = value ? new Date(value) : new Date();
  const valid = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${valid.getFullYear()}-${String(valid.getMonth() + 1).padStart(2, '0')}-${String(valid.getDate()).padStart(2, '0')}`;
}

export function tareAgeDays(weighedAt: string, now = Date.now()) {
  const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const current = `${dateParts.find((part) => part.type === 'year')?.value}-${dateParts.find((part) => part.type === 'month')?.value}-${dateParts.find((part) => part.type === 'day')?.value}`;
  const toDayNumber = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
  };
  return Math.max(0, toDayNumber(current) - toDayNumber(weighedAt));
}
export function tareFreshness(weighedAt: string, now = Date.now()) {
  const age = tareAgeDays(weighedAt, now);
  if (age <= 30) return { age, label: 'حديث', cls: 'status-green' };
  if (age <= 89) return { age, label: 'يُحدّث قريباً', cls: 'status-amber' };
  return { age, label: 'متأخر', cls: 'status-red' };
}
