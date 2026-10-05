import React, { lazy, Suspense, useState, useEffect, useRef } from "react";
import { NavLink, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useUsage } from "@/lib/usage";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Sun, Moon, Home, BookOpen, NotebookPen, ListTodo,
  Timer, BarChart3, Settings, LogOut, Menu, GraduationCap,
  Calendar, Sparkles, Search as SearchIcon, ShieldCheck, Zap, Users,
} from "lucide-react";

const SearchDialog = lazy(() => import("@/components/SearchDialog"));
const AiCompanion = lazy(() => import("@/components/AiCompanion"));

const NAV = [
  { to: "/today", label: "Today", icon: Home, testid: "nav-today" },
  { to: "/subjects", label: "Subjects", icon: BookOpen, testid: "nav-subjects" },
  { to: "/planner", label: "Planner", icon: Calendar, testid: "nav-timetable" },
  { to: "/notebooks", label: "Notebooks", icon: NotebookPen, testid: "nav-notebooks" },
  { to: "/tasks", label: "Tasks", icon: ListTodo, testid: "nav-tasks" },
  { to: "/reviews", label: "Reviews", icon: Sparkles, testid: "nav-reviews" },
  { to: "/timer", label: "Focus", icon: Timer, testid: "nav-timer" },
  { to: "/analytics", label: "Progress", icon: BarChart3, testid: "nav-analytics" },
  { to: "/settings", label: "Settings", icon: Settings, testid: "nav-settings" },
  { to: "/circles", label: "Circles", icon: Users, testid: "nav-circles" },
];

