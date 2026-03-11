

# Complete Plan: Production-Ready CRM with Roles, Google Login, GHL Integration & Security

This plan covers everything needed to make the CRM production-ready, organized into phases.

---

## Phase 1: User Roles (Admin & Team Member)

**Problem:** Currently every logged-in user sees everything including API keys and settings. There's no distinction between admin and team member.

**Solution:**
- Create a `user_roles` table with an `app_role` enum (`admin`, `team_member`)
- Create a `profiles` table to store display names and metadata
- Create a `has_role()` security definer function to check roles without RLS recursion
- Auto-create profile + default role via database trigger on signup
- Update all existing RLS policies to scope data to the organization (not just individual user)

**What changes for users:**
- **Admin**: Full access to Settings, API keys, GHL config, webhook URLs, user management, sync buttons
- **Team Member**: Can use CRM, Calendar, Conversations, etc. but CANNOT see Settings/credentials sections. The "Instellingen" nav item is hidden or shows only non-sensitive settings (e.g. personal preferences)

---

## Phase 2: Google Login

**Solution:**
- Use Lovable Cloud's managed Google OAuth (no extra config needed)
- Add a "Inloggen met Google" button to the AuthPage
- Uses `lovable.auth.signInWithOAuth("google", ...)` which is automatically managed

---

## Phase 3: Secure GHL Configuration (Admin Only)

**Problem:** Currently the API Key and Location ID are entered in a client-side form that doesn't actually save them. The real secrets are stored as backend secrets but the Settings page gives a false impression of configurability.

**Solution:**
- Create a new `organization_settings` table to store non-sensitive config (webhook URL display, sync preferences, enabled webhooks)
- The GHL API Key and Location ID are already stored as backend secrets -- the admin should be able to update them via a secure edge function (`update-settings`) that validates the admin role before saving
- Create a new edge function `manage-ghl-config` that:
  - Only admins can call (checks role in DB)
  - Validates the API key against GHL before saving
  - Stores/updates secrets securely
- Remove the fake client-side "connect" flow

---

## Phase 4: Webhook URL Display & Configuration

**Problem:** The webhook URL (`https://homqvnnphotphxemurwp.supabase.co/functions/v1/ghl-webhook`) exists but isn't clearly shown to the admin for easy copy-paste into GHL.

**Solution:**
- Show the webhook URL prominently in the admin Settings page with a copy button
- Add clear instructions: "Plak deze URL in GHL -> Settings -> Webhooks"
- The webhook endpoint already exists and works -- just needs visibility

---

## Phase 5: Multi-User / Organization Support

**Problem:** Currently the webhook handler picks a random `user_id` from the database. With multiple users, data needs to belong to an organization.

**Solution:**
- Create an `organizations` table
- Add `organization_id` to all data tables (contacts, bookings, inquiries, companies, tasks, contact_activities)
- Update RLS policies: users can see data from their organization
- Update the webhook handler to use organization-level user assignment instead of picking a random user
- First registered user becomes admin of the organization

---

## Phase 6: Admin User Management

**Solution:**
- New "Team" tab in Settings (admin only)
- Admin can invite team members by email (sends invite via Supabase auth)
- Admin can change roles (promote/demote)
- Admin can remove team members
- Create an `invitations` table for pending invites

---

## Phase 7: Security Hardening

Current security gaps and fixes:

| Issue | Fix |
|-------|-----|
| Webhook has no signature verification | Add HMAC signature validation for GHL webhooks |
| API key visible in client-side form | Move to server-side only, admin-gated edge function |
| No rate limiting on edge functions | Add basic rate limiting |
| `trigger_ghl_sync` function exposes anon key in plaintext SQL | Refactor to use `current_setting()` or remove hardcoded key |
| Settings page API key field stores nothing | Connect to real backend or remove |
| Webhook picks random user_id | Scope to organization |

---

## Phase 8: Additional Improvements

- **Audit log**: Track who changed what (admin can view)
- **Session management**: Show active sessions, allow admin to revoke
- **Password reset flow**: Add forgot password + reset page (currently missing)
- **Email verification**: Ensure email confirmation is required before login
- **Auto-sync toggle**: Let admin enable/disable automatic GHL sync per data type

---

## Technical Implementation Summary

### New Database Tables

```text
organizations
  - id (uuid, PK)
  - name (text)
  - ghl_location_id (text, nullable)
  - created_at (timestamptz)

profiles
  - id (uuid, PK, references auth.users)
  - organization_id (uuid, FK -> organizations)
  - display_name (text)
  - created_at (timestamptz)

user_roles
  - id (uuid, PK)
  - user_id (uuid, FK -> auth.users, CASCADE)
  - role (app_role enum: admin, team_member)
  - UNIQUE(user_id, role)

organization_settings
  - id (uuid, PK)
  - organization_id (uuid, FK -> organizations)
  - key (text)
  - value (text)
  - UNIQUE(organization_id, key)

invitations
  - id (uuid, PK)
  - organization_id (uuid, FK -> organizations)
  - email (text)
  - role (app_role)
  - invited_by (uuid)
  - status (text: pending, accepted, expired)
  - created_at (timestamptz)
```

### Modified Tables (add organization_id)
- contacts, companies, bookings, inquiries, tasks, contact_activities, room_settings

### New Edge Functions
- `manage-ghl-config`: Admin-only, validates + stores GHL credentials
- `manage-team`: Admin-only, invite/remove/change role of team members

### Modified Files
- `AuthPage.tsx`: Add Google login button
- `AppLayout.tsx`: Conditionally show Settings based on role
- `SettingsPage.tsx`: Restructure tabs -- admin-only sections hidden for team members, add Team management tab, show webhook URL with copy button
- `AuthContext.tsx`: Add role + organization info
- All context providers: Add organization_id scoping
- `ghl-webhook/index.ts`: Use organization_id instead of random user
- `ghl-sync/index.ts`: Scope to organization

### Implementation Order
1. Database migrations (tables, functions, triggers, RLS)
2. Google login
3. Role-based UI (hide settings for non-admins)
4. Admin GHL config management
5. Team management
6. Webhook URL display
7. Security fixes
8. Multi-org scoping

