/**
 * Resolve a contact from an inquiry/booking that may not be linked yet.
 * Records synced from VirtuGrow can arrive before their contact exists locally,
 * leaving contactId empty. Falling back to a normalized name match keeps the
 * contact clickable in the UI.
 */
export interface NamedContact {
  id: string;
  firstName: string;
  lastName: string;
  [key: string]: any;
}

const nameKey = (s?: string | null) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

export function resolveContact<T extends NamedContact>(
  contacts: T[],
  contactId?: string | null,
  contactName?: string | null,
): T | null {
  if (contactId) {
    const byId = contacts.find(c => c.id === contactId);
    if (byId) return byId;
  }
  const target = nameKey(contactName);
  if (!target) return null;
  return contacts.find(c => nameKey(`${c.firstName} ${c.lastName}`) === target) || null;
}
