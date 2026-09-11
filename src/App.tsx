import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import CrmPage from "@/pages/CrmPage";
import CompaniesPage from "@/pages/CompaniesPage";
import CompanyDetailPage from "@/pages/CompanyDetailPage";
import ContactDetailPage from "@/pages/ContactDetailPage";
import InquiriesPage from "@/pages/InquiriesPage";
import TasksPage from "@/pages/TasksPage";
import ReserveringenPage from "@/pages/ReserveringenPage";
import BookingDetailPage from "@/pages/BookingDetailPage";
import InquiryDetailPage from "@/pages/InquiryDetailPage";
import TaskDetailPage from "@/pages/TaskDetailPage";
import AuthPage from "@/pages/AuthPage";
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


const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Laden...</div>
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
