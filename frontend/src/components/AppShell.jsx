import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import SearchDialog from "@/components/SearchDialog";
import {
  Sun, Moon, Home, BookOpen, NotebookPen, ListTodo,
  Timer, BarChart3, Settings, LogOut, Menu, X, GraduationCap,
  Calendar, Sparkles, Search as SearchIcon,
} from "lucide-react";

const NAV = [
  { to: "/today", label: "Today", icon: Home, testid: "nav-today" },
  { to: "/subjects", label: "Subjects", icon: BookOpen, testid: "nav-subjects" },
  { to: "/timetable", label: "Timetable", icon: Calendar, testid: "nav-timetable" },
  { to: "/notebooks", label: "Notebooks", icon: NotebookPen, testid: "nav-notebooks" },
  { to: "/tasks", label: "Tasks", icon: ListTodo, testid: "nav-tasks" },
  { to: "/reviews", label: "Reviews", icon: Sparkles, testid: "nav-reviews" },
  { to: "/timer", label: "Focus", icon: Timer, testid: "nav-timer" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, testid: "nav-analytics" },
  { to: "/settings", label: "Settings", icon: Settings, testid: "nav-settings" },
];

function SidebarBody({ onNavigate, onOpenSearch }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div>
            <div className="font-serif text-lg leading-none tracking-tight">Syllo</div>
            <div className="text-xs text-muted-foreground mt-0.5">Your study space</div>
          </div>
        </div>
      </div>
      <div className="px-3 pb-3">
        <button
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground bg-accent/40 hover:bg-accent transition-colors"
          onClick={() => { onOpenSearch?.(); onNavigate?.(); }}
          data-testid="sidebar-search-btn"
        >
          <SearchIcon className="w-4 h-4" />
          <span>Search</span>
          <kbd className="ml-auto text-[10px] font-mono border border-border rounded px-1.5 py-0.5">⌘K</kbd>
        </button>
      </div>
      <nav className="px-3 flex-1 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon, testid }) => (
          <NavLink
            key={to}
            to={to}
            data-testid={testid}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-border space-y-2">
        <button
          className="btn btn-ghost w-full justify-start"
          onClick={toggle}
          data-testid="theme-toggle-button"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>
        <div className="flex items-center gap-2 px-2 py-2 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-secondary grid place-items-center text-xs font-medium">
            {(user?.name || "?")[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </div>
          <button
            className="btn btn-ghost !p-2"
            title="Sign out"
            data-testid="sign-out-button"
            onClick={async () => { await logout(); nav("/login"); }}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 shrink-0 border-r border-border bg-card/50">
        <div className="w-full sticky top-0 h-screen">
          <SidebarBody onOpenSearch={() => setSearchOpen(true)} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 h-14 border-b border-border bg-background/85 backdrop-blur flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <GraduationCap className="w-3.5 h-3.5" />
          </div>
          <div className="font-serif text-base">Syllo</div>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost !p-2" onClick={() => setSearchOpen(true)} data-testid="mobile-search-btn" aria-label="Search">
            <SearchIcon className="w-5 h-5" />
          </button>
          <button
            className="btn btn-ghost !p-2"
            onClick={() => setOpen(true)}
            data-testid="mobile-nav-open"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-card border-r border-border h-full">
            <button
              className="btn btn-ghost !p-2 absolute right-2 top-2"
              onClick={() => setOpen(false)}
              data-testid="mobile-nav-close"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarBody onNavigate={() => setOpen(false)} onOpenSearch={() => setSearchOpen(true)} />
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 fade-in">
          {children}
        </div>
      </main>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
