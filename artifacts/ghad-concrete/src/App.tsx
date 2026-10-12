import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setBaseUrl } from '@workspace/api-client-react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Toasts, type Notice, Shell } from '@/components/shared';
import HomePage from '@/pages/home';
import ArchivePage from '@/pages/archive';
import MixersPage from '@/pages/mixers';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const appBase = import.meta.env.BASE_URL.replace(/\/$/, '');
setBaseUrl(appBase);

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function RoutedPages({ notify, onLogout }: {
  notify: (message: string, error?: boolean) => void;
  onLogout: () => void;
}) {
  return <RoutedErrorBoundary><Shell onLogout={onLogout}><Switch>
    <Route path="/" component={() => <HomePage notify={notify} />} />
    <Route path="/archive" component={() => <ArchivePage notify={notify} />} />
    <Route path="/mixers" component={() => <MixersPage notify={notify} />} />
    <Route component={NotFound} />
  </Switch></Shell></RoutedErrorBoundary>;
}

type AuthState = 'checking' | 'authenticated' | 'signedOut' | 'setupError' | 'serviceError';

function LoginPage({
  onSuccess,
  onRetry,
  setupError,
  serviceError,
}: {
  onSuccess: () => void;
  onRetry: () => void;
  setupError: boolean;
  serviceError: boolean;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch(`${appBase}/api/auth/login`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (response.ok) {
        setPassword('');
        onSuccess();
      } else if (response.status === 401) {
        setError('اسم المستخدم أو كلمة المرور غير صحيحة.');
      } else if (response.status === 429) {
        setError('تم إيقاف المحاولات مؤقتًا. انتظر 15 دقيقة ثم حاول مجددًا.');
      } else {
        setError(result?.error ?? 'تعذّر تسجيل الدخول. حاول مرة أخرى.');
      }
    } catch {
      setError('تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم حاول مجددًا.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="login-screen" dir="rtl">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand">
        <div className="brand-mark">غ</div>
        <div>
          <div className="brand-title">الغد للباطون الجاهز</div>
          <div className="brand-sub">مكتب الوزن والتشغيل</div>
        </div>
      </div>
      <div className="login-heading">
        <div className="login-icon"><LockKeyhole size={19} /></div>
        <div className="eyebrow">دخول المشرف</div>
        <h1 id="login-title">تسجيل الدخول</h1>
        <p className="page-description">أدخل بيانات الحساب لمتابعة عمليات الوزن والأرشيف.</p>
      </div>

      {setupError && <div className="login-alert" role="alert">
        إعداد الدخول غير مكتمل. أضف متغيرَي <bdi>ADMIN_USERNAME</bdi> و<bdi>ADMIN_PASSWORD</bdi> في إعدادات Cloudflare Pages.
      </div>}
      {serviceError && <div className="login-alert" role="alert">
        تعذّر التحقق من جلسة الدخول. تحقق من الاتصال ثم أعد المحاولة.
      </div>}
      {error && <div className="login-alert" role="alert">{error}</div>}

      <form className="login-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="admin-username">اسم المستخدم</label>
          <input
            id="admin-username"
            className="control"
            dir="ltr"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            maxLength={120}
          />
        </div>
        <div className="field">
          <label htmlFor="admin-password">كلمة المرور</label>
          <div className="password-control">
            <input
              id="admin-password"
              className="control"
              dir="ltr"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={256}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>
        <button type="submit" className="btn btn-primary login-submit" disabled={busy || setupError}>
          {busy ? 'جارٍ التحقق…' : 'دخول إلى النظام'}
        </button>
      </form>
      {serviceError && <button type="button" className="login-retry" onClick={onRetry}>إعادة المحاولة</button>}
      <div className="login-footnote">الدخول مخصص للمخولين بإدارة العمليات.</div>
    </section>
  </main>;
}

function AppContent() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const notify = useCallback((message: string, error = false) => {
    const id = Date.now();
    setNotices((current) => [...current, { id, message, error }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);
  const checkSession = useCallback(async () => {
    try {
      const response = await fetch(`${appBase}/api/auth/session`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 503) {
        setAuthState('setupError');
      } else if (response.status === 401) {
        setAuthState('signedOut');
      } else if (response.ok) {
        const result = await response.json() as { authenticated?: boolean };
        setAuthState(result.authenticated ? 'authenticated' : 'signedOut');
      } else {
        setAuthState('serviceError');
      }
    } catch {
      setAuthState('serviceError');
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (authState !== 'authenticated') return;
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkSession();
    };
    const timer = window.setInterval(() => void checkSession(), 5 * 60 * 1000);
    window.addEventListener('focus', checkWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', checkWhenVisible);
    };
  }, [authState, checkSession]);

  const handleLogin = useCallback(() => {
    queryClient.clear();
    setAuthState('authenticated');
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      const response = await fetch(`${appBase}/api/auth/logout`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Logout failed');
      queryClient.clear();
      setAuthState('signedOut');
    } catch {
      notify('تعذّر تسجيل الخروج. تحقق من الاتصال ثم حاول مرة أخرى.', true);
    }
  }, [notify]);

  if (authState === 'checking') {
    return <main className="login-screen" dir="rtl"><div className="login-loading">جارٍ التحقق من جلسة الدخول…</div></main>;
  }

  if (authState !== 'authenticated') {
    return <LoginPage
      onSuccess={handleLogin}
      onRetry={() => void checkSession()}
      setupError={authState === 'setupError'}
      serviceError={authState === 'serviceError'}
    />;
  }

  return <>
      <WouterRouter base={appBase}>
        <RoutedPages notify={notify} onLogout={() => void handleLogout()} />
      </WouterRouter>
      <Toasts notices={notices} dismiss={dismiss} />
      <Toaster />
  </>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><AppContent /></TooltipProvider></QueryClientProvider>;
}

export default App;
