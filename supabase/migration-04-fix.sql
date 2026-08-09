-- ============================================================
-- TRUE VANILLA - Migration 04 (correctif groupé)
-- Regroupe les migrations 02 et 03, et corrige les cas où
-- « /clearpolls » ou la liste noire ne répondent pas :
--   • type de sanction « blacklist » autorisé
--   • sanction possible sur un identifiant Discord jamais connecté
--   • fonctions tv_clear_polls / tv_clear_chat
--   • droits d'exécution accordés à tous les comptes connectés
-- Ré-exécutable autant de fois que nécessaire.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Liste noire
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 2. Sanctionner un identifiant Discord jamais connecté au site
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 3. Le sondage et le chat deviennent invisibles aux blacklistés
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. Table « staff » lisible (couronne dans le chat)
-- ------------------------------------------------------------
alter table public.staff enable row level security;
drop policy if exists "staff lisible" on public.staff;
create policy "staff lisible" on public.staff for select using (true);

-- ------------------------------------------------------------
-- 5. Vider l'historique des sondages / le chat
-- ------------------------------------------------------------
create or replace function public.tv_clear_polls()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.tv_is_staff() then raise exception 'NON_AUTORISE'; end if;
  with removed as (delete from public.polls where status = 'closed' returning 1)
  select count(*) into v_count from removed;
  return v_count;
end;
$$;

create or replace function public.tv_clear_chat()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.tv_is_staff() then raise exception 'NON_AUTORISE'; end if;
  with removed as (delete from public.chat_messages returning 1)
  select count(*) into v_count from removed;
  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- 6. Droits d'exécution
-- ------------------------------------------------------------
grant execute on function
  public.tv_is_blacklisted(text),
  public.tv_active_sanction(text),
  public.tv_resolve_user(text),
  public.tv_sanction(text, text, text, integer),
  public.tv_unsanction(text),
  public.tv_clear_polls(),
  public.tv_clear_chat()
to anon, authenticated;

-- ------------------------------------------------------------
-- 7. Vérification : doit renvoyer 7 lignes
-- ------------------------------------------------------------
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('tv_clear_polls', 'tv_clear_chat', 'tv_is_blacklisted',
                       'tv_sanction', 'tv_unsanction', 'tv_active_sanction', 'tv_resolve_user')
order by routine_name;
