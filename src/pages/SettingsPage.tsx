import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, Shield, Key, Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
}

type AccountState =
  | { kind: "loading" }
  | { kind: "signed-in"; user: SessionUser }
  | { kind: "signed-out" }
  | { kind: "error" };

export function SettingsPage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountState>({ kind: "loading" });
  const [signOutError, setSignOutError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) return setAccount({ kind: "signed-out" });
        if (!response.ok) return setAccount({ kind: "error" });
        const result = (await response.json()) as { user: SessionUser | null };
        setAccount(result.user ? { kind: "signed-in", user: result.user } : { kind: "signed-out" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setAccount({ kind: "error" });
      });
    return () => controller.abort();
  }, []);

  async function signOut() {
    setSignOutError(false);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("logout failed");
      navigate("/login");
    } catch {
      setSignOutError(true);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground">Your account, credential security and notifications.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Account
          </CardTitle>
          <CardDescription>The account you are signed in with.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {account.kind === "loading" && <p className="text-sm text-muted-foreground">Loading your account…</p>}
          {account.kind === "error" && <p className="text-sm text-muted-foreground" role="status">Your account details could not be loaded. Refresh to try again.</p>}
          {account.kind === "signed-out" && (
            <p className="text-sm text-muted-foreground">
              You are not signed in. <Link to="/login" className="font-semibold text-primary underline-offset-2 hover:underline">Sign in</Link>
            </p>
          )}
          {account.kind === "signed-in" && (
            <>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-xs font-medium text-muted-foreground">Display name</dt>
                  <dd className="text-sm text-foreground">{account.user.displayName || "Not set"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-medium text-muted-foreground">Email</dt>
                  <dd className="break-all text-sm text-foreground">{account.user.email}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">Changing your name, email or password isn't available yet.</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="outline" className="gap-2" onClick={() => void signOut()}>
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </Button>
                {signOutError && <span className="text-xs text-destructive" role="alert">Sign-out failed. Try again.</span>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Security
          </CardTitle>
          <CardDescription>Provider keys are decrypted only on the server.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-2">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Key className="h-4 w-4 text-primary" />
              Encrypted credential vault
            </div>
            <p>
              Add Gemini and OpenAI keys in <Link to="/ai-providers" className="font-semibold text-primary underline-offset-2 hover:underline">AI Providers</Link>. Keys are encrypted before they are stored and are never shown again after saving.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Notifications
          </CardTitle>
          <CardDescription>How FlowPilot tells you about your workflows.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Add a Send Email step to a workflow to get a notice at your account email. Automatic alerts for failed runs aren't available yet; check <Link to="/executions" className="font-semibold text-primary underline-offset-2 hover:underline">Run history</Link> for failures.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
