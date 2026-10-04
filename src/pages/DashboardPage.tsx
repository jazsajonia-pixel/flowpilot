import { Link } from "react-router-dom";
import { Plus, Workflow, Activity, CheckCircle, Bot, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function DashboardPage() {
  const stats = [
    { title: "Total Workflows", value: "0", icon: Workflow, change: "No workflows created" },
    { title: "Total Executions", value: "0", icon: Activity, change: "No executions yet" },
    { title: "Success Rate", value: "—", icon: CheckCircle, change: "Awaiting execution data" },
    { title: "AI Token Usage", value: "—", icon: Bot, change: "No active AI calls" },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Welcome to FlowPilot AI
            <Sparkles className="h-5 w-5 text-primary" />
          </h2>
          <p className="text-sm text-muted-foreground">
            Visually automate your workflows with built-in AI processing, triggers, and integrations.
          </p>
        </div>
        <Link to="/workflows">
          <Button className="shrink-0 gap-2">
            <Plus className="h-4 w-4" />
            Create Workflow
          </Button>
        </Link>
      </div>

      {/* Overview Statistics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Columns: Recent Workflows & Executions Empty States */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Workflows Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Workflows</CardTitle>
            <CardDescription>Your latest automated workflow configurations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
              <Workflow className="h-8 w-8 text-muted-foreground/60 mb-2" />
              <p className="text-sm font-medium text-foreground">No workflows created yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Build your first AI-powered workflow graph to automate repetitive tasks.
              </p>
              <Link to="/workflows" className="mt-4">
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  Build Workflow
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Recent Executions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Executions</CardTitle>
            <CardDescription>Real-time execution logs and status history</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
              <Activity className="h-8 w-8 text-muted-foreground/60 mb-2" />
              <p className="text-sm font-medium text-foreground">No execution history</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Executions will appear here when triggered manually, via webhooks, or on schedule.
              </p>
              <Link to="/executions" className="mt-4">
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  View Executions
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Start Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Start Guide</CardTitle>
          <CardDescription>Learn how FlowPilot AI connects intelligence to automation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary font-bold text-xs">
                1
              </div>
              <h4 className="text-sm font-semibold text-foreground">Configure AI Provider</h4>
              <p className="text-xs text-muted-foreground">
                Set up Google Gemini or bring your own AI API keys under AI Providers.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary font-bold text-xs">
                2
              </div>
              <h4 className="text-sm font-semibold text-foreground">Build Workflow Graph</h4>
              <p className="text-xs text-muted-foreground">
                Connect Webhooks, Gemini AI processing, conditions, and action nodes visually.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary font-bold text-xs">
                3
              </div>
              <h4 className="text-sm font-semibold text-foreground">Monitor Executions</h4>
              <p className="text-xs text-muted-foreground">
                Track real-time node outputs, conditions evaluation, and execution step logs.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
