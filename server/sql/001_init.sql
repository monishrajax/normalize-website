-- Normalize — initial schema.
-- Run once in the Supabase SQL editor (or: psql "$DATABASE_URL" -f 001_init.sql).
--
-- Mirrors what the Mongo models held, with two deliberate differences:
--   · `desc` became `description`, because DESC is a reserved word in SQL.
--   · Nested objects that were embedded documents are jsonb. For orders that is
--     not laziness: items/pricing/customer are a point-in-time SNAPSHOT of what
--     was charged and where it went, and must not change when the catalogue
--     does. A jsonb blob says "frozen copy" far more clearly than a join.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- products — the ONLY source of truth for price.
-- ---------------------------------------------------------------------------
create table if not exists products (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  category     text not null check (category in ('apparel','bags','caps','accessories')),
  price        integer not null check (price >= 0),        -- whole rupees
  sizes        text[] not null default '{}',
  image        text not null default '',
  images       jsonb not null default '{}'::jsonb,          -- variant -> image
  description  text not null default '',
  details      jsonb not null default '{}'::jsonb,          -- material/design/care

  -- Courier needs these; they never reach the browser.
  sku          text not null,
  -- double precision, NOT numeric: postgres returns numeric as a STRING to
  -- preserve exact precision, so weight_kg would arrive as "0.350" and any
  -- arithmetic on it would silently concatenate. Weight is not money and does
  -- not need exactness; `price` stays integer rupees, which is where it matters.
  weight_kg    double precision not null default 0.5,
  dims         jsonb not null default '{"length":30,"breadth":10,"height":25}'::jsonb,

  -- Launch mode lives in the data, not in a redeploy.
  is_sellable  boolean not null default false,
  is_featured  boolean not null default false,
  sort_order   integer not null default 0,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists products_is_sellable_idx on products (is_sellable);
create index if not exists products_category_idx    on products (category);
create index if not exists products_sort_order_idx  on products (sort_order);

-- ---------------------------------------------------------------------------
-- orders — every order lands here the moment it is created, so a sale can
-- never be invisible just because a browser closed mid-payment.
-- ---------------------------------------------------------------------------
do $$ begin
  create type order_status as enum ('created','paid','failed','shipped','cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null unique,
  razorpay_order_id   text not null unique,
  razorpay_payment_id text,
  status              order_status not null default 'created',

  items    jsonb not null,                         -- frozen line snapshot
  pricing  jsonb not null,                         -- what was actually charged
  customer jsonb not null default '{}'::jsonb,
  shipping jsonb not null default '{}'::jsonb,     -- awb / courier / pending

  paid_at    timestamptz,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_status_idx     on orders (status);
create index if not exists orders_payment_id_idx on orders (razorpay_payment_id);
-- The AWB lives inside the shipping blob; an expression index keeps lookups by
-- tracking number cheap without promoting it to a column.
create index if not exists orders_awb_idx on orders ((shipping->>'awb'));

-- ---------------------------------------------------------------------------
-- updated_at, maintained by the database rather than by every call site.
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

drop trigger if exists products_set_updated_at on products;
create trigger products_set_updated_at before update on products
  for each row execute function set_updated_at();

drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at before update on orders
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security.
--
-- The API connects as the database owner over the Postgres protocol, which
-- bypasses RLS — so these policies do not affect this server at all. What they
-- DO is shut the door on Supabase's auto-generated PostgREST API, which is
-- public on every project and reachable with the anon key. `orders` holds
-- customer names, phone numbers and street addresses; enabling RLS with no
-- policy means no anon or authenticated role can read a single row of it.
--
-- Do not add a permissive policy here without a specific reason.
-- ---------------------------------------------------------------------------
alter table products enable row level security;
alter table orders   enable row level security;
