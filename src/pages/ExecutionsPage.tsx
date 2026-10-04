import { Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function ExecutionsPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Executions History</h2>
          <p className="text-sm text-muted-foreground">
            Inspect real-time execution logs, node step outputs, and system errors.
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh History
        </Button>
      </div>

      {/* Executions Table Empty State */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Execution Logs</CardTitle>
          <CardDescription>Historical record of triggered workflow executions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
              <Activity className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No executions logged</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Trigger a workflow manually, via webhook, or on schedule to see live step logs and outputs.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
