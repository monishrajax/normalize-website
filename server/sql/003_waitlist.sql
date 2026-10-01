-- Normalize — early-access waitlist.
-- Run once in the Supabase SQL editor, or let `npm run migrate` apply it
-- alongside 001 and 002 (migrate.js and the e2e harness both pick up every
-- .sql file in this folder, in filename order).
--
-- One row per interested visitor: name, email, an optional WhatsApp number,
-- and whichever of the gate's rotating questions they happened to answer.
-- The question/answer are kept as plain text, not a foreign key into a
-- QUESTIONS table — the pool lives in the client and can change wording
-- freely without a migration; what matters here is a durable record of what
-- was actually asked and said at signup time, the same "frozen snapshot"
-- reasoning orders.items already uses for catalogue data.

create table if not exists waitlist_signups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  phone      text not null default '',
  question   text not null default '',
  answer     text not null default '',
  created_at timestamptz not null default now()
);

-- One row per person: submitting the form again (another visit, another
-- device) updates their answer rather than creating a duplicate lead. The
-- index is on the lowercased address so "Name@x.com" and "name@x.com" collide
-- on purpose.
create unique index if not exists waitlist_signups_email_idx
  on waitlist_signups (lower(email));

-- RLS on, no policies — same stance as every other table here. The API
-- connects as the owner over the Postgres protocol and bypasses this
-- entirely; what it blocks is Supabase's public PostgREST endpoint reading
-- a list of names, emails and phone numbers directly.
alter table waitlist_signups enable row level security;
