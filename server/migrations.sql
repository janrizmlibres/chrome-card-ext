-- Create audit_logs table
create table if not exists audit_logs (
  id uuid default gen_random_uuid() primary key,
  card_id uuid references cards(id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
