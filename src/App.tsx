import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { AppShell } from "@/components/layout/AppShell";
import { AuthPage } from "@/pages/AuthPage";
import {
  DashboardPage,
  WorkflowsPage,
  TemplatesPage,
  ExecutionsPage,
  AIProvidersPage,
  IntegrationsPage,
  SettingsPage,
  WorkflowEditorPage,
} from "@/pages";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />
          <Route path="/workflow-preview" element={<WorkflowEditorPage demo />} />
          <Route path="/workflows/:workflowId/edit" element={<WorkflowEditorPage />} />
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="workflows" element={<WorkflowsPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="executions" element={<ExecutionsPage />} />
            <Route path="ai-providers" element={<AIProvidersPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
