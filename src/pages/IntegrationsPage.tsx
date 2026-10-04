import { Blocks, Webhook, Mail, Database, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function IntegrationsPage() {
  const integrations = [
    { name: "Webhooks", category: "Triggers & Actions", icon: Webhook, description: "Receive or send HTTP webhook payloads." },
    { name: "Email Services", category: "Actions", icon: Mail, description: "Send automated transactional emails." },
    { name: "PostgreSQL", category: "Database", icon: Database, description: "Read and write records to external database tables." },
    { name: "Custom REST APIs", category: "Actions", icon: Globe, description: "Call any external REST API endpoint with authentication." },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Connect external triggers, messaging services, databases, and APIs.
        </p>
      </div>

      {/* Integrations Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {integrations.map((item, i) => (
          <Card key={i} className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <item.icon className="h-5 w-5" />
              </div>
              <Badge variant="outline" className="w-fit text-[10px] mb-1">
                {item.category}
              </Badge>
              <CardTitle className="text-base">{item.name}</CardTitle>
              <CardDescription className="text-xs">{item.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button variant="outline" size="sm" className="w-full text-xs">
                Connect
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Custom Webhook Notice */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Blocks className="h-5 w-5 text-primary" />
            Integrations Hub Architecture
          </CardTitle>
          <CardDescription>
            Seamlessly route data in and out of FlowPilot AI workflows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Full OAuth connection flows, API credential vaults, and webhook receivers will be active in upcoming development phases.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
