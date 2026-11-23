// Gegevens van een BUUT-aanvraag voor de offertetool (zie offertetool-api).
import { resolveBedrijfsnaam } from "./bedrijfsnaam.ts";
import { resolveKostenplaats, pickBookings, hhmm } from "./reservering.ts";
import { inloopVoor } from "./begroting.ts";

const trimTime = (t?: string | null) => (t ? String(t).slice(0, 5) : "");
export const contactName = (c: any) => [c?.first_name, c?.infix, c?.last_name].map((v) => String(v ?? "").trim()).filter((v) => v && v !== "—").join(" ");

/** Alle gegevens die de offerte en de reserveringsbevestiging nodig hebben. */
export function buildBundle(inq: any, contact: any, company: any | null, contactCompany: any | null, bookings: any[]) {
  const picked = pickBookings(bookings);
  const main = picked[0];
  const sameDay = main ? picked.filter((b) => b.date === main.date) : [];
  const mins = (b: any) => Number(b.end_hour) * 60 + Number(b.end_minute ?? 0);
  const last = main ? sameDay.reduce((m, b) => (mins(b) > mins(m) ? b : m), main) : null;
  const start = main ? hhmm(main.start_hour, main.start_minute) : trimTime(inq.preferred_start_time);
  const end = last ? hhmm(last.end_hour, last.end_minute) : trimTime(inq.preferred_end_time);
  const guestsBooking = Math.max(0, ...sameDay.map((b) => Number(b.guest_count) || 0));
  const bedrijfsnaam = resolveBedrijfsnaam({
    opNaamVan: null, company, contactCompany: contact?.company,
    contactIsPrivate: contactCompany?.is_private ?? null, contactCompanyRow: contactCompany,
  });
  return {
    inquiry: {
      id: inq.id, displayNumber: inq.display_number ?? null, title: inq.title ?? "", eventType: inq.event_type ?? "",
      status: inq.status, message: inq.message ?? "", createdAt: inq.created_at,
      ghlOpportunityId: inq.ghl_opportunity_id ?? null, reservationNumber: inq.reservation_number ?? null,
      opNaamVan: inq.op_naam_van ?? "", kostenplaats: inq.kostenplaats ?? "",
    },
    contact: contact ? {
      id: contact.id, firstName: [contact.first_name, contact.infix].filter((v: any) => v && String(v).trim()).join(" ").trim(),
      lastName: contact.last_name ?? "", fullName: contactName(contact), email: contact.email ?? "", phone: contact.phone || contact.mobile || "",
      address: contact.address ?? "", postcode: contact.postcode ?? "", city: contact.city ?? "", country: contact.country ?? "",
      ghlContactId: contact.ghl_contact_id ?? null, companyName: contact.company ?? "",
    } : null,
    company: {
      isPrivate: bedrijfsnaam === "Particulier",
      name: bedrijfsnaam === "Particulier" ? "" : bedrijfsnaam,
      id: (company ?? contactCompany)?.id ?? null,
    },
    // "Op naam van" gaat voor op de bedrijfsnaam op het document (zelfde regel als BUUT).
    documentName: resolveBedrijfsnaam({ opNaamVan: inq.op_naam_van, company, contactCompany: contact?.company, contactIsPrivate: contactCompany?.is_private ?? null, contactCompanyRow: contactCompany }),
    costCentre: resolveKostenplaats({ kostenplaats: inq.kostenplaats, company, contactCompany: contact?.company, contactIsPrivate: contactCompany?.is_private ?? null }),
    event: {
      date: main ? String(main.date).slice(0, 10) : (inq.preferred_date ? String(inq.preferred_date).slice(0, 10) : ""),
      startTime: start, endTime: end, walkInTime: start ? inloopVoor(start).replace("—", "") : "",
      guests: guestsBooking > 0 ? guestsBooking : (Number(inq.guest_count) || null),
      room: [...new Set(sameDay.map((b) => b.room_name).filter(Boolean))].join(", ") || (inq.room_preference ?? ""),
      roomSetup: [...new Set(sameDay.map((b) => b.room_setup).filter(Boolean))].join(", "),
      description: inq.event_type ?? "",
      source: main ? (main.status === "confirmed" ? "reservering" : "optie") : (inq.preferred_date ? "voorkeur" : "geen"),
    },
    bookings: picked.map((b) => ({
      id: b.id, date: b.date, status: b.status, room: b.room_name ?? "", roomSetup: b.room_setup ?? "",
      startTime: hhmm(b.start_hour, b.start_minute), endTime: hhmm(b.end_hour, b.end_minute), guests: b.guest_count ?? null,
    })),
  };
}

