CREATE POLICY "Public can update quotes by token"
ON public.quotes
FOR UPDATE
TO anon
USING (public_token IS NOT NULL)
WITH CHECK (public_token IS NOT NULL);