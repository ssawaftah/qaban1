import { useCallback, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setBaseUrl } from '@workspace/api-client-react';
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

function RoutedPages({ notify }: { notify: (message: string, error?: boolean) => void }) {
  return <RoutedErrorBoundary><Shell><Switch>
    <Route path="/" component={() => <HomePage notify={notify} />} />
    <Route path="/archive" component={() => <ArchivePage notify={notify} />} />
    <Route path="/mixers" component={() => <MixersPage notify={notify} />} />
    <Route component={NotFound} />
  </Switch></Shell></RoutedErrorBoundary>;
}

function App() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const notify = useCallback((message: string, error = false) => {
    const id = Date.now();
    setNotices((current) => [...current, { id, message, error }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  return <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WouterRouter base={appBase}>
        <RoutedPages notify={notify} />
      </WouterRouter>
      <Toasts notices={notices} dismiss={dismiss} />
      <Toaster />
    </TooltipProvider>
  </QueryClientProvider>;
}

export default App;
