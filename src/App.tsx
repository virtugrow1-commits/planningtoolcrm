import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
const CrmPage = lazy(() => import("@/pages/CrmPage"));
const CompaniesPage = lazy(() => import("@/pages/CompaniesPage"));
const CompanyDetailPage = lazy(() => import("@/pages/CompanyDetailPage"));
const ContactDetailPage = lazy(() => import("@/pages/ContactDetailPage"));
const InquiriesPage = lazy(() => import("@/pages/InquiriesPage"));
const TasksPage = lazy(() => import("@/pages/TasksPage"));
const ReserveringenPage = lazy(() => import("@/pages/ReserveringenPage"));
const BookingDetailPage = lazy(() => import("@/pages/BookingDetailPage"));
const InquiryDetailPage = lazy(() => import("@/pages/InquiryDetailPage"));
const TaskDetailPage = lazy(() => import("@/pages/TaskDetailPage"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
import NotFound from "./pages/NotFound";

// Heavy, rarely-visited screens load on demand so the first screen paints faster
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const PublicQuotePage = lazy(() => import("@/pages/PublicQuotePage"));

import { BookingsProvider } from "@/contexts/BookingsContext";
import { ContactsProvider } from "@/contexts/ContactsContext";
import { CompaniesProvider } from "@/contexts/CompaniesContext";
import { InquiriesProvider } from "@/contexts/InquiriesContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TasksProvider } from "@/contexts/TasksContext";
import { LanguageProvider } from "@/contexts/LanguageContext";

function RouteFallback() {
  return (
    <div className="p-6 space-y-4">
      <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
      <div className="h-32 rounded-xl bg-muted animate-pulse" />
      <div className="h-32 rounded-xl bg-muted animate-pulse" />
    </div>
  );
}


const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } } });

function ProtectedRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="h-14 border-b border-border bg-card" />
        <RouteFallback />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ContactsProvider>
      <CompaniesProvider>
        <InquiriesProvider>
          <BookingsProvider>
            <TasksProvider>
              <AppLayout>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/tasks" element={<TasksPage />} />
                    <Route path="/crm" element={<CrmPage />} />
                    <Route path="/crm/:id" element={<ContactDetailPage />} />
                    <Route path="/companies" element={<CompaniesPage />} />
                    <Route path="/companies/:id" element={<CompanyDetailPage />} />
                    <Route path="/inquiries" element={<InquiriesPage />} />
                    <Route path="/inquiries/:id" element={<InquiryDetailPage />} />
                    <Route path="/tasks/:id" element={<TaskDetailPage />} />
                    <Route path="/documents" element={<Navigate to="/" replace />} />
                    <Route path="/quotes/*" element={<Navigate to="/" replace />} />
                    <Route path="/invoices/*" element={<Navigate to="/" replace />} />
                    <Route path="/templates/*" element={<Navigate to="/" replace />} />

                    <Route path="/reserveringen" element={<ReserveringenPage />} />
                    <Route path="/reserveringen/:id" element={<BookingDetailPage />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>

              </AppLayout>
            </TasksProvider>
          </BookingsProvider>
        </InquiriesProvider>
      </CompaniesProvider>
    </ContactsProvider>
  );
}

function AuthRoute() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <AuthPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LanguageProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login" element={<AuthRoute />} />
                <Route path="/quote/view/:token" element={<PublicQuotePage />} />
                <Route path="/*" element={<ProtectedRoutes />} />
              </Routes>
            </Suspense>
          </BrowserRouter>

        </AuthProvider>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
