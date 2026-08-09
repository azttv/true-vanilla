-- ============================================================
-- TRUE VANILLA - Migration 05
-- Badges de rôle Discord (VIP / Nitro) affichés dans le chat.
-- ============================================================

alter table public.profiles add column if not exists is_vip   boolean not null default false;
alter table public.profiles add column if not exists is_nitro boolean not null default false;

-- Les badges sont écrits par la personne elle-même (politique de mise à jour
-- déjà en place : « chacun met à jour son profil ») et lus par tout le monde.
create index if not exists profiles_badges_idx on public.profiles (discord_id)
  where is_vip or is_nitro;
