import { Bot, Key, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function AIProvidersPage() {
  const providers = [
    {
      name: "FlowPilot Gemini (Built-in)",
      type: "Server-managed provider",
      description: "Uses the server GEMINI_API_KEY environment variable; no API key is entered in the browser.",
      status: "Environment-managed",
      isDefault: true,
    },
    {
      name: "Google Gemini (BYO Key)",
      type: "Bring Your Own Key",
      description: "User-managed Gemini credentials and model selection are planned for Phase 6.",
      status: "Planned",
      isDefault: false,
    },
    {
      name: "OpenAI (BYO Key)",
      type: "Bring Your Own Key",
      description: "User-managed OpenAI credentials and model selection are planned for Phase 6.",
      status: "Planned",
      isDefault: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">AI Providers</h2>
        <p className="text-sm text-muted-foreground">
          Review the server-managed default provider and planned user-managed integrations.
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
                disabled
              >
                <Key className="h-3.5 w-3.5" />
                {provider.isDefault ? "Server-managed" : "Planned for Phase 6"}
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
              • <strong>Built-in provider:</strong> Gemini reads <code>GEMINI_API_KEY</code> only from the server environment. Configure it in the server/deployment environment; never add it to workflow settings or browser code.
            </p>
            <p>
              • <strong>BYO credentials:</strong> Encrypted user-key storage, OpenAI support, and model selection are Phase 6 work. AI prompts and generated responses are omitted from execution logs.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
