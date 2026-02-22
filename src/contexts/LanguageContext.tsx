import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

type Language = 'nl' | 'en';

const translations: Record<string, Record<Language, string>> = {
  // Navigation
  'nav.dashboard': { nl: 'Dashboard', en: 'Dashboard' },
  'nav.crm': { nl: 'CRM', en: 'CRM' },
  'nav.companies': { nl: 'Bedrijven', en: 'Companies' },
  'nav.inquiries': { nl: 'Aanvragen', en: 'Inquiries' },
  'nav.conversations': { nl: 'Gesprekken', en: 'Conversations' },
  'nav.reserveringen': { nl: 'Reserveringen', en: 'Reservations' },
  'nav.calendar': { nl: 'Kalender', en: 'Calendar' },
  'nav.settings': { nl: 'Instellingen', en: 'Settings' },
  'nav.logout': { nl: 'Uitloggen', en: 'Sign out' },

  // Dashboard
  'dashboard.title': { nl: 'Dashboard', en: 'Dashboard' },
  'dashboard.openInquiries': { nl: 'Open aanvragen', en: 'Open inquiries' },
  'dashboard.upcomingBookings': { nl: 'Komende boekingen', en: 'Upcoming bookings' },
  'dashboard.openTasks': { nl: 'Open taken', en: 'Open tasks' },
  'dashboard.overdueTasks': { nl: 'Verlopen taken', en: 'Overdue tasks' },
  'dashboard.tasks': { nl: 'Taken', en: 'Tasks' },
  'dashboard.addTask': { nl: 'Taak toevoegen', en: 'Add task' },
  'dashboard.noTasks': { nl: 'Geen taken', en: 'No tasks' },
  'dashboard.upcomingBookingsTitle': { nl: 'Komende Boekingen', en: 'Upcoming Bookings' },
  'dashboard.viewCalendar': { nl: 'Bekijk kalender', en: 'View calendar' },
  'dashboard.noUpcoming': { nl: 'Geen komende boekingen', en: 'No upcoming bookings' },
  'dashboard.recentInquiries': { nl: 'Recente Aanvragen', en: 'Recent Inquiries' },
  'dashboard.viewAll': { nl: 'Bekijk alles', en: 'View all' },
  'dashboard.noInquiries': { nl: 'Geen aanvragen', en: 'No inquiries' },

  // Auth
  'auth.login': { nl: 'Inloggen', en: 'Sign in' },
  'auth.register': { nl: 'Registreren', en: 'Sign up' },
  'auth.loginTitle': { nl: 'Inloggen', en: 'Sign in' },
  'auth.registerTitle': { nl: 'Account aanmaken', en: 'Create account' },
  'auth.loginSubtitle': { nl: 'Vul je gegevens in om verder te gaan', en: 'Enter your details to continue' },
  'auth.registerSubtitle': { nl: 'Maak een nieuw account aan', en: 'Create a new account' },
  'auth.email': { nl: 'E-mail', en: 'Email' },
  'auth.password': { nl: 'Wachtwoord', en: 'Password' },
  'auth.loading': { nl: 'Even geduld...', en: 'Please wait...' },
  'auth.noAccount': { nl: 'Nog geen account?', en: "Don't have an account?" },
  'auth.hasAccount': { nl: 'Al een account?', en: 'Already have an account?' },
  'auth.googleLogin': { nl: 'Inloggen met Google', en: 'Sign in with Google' },
  'auth.or': { nl: 'of', en: 'or' },
  'auth.loginFailed': { nl: 'Inloggen mislukt', en: 'Login failed' },
  'auth.registerFailed': { nl: 'Registratie mislukt', en: 'Registration failed' },
  'auth.accountCreated': { nl: 'Account aangemaakt', en: 'Account created' },
  'auth.accountCreatedDesc': { nl: 'Je bent nu ingelogd.', en: 'You are now signed in.' },
  'auth.googleFailed': { nl: 'Google login mislukt', en: 'Google login failed' },

  // Settings
  'settings.title': { nl: 'Instellingen', en: 'Settings' },
  'settings.subtitle': { nl: 'GoHighLevel integratie & configuratie', en: 'GoHighLevel integration & configuration' },
  'settings.ghlConnection': { nl: 'GHL Verbinding', en: 'GHL Connection' },
  'settings.webhooks': { nl: 'Webhooks', en: 'Webhooks' },
  'settings.fieldMapping': { nl: 'Veld Mapping', en: 'Field Mapping' },
  'settings.csvImport': { nl: 'CSV Import', en: 'CSV Import' },
  'settings.connected': { nl: 'Verbonden met GoHighLevel', en: 'Connected to GoHighLevel' },
  'settings.notConnected': { nl: 'Niet verbonden', en: 'Not connected' },
  'settings.sync': { nl: 'Synchronisatie', en: 'Synchronization' },
  'settings.fullSync': { nl: 'Volledige Sync', en: 'Full Sync' },
  'settings.webhookUrl': { nl: 'Webhook URL', en: 'Webhook URL' },
  'settings.webhookUrlDesc': { nl: 'Plak deze URL in GHL → Settings → Webhooks om realtime data te ontvangen.', en: 'Paste this URL in GHL → Settings → Webhooks to receive realtime data.' },
  'settings.webhookUrlCopied': { nl: 'Webhook URL gekopieerd!', en: 'Webhook URL copied!' },
  'settings.connect': { nl: 'Verbinden', en: 'Connect' },

  // CRM
  'crm.title': { nl: 'Contacten', en: 'Contacts' },
  'crm.addContact': { nl: 'Contact toevoegen', en: 'Add contact' },
  'crm.search': { nl: 'Zoeken...', en: 'Search...' },
  'crm.noContacts': { nl: 'Geen contacten gevonden', en: 'No contacts found' },
  'crm.firstName': { nl: 'Voornaam', en: 'First name' },
  'crm.lastName': { nl: 'Achternaam', en: 'Last name' },
  'crm.company': { nl: 'Bedrijf', en: 'Company' },
  'crm.status': { nl: 'Status', en: 'Status' },
  'crm.phone': { nl: 'Telefoon', en: 'Phone' },

  // Calendar
  'calendar.title': { nl: 'Kalender', en: 'Calendar' },
  'calendar.today': { nl: 'Vandaag', en: 'Today' },
  'calendar.week': { nl: 'Week', en: 'Week' },
  'calendar.month': { nl: 'Maand', en: 'Month' },
  'calendar.newBooking': { nl: 'Nieuwe boeking', en: 'New booking' },

  // Common
  'common.save': { nl: 'Opslaan', en: 'Save' },
  'common.cancel': { nl: 'Annuleren', en: 'Cancel' },
  'common.delete': { nl: 'Verwijderen', en: 'Delete' },
  'common.edit': { nl: 'Bewerken', en: 'Edit' },
  'common.loading': { nl: 'Laden...', en: 'Loading...' },
  'common.guests': { nl: 'gasten', en: 'guests' },
  'common.notes': { nl: 'Notities', en: 'Notes' },
  'common.actions': { nl: 'Acties', en: 'Actions' },

  // Inquiry statuses
  'status.new': { nl: 'Nieuw', en: 'New' },
  'status.contacted': { nl: 'Lopend Contact', en: 'Contacted' },
  'status.option': { nl: 'In Optie', en: 'Option' },
  'status.quoted': { nl: 'Offerte Verzonden', en: 'Quoted' },
  'status.quote_revised': { nl: 'Aangepaste Offerte', en: 'Quote Revised' },
  'status.confirmed': { nl: 'Bevestigd', en: 'Confirmed' },
  'status.reserved': { nl: 'Gereserveerd', en: 'Reserved' },
  'status.invoiced': { nl: 'Gefactureerd', en: 'Invoiced' },
  'status.lost': { nl: 'Vervallen', en: 'Lost' },
  'status.after_sales': { nl: 'After Sales', en: 'After Sales' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'nl',
  setLanguage: () => {},
  t: (key: string) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('app-language');
    return (saved === 'en' || saved === 'nl') ? saved : 'nl';
  });

  const handleSetLanguage = useCallback((lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('app-language', lang);
  }, []);

  const t = useCallback((key: string): string => {
    return translations[key]?.[language] ?? key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
