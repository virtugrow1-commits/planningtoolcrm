
-- Conversations table: stores GHL conversation metadata
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  ghl_conversation_id text,
  contact_id uuid,
  contact_name text NOT NULL DEFAULT 'Onbekend',
  phone text,
  email text,
  last_message_body text,
  last_message_date timestamp with time zone,
  last_message_direction text DEFAULT 'inbound',
  unread boolean NOT NULL DEFAULT true,
  channel text DEFAULT 'chat',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Messages table: stores individual messages
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  ghl_message_id text,
  body text NOT NULL DEFAULT '',
  direction text NOT NULL DEFAULT 'inbound',
  message_type text DEFAULT 'TYPE_SMS',
  status text DEFAULT 'delivered',
  date_added timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraints for dedup
CREATE UNIQUE INDEX conversations_ghl_id_unique ON public.conversations (ghl_conversation_id) WHERE ghl_conversation_id IS NOT NULL;
CREATE UNIQUE INDEX messages_ghl_id_unique ON public.messages (ghl_message_id) WHERE ghl_message_id IS NOT NULL;

-- RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view conversations" ON public.conversations FOR SELECT
  USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can create conversations" ON public.conversations FOR INSERT
  WITH CHECK (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update conversations" ON public.conversations FOR UPDATE
  USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete conversations" ON public.conversations FOR DELETE
  USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));

CREATE POLICY "Org members can view messages" ON public.messages FOR SELECT
  USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can create messages" ON public.messages FOR INSERT
  WITH CHECK (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can update messages" ON public.messages FOR UPDATE
  USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));
CREATE POLICY "Org members can delete messages" ON public.messages FOR DELETE
  USING (user_id IN (SELECT p.id FROM profiles p WHERE p.organization_id = get_user_organization_id(auth.uid())));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Updated_at trigger
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
