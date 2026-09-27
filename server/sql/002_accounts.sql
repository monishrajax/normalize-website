-- Normalize — customer accounts.
-- Run once in the Supabase SQL editor (or: psql "$DATABASE_URL" -f 002_accounts.sql).
--
-- Identity itself is NOT defined here. Supabase Auth owns `auth.users` — the
-- email, the password hash, the confirmation state — and this file only adds
-- the things a storefront needs hung off it. That split is the whole reason for
-- using Supabase Auth rather than writing our own: no password column of ours
-- to leak, no reset-token logic of ours to get wrong.
--
-- Because auth.users lives in THIS database, these can be real foreign keys
-- with real cascades. An external auth vendor would have left user_id as a
-- string we hand-synced and hoped stayed consistent.
--
-- The keys are added at the END of this file, guarded on the auth schema
-- existing. The e2e suite builds a throwaway Postgres that has no Supabase and
-- therefore no auth.users, and a hard reference here would mean accounts were
-- the one part of the app no test could ever touch. On Supabase the constraints
-- are created and behave exactly as written; on a bare cluster the columns are
-- plain uuids and everything else is identical.

-- ---------------------------------------------------------------------------
-- orders.user_id — NULLABLE, and that is the point.
--
-- Guest checkout stays exactly as it is: no account required to buy, and every
-- order already in this table keeps working untouched. The column records who
-- placed an order only when it was placed while signed in.
--
-- `on delete set null` NOT cascade: deleting an account must not delete the
-- sales record. The order still happened, the money still moved, and the
-- customer snapshot in `customer` jsonb is what dispatch runs on.
-- ---------------------------------------------------------------------------
alter table orders add column if not exists user_id uuid;

create index if not exists orders_user_id_idx on orders (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- profiles — the storefront's own view of a customer.
--
-- auth.users is Supabase's table and should not be written to directly, so
-- anything we want to know about a customer lives here, keyed one-to-one.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  user_id    uuid primary key,
  full_name  text not null default '',
  phone      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- addresses — saved delivery addresses.
--
-- Deliberately mirrors the checkout form's fields one for one, so prefilling is
-- a copy rather than a translation. Same validation lives on both sides: a
-- 10-digit Indian mobile starting 6-9, a 6-digit PIN not starting 0.
--
-- These are NOT the addresses an order ships to. An order freezes its own copy
-- in `orders.customer` at purchase time — editing a saved address later must
-- never rewrite where a past parcel went.
-- ---------------------------------------------------------------------------
create table if not exists addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  label      text not null default 'Home',
  name       text not null,
  phone      text not null check (phone ~ '^[6-9][0-9]{9}$'),
  line1      text not null,
  city       text not null,
  state      text not null,
  pincode    text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists addresses_user_id_idx on addresses (user_id, created_at desc);

-- At most one default per customer, enforced by the database rather than by
-- whichever code path happened to write last.
create unique index if not exists addresses_one_default_idx
  on addresses (user_id) where is_default;

-- ---------------------------------------------------------------------------
-- wishlists — the saved-items list, once it outgrows localStorage.
--
-- A row per saved product rather than an array column: the primary key then
-- makes saving the same item twice impossible, so the merge on sign-in is a
-- plain upsert instead of a read-modify-write that can race between devices.
--
-- `on delete cascade` from products too — a withdrawn product should not sit in
-- someone's wishlist pointing at nothing.
-- ---------------------------------------------------------------------------
create table if not exists wishlists (
  user_id    uuid not null,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists wishlists_user_id_idx on wishlists (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS on, no policies — the same stance as products and orders in 001_init.
--
-- The API connects over the Postgres protocol as the owner and bypasses RLS
-- entirely, so this costs it nothing. What it does is shut the door on
-- Supabase's auto-generated PostgREST API, which is public on every project.
-- These tables hold names, phone numbers and home addresses; the browser holds
-- an anon key and must never be able to read a single row of them directly.
--
-- Do not add a permissive policy here without a specific reason. "The frontend
-- needs it" is not one — the frontend goes through our API, which checks a
-- verified JWT and filters by the user id IN that token.
-- ---------------------------------------------------------------------------
alter table profiles  enable row level security;
alter table addresses enable row level security;
alter table wishlists enable row level security;

-- Keep updated_at honest without every caller remembering to set it.
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

drop trigger if exists addresses_touch on addresses;
create trigger addresses_touch before update on addresses
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- The foreign keys into Supabase Auth, added only where auth.users exists.
--
-- `on delete set null` for orders, `cascade` for the rest: deleting an account
-- must take that person's saved addresses and wishlist with it, but must NOT
-- delete the sales record. The order still happened and the money still moved;
-- `orders.customer` holds the frozen snapshot dispatch actually runs on.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('auth.users') is null then
    raise notice 'auth.users not found - skipping foreign keys (not a Supabase database)';
    return;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_user_id_fkey') then
    alter table orders add constraint orders_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_user_id_fkey') then
    alter table profiles add constraint profiles_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'addresses_user_id_fkey') then
    alter table addresses add constraint addresses_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'wishlists_user_id_fkey') then
    alter table wishlists add constraint wishlists_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;
