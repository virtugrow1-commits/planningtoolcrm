import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import CalendarPage from "@/pages/CalendarPage";
import CrmPage from "@/pages/CrmPage";
import CompaniesPage from "@/pages/CompaniesPage";
import CompanyDetailPage from "@/pages/CompanyDetailPage";
import ContactDetailPage from "@/pages/ContactDetailPage";
import InquiriesPage from "@/pages/InquiriesPage";
import QuotationsPage from "@/pages/QuotationsPage";
import ConversationsPage from "@/pages/ConversationsPage";
import ReserveringenPage from "@/pages/ReserveringenPage";
import SettingsPage from "@/pages/SettingsPage";
import BookingDetailPage from "@/pages/BookingDetailPage";
import InquiryDetailPage from "@/pages/InquiryDetailPage";
import AuthPage from "@/pages/AuthPage";
import NotFound from "./pages/NotFound";
import { BookingsProvider } from "@/contexts/BookingsContext";
import { ContactsProvider } from "@/contexts/ContactsContext";
import { CompaniesProvider } from "@/contexts/CompaniesContext";
import { InquiriesProvider } from "@/contexts/InquiriesContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TasksProvider } from "@/contexts/TasksContext";
import { LanguageProvider } from "@/contexts/LanguageContext";

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
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/crm" element={<CrmPage />} />
                  <Route path="/crm/:id" element={<ContactDetailPage />} />
                  <Route path="/companies" element={<CompaniesPage />} />
                  <Route path="/companies/:id" element={<CompanyDetailPage />} />
                  <Route path="/inquiries" element={<InquiriesPage />} />
                  <Route path="/inquiries/:id" element={<InquiryDetailPage />} />
                  <Route path="/reserveringen" element={<ReserveringenPage />} />
                  <Route path="/reserveringen/:id" element={<BookingDetailPage />} />
                  <Route path="/quotations" element={<QuotationsPage />} />
                  <Route path="/conversations" element={<ConversationsPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
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
            <Routes>
              <Route path="/login" element={<AuthRoute />} />
              <Route path="/*" element={<ProtectedRoutes />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
