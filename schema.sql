-- VENTURA 2.0 — esquema inicial do banco
-- Execute no SQL Editor de um NOVO projeto Supabase.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null default 0 check(price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  service_id uuid references public.services(id) on delete set null,
  booking_date date not null,
  booking_time time not null,
  notes text default '',
  status text not null default 'pending' check(status in ('pending','confirmed','cancelled','completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(10,2) not null check(amount > 0),
  sale_date date not null default current_date,
  created_at timestamptz not null default now()
);

create or replace function public.is_ventura_admin()
returns boolean language sql stable security definer
set search_path = public
as $$ select exists(select 1 from public.admin_users where user_id = auth.uid()); $$;

alter table public.admin_users enable row level security;
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.sales enable row level security;

create policy "admins read admin list" on public.admin_users for select to authenticated using (public.is_ventura_admin());
create policy "public read active services" on public.services for select to anon, authenticated using (active or public.is_ventura_admin());
create policy "admins manage services" on public.services for all to authenticated using (public.is_ventura_admin()) with check (public.is_ventura_admin());

-- Clientes podem solicitar horário. Dados pessoais só ficam visíveis à administração.
create policy "public submit booking" on public.bookings for insert to anon, authenticated with check (status = 'pending');
create policy "admins read bookings" on public.bookings for select to authenticated using (public.is_ventura_admin());
create policy "admins update bookings" on public.bookings for update to authenticated using (public.is_ventura_admin()) with check (public.is_ventura_admin());
create policy "admins manage sales" on public.sales for all to authenticated using (public.is_ventura_admin()) with check (public.is_ventura_admin());

-- Depois de criar o usuário administrativo em Authentication > Users,
-- copie o UUID dele e execute:
-- insert into public.admin_users(user_id) values ('COLE-O-UUID-AQUI');
