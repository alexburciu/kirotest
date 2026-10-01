import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/layout/AppShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { TriggersPage } from "@/pages/TriggersPage";
import { MonitorPage } from "@/pages/MonitorPage";
import { ProvidersPage } from "@/pages/ProvidersPage";
import { LoginPage } from "@/pages/LoginPage";

// ---------------------------------------------------------------------------
// QueryClient (single instance outside the component tree)
// ---------------------------------------------------------------------------

const queryClient = new QueryClient();

// ---------------------------------------------------------------------------
// AuthGuard
// ---------------------------------------------------------------------------

function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Redirect root → /triggers */}
      <Route path="/" element={<Navigate to="/triggers" replace />} />

      {/* Protected routes wrapped in AppShell */}
      <Route
        path="/triggers"
        element={
          <AuthGuard>
            <AppShell breadcrumb={<Breadcrumb />}>
              <TriggersPage />
            </AppShell>
          </AuthGuard>
        }
      />
      <Route
        path="/monitor"
        element={
          <AuthGuard>
            <AppShell breadcrumb={<Breadcrumb />}>
              <MonitorPage />
            </AppShell>
          </AuthGuard>
        }
      />
      <Route
        path="/providers"
        element={
          <AuthGuard>
            <AppShell breadcrumb={<Breadcrumb />}>
              <ProvidersPage />
            </AppShell>
          </AuthGuard>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
