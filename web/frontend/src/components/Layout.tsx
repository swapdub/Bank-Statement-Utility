import { NavLink, Outlet } from "react-router-dom";
import {
  Upload,
  TableProperties,
  Tags,
  BarChart3,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const navItems = [
  { to: "/", icon: Upload, label: "Upload" },
  { to: "/transactions", icon: TableProperties, label: "Transactions" },
  { to: "/categorize", icon: Tags, label: "Categorize" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
];

export default function Layout() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Top nav */}
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
            <span className="text-lg font-semibold tracking-tight">
              💰 Expense Analyzer
            </span>
            <nav className="flex items-center gap-1">
              {navItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        {/* Main content */}
        <main className="mx-auto max-w-7xl px-4 py-6">
          <Outlet />
        </main>

        <Toaster richColors position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}
