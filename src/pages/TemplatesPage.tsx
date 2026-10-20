import { useState } from "react";
import { ArrowRight, Layers, LoaderCircle, Sparkles, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createWorkflow, saveWorkflowGraph, updateWorkflow, WorkflowApiError, type WorkflowGraph } from "@/lib/workflow-api";
import type { NodeCategory, NodeType } from "@/types/workflow";

type TemplateNode = {
  category: NodeCategory;
  type: NodeType;
  label: string;
  config?: Record<string, unknown>;
};

type WorkflowTemplate = {
  id: string;
  title: string;
  description: string;
  badge: string;
  nodes: TemplateNode[];
};

const templates: WorkflowTemplate[] = [
  {
    id: "content-creation-review",
    title: "AI Content Creation & Review",
    description: "Start with a topic, generate a draft, review it with AI, check approval, revise when needed, and prepare the final output.",
    badge: "New · AI Powered",
    nodes: [
      { category: "manual_trigger", type: "trigger", label: "Content request" },
      { category: "ai_generation", type: "ai", label: "Generate content" },
      { category: "ai_classification", type: "ai", label: "Review content" },
      { category: "condition", type: "logic", label: "Review passed?" },
      { category: "ai_generation", type: "ai", label: "Revise content" },
      { category: "create_db_record", type: "action", label: "Save final content", config: { collection: "content_drafts" } },
    ],
  },
  {
    id: "content-summarization",
    title: "Automated Content Summarization",
    description: "Receive content, summarize it with AI, then send the summary to a configured webhook.",
    badge: "AI Powered",
    nodes: [
      { category: "manual_trigger", type: "trigger", label: "New content" },
      { category: "ai_summarization", type: "ai", label: "Summarize content" },
      { category: "webhook_action", type: "action", label: "Send summary" },
    ],
  },
  {
    id: "feedback-triage",
    title: "Customer Feedback Triage",
    description: "Classify incoming feedback, check whether it needs urgent attention, and prepare an email notification.",
    badge: "Popular",
    nodes: [
      { category: "manual_trigger", type: "trigger", label: "New feedback" },
      { category: "ai_classification", type: "ai", label: "Classify feedback" },
      { category: "condition", type: "logic", label: "Urgent?" },
      { category: "send_email", type: "action", label: "Notify account owner" },
    ],
  },
  {
    id: "lead-classification",
    title: "AI Lead Classification",
    description: "Classify a lead, check its status, and save a record to your private FlowPilot data collection.",
    badge: "Automation",
    nodes: [
      { category: "manual_trigger", type: "trigger", label: "New lead" },
      { category: "ai_classification", type: "ai", label: "Classify lead" },
      { category: "condition", type: "logic", label: "Qualified?" },
      { category: "create_db_record", type: "action", label: "Save lead", config: { collection: "leads", data: "{\"status\": \"new\", \"source\": \"workflow-template\"}" } },
    ],
  },
];

function buildGraph(template: WorkflowTemplate): WorkflowGraph {
  const nodes = template.nodes.map((node, index) => ({
    id: crypto.randomUUID(),
    type: node.type,
    category: node.category,
    label: node.label,
    position: { x: 60 + index * 230, y: 180 },
    config: node.config ?? {},
  }));
  const connections = nodes.slice(1).map((node, index) => ({
    id: crypto.randomUUID(),
    sourceNodeId: nodes[index].id,
    sourceHandle: "out",
    targetNodeId: node.id,
    targetHandle: "in",
  }));
  return { nodes, connections };
}

export function TemplatesPage() {
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function useTemplate(template: WorkflowTemplate) {
    setCreatingId(template.id);
    setError(null);
    setNeedsLogin(false);
    let createdId: string | null = null;
    try {
      const workflow = await createWorkflow(template.title);
      createdId = workflow.id;
      await updateWorkflow(workflow.id, { description: template.description });
      await saveWorkflowGraph(workflow.id, buildGraph(template));
      window.location.assign(`/workflows/${encodeURIComponent(workflow.id)}/edit`);
    } catch (reason) {
      setNeedsLogin(reason instanceof WorkflowApiError && reason.status === 401);
      setError(
        createdId
          ? `The workflow was created, but its template graph could not be saved. Open it from Workflows and try again. ${reason instanceof Error ? reason.message : ""}`
          : reason instanceof Error
            ? reason.message
            : "Could not create this workflow from the template.",
      );
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Workflow Templates</h2>
        <p className="text-sm text-muted-foreground">
          Create a workflow from a ready-made canvas, then customize its steps and settings.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>{needsLogin ? "Sign in to create a workflow from a template." : error}</span>
          {needsLogin && <a className="font-semibold underline" href="/login">Sign in</a>}
        </div>
      )}

      <div className="flowpilot-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const isCreating = creatingId === template.id;
          const isBusy = creatingId !== null;
          return (
            <Card key={template.id} className="flowpilot-interactive-card flex min-w-0 flex-col overflow-hidden">
              <CardHeader className="flex-1">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="gap-1 whitespace-normal">
                    <Sparkles className="flowpilot-icon-hover h-3 w-3 shrink-0 text-primary" />
                    {template.badge}
                  </Badge>
                  <span className="shrink-0 text-xs text-muted-foreground">{template.nodes.length} steps</span>
                </div>
                <CardTitle className="text-base">{template.title}</CardTitle>
                <CardDescription className="text-xs leading-5">{template.description}</CardDescription>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {template.nodes.map((node, index) => (
                    <span key={`${node.category}-${index}`} className="rounded-md border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
                      {node.label}
                    </span>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Button type="button" variant={template.id === "content-creation-review" ? "default" : "outline"} size="sm" className="w-full gap-2" disabled={isBusy} onClick={() => void useTemplate(template)}>
                  {isCreating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                  {isCreating ? "Creating workflow…" : "Use template"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Workflow className="h-4 w-4" /> Before you run a template</CardTitle>
          <CardDescription>Templates create editable workflow canvases, not pre-authorized external services.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p className="flex gap-2"><Layers className="mt-0.5 h-4 w-4 shrink-0" /> Select a template to create and open a separate workflow in your account.</p>
          <p>Review the generated graph, connect any branches you need, and configure AI providers, conditions, email actions, database fields, or webhook URLs before running.</p>
          <p>Some templates are starting points: the steps are prefilled, but settings and branching may need adjustment for your use case.</p>
        </CardContent>
      </Card>
    </div>
  );
}
