import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { UsageProvider } from "@/lib/usage";
import AppShell from "@/components/AppShell";
import Today from "@/pages/Today";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import "@/App.css";

const Subjects = lazy(() => import("@/pages/Subjects"));
const SubjectDetail = lazy(() => import("@/pages/SubjectDetail"));
const Notebooks = lazy(() => import("@/pages/Notebooks"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const FocusTimer = lazy(() => import("@/pages/FocusTimer"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Settings = lazy(() => import("@/pages/Settings"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Timetable = lazy(() => import("@/pages/Timetable"));
const Reviews = lazy(() => import("@/pages/Reviews"));
const Upgrade = lazy(() => import("@/pages/Upgrade"));
const Admin = lazy(() => import("@/pages/Admin"));
const PaymentSuccess = lazy(() => import("@/pages/Payment").then((module) => ({ default: module.PaymentSuccess })));
const PaymentCancel = lazy(() => import("@/pages/Payment").then((module) => ({ default: module.PaymentCancel })));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));

function RouteLoading() {
  return (
    <div className="min-h-screen grid place-items-center text-muted-foreground text-sm" role="status">
      Loading Syllo…
    </div>
  );
}

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

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">Loading</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/today" replace />;
  return <AppShell>{children}</AppShell>;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/onboarding" element={<OnboardingRoute />} />
        <Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/payment/cancel" element={<PaymentCancel />} />
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
        <Route path="/upgrade" element={<Protected><Upgrade /></Protected>} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <UsageProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </UsageProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
