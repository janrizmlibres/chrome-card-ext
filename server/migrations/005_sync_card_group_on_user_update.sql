-- Migration: Auto-sync card group IDs when user's group changes
-- This trigger automatically updates all cards owned by a user
-- when that user's slash_group_id is changed

-- Function to handle user group ID changes
create or replace function public.sync_user_cards_group()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Only proceed if slash_group_id actually changed
  if (old.slash_group_id is distinct from new.slash_group_id) then
    -- Update all cards created by this user
    update public.cards
    set slash_group_id = new.slash_group_id
    where created_by = new.id;
    
    raise notice 'Updated cards for user % to group %', new.id, new.slash_group_id;
  end if;
  
  return new;
end;
$$;

-- Trigger to call the function when a user's group changes
drop trigger if exists on_user_group_changed on public.users;
create trigger on_user_group_changed
  after update on public.users
  for each row
  when (old.slash_group_id is distinct from new.slash_group_id)
  execute procedure public.sync_user_cards_group();

