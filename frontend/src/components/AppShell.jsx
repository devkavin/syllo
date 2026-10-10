import React, { lazy, Suspense, useState, useEffect, useRef, useId } from "react";
import { NavLink, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useUsage } from "@/lib/usage";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Sun, Moon, Home, BookOpen, NotebookPen, ListTodo,
  Timer, BarChart3, Settings, LogOut, Menu, GraduationCap,
  Calendar, Sparkles, Search as SearchIcon, ShieldCheck, ChevronDown, Users,
} from "lucide-react";

import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

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
  const { pathname } = useLocation();
  const libraryItems = NAV.filter(item => ["/notebooks", "/tasks", "/reviews"].includes(item.to));
  const libraryActive = libraryItems.some(item => pathname.startsWith(item.to));
  const [libraryExpanded, setLibraryExpanded] = useState(false);
  const libraryOpen = libraryExpanded || libraryActive;
  const libraryId = useId();
  const primaryItems = ["/today", "/subjects", "/planner", "/timer", "/analytics"].map(to => NAV.find(item => item.to === to));
  const navItem = ({ to, label, icon: Icon, testid }) => <NavLink key={to} to={to} data-testid={testid} onClick={onNavigate}
    className={({ isActive }) => `flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive ? "bg-accent text-accent-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"}`}>
    <Icon className="w-4 h-4 shrink-0" />{label}
  </NavLink>;
  return <div className="flex min-h-full flex-col">
    <div className="px-5 pt-6 pb-5 shrink-0">
      <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center"><GraduationCap className="w-4 h-4" /></div>
        <div><div className="font-display font-semibold text-xl leading-none tracking-tight">syllo</div><div className="text-xs text-muted-foreground mt-1">Your study space</div></div></div>
    </div>
    <div className="px-3 pb-4 space-y-1 shrink-0">
      <button className="btn btn-outline w-full justify-start text-muted-foreground" onClick={() => { onOpenSearch?.(); onNavigate?.(); }} data-testid="sidebar-search-btn">
        <SearchIcon className="w-4 h-4" /><span>Search</span><kbd className="ml-auto text-xs font-mono border border-border rounded-sm px-1.5 py-0.5">{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K"}</kbd>
      </button>
      <button className="btn btn-ghost w-full justify-start" onClick={() => { onOpenAi?.(); onNavigate?.(); }} data-testid="sidebar-ai-btn"><Sparkles className="w-4 h-4" /><span>Study Companion</span></button>
    </div>
    <nav aria-label="Workspace" className="px-3 flex-1 space-y-0.5">
      {primaryItems.map(navItem)}
      <div className="border-t border-border mt-4! pt-3">
        <button className={`btn btn-ghost w-full justify-start ${libraryActive ? "font-semibold" : "text-muted-foreground"}`} aria-expanded={libraryOpen} aria-controls={libraryId} onClick={() => setLibraryExpanded(value => !value)}>
          <NotebookPen className="w-4 h-4" /><span>Library</span><ChevronDown className={`ml-auto h-4 w-4 transition-transform ${libraryOpen ? "rotate-180" : ""}`} />
        </button>
        {libraryOpen && <div id={libraryId} className="ml-4 pl-2 border-l border-border space-y-0.5">{libraryItems.map(navItem)}</div>}
        {navItem(NAV.find(item => item.to === "/circles"))}
        {user?.role === "admin" && navItem({ to: "/admin", label: "Admin", icon: ShieldCheck, testid: "nav-admin" })}
      </div>
    </nav>
    <div className="p-3 mt-4 border-t border-border shrink-0 space-y-1">
      <Link to="/upgrade" className="flex min-h-11 items-center justify-between gap-2 px-3 rounded-lg text-xs text-muted-foreground hover:bg-accent" data-testid="sidebar-plan-card" onClick={onNavigate}>
        <span>{usage?.plan?.name || "Freshman"}</span><span>{usage?.credits_remaining ?? 0} helps</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button className="btn btn-ghost w-full justify-start" aria-label="Account menu">
          <span className="w-7 h-7 shrink-0 rounded-full bg-secondary grid place-items-center text-xs">{(user?.name || "?")[0]?.toUpperCase()}</span>
          <span className="truncate">{user?.name || "Account"}</span><ChevronDown className="ml-auto w-4 h-4 shrink-0" />
        </button></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuLabel className="font-normal"><p className="text-sm font-medium truncate">{user?.name}</p><p className="text-xs text-muted-foreground break-all">{user?.email}</p></DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="min-h-11"><Link to="/settings" data-testid="nav-settings" onClick={onNavigate}><Settings />Settings</Link></DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onSelect={toggle} data-testid="theme-toggle-button">{theme === "dark" ? <Sun /> : <Moon />}{theme === "dark" ? "Light mode" : "Dark mode"}</DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-11"><Link to="/privacy" onClick={onNavigate}>Privacy</Link></DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-11"><Link to="/terms" onClick={onNavigate}>Terms</Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-11" data-testid="sign-out-button" onSelect={async () => { await logout(); onNavigate?.(); nav("/login"); }}><LogOut />Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>;
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

      <Suspense fallback={null}>
        {searchOpen && <SearchDialog open onClose={() => setSearchOpen(false)} fallbackFocusRef={mobileMenu} />}
        {aiOpen && <AiCompanion open onClose={() => setAiOpen(false)} fallbackFocusRef={mobileMenu} />}
      </Suspense>
    </div></Sheet>
  );
}
