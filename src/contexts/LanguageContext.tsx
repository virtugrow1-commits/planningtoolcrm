import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

type Language = 'nl' | 'en';

const translations: Record<string, Record<Language, string>> = {
  // Navigation
  'nav.dashboard': { nl: 'Dashboard', en: 'Dashboard' },
  'nav.crm': { nl: 'CRM', en: 'CRM' },
  'nav.companies': { nl: 'Bedrijven', en: 'Companies' },
  'nav.inquiries': { nl: 'Aanvragen', en: 'Inquiries' },
  'nav.quotes': { nl: 'Offertes', en: 'Quotes' },
  'nav.conversations': { nl: 'Gesprekken', en: 'Conversations' },
  'nav.reserveringen': { nl: 'Reserveringen', en: 'Reservations' },
  'nav.calendar': { nl: 'Kalender', en: 'Calendar' },
  'nav.documents': { nl: 'Documenten', en: 'Documents' },
  'nav.settings': { nl: 'Instellingen', en: 'Settings' },
  'nav.logout': { nl: 'Uitloggen', en: 'Sign out' },

  // Dashboard
  'dashboard.title': { nl: 'Dashboard', en: 'Dashboard' },
  'dashboard.openInquiries': { nl: 'Open aanvragen', en: 'Open inquiries' },
  'dashboard.upcomingBookings': { nl: 'Komende boekingen', en: 'Upcoming bookings' },
  'dashboard.openTasks': { nl: 'Openstaande Taken', en: 'Open Tasks' },
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
  'dashboard.inquiries': { nl: 'Aanvragen', en: 'Inquiries' },
  'dashboard.bookingsToday': { nl: 'Reserveringen Vandaag', en: 'Bookings Today' },
  'dashboard.newAndContacted': { nl: 'Nieuw & gecontacteerd', en: 'New & contacted' },
  'dashboard.confirmed': { nl: 'bevestigd', en: 'confirmed' },
  'dashboard.inOption': { nl: 'in optie', en: 'optional' },
  'dashboard.open': { nl: 'open', en: 'open' },
  'dashboard.completed': { nl: 'afgerond', en: 'completed' },
  'dashboard.newTask': { nl: 'Nieuwe Taak', en: 'New Task' },
  'dashboard.allUsers': { nl: 'Alle gebruikers', en: 'All users' },
  'dashboard.all': { nl: 'Alle', en: 'All' },
  'dashboard.selected': { nl: 'geselecteerd', en: 'selected' },
  'dashboard.changeStatus': { nl: 'Status wijzigen', en: 'Change status' },
  'dashboard.moveToDate': { nl: 'Verplaats naar datum', en: 'Move to date' },
  'dashboard.applyTo': { nl: 'Toepassen op', en: 'Apply to' },
  'dashboard.task': { nl: 'taak', en: 'task' },
  'dashboard.tasksPlural': { nl: 'taken', en: 'tasks' },
  'dashboard.noTasksYet': { nl: 'Nog geen taken', en: 'No tasks yet' },
  'dashboard.createFirstTask': { nl: 'Maak je eerste taak aan', en: 'Create your first task' },
  'dashboard.showMore': { nl: 'Meer laden', en: 'Show more' },
  'dashboard.loading': { nl: 'Laden...', en: 'Loading...' },

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
  'settings.subtitle': { nl: 'VirtuGrow integratie & configuratie', en: 'VirtuGrow integration & configuration' },
  'settings.ghlConnection': { nl: 'VGW Verbinding', en: 'VGW Connection' },
  'settings.webhooks': { nl: 'Webhooks', en: 'Webhooks' },
  'settings.fieldMapping': { nl: 'Veld Mapping', en: 'Field Mapping' },
  'settings.csvImport': { nl: 'CSV Import', en: 'CSV Import' },
  'settings.connected': { nl: 'Verbonden met VirtuGrow', en: 'Connected to VirtuGrow' },
  'settings.notConnected': { nl: 'Niet verbonden', en: 'Not connected' },
  'settings.sync': { nl: 'Synchronisatie', en: 'Synchronization' },
  'settings.fullSync': { nl: 'Volledige Sync', en: 'Full Sync' },
  'settings.webhookUrl': { nl: 'Webhook URL', en: 'Webhook URL' },
  'settings.webhookUrlDesc': { nl: 'Plak deze URL in VirtuGrow → Settings → Webhooks om realtime data te ontvangen.', en: 'Paste this URL in VirtuGrow → Settings → Webhooks to receive realtime data.' },
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
  'crm.email': { nl: 'E-mail', en: 'Email' },
  'crm.contacts': { nl: 'Contactpersonen', en: 'Contacts' },
  'crm.companies': { nl: 'Bedrijven', en: 'Companies' },
  'crm.addCompany': { nl: 'Bedrijf toevoegen', en: 'Add company' },
  'crm.noCompanies': { nl: 'Geen bedrijven gevonden', en: 'No companies found' },
  'crm.name': { nl: 'Naam', en: 'Name' },
  'crm.website': { nl: 'Website', en: 'Website' },
  'crm.address': { nl: 'Adres', en: 'Address' },
  'crm.city': { nl: 'Plaats', en: 'City' },
  'crm.postcode': { nl: 'Postcode', en: 'Postcode' },
  'crm.kvk': { nl: 'KvK-nummer', en: 'Chamber of Commerce' },
  'crm.notes': { nl: 'Notities', en: 'Notes' },
  'crm.newContact': { nl: 'Nieuw contact', en: 'New contact' },
  'crm.newCompany': { nl: 'Nieuw bedrijf', en: 'New company' },
  'crm.department': { nl: 'Afdeling', en: 'Department' },
  'crm.dmu': { nl: 'DMU', en: 'DMU' },
  'crm.functionGroup': { nl: 'Functiegroep', en: 'Function group' },
  'crm.jobTitle': { nl: 'Functietitel', en: 'Job title' },
  'crm.filter': { nl: 'Filters', en: 'Filters' },
  'crm.clearFilters': { nl: 'Filters wissen', en: 'Clear filters' },
  'crm.exportCsv': { nl: 'Exporteer CSV', en: 'Export CSV' },
  'crm.viewProfile': { nl: 'Bekijk profiel', en: 'View profile' },
  'crm.viewCompany': { nl: 'Bekijk bedrijf', en: 'View company' },

  // Contact statuses
  'contactStatus.lead': { nl: 'Lead', en: 'Lead' },
  'contactStatus.prospect': { nl: 'Prospect', en: 'Prospect' },
  'contactStatus.client': { nl: 'Klant', en: 'Client' },
  'contactStatus.inactive': { nl: 'Inactief', en: 'Inactive' },
  'contactStatus.do_not_contact': { nl: 'Niet benaderen', en: 'Do not contact' },

  // Calendar
  'calendar.title': { nl: 'Kalender', en: 'Calendar' },
  'calendar.today': { nl: 'Vandaag', en: 'Today' },
  'calendar.week': { nl: 'Week', en: 'Week' },
  'calendar.month': { nl: 'Maand', en: 'Month' },
  'calendar.day': { nl: 'Dag', en: 'Day' },
  'calendar.newBooking': { nl: 'Nieuwe boeking', en: 'New booking' },
  'calendar.newReservation': { nl: 'Nieuwe reservering', en: 'New reservation' },
  'calendar.roomSettings': { nl: 'Ruimte-instellingen', en: 'Room settings' },
  'calendar.bookingUpdated': { nl: 'Boeking bijgewerkt', en: 'Booking updated' },
  'calendar.bookingDeleted': { nl: 'Boeking verwijderd', en: 'Booking deleted' },
  'calendar.bookingAdded': { nl: 'Boeking toegevoegd', en: 'Booking added' },
  'calendar.conflictDetected': { nl: 'Conflict gedetecteerd', en: 'Conflict detected' },

  // Common / buttons
  'common.save': { nl: 'Opslaan', en: 'Save' },
  'common.cancel': { nl: 'Annuleren', en: 'Cancel' },
  'common.delete': { nl: 'Verwijderen', en: 'Delete' },
  'common.edit': { nl: 'Bewerken', en: 'Edit' },
  'common.loading': { nl: 'Laden...', en: 'Loading...' },
  'common.guests': { nl: 'gasten', en: 'guests' },
  'common.notes': { nl: 'Notities', en: 'Notes' },
  'common.actions': { nl: 'Acties', en: 'Actions' },
  'common.close': { nl: 'Sluiten', en: 'Close' },
  'common.add': { nl: 'Toevoegen', en: 'Add' },
  'common.search': { nl: 'Zoeken...', en: 'Search...' },
  'common.yes': { nl: 'Ja', en: 'Yes' },
  'common.no': { nl: 'Nee', en: 'No' },
  'common.confirm': { nl: 'Bevestigen', en: 'Confirm' },
  'common.back': { nl: 'Terug', en: 'Back' },
  'common.next': { nl: 'Volgende', en: 'Next' },
  'common.previous': { nl: 'Vorige', en: 'Previous' },
  'common.noResults': { nl: 'Geen resultaten', en: 'No results' },
  'common.areYouSure': { nl: 'Weet je het zeker?', en: 'Are you sure?' },
  'common.overview': { nl: 'Overzicht', en: 'Overview' },
  'common.details': { nl: 'Details', en: 'Details' },
  'common.history': { nl: 'Geschiedenis', en: 'History' },
  'common.createdAt': { nl: 'Aangemaakt', en: 'Created' },
  'common.date': { nl: 'Datum', en: 'Date' },
  'common.time': { nl: 'Tijd', en: 'Time' },
  'common.status': { nl: 'Status', en: 'Status' },
  'common.priority': { nl: 'Prioriteit', en: 'Priority' },
  'common.description': { nl: 'Beschrijving', en: 'Description' },
  'common.title': { nl: 'Titel', en: 'Title' },
  'common.source': { nl: 'Bron', en: 'Source' },
  'common.duplicate': { nl: 'Dupliceer', en: 'Duplicate' },
  'common.send': { nl: 'Verzenden', en: 'Send' },
  'common.preview': { nl: 'Voorbeeld', en: 'Preview' },
  'common.download': { nl: 'Downloaden', en: 'Download' },
  'common.upload': { nl: 'Uploaden', en: 'Upload' },
  'common.select': { nl: 'Selecteer', en: 'Select' },
  'common.optional': { nl: 'Optioneel', en: 'Optional' },
  'common.required': { nl: 'Verplicht', en: 'Required' },
  'common.unknown': { nl: 'Onbekend', en: 'Unknown' },
  'common.total': { nl: 'Totaal', en: 'Total' },
  'common.subtotal': { nl: 'Subtotaal', en: 'Subtotal' },
  'common.amount': { nl: 'Bedrag', en: 'Amount' },
  'common.perPage': { nl: 'per pagina', en: 'per page' },
  'common.page': { nl: 'Pagina', en: 'Page' },
  'common.of': { nl: 'van', en: 'of' },

  // Inquiry statuses (pipeline)
  'status.new': { nl: 'Nieuwe Aanvraag', en: 'New Inquiry' },
  'status.contacted': { nl: 'Lopend Contact', en: 'In Contact' },
  'status.option': { nl: 'Optie', en: 'Option' },
  'status.quoted': { nl: 'Offerte Verzonden', en: 'Quote Sent' },
  'status.quote_revised': { nl: 'Aangepaste Offerte', en: 'Quote Revised' },
  'status.confirmed': { nl: 'Definitieve Reservering', en: 'Confirmed Reservation' },
  'status.reserved': { nl: 'Reservering', en: 'Reservation' },
  'status.script': { nl: 'Draaiboek Maken', en: 'Create Script' },
  'status.invoiced': { nl: 'Facturatie', en: 'Invoicing' },
  'status.lost': { nl: 'Vervallen / Verloren', en: 'Expired / Lost' },
  'status.converted': { nl: 'Afgehandeld', en: 'Completed' },
  'status.after_sales': { nl: 'After Sales', en: 'After Sales' },
  'status.condolence_reminder': { nl: 'Condoleance Herdenkingen', en: 'Condolence Commemorations' },

  // Inquiries page
  'inquiries.title': { nl: 'Aanvragen', en: 'Inquiries' },
  'inquiries.newInquiry': { nl: 'Nieuwe aanvraag', en: 'New inquiry' },
  'inquiries.noInquiries': { nl: 'Geen aanvragen gevonden', en: 'No inquiries found' },
  'inquiries.eventType': { nl: 'Type evenement', en: 'Event type' },
  'inquiries.preferredDate': { nl: 'Voorkeursdatum', en: 'Preferred date' },
  'inquiries.preferredTime': { nl: 'Voorkeurstijd', en: 'Preferred time' },
  'inquiries.guestCount': { nl: 'Aantal gasten', en: 'Number of guests' },
  'inquiries.budget': { nl: 'Budget', en: 'Budget' },
  'inquiries.roomPreference': { nl: 'Ruimte voorkeur', en: 'Room preference' },
  'inquiries.contactPerson': { nl: 'Contactpersoon', en: 'Contact person' },
  'inquiries.company': { nl: 'Bedrijf', en: 'Company' },
  'inquiries.responsible': { nl: 'Verantwoordelijke', en: 'Assigned to' },
  'inquiries.schedule': { nl: 'Inplannen', en: 'Schedule' },
  'inquiries.convertToReservation': { nl: 'Omzetten naar Reservering', en: 'Convert to Reservation' },
  'inquiries.deleteInquiry': { nl: 'Aanvraag verwijderen', en: 'Delete inquiry' },
  'inquiries.deleteConfirm': { nl: 'Weet je zeker dat je deze aanvraag wilt verwijderen?', en: 'Are you sure you want to delete this inquiry?' },
  'inquiries.bulkDeleteConfirm': { nl: 'Je staat op het punt aanvragen te verwijderen. Deze actie kan niet ongedaan worden gemaakt.', en: 'You are about to delete inquiries. This action cannot be undone.' },
  'inquiries.inquiryDetails': { nl: 'Aanvraaggegevens', en: 'Inquiry details' },
  'inquiries.customerInput': { nl: 'Klantinvoer (Formuliergegevens)', en: 'Customer input (Form data)' },
  'inquiries.noFormData': { nl: 'Geen gestructureerde formulierdata beschikbaar.', en: 'No structured form data available.' },
  'inquiries.remarks': { nl: 'Opmerkingen', en: 'Remarks' },
  'inquiries.addNote': { nl: 'Notitie toevoegen', en: 'Add note' },
  'inquiries.addTask': { nl: 'Taak toevoegen', en: 'Add task' },
  'inquiries.enrichFromVGW': { nl: 'Formuliergegevens ophalen uit VirtuGrow', en: 'Fetch form data from VirtuGrow' },
  'inquiries.fetching': { nl: 'Ophalen...', en: 'Fetching...' },
  'inquiries.kanbanView': { nl: 'Kanban', en: 'Kanban' },
  'inquiries.listView': { nl: 'Lijst', en: 'List' },
  'inquiries.archiveColumns': { nl: 'Archief kolommen', en: 'Archive columns' },
  'inquiries.hideArchive': { nl: 'Archief verbergen', en: 'Hide archive' },
  'inquiries.showArchive': { nl: 'Archief tonen', en: 'Show archive' },
  'inquiries.once': { nl: 'Eenmalig', en: 'Once' },
  'inquiries.everyWeek': { nl: 'Elke week', en: 'Every week' },
  'inquiries.biWeekly': { nl: 'Om de 2 weken', en: 'Every 2 weeks' },
  'inquiries.monthly': { nl: 'Elke maand', en: 'Monthly' },
  'inquiries.quarterly': { nl: 'Elk kwartaal', en: 'Quarterly' },
  'inquiries.adRandom': { nl: 'Ad random (vrije datums)', en: 'Ad random (custom dates)' },
  'inquiries.addDate': { nl: 'Datum toevoegen', en: 'Add date' },
  'inquiries.recurrence': { nl: 'Herhaling', en: 'Recurrence' },
  'inquiries.howManyTimes': { nl: 'Aantal herhalingen', en: 'Number of repeats' },
  'inquiries.room': { nl: 'Ruimte', en: 'Room' },
  'inquiries.startTime': { nl: 'Begintijd', en: 'Start time' },
  'inquiries.endTime': { nl: 'Eindtijd', en: 'End time' },
  'inquiries.option': { nl: 'Optie', en: 'Option' },
  'inquiries.reservation': { nl: 'Reservering', en: 'Reservation' },

  // Tasks
  'tasks.title': { nl: 'Taken', en: 'Tasks' },
  'tasks.newTask': { nl: 'Nieuwe Taak', en: 'New Task' },
  'tasks.editTask': { nl: 'Taak bewerken', en: 'Edit Task' },
  'tasks.taskTitle': { nl: 'Titel', en: 'Title' },
  'tasks.taskCreated': { nl: 'Taak aangemaakt', en: 'Task created' },
  'tasks.taskUpdated': { nl: 'Taak bijgewerkt', en: 'Task updated' },
  'tasks.taskDeleted': { nl: 'Taak verwijderd', en: 'Task deleted' },
  'tasks.tasksDeleted': { nl: 'taken verwijderd', en: 'tasks deleted' },
  'tasks.tasksUpdated': { nl: 'taken bijgewerkt', en: 'tasks updated' },
  'tasks.giveTitleError': { nl: 'Geef de taak een titel', en: 'Please provide a task title' },
  'tasks.followUpTask': { nl: 'Vervolgtaak', en: 'Follow-up task' },
  'tasks.followUpCreated': { nl: 'Vervolgtaak aangemaakt', en: 'Follow-up task created' },
  'tasks.taskCompleted': { nl: 'Taak afgerond!', en: 'Task completed!' },
  'tasks.createFollowUp': { nl: 'Wil je een vervolgtaak aanmaken?', en: 'Would you like to create a follow-up task?' },
  'tasks.dueDate': { nl: 'Datum', en: 'Date' },
  'tasks.assignedTo': { nl: 'Verantwoordelijke', en: 'Assigned to' },
  'tasks.contactPerson': { nl: 'Contactpersoon', en: 'Contact person' },
  'tasks.noFollowUp': { nl: 'Nee, bedankt', en: 'No, thanks' },
  'tasks.yesCreate': { nl: 'Ja, aanmaken', en: 'Yes, create' },
  'tasks.movedToDate': { nl: 'taken verplaatst', en: 'tasks moved' },

  // Task statuses
  'taskStatus.open': { nl: 'Open', en: 'Open' },
  'taskStatus.in_progress': { nl: 'In Behandeling', en: 'In Progress' },
  'taskStatus.completed': { nl: 'Afgerond', en: 'Completed' },

  // Task priorities
  'taskPriority.low': { nl: 'Laag', en: 'Low' },
  'taskPriority.normal': { nl: 'Normaal', en: 'Normal' },
  'taskPriority.high': { nl: 'Hoog', en: 'High' },
  'taskPriority.urgent': { nl: 'Urgent', en: 'Urgent' },

  // Quotes
  'quotes.title': { nl: 'Offertes', en: 'Quotes' },
  'quotes.newQuote': { nl: 'Nieuwe offerte', en: 'New quote' },
  'quotes.noQuotes': { nl: 'Geen offertes', en: 'No quotes' },
  'quotes.preview': { nl: 'Voorbeeld', en: 'Preview' },
  'quotes.sendQuote': { nl: 'Offerte versturen', en: 'Send quote' },
  'quotes.validUntil': { nl: 'Geldig tot', en: 'Valid until' },
  'quotes.termsAndConditions': { nl: 'Algemene voorwaarden', en: 'Terms and conditions' },
  'quotes.lineItems': { nl: 'Regels', en: 'Line items' },
  'quotes.addItem': { nl: 'Item toevoegen', en: 'Add item' },

  // Reservations
  'reservations.title': { nl: 'Reserveringen', en: 'Reservations' },
  'reservations.noReservations': { nl: 'Geen reserveringen', en: 'No reservations' },
  'reservations.room': { nl: 'Ruimte', en: 'Room' },
  'reservations.guests': { nl: 'Gasten', en: 'Guests' },
  'reservations.setup': { nl: 'Opstelling', en: 'Setup' },
  'reservations.preparation': { nl: 'Voorbereiding', en: 'Preparation' },
  'reservations.confirmed': { nl: 'Bevestigd', en: 'Confirmed' },
  'reservations.option': { nl: 'Optie', en: 'Option' },

  // Documents
  'documents.title': { nl: 'Documenten', en: 'Documents' },
  'documents.noDocuments': { nl: 'Geen documenten', en: 'No documents' },

  // Conversations
  'conversations.title': { nl: 'Gesprekken', en: 'Conversations' },
  'conversations.noConversations': { nl: 'Geen gesprekken', en: 'No conversations' },

  // Detail pages
  'detail.contactPerson': { nl: 'Contactpersoon', en: 'Contact person' },
  'detail.company': { nl: 'Bedrijf', en: 'Company' },
  'detail.viewProfile': { nl: 'Bekijk profiel →', en: 'View profile →' },
  'detail.viewCompany': { nl: 'Bekijk bedrijf →', en: 'View company →' },
  'detail.tasks': { nl: 'Taken', en: 'Tasks' },
  'detail.history': { nl: 'Geschiedenis', en: 'History' },
  'detail.inquiryDetails': { nl: 'Aanvraaggegevens', en: 'Inquiry Details' },

  // Sources
  'source.manual': { nl: 'Handmatig', en: 'Manual' },
  'source.website': { nl: 'Website', en: 'Website' },
  'source.phone': { nl: 'Telefoon', en: 'Phone' },
  'source.email': { nl: 'Email', en: 'Email' },
  'source.ghl': { nl: 'VirtuGrow', en: 'VirtuGrow' },

  // Invoices
  'invoices.title': { nl: 'Facturen', en: 'Invoices' },
  'invoices.newInvoice': { nl: 'Nieuwe factuur', en: 'New invoice' },
  'invoices.noInvoices': { nl: 'Geen facturen', en: 'No invoices' },

  // Toast messages
  'toast.saved': { nl: 'Opgeslagen', en: 'Saved' },
  'toast.deleted': { nl: 'Verwijderd', en: 'Deleted' },
  'toast.error': { nl: 'Er is een fout opgetreden', en: 'An error occurred' },
  'toast.copied': { nl: 'Gekopieerd', en: 'Copied' },
  'toast.updated': { nl: 'Bijgewerkt', en: 'Updated' },
  'toast.created': { nl: 'Aangemaakt', en: 'Created' },

  // Misc
  'misc.noData': { nl: 'Geen data beschikbaar', en: 'No data available' },
  'misc.confirmDelete': { nl: 'Weet je het zeker? Dit kan niet ongedaan worden gemaakt.', en: 'Are you sure? This cannot be undone.' },
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
