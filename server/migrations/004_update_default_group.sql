-- Migration: Update trigger to assign default-group-id to new users
-- This replaces the previous trigger that assigned NULL

-- Update the function to use 'default-group-id' instead of null
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

-- The trigger itself doesn't need to be recreated, just the function

