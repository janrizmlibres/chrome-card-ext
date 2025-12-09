-- Teardown script to remove all schema objects created in schema.sql

-- Drop triggers
drop trigger if exists on_auth_user_created on auth.users;

-- Drop policies
drop policy if exists "Users can read own data" on users;
drop policy if exists "Users can insert own data" on users;
drop policy if exists "Users can update own data" on users;

drop policy if exists "Any authenticated user can read selector profiles" on selector_profiles;
drop policy if exists "Any authenticated user can create selector profiles" on selector_profiles;
drop policy if exists "Any authenticated user can update selector profiles" on selector_profiles;
drop policy if exists "Any authenticated user can delete selector profiles" on selector_profiles;

drop policy if exists "Any authenticated user can read network profiles" on network_profiles;
drop policy if exists "Only admins can create network profiles" on network_profiles;
drop policy if exists "Only admins can update network profiles" on network_profiles;
drop policy if exists "Only admins can delete network profiles" on network_profiles;

drop policy if exists "Any authenticated user can read addresses" on addresses;
drop policy if exists "Only admins can insert addresses" on addresses;
drop policy if exists "Only admins can update addresses" on addresses;
drop policy if exists "Only admins can delete addresses" on addresses;

-- Drop functions
drop function if exists public.handle_new_user() cascade;
drop function if exists public.sync_user_cards_group() cascade;

-- Drop tables (dependents first)
drop table if exists audit_logs cascade;
drop table if exists network_profiles cascade;
drop table if exists selector_profiles cascade;
drop table if exists addresses cascade;
drop table if exists settings cascade;
drop table if exists users cascade;
