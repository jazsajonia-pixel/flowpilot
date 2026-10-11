import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, User, Plus } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';

interface HeaderProps {
  onMobileMenuOpen: () => void;
  pageTitle?: string;
}

interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
}

interface SessionResponse {
  user: SessionUser | null;
}

export function Header({ onMobileMenuOpen, pageTitle = 'Dashboard' }: HeaderProps) {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/auth/session', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as SessionResponse;
        setCurrentUser(result.user);
      })
      .catch(() => {
        // The UI session indicator is advisory; server-side APIs remain authoritative.
        setCurrentUser(null);
      });
    return () => controller.abort();
  }, []);

  async function signOut() {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) return;
      setCurrentUser(null);
      navigate('/login');
    } catch {
      // Keep the current account indicator if the server could not revoke the session.
    }
  }

  const userMenuItems = currentUser
    ? [
        { label: currentUser.displayName || currentUser.email, icon: <User className="h-4 w-4" />, onClick: () => navigate('/settings') },
        { label: 'Settings', onClick: () => navigate('/settings') },
        { label: 'Sign out', destructive: true, onClick: () => void signOut() },
      ]
    : [
        { label: 'Sign in', icon: <User className="h-4 w-4" />, onClick: () => navigate('/login') },
        { label: 'Create account', onClick: () => navigate('/register') },
      ];
  const avatarFallback = currentUser
    ? (currentUser.displayName || currentUser.email).slice(0, 2).toUpperCase()
    : 'FP';

  return (
    <header className="sticky top-0 z-30 flex h-[76px] w-full items-center justify-between border-b border-border/80 bg-white/85 px-4 backdrop-blur-xl sm:px-7">
      <div className="flex items-center space-x-3">
        <button
          onClick={onMobileMenuOpen}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">{pageTitle}</h1>
      </div>

      <div className="flex items-center space-x-3">
        <button type="button" onClick={() => navigate('/workflows')} className="hidden w-48 items-center gap-2 rounded-xl border border-border/80 bg-slate-50/80 px-3 py-2 text-left text-xs text-muted-foreground transition-all hover:border-violet-200 hover:bg-white hover:text-foreground sm:flex lg:w-64" aria-label="Browse and search workflows">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Find a workflow</span>
          <kbd className="ml-auto rounded-md border border-border bg-white px-1.5 py-0.5 font-mono text-[9px]">⌘ K</kbd>
        </button>
        <Button size="sm" className="hidden h-9 gap-2 rounded-xl px-3 shadow-sm shadow-primary/15 sm:inline-flex" onClick={() => navigate('/workflows')}>
          <Plus className="h-3.5 w-3.5" /> New workflow
        </Button>
        <Dropdown
          trigger={
            <button type="button" className="flex items-center space-x-2 rounded-full p-0.5 transition-colors hover:bg-accent" aria-label="Account menu">
              <Avatar fallback={avatarFallback} />
            </button>
          }
          items={userMenuItems}
        />
      </div>
    </header>
  );
}
