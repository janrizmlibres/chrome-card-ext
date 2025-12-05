-- Migration: Auto-create users table records on auth signup
-- This trigger automatically creates a record in the public.users table
-- when a new user signs up in auth.users
-- New users are automatically assigned to 'default-group-id'

-- Function to handle new user creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, role, slash_group_id)
  values (
    new.id,
    new.email,
    'user',
    'default-group-id'
  );
  return new;
end;
$$;

-- Trigger to call the function when a new user signs up
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