function SidebarBody({ onNavigate, onOpenSearch, onOpenAi }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { usage } = useUsage();
  const nav = useNavigate();
  const isAdmin = user?.role === "admin";
  const planName = usage?.plan?.name || "Freshman";
  const credits = usage?.credits_remaining ?? 0;
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div>
            <div className="font-serif text-xl leading-none tracking-tight">syllo</div>
            <div className="text-xs text-muted-foreground mt-0.5">Your study space</div>
          </div>
        </div>
      </div>
      <div className="px-3 pb-2 space-y-2 shrink-0">
        <button
          className="btn btn-outline w-full justify-start text-muted-foreground"
          onClick={() => { onOpenSearch?.(); onNavigate?.(); }}
          data-testid="sidebar-search-btn"
        >
          <SearchIcon className="w-4 h-4" />
          <span>Search</span>
          <kbd className="ml-auto text-xs font-mono border border-border rounded px-1.5 py-0.5">{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K"}</kbd>
        </button>
        <button
          className="btn btn-ghost w-full justify-start"
          onClick={() => { onOpenAi?.(); onNavigate?.(); }}
          data-testid="sidebar-ai-btn"
        >
          <Sparkles className="w-4 h-4" />
          <span>Study Companion</span>
        </button>
      </div>
      <nav aria-label="Workspace" className="px-3 flex-1 min-h-[12rem] overflow-y-auto space-y-0.5">
        {[...NAV.filter(item => ["/today", "/subjects", "/planner", "/timer", "/analytics"].includes(item.to)), ...NAV.filter(item => !["/today", "/subjects", "/planner", "/timer", "/analytics"].includes(item.to))].map(({ to, label, icon: Icon, testid }, index) => (
          <NavLink
            key={to}
            to={to}
            data-testid={testid}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${index === 5 ? "!mt-5 border-t border-border pt-3" : ""} ${
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
        {isAdmin && (
          <NavLink
            to="/admin"
            data-testid="nav-admin"
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors mt-3 ${
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
              }`
            }
          >
            <ShieldCheck className="w-4 h-4" />
            Admin
          </NavLink>
        )}
      </nav>
      <div className="px-3 py-3 shrink-0">
        <Link to="/upgrade" className="block px-3 py-3 rounded-lg border border-border hover:bg-accent/40 transition-colors" data-testid="sidebar-plan-card" onClick={onNavigate}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Plan · {planName}</span>
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="text-sm"><span className="font-mono">{credits}</span> <span className="text-muted-foreground">helps available</span></div>
        </Link>
      </div>
      <div className="p-3 border-t border-border space-y-2 shrink-0">
        <div className="flex items-center gap-3 px-2 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground" onClick={onNavigate}>Privacy</Link>
          <Link to="/terms" className="hover:text-foreground" onClick={onNavigate}>Terms</Link>
        </div>
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
            className="btn btn-ghost btn-icon"
            aria-label="Sign out"
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
  const { pathname } = useLocation();
  const [pendingCircle] = useState(() => {
    try {
      const invite = JSON.parse(sessionStorage.getItem("syllo.circleInvite"));
      return /^[A-Za-z0-9_-]{30,64}$/.test(invite?.token) ? invite : null;
    } catch { return null; }
  });
  const [inviteDismissed, setInviteDismissed] = useState(() => {
    try { return sessionStorage.getItem("syllo.circleInviteDismissed") === pendingCircle?.token; }
    catch { return false; }
  });
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const mobileMenu = useRef(null);
  // FocusScope dispatches close autofocus after unmount; read the current handoff,
  // not the state captured by the drawer's previous render.
  const overlayOpen = useRef(false);
  overlayOpen.current = searchOpen || aiOpen;

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
    <Sheet open={open} onOpenChange={setOpen}><div className="min-h-screen flex bg-background text-foreground">
      <a className="skip-link" href="#main-content">Skip to content</a>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 border-r border-border bg-card">
        <div className="w-full sticky top-0 h-screen overflow-y-auto">
          <SidebarBody onOpenSearch={() => setSearchOpen(true)} onOpenAi={() => setAiOpen(true)} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 h-16 border-b border-border bg-background flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <GraduationCap className="w-3.5 h-3.5" />
          </div>
          <div className="font-serif text-lg">syllo</div>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost btn-icon" onClick={() => setAiOpen(true)} data-testid="mobile-ai-btn" aria-label="Open Study Companion">
            <Sparkles className="w-5 h-5" />
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => setSearchOpen(true)} data-testid="mobile-search-btn" aria-label="Search">
            <SearchIcon className="w-5 h-5" />
          </button>
          <SheetTrigger asChild><button
            ref={mobileMenu}
            className="btn btn-ghost btn-icon"
            data-testid="mobile-nav-open"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button></SheetTrigger>
        </div>
      </div>

      {open && (
          <SheetContent side="left" className="w-80 max-w-[90vw] bg-card p-0 overflow-y-auto" closeLabel="Close menu" closeTestId="mobile-nav-close" aria-describedby={undefined}
            onCloseAutoFocus={event => { if (overlayOpen.current) event.preventDefault(); }}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarBody onNavigate={() => setOpen(false)} onOpenSearch={() => setSearchOpen(true)} onOpenAi={() => setAiOpen(true)} />
          </SheetContent>
      )}

      <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 pt-16 md:pt-0">
        <div className="workspace max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10 pb-24">
          {pendingCircle && !inviteDismissed && pathname.replace(/\/$/, "") !== "/circles" && (
            <section aria-labelledby="circle-invitation-heading" className="mb-6 rounded-xl border border-primary/25 bg-accent/60 p-4 sm:p-5">
              <div className="flex items-start gap-3 sm:gap-4">
                <div aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Circle invitation</p>
                  <h2 id="circle-invitation-heading" className="text-lg font-semibold leading-snug">You’re invited to a study circle</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Study with friends. Your notes stay private, and joining is up to you.</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <Link className="btn btn-primary min-h-11 justify-center" to={`/join/${pendingCircle.token}${typeof pendingCircle.ref === "string" && pendingCircle.ref ? `?ref=${encodeURIComponent(pendingCircle.ref)}` : ""}`}>View invitation</Link>
                    <button type="button" className="btn btn-ghost min-h-11 justify-center" onClick={() => {
                      setInviteDismissed(true);
                      try { sessionStorage.setItem("syllo.circleInviteDismissed", pendingCircle.token); } catch { /* Still dismiss when storage is unavailable. */ }
                    }}>Not now</button>
                  </div>
                </div>
              </div>
            </section>
          )}
          {children}
        </div>
      </main>

      {/* Floating AI action button */}
      <button
        onClick={() => setAiOpen(true)}
        data-testid="floating-ai-btn"
        aria-label="Open Study Companion"
        className="hidden md:grid fixed z-40 bottom-6 right-6 w-12 h-12 rounded-xl place-items-center border border-border bg-primary text-primary-foreground shadow-md"
      >
        <Sparkles className="w-5 h-5" />
      </button>

      <Suspense fallback={null}>
        {searchOpen && <SearchDialog open onClose={() => setSearchOpen(false)} fallbackFocusRef={mobileMenu} />}
        {aiOpen && <AiCompanion open onClose={() => setAiOpen(false)} fallbackFocusRef={mobileMenu} />}
      </Suspense>
    </div></Sheet>
  );
}
