import { User, Shield, Key, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage application preferences, profile details, and security configurations.
        </p>
      </div>

      {/* Account Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Account Profile
          </CardTitle>
          <CardDescription>Update your account details and display preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input id="name" defaultValue="FlowPilot User" placeholder="Your name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" defaultValue="user@flowpilot.ai" placeholder="Your email" />
            </div>
          </div>
          <Button size="sm">Save Profile</Button>
        </CardContent>
      </Card>

      {/* Security & API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Security & Authentication
          </CardTitle>
          <CardDescription>Provider credentials are managed separately and decrypted only by server functions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-2">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Key className="h-4 w-4 text-primary" />
              Encrypted Credential Vault
            </div>
            <p>
              Gemini and OpenAI keys can be managed from AI Providers. Keys are encrypted before database storage, are never returned after saving, and require the server-only <code>CREDENTIAL_ENCRYPTION_KEY</code> to be configured.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* System Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Notification Preferences
          </CardTitle>
          <CardDescription>Configure alerts for workflow execution failures</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Notification channels (Email, Webhook alerts) will be configurable in Phase 7.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
