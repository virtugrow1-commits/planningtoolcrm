
-- Phase 1: Foundation tables for roles & organizations

-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'team_member');

-- 2. Create organizations table
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Mijn Organisatie',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 3. Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Create has_role security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 6. Get user's organization_id (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = _user_id
$$;

-- 7. Trigger: auto-create org + profile + admin role on first signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  user_display_name text;
BEGIN
  -- Use raw_user_meta_data for display name
  user_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Check if any organization exists yet
  SELECT id INTO new_org_id FROM public.organizations LIMIT 1;

  IF new_org_id IS NULL THEN
    -- First user: create org, assign admin
    INSERT INTO public.organizations (name) VALUES ('Mijn Organisatie')
    RETURNING id INTO new_org_id;

    INSERT INTO public.profiles (id, organization_id, display_name)
    VALUES (NEW.id, new_org_id, user_display_name);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    -- Subsequent users: join existing org as team_member
    INSERT INTO public.profiles (id, organization_id, display_name)
    VALUES (NEW.id, new_org_id, user_display_name);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'team_member');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. RLS policies for organizations
CREATE POLICY "Users can view their organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = public.get_user_organization_id(auth.uid()));

-- 9. RLS policies for profiles
CREATE POLICY "Users can view profiles in their org"
  ON public.profiles FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- 10. RLS policies for user_roles
CREATE POLICY "Users can view roles in their org"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT p.id FROM public.profiles p
      WHERE p.organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
