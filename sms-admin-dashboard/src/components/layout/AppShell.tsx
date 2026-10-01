import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Activity, Cloud, Settings } from "lucide-react";

interface NavItem {
  to: string;
  icon: ReactNode;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/triggers", icon: <Settings size={20} />, label: "Trigger Config" },
  { to: "/monitor", icon: <Activity size={20} />, label: "Campaign Monitor" },
  { to: "/providers", icon: <Cloud size={20} />, label: "Provider Settings" },
];

interface AppShellProps {
  children: ReactNode;
  breadcrumb?: ReactNode;
}

export function AppShell({ children, breadcrumb }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-border bg-background md:w-56">
        <div className="flex h-14 items-center px-4 font-semibold text-foreground md:px-6">
          <span className="hidden md:inline">SMS Admin</span>
          <span className="md:hidden">SA</span>
        </div>
        <nav className="flex flex-col gap-1 p-2">
          {NAV_ITEMS.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                ].join(" ")
              }
            >
              <span className="shrink-0">{icon}</span>
              <span className="hidden md:inline">{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-14 items-center border-b border-border bg-background px-4 md:px-6">
          {breadcrumb}
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-muted/30 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
