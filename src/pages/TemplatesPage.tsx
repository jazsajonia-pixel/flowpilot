import { Layers, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const templateCategories = [
  {
    title: "AI Lead Classification & Email Notification",
    description: "Webhook → Gemini AI → Condition → Send Email & Database Record",
    badge: "Popular",
  },
  {
    title: "Automated Content Summarization",
    description: "Schedule Trigger → Fetch RSS / HTTP → AI Summarization → Webhook Action",
    badge: "AI Powered",
  },
  {
    title: "Customer Support Ticket Routing",
    description: "Incoming Webhook → AI Extraction → Condition / Switch → Database Update",
    badge: "Automation",
  },
];

export function TemplatesPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Workflow Templates</h2>
        <p className="text-sm text-muted-foreground">
          Jumpstart your automation with pre-built workflow templates powered by AI.
        </p>
      </div>

      {/* Templates Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {templateCategories.map((template, i) => (
          <Card key={i} className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3 text-primary" />
                  {template.badge}
                </Badge>
              </div>
              <CardTitle className="text-base">{template.title}</CardTitle>
              <CardDescription className="text-xs">{template.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button variant="outline" size="sm" className="w-full gap-1 text-xs">
                Use Template
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Template Gallery Empty / Catalog State */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Community & Enterprise Templates</CardTitle>
          <CardDescription>Browse available pre-configured automation patterns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
            <Layers className="h-8 w-8 text-muted-foreground/60 mb-2" />
            <p className="text-sm font-medium text-foreground">More templates coming soon</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Additional industry-specific AI workflow templates will be added in upcoming updates.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
