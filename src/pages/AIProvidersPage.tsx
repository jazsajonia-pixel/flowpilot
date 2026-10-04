import { Bot, Key, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function AIProvidersPage() {
  const providers = [
    {
      name: "FlowPilot Gemini (Built-in)",
      type: "Default Platform Provider",
      description: "Default built-in Google Gemini AI model provided out of the box.",
      status: "Active",
      isDefault: true,
    },
    {
      name: "Google Gemini (BYO Key)",
      type: "Bring Your Own Key",
      description: "Connect your personal or enterprise Google Gemini API key.",
      status: "Not Configured",
      isDefault: false,
    },
    {
      name: "OpenAI (BYO Key)",
      type: "Bring Your Own Key",
      description: "Connect your OpenAI API key for GPT-4o and GPT-3.5 models.",
      status: "Not Configured",
      isDefault: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">AI Providers</h2>
        <p className="text-sm text-muted-foreground">
          Manage platform default AI models and bring-your-own custom API credentials.
        </p>
      </div>

      {/* Providers Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {providers.map((provider, i) => (
          <Card key={i} className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <Badge variant={provider.isDefault ? "success" : "outline"} className="gap-1">
                  {provider.isDefault && <CheckCircle2 className="h-3 w-3" />}
                  {provider.status}
                </Badge>
                {provider.isDefault && (
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="h-3 w-3 text-primary" />
                    Built-in
                  </Badge>
                )}
              </div>
              <CardTitle className="text-base">{provider.name}</CardTitle>
              <CardDescription className="text-xs">{provider.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button
                variant={provider.isDefault ? "secondary" : "outline"}
                size="sm"
                className="w-full gap-2 text-xs"
                disabled={provider.isDefault}
              >
                <Key className="h-3.5 w-3.5" />
                {provider.isDefault ? "Default Active" : "Configure API Key"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Security Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI Provider Abstraction Layer
          </CardTitle>
          <CardDescription>
            FlowPilot AI decouples workflow nodes from specific AI vendors.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-2">
            <p>
              • <strong>Credential Vault:</strong> Encrypted API-key storage and server-side execution are planned for Phase 6 and are not implemented yet. Do not enter real keys in this prototype.
            </p>
            <p>
              • <strong>Zero Client Exposure:</strong> The future credential vault will keep secrets out of the frontend browser environment.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
