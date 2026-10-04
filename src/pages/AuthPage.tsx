import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AuthResponse {
  error?: string;
  user?: { id: string; email: string; displayName: string | null };
}

export function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const isRegistration = location.pathname === '/register';
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const passwordCharacters = Array.from(password).length;
    if (passwordCharacters < 15 || passwordCharacters > 128) {
      setError('Password must contain 15 to 128 characters.');
      return;
    }
    setIsSubmitting(true);

    const payload = isRegistration
      ? { email, password, ...(displayName.trim() ? { displayName: displayName.trim() } : {}) }
      : { email, password };

    try {
      const response = await fetch(`/api/auth/${isRegistration ? 'register' : 'login'}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as AuthResponse;
      if (!response.ok) {
        setError(result.error ?? 'Authentication could not be completed. Please try again.');
        return;
      }
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Could not reach the authentication service. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <Link to="/dashboard" className="text-sm font-semibold tracking-wide text-primary">
            FLOWPILOT AI
          </Link>
          <CardTitle className="text-2xl">{isRegistration ? 'Create your account' : 'Welcome back'}</CardTitle>
          <CardDescription>
            {isRegistration
              ? 'Create an account to start using FlowPilot.'
              : 'Sign in with your FlowPilot email and password.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {isRegistration && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Display name <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="displayName"
                  autoComplete="name"
                  maxLength={120}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                maxLength={320}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isRegistration ? 'new-password' : 'current-password'}
                minLength={15}
                maxLength={256}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {isRegistration && (
                <p className="text-xs text-muted-foreground">Use at least 15 characters; long passphrases are accepted.</p>
              )}
            </div>
            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Please wait…' : isRegistration ? 'Create account' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            {isRegistration ? 'Already have an account?' : 'New to FlowPilot?'}{' '}
            <Link
              className="font-medium text-primary underline-offset-4 hover:underline"
              to={isRegistration ? '/login' : '/register'}
            >
              {isRegistration ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
