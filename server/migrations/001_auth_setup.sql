-- Migration: Auth Setup
-- This migration sets up the users table and updates existing tables for auth support

-- Users table (references Supabase auth.users)
create table if not exists users (
    id uuid primary key references auth.users(id) on delete cascade,
    email text unique not null,
    role text check (role in ('admin', 'user')) not null default 'user',
    slash_group_id text,
    created_at timestamptz default now()
);

-- Enable Row Level Security
alter table users enable row level security;

-- Policies for users table
create policy if not exists "Users can read own data"
    on users for select
    using (auth.uid() = id);

create policy if not exists "Users can update own data"
    on users for update
    using (auth.uid() = id);

-- Add slash_group_id to cards if it doesn't exist
do $$ 
begin
    if not exists (select 1 from information_schema.columns where table_name='cards' and column_name='slash_group_id') then
        alter table cards add column slash_group_id text;
    end if;
end $$;

-- Update created_by column type if it's not uuid
do $$
begin
    -- Check if created_by is text and convert to uuid
    if exists (
        select 1 from information_schema.columns 
        where table_name='cards' and column_name='created_by' and data_type='text'
    ) then
        -- Drop the column and recreate it (only safe if no important data)
        alter table cards drop column created_by;
        alter table cards add column created_by uuid references users(id);
    end if;
end $$;

-- Enable Row Level Security on cards
alter table cards enable row level security;

-- Policies for cards table
create policy if not exists "Admins can see all cards"
    on cards for select
    using (
        exists (
            select 1 from users
            where users.id = auth.uid() and users.role = 'admin'
        )
    );

create policy if not exists "Users can see own group cards"
    on cards for select
    using (
        exists (
            select 1 from users
            where users.id = auth.uid() 
            and users.role = 'user'
            and users.slash_group_id = cards.slash_group_id
        )
    );

create policy if not exists "Authenticated users can create cards"
    on cards for insert
    with check (auth.uid() = created_by);

-- Update selector_profiles user_id type
do $$
begin
    if exists (
        select 1 from information_schema.columns 
        where table_name='selector_profiles' and column_name='user_id' and data_type='text'
    ) then
        alter table selector_profiles drop column user_id;
        alter table selector_profiles add column user_id uuid references users(id);
    end if;
end $$;

-- Enable RLS on selector_profiles
alter table selector_profiles enable row level security;

-- Policies for selector_profiles
create policy if not exists "Users can read own profiles"
    on selector_profiles for select
    using (auth.uid() = user_id);

create policy if not exists "Users can create own profiles"
    on selector_profiles for insert
    with check (auth.uid() = user_id);

create policy if not exists "Users can update own profiles"
    on selector_profiles for update
    using (auth.uid() = user_id);

create policy if not exists "Users can delete own profiles"
    on selector_profiles for delete
    using (auth.uid() = user_id);

