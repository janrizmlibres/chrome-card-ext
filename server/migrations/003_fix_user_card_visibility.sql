-- Migration: Fix user card visibility policy
-- Users with NULL slash_group_id should only see their own cards
-- Users with a group ID should see all cards from their group

-- Drop the old policy
drop policy if exists "Users can see own group cards" on cards;

-- Create the updated policy
create policy "Users can see own group cards"
    on cards for select
    using (
        exists (
            select 1 from users
            where users.id = auth.uid() 
            and users.role = 'user'
            and (
                -- If user has a group, show cards from that group
                (users.slash_group_id is not null 
                 and users.slash_group_id = cards.slash_group_id)
                -- If user has no group, only show their own cards
                or (users.slash_group_id is null 
                    and cards.created_by = auth.uid())
            )
        )
    );

