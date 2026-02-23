
-- Update RLS policies for contacts to be organization-based
DROP POLICY IF EXISTS "Users can view own contacts" ON public.contacts;
CREATE POLICY "Org members can view contacts"
  ON public.contacts FOR SELECT
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can create own contacts" ON public.contacts;
CREATE POLICY "Org members can create contacts"
  ON public.contacts FOR INSERT
  WITH CHECK (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can update own contacts" ON public.contacts;
CREATE POLICY "Org members can update contacts"
  ON public.contacts FOR UPDATE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can delete own contacts" ON public.contacts;
CREATE POLICY "Org members can delete contacts"
  ON public.contacts FOR DELETE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

-- Update RLS policies for bookings
DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
CREATE POLICY "Org members can view bookings"
  ON public.bookings FOR SELECT
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can create own bookings" ON public.bookings;
CREATE POLICY "Org members can create bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;
CREATE POLICY "Org members can update bookings"
  ON public.bookings FOR UPDATE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can delete own bookings" ON public.bookings;
CREATE POLICY "Org members can delete bookings"
  ON public.bookings FOR DELETE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

-- Update RLS policies for companies
DROP POLICY IF EXISTS "Users can view own companies" ON public.companies;
CREATE POLICY "Org members can view companies"
  ON public.companies FOR SELECT
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can create own companies" ON public.companies;
CREATE POLICY "Org members can create companies"
  ON public.companies FOR INSERT
  WITH CHECK (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can update own companies" ON public.companies;
CREATE POLICY "Org members can update companies"
  ON public.companies FOR UPDATE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can delete own companies" ON public.companies;
CREATE POLICY "Org members can delete companies"
  ON public.companies FOR DELETE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

-- Update RLS policies for inquiries
DROP POLICY IF EXISTS "Users can view own inquiries" ON public.inquiries;
CREATE POLICY "Org members can view inquiries"
  ON public.inquiries FOR SELECT
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can create own inquiries" ON public.inquiries;
CREATE POLICY "Org members can create inquiries"
  ON public.inquiries FOR INSERT
  WITH CHECK (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can update own inquiries" ON public.inquiries;
CREATE POLICY "Org members can update inquiries"
  ON public.inquiries FOR UPDATE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can delete own inquiries" ON public.inquiries;
CREATE POLICY "Org members can delete inquiries"
  ON public.inquiries FOR DELETE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

-- Update RLS policies for tasks
DROP POLICY IF EXISTS "Users can view own tasks" ON public.tasks;
CREATE POLICY "Org members can view tasks"
  ON public.tasks FOR SELECT
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can create own tasks" ON public.tasks;
CREATE POLICY "Org members can create tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can update own tasks" ON public.tasks;
CREATE POLICY "Org members can update tasks"
  ON public.tasks FOR UPDATE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can delete own tasks" ON public.tasks;
CREATE POLICY "Org members can delete tasks"
  ON public.tasks FOR DELETE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

-- Update RLS policies for contact_activities
DROP POLICY IF EXISTS "Users can view own activities" ON public.contact_activities;
CREATE POLICY "Org members can view activities"
  ON public.contact_activities FOR SELECT
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can create own activities" ON public.contact_activities;
CREATE POLICY "Org members can create activities"
  ON public.contact_activities FOR INSERT
  WITH CHECK (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can update own activities" ON public.contact_activities;
CREATE POLICY "Org members can update activities"
  ON public.contact_activities FOR UPDATE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can delete own activities" ON public.contact_activities;
CREATE POLICY "Org members can delete activities"
  ON public.contact_activities FOR DELETE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

-- Update RLS policies for room_settings
DROP POLICY IF EXISTS "Users can view own room_settings" ON public.room_settings;
CREATE POLICY "Org members can view room_settings"
  ON public.room_settings FOR SELECT
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can create own room_settings" ON public.room_settings;
CREATE POLICY "Org members can create room_settings"
  ON public.room_settings FOR INSERT
  WITH CHECK (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can update own room_settings" ON public.room_settings;
CREATE POLICY "Org members can update room_settings"
  ON public.room_settings FOR UPDATE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));

DROP POLICY IF EXISTS "Users can delete own room_settings" ON public.room_settings;
CREATE POLICY "Org members can delete room_settings"
  ON public.room_settings FOR DELETE
  USING (user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.organization_id = get_user_organization_id(auth.uid())
  ));
