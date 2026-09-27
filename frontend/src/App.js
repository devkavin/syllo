import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import AppShell from "@/components/AppShell";
import Today from "@/pages/Today";
import Subjects from "@/pages/Subjects";
import SubjectDetail from "@/pages/SubjectDetail";
import Notebooks from "@/pages/Notebooks";
import Tasks from "@/pages/Tasks";
import FocusTimer from "@/pages/FocusTimer";
import Analytics from "@/pages/Analytics";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import Timetable from "@/pages/Timetable";
import Reviews from "@/pages/Reviews";
import "@/App.css";

function Protected({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">Loading</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user && user.onboarded === false && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return <AppShell>{children}</AppShell>;
}

function OnboardingRoute() {
  const { user } = useAuth();
  if (user === undefined) return <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">Loading</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.onboarded) return <Navigate to="/today" replace />;
  return <Onboarding />;
}

function Router() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/today" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/onboarding" element={<OnboardingRoute />} />
      <Route path="/today" element={<Protected><Today /></Protected>} />
      <Route path="/subjects" element={<Protected><Subjects /></Protected>} />
      <Route path="/subjects/:id" element={<Protected><SubjectDetail /></Protected>} />
      <Route path="/timetable" element={<Protected><Timetable /></Protected>} />
      <Route path="/notebooks" element={<Protected><Notebooks /></Protected>} />
      <Route path="/tasks" element={<Protected><Tasks /></Protected>} />
      <Route path="/reviews" element={<Protected><Reviews /></Protected>} />
      <Route path="/timer" element={<Protected><FocusTimer /></Protected>} />
      <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Router />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
