import * as React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { PageContainer } from "./PageContainer";

const routeTitleMap: Record<string, string> = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/workflows": "Workflows",
  "/templates": "Workflow Templates",
  "/executions": "Executions History",
  "/ai-providers": "AI Providers",
  "/integrations": "Integrations",
  "/settings": "Settings",
};

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const location = useLocation();

  const currentTitle = routeTitleMap[location.pathname] || "FlowPilot AI";

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Layout Area */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          onMobileMenuOpen={() => setSidebarOpen(true)}
          pageTitle={currentTitle}
        />
        <main className="flex-1 overflow-y-auto bg-background/70">
          <PageContainer>
            <div key={location.pathname} className="flowpilot-page-enter">
              <Outlet />
            </div>
          </PageContainer>
        </main>
      </div>
    </div>
  );
}
