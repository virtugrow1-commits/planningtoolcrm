import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import CalendarPage from "@/pages/CalendarPage";
import CrmPage from "@/pages/CrmPage";
import ContactDetailPage from "@/pages/ContactDetailPage";
import InquiriesPage from "@/pages/InquiriesPage";
import QuotationsPage from "@/pages/QuotationsPage";
import SettingsPage from "@/pages/SettingsPage";
import AuthPage from "@/pages/AuthPage";
import NotFound from "./pages/NotFound";
import { BookingsProvider } from "@/contexts/BookingsContext";
import { ContactsProvider } from "@/contexts/ContactsContext";
import { InquiriesProvider } from "@/contexts/InquiriesContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TasksProvider } from "@/contexts/TasksContext";

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
      <InquiriesProvider>
        <BookingsProvider>
          <TasksProvider>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/crm" element={<CrmPage />} />
                <Route path="/crm/:id" element={<ContactDetailPage />} />
                <Route path="/inquiries" element={<InquiriesPage />} />
                <Route path="/quotations" element={<QuotationsPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppLayout>
          </TasksProvider>
        </BookingsProvider>
      </InquiriesProvider>
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
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
