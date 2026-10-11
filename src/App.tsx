import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { AppShell } from "@/components/layout/AppShell";
import { AuthPage } from "@/pages/AuthPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { WorkflowsPage } from "@/pages/WorkflowsPage";
import { TemplatesPage } from "@/pages/TemplatesPage";
import { ExecutionsPage } from "@/pages/ExecutionsPage";
import { AIProvidersPage } from "@/pages/AIProvidersPage";
import { IntegrationsPage } from "@/pages/IntegrationsPage";
import { DataPage } from "@/pages/DataPage";
import { ExecutionDetailPage } from "@/pages/ExecutionDetailPage";
import { SettingsPage } from "@/pages/SettingsPage";

const WorkflowEditorPage = lazy(() => import("@/pages/WorkflowEditorPage").then((module) => ({ default: module.WorkflowEditorPage })));

function WorkflowEditorRoute({ demo = false }: { demo?: boolean }) {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading workflow canvas…</main>}>
      <WorkflowEditorPage demo={demo} />
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />
          <Route path="/workflow-preview" element={<WorkflowEditorRoute demo />} />
          <Route path="/workflows/:workflowId/edit" element={<WorkflowEditorRoute />} />
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="workflows" element={<WorkflowsPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="executions" element={<ExecutionsPage />} />
            <Route path="executions/:executionId" element={<ExecutionDetailPage />} />
            <Route path="ai-providers" element={<AIProvidersPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="data" element={<DataPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
