import { Menu, Bell, Search, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";

interface HeaderProps {
  onMobileMenuOpen: () => void;
  pageTitle?: string;
}

export function Header({ onMobileMenuOpen, pageTitle = "Dashboard" }: HeaderProps) {
  const userMenuItems = [
    { label: "Profile", icon: <User className="h-4 w-4" /> },
    { label: "Settings" },
    { label: "Sign out", destructive: true },
  ];

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur sm:px-6">
      {/* Left section: Mobile toggle & Title */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onMobileMenuOpen}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {pageTitle}
        </h1>
      </div>

      {/* Right section: Search placeholder, Notifications & User Dropdown */}
      <div className="flex items-center space-x-3">
        {/* Search Bar Placeholder */}
        <div className="hidden sm:flex items-center space-x-2 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground w-48 lg:w-64">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Search workflows...</span>
          <kbd className="ml-auto pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
            ⌘K
          </kbd>
        </div>

        {/* Notifications Button Placeholder */}
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
          <span className="sr-only">Notifications</span>
        </Button>

        {/* User Profile Avatar Dropdown */}
        <Dropdown
          trigger={
            <div className="flex items-center space-x-2 rounded-full p-0.5 hover:bg-accent transition-colors">
              <Avatar fallback="FP" />
            </div>
          }
          items={userMenuItems}
        />
      </div>
    </header>
  );
}
