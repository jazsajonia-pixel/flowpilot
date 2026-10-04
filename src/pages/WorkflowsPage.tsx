import { Workflow, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function WorkflowsPage() {
  return (
    <div className="space-y-6">
      {/* Page Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Workflows</h2>
          <p className="text-sm text-muted-foreground">
            Create, manage, and monitor your visual automation graph workflows.
          </p>
        </div>
        <Button className="shrink-0 gap-2">
          <Plus className="h-4 w-4" />
          Create Workflow
        </Button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search workflows..." className="pl-9" />
        </div>
      </div>

      {/* Empty State Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Workflows</CardTitle>
          <CardDescription>Your saved workflow canvas definitions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
              <Workflow className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No workflows yet</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Create your first workflow to start automating tasks with triggers, AI nodes, logic, and actions.
            </p>
            <Button className="mt-5 gap-2" size="sm">
              <Plus className="h-4 w-4" />
              Create your first workflow
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
