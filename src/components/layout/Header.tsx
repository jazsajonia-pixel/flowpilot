import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell, Search, User } from 'lucide-react';
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
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur sm:px-6">
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
        <div className="hidden w-48 items-center space-x-2 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground sm:flex lg:w-64">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Search workflows...</span>
          <kbd className="pointer-events-none ml-auto inline-flex h-4 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
            ⌘K
          </kbd>
        </div>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
          <span className="sr-only">Notifications</span>
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
