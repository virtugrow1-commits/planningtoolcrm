DROP POLICY IF EXISTS "Authenticated users can read task suppressions" ON public.ghl_task_suppressions;
CREATE POLICY "Admins can read task suppressions" ON public.ghl_task_suppressions
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'));