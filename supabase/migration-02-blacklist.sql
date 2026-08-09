-- ============================================================
-- TRUE VANILLA - Migration 02
-- Liste noire (accès au sondage et au chat totalement bloqué)
-- + table « staff » lisible (couronne dans le chat).
-- À exécuter une seule fois si schema.sql a déjà été lancé.
-- ============================================================

-- 1. Nouveau type de sanction
alter table public.moderation drop constraint if exists moderation_kind_check;
alter table public.moderation
  add constraint moderation_kind_check check (kind in ('ban', 'timeout', 'blacklist'));

create or replace function public.tv_is_blacklisted(p_discord_id text default null)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.moderation m
    where m.discord_id = coalesce(p_discord_id, public.tv_discord_id())
      and m.active and m.kind = 'blacklist'
  );
$$;

-- Une mise sur liste noire bloque aussi l'envoi de messages.
create or replace function public.tv_active_sanction(p_discord_id text)
returns public.moderation
language sql stable security definer set search_path = public
as $$
  select m.* from public.moderation m
  where m.discord_id = p_discord_id
    and m.active
    and (m.kind in ('ban', 'blacklist') or m.expires_at > now())
  order by (m.kind = 'blacklist') desc, (m.kind = 'ban') desc, m.created_at desc
  limit 1;
$$;

-- 2. Le sondage et le chat deviennent invisibles pour les comptes blacklistés
drop policy if exists "sondages publics visibles" on public.polls;
create policy "sondages publics visibles"
  on public.polls for select
  using ((status <> 'draft' and not public.tv_is_blacklisted()) or public.tv_is_staff());

drop policy if exists "options visibles" on public.poll_options;
create policy "options visibles"
  on public.poll_options for select
  using (not public.tv_is_blacklisted() or public.tv_is_staff());

drop policy if exists "chat lisible" on public.chat_messages;
create policy "chat lisible"
  on public.chat_messages for select
  using (not public.tv_is_blacklisted() or public.tv_is_staff());

-- 3. Sanctionner un identifiant Discord jamais connecté au site
create or replace function public.tv_sanction(p_target text, p_kind text, p_reason text, p_seconds integer)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_id text;
begin
  if not public.tv_is_staff() then raise exception 'NON_AUTORISE'; end if;

  v_id := coalesce(
    public.tv_resolve_user(p_target),
    case when p_target ~ '^[0-9]{15,25}$' then p_target end
  );
  if v_id is null then raise exception 'JOUEUR_INTROUVABLE'; end if;
  if exists (select 1 from public.staff where discord_id = v_id) then
    raise exception 'CIBLE_STAFF';
  end if;

  update public.moderation set active = false where discord_id = v_id and active;

  insert into public.moderation (discord_id, username, kind, reason, expires_at, created_by)
  values (
    v_id,
    coalesce((select username from public.profiles where discord_id = v_id), p_target),
    p_kind,
    coalesce(nullif(trim(p_reason), ''), 'Non précisé'),
    case when p_kind = 'timeout' then now() + make_interval(secs => coalesce(p_seconds, 600)) end,
    public.tv_discord_id()
  );

  return v_id;
end;
$$;

-- 4. Table « staff » lisible par le site (couronne dans le chat)
alter table public.staff enable row level security;
drop policy if exists "staff lisible" on public.staff;
create policy "staff lisible" on public.staff for select using (true);

grant execute on function public.tv_is_blacklisted(text) to anon, authenticated;
