-- Ensure required extensions
create extension if not exists pgcrypto with schema extensions;

-- Users table (references Supabase auth.users)
create table users (
    id uuid primary key references auth.users(id) on delete cascade,
    email text unique not null,
    role text check (role in ('admin', 'user')) not null default 'user',
    slash_group_id text,
    created_at timestamptz default now()
);

-- Enable Row Level Security
alter table users enable row level security;

-- Policies for users table
create policy "Users can read own data"
    on users for select
    using (auth.uid() = id);

create policy "Users can insert own data"
    on users for insert
    with check (auth.uid() = id);

create policy "Users can update own data"
    on users for update
    using (auth.uid() = id);

-- Trigger function to auto-create users table record on signup
-- New users get a random slash_group_id
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public, extensions
as $$
begin
  -- Only seed the users row; let the app assign slash_group_id from Slash API
  insert into public.users (id, email, role)
  values (
    new.id,
    new.email,
    'user'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Trigger to call the function when a new user signs up
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table settings (
    id int primary key default 1,
    cooldown_interval int default 30
);

create table selector_profiles (
    id uuid default gen_random_uuid() primary key,
    domain text not null unique,
    user_id uuid references users(id),
    cardNumberSelectors text[],
    cardExpirySelectors text[],
    cvvSelectors text[],
    cardNameSelectors text[],
    address1Selectors text[],
    address2Selectors text[],
    citySelectors text[],
    stateSelectors text[],
    zipSelectors text[],
    phoneSelectors text[],
    nameSelectors text[],
    created_at timestamptz default now()
);

-- Enable RLS on selector_profiles
alter table selector_profiles enable row level security;

-- Include CASCADE delete on users
alter table selector_profiles 
    drop constraint if exists selector_profiles_user_id_fkey,
    add constraint selector_profiles_user_id_fkey 
    foreign key (user_id) references users(id) on delete cascade;

create policy "Any authenticated user can read selector profiles"
    on selector_profiles for select
    using (auth.role() = 'authenticated');

create policy "Any authenticated user can create selector profiles"
    on selector_profiles for insert
    with check (auth.role() = 'authenticated');

create policy "Any authenticated user can update selector profiles"
    on selector_profiles for update
    using (auth.role() = 'authenticated');

create policy "Any authenticated user can delete selector profiles"
    on selector_profiles for delete
    using (auth.role() = 'authenticated');

create table network_profiles (
    id uuid default gen_random_uuid() primary key,
    domain text not null,
    user_id uuid references users(id),
    rules jsonb not null default '[]'::jsonb,
    created_at timestamptz default now()
);

alter table network_profiles enable row level security;

create policy "Any authenticated user can read network profiles"
    on network_profiles for select
    using (auth.role() = 'authenticated');

create policy "Only admins can create network profiles"
    on network_profiles for insert
    with check (
        exists (
            select 1 from public.users
            where users.id = auth.uid()
            and users.role = 'admin'
        )
    );

create policy "Only admins can update network profiles"
    on network_profiles for update
    using (
        exists (
            select 1 from public.users
            where users.id = auth.uid()
            and users.role = 'admin'
        )
    );

create policy "Only admins can delete network profiles"
    on network_profiles for delete
    using (
        exists (
            select 1 from public.users
            where users.id = auth.uid()
            and users.role = 'admin'
        )
    );

-- Addresses table (shared across all users, admin import)
create table addresses (
    id uuid default gen_random_uuid() primary key,
    address1 text not null,
    address2 text,
    city text not null,
    state text not null,
    zip text,
    phone text,
    name text not null,
    last_used timestamptz,
    usage_count int default 0,
    excluded_until timestamptz,
    created_by uuid references users(id),
    created_at timestamptz default now()
);

alter table addresses enable row level security;

create policy "Any authenticated user can read addresses"
    on addresses for select
    using (auth.role() = 'authenticated');

create policy "Only admins can insert addresses"
    on addresses for insert
    with check (
        exists (
            select 1 from public.users
            where users.id = auth.uid()
            and users.role = 'admin'
        )
    );

create policy "Only admins can update addresses"
    on addresses for update
    using (
        exists (
            select 1 from public.users
            where users.id = auth.uid()
            and users.role = 'admin'
        )
    );

create policy "Only admins can delete addresses"
    on addresses for delete
    using (
        exists (
            select 1 from public.users
            where users.id = auth.uid()
            and users.role = 'admin'
        )
    );

-- Audit logs table
create table audit_logs (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references users(id),
    card_id text,
    address_id uuid references addresses(id),
    action text not null,
    details jsonb,
    created_at timestamptz default now()
);