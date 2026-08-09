-- ============================================================
-- TRUE VANILLA - Sondage & chat en direct
-- Schéma Supabase complet (à coller dans SQL Editor → Run)
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. OUTILS
-- ============================================================

-- Identifiant Discord de l'utilisateur connecté (issu du JWT Supabase).
create or replace function public.tv_discord_id()
returns text
language sql stable
as $$
  select coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'provider_id', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'sub', '')
  );
$$;

-- Liste du staff.
create table if not exists public.staff (
  discord_id text primary key,
  label      text,
  created_at timestamptz not null default now()
);

-- Compatibilité : une table « staff » créée précédemment peut avoir d'autres colonnes.
alter table public.staff add column if not exists label      text;
alter table public.staff add column if not exists created_at timestamptz not null default now();

-- Rend facultatives les colonnes héritées d'une ancienne table « staff »
-- (username, etc.) pour que l'insertion ci-dessous passe.
do $$
declare c record;
begin
  for c in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'staff'
      and column_name <> 'discord_id'
      and is_nullable = 'NO' and column_default is null
  loop
    execute format('alter table public.staff alter column %I drop not null', c.column_name);
  end loop;
end $$;

insert into public.staff (discord_id, label) values
  ('217271015892451328', 'Staff'),
  ('303167270891290625', 'Staff')
on conflict (discord_id) do nothing;

alter table public.staff enable row level security;
drop policy if exists "staff lisible" on public.staff;
create policy "staff lisible" on public.staff for select using (true);

create or replace function public.tv_is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.staff s where s.discord_id = public.tv_discord_id());
$$;

-- Retire les accents sans dépendre de l'extension unaccent.
create or replace function public.unaccent_fallback(txt text)
returns text
language sql immutable
as $$
  select translate(
    coalesce(txt, ''),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'
  );
$$;

-- Normalisation d'un texte : minuscules, sans accents, sans caractères parasites.
create or replace function public.tv_normalize(txt text)
returns text
language sql immutable
as $$
  select regexp_replace(lower(public.unaccent_fallback(txt)), '[^a-z0-9]', '', 'g');
$$;

-- ============================================================
-- 2. PROFILS
-- ============================================================

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  discord_id text unique not null,
  username   text not null,
  avatar_url text,
  is_vip     boolean not null default false,   -- rôle VIP sur le Discord
  is_nitro   boolean not null default false,   -- rôle Nitro sur le Discord
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists is_vip   boolean not null default false;
alter table public.profiles add column if not exists is_nitro boolean not null default false;

alter table public.profiles enable row level security;

drop policy if exists "profils lisibles par tous" on public.profiles;
create policy "profils lisibles par tous"
  on public.profiles for select using (true);

drop policy if exists "chacun écrit son profil" on public.profiles;
create policy "chacun écrit son profil"
  on public.profiles for insert to authenticated
  with check (id = auth.uid() and discord_id = public.tv_discord_id());

drop policy if exists "chacun met à jour son profil" on public.profiles;
create policy "chacun met à jour son profil"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ============================================================
-- 3. SONDAGES
-- ============================================================

create table if not exists public.polls (
  id           uuid primary key default gen_random_uuid(),
  question     text not null,
  multiple     boolean not null default false,
  status       text not null default 'draft' check (status in ('draft', 'live', 'closed')),
  starts_at    timestamptz,
  ends_at      timestamptz,
  participants integer not null default 0,
  created_by   text,
  created_at   timestamptz not null default now()
);

create table if not exists public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  poll_id  uuid not null references public.polls (id) on delete cascade,
  label    text not null,
  position integer not null default 0,
  votes    integer not null default 0
);

create index if not exists poll_options_poll_idx on public.poll_options (poll_id, position);

create table if not exists public.votes (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.polls (id) on delete cascade,
  option_id  uuid not null references public.poll_options (id) on delete cascade,
  discord_id text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, discord_id, option_id)
);

-- Un participant = une personne ayant validé son vote (sert de base aux pourcentages).
create table if not exists public.poll_participants (
  poll_id    uuid not null references public.polls (id) on delete cascade,
  discord_id text not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, discord_id)
);

alter table public.polls             enable row level security;
alter table public.poll_options      enable row level security;
alter table public.votes             enable row level security;
alter table public.poll_participants enable row level security;

drop policy if exists "sondages publics visibles" on public.polls;
create policy "sondages publics visibles"
  on public.polls for select using (status <> 'draft' or public.tv_is_staff());

drop policy if exists "staff gère les sondages" on public.polls;
create policy "staff gère les sondages"
  on public.polls for all to authenticated
  using (public.tv_is_staff()) with check (public.tv_is_staff());

drop policy if exists "options visibles" on public.poll_options;
create policy "options visibles"
  on public.poll_options for select using (true);

drop policy if exists "staff gère les options" on public.poll_options;
create policy "staff gère les options"
  on public.poll_options for all to authenticated
  using (public.tv_is_staff()) with check (public.tv_is_staff());

-- Les votes individuels ne sont jamais exposés : seuls les compteurs le sont.
drop policy if exists "chacun voit ses votes" on public.votes;
create policy "chacun voit ses votes"
  on public.votes for select to authenticated
  using (discord_id = public.tv_discord_id() or public.tv_is_staff());

drop policy if exists "participation visible" on public.poll_participants;
create policy "participation visible"
  on public.poll_participants for select to authenticated
  using (discord_id = public.tv_discord_id() or public.tv_is_staff());

-- ============================================================
-- 4. MODÉRATION
-- ============================================================

create table if not exists public.moderation (
  id         uuid primary key default gen_random_uuid(),
  discord_id text not null,
  username   text,
  kind       text not null check (kind in ('ban', 'timeout', 'blacklist')),
  reason     text not null default 'Non précisé',
  expires_at timestamptz,
  active     boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists moderation_user_idx on public.moderation (discord_id, active);

alter table public.moderation enable row level security;

drop policy if exists "sanctions visibles" on public.moderation;
create policy "sanctions visibles"
  on public.moderation for select to authenticated using (true);

drop policy if exists "staff gère les sanctions" on public.moderation;
create policy "staff gère les sanctions"
  on public.moderation for all to authenticated
  using (public.tv_is_staff()) with check (public.tv_is_staff());

-- Compte sur liste noire : ne voit plus ni le sondage ni le chat.
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

-- Sanction active d'un joueur (le timeout expiré est ignoré).
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

-- ============================================================
-- 5. FILTRE DE MOTS
-- ============================================================

create table if not exists public.filter_words (
  word       text primary key,
  added_by   text,
  created_at timestamptz not null default now()
);

alter table public.filter_words enable row level security;

drop policy if exists "filtre lisible" on public.filter_words;
create policy "filtre lisible"
  on public.filter_words for select using (true);

drop policy if exists "staff gère le filtre" on public.filter_words;
create policy "staff gère le filtre"
  on public.filter_words for all to authenticated
  using (public.tv_is_staff()) with check (public.tv_is_staff());

-- ============================================================
-- 6. CHAT
-- ============================================================

create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid references public.polls (id) on delete set null,
  discord_id text not null,
  username   text not null,
  avatar_url text,
  content    text not null check (char_length(content) between 1 and 400),
  reply_to         uuid references public.chat_messages (id) on delete set null,
  reply_discord_id text,
  reply_username   text,
  reply_content  text,
  pinned     boolean not null default false,
  deleted    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists chat_created_idx on public.chat_messages (created_at desc);
create index if not exists chat_reply_idx   on public.chat_messages (reply_to);
alter table public.chat_messages replica identity full;
alter table public.chat_messages enable row level security;

drop policy if exists "chat lisible" on public.chat_messages;
create policy "chat lisible"
  on public.chat_messages for select using (true);

drop policy if exists "envoi de message" on public.chat_messages;
create policy "envoi de message"
  on public.chat_messages for insert to authenticated
  with check (
    discord_id = public.tv_discord_id()
    and not deleted
    and not pinned
    and (public.tv_active_sanction(public.tv_discord_id())).id is null
    and exists (
      select 1 from public.polls p
      where p.id = poll_id and p.status = 'live' and p.ends_at > now()
    )
  );

drop policy if exists "staff gère le chat" on public.chat_messages;
create policy "staff gère le chat"
  on public.chat_messages for all to authenticated
  using (public.tv_is_staff()) with check (public.tv_is_staff());

-- Dernier filet de sécurité côté serveur : refuse les mots interdits.
create or replace function public.tv_check_filter()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  norm text := public.tv_normalize(new.content);
  bad  text;
begin
  select w.word into bad
  from public.filter_words w
  where length(public.tv_normalize(w.word)) > 2
    and norm like '%' || public.tv_normalize(w.word) || '%'
  limit 1;

  if bad is not null then
    raise exception 'MESSAGE_FILTRE:%', bad;
  end if;
  return new;
end;
$$;

drop trigger if exists chat_filter_trigger on public.chat_messages;
create trigger chat_filter_trigger
  before insert on public.chat_messages
  for each row execute function public.tv_check_filter();

-- ============================================================
-- 7. FONCTIONS MÉTIER (RPC)
-- ============================================================

-- Ferme automatiquement les sondages arrivés à échéance.
create or replace function public.tv_expire_polls()
returns void
language sql security definer set search_path = public
as $$
  update public.polls
     set status = 'closed'
   where status = 'live' and ends_at is not null and ends_at <= now();
$$;

-- Enregistre un vote (atomique, non modifiable).
create or replace function public.tv_cast_vote(p_poll uuid, p_options uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user text := public.tv_discord_id();
  v_poll public.polls;
begin
  if v_user is null then
    raise exception 'NON_CONNECTE';
  end if;

  select * into v_poll from public.polls where id = p_poll for update;

  if v_poll.id is null or v_poll.status <> 'live' or v_poll.ends_at <= now() then
    raise exception 'SONDAGE_INACTIF';
  end if;

  if array_length(p_options, 1) is null then
    raise exception 'AUCUN_CHOIX';
  end if;

  if not v_poll.multiple and array_length(p_options, 1) > 1 then
    raise exception 'CHOIX_UNIQUE';
  end if;

  if (public.tv_active_sanction(v_user)).id is not null then
    raise exception 'SANCTIONNE';
  end if;

  insert into public.poll_participants (poll_id, discord_id) values (p_poll, v_user);

  insert into public.votes (poll_id, option_id, discord_id)
  select p_poll, o.id, v_user
  from public.poll_options o
  where o.poll_id = p_poll and o.id = any (p_options);

  update public.poll_options
     set votes = votes + 1
   where poll_id = p_poll and id = any (p_options);

  update public.polls set participants = participants + 1 where id = p_poll;
exception
  when unique_violation then
    raise exception 'DEJA_VOTE';
end;
$$;

-- Met un sondage en direct (staff). Détache aussi le message épinglé précédent.
create or replace function public.tv_start_poll(p_poll uuid, p_minutes integer)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.tv_is_staff() then raise exception 'NON_AUTORISE'; end if;

  update public.polls set status = 'closed' where status = 'live';
  update public.chat_messages set pinned = false where pinned;

  update public.polls
     set status    = 'live',
         starts_at = now(),
         ends_at   = now() + make_interval(mins => greatest(p_minutes, 1))
   where id = p_poll;
end;
$$;

create or replace function public.tv_close_poll(p_poll uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.tv_is_staff() then raise exception 'NON_AUTORISE'; end if;
  update public.polls set status = 'closed', ends_at = least(ends_at, now()) where id = p_poll;
end;
$$;

-- Génère des votes fictifs pour tester l'affichage (staff).
create or replace function public.tv_simulate_votes(p_poll uuid, p_count integer)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_opt   uuid;
  v_multi boolean;
  i       integer;
  v_fake  text;
begin
  if not public.tv_is_staff() then raise exception 'NON_AUTORISE'; end if;
  select multiple into v_multi from public.polls where id = p_poll;

  for i in 1..greatest(p_count, 1) loop
    v_fake := 'sim-' || gen_random_uuid()::text;
    insert into public.poll_participants (poll_id, discord_id) values (p_poll, v_fake);

    for v_opt in
      select id from public.poll_options
      where poll_id = p_poll
      order by random()
      limit case when v_multi then 1 + floor(random() * 2)::int else 1 end
    loop
      insert into public.votes (poll_id, option_id, discord_id) values (p_poll, v_opt, v_fake);
      update public.poll_options set votes = votes + 1 where id = v_opt;
    end loop;

    update public.polls set participants = participants + 1 where id = p_poll;
  end loop;
end;
$$;

-- Résout un pseudo Discord ou un identifiant vers un identifiant Discord.
create or replace function public.tv_resolve_user(p_target text)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select discord_id from public.profiles where discord_id = p_target),
    (select discord_id from public.profiles where lower(username) = lower(p_target) limit 1),
    (select discord_id from public.chat_messages where lower(username) = lower(p_target)
      order by created_at desc limit 1)
  );
$$;

-- Sanctionne un joueur (staff). p_seconds = null → bannissement définitif.
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

create or replace function public.tv_unsanction(p_target text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_id text;
begin
  if not public.tv_is_staff() then raise exception 'NON_AUTORISE'; end if;
  v_id := coalesce(public.tv_resolve_user(p_target), p_target);
  update public.moderation set active = false where discord_id = v_id and active;
  return v_id;
end;
$$;

-- Épingle un message (un seul à la fois).
create or replace function public.tv_pin_message(p_message uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.tv_is_staff() then raise exception 'NON_AUTORISE'; end if;
  update public.chat_messages set pinned = false where pinned;
  update public.chat_messages set pinned = true where id = p_message;
end;
$$;

create or replace function public.tv_unpin_all()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.tv_is_staff() then raise exception 'NON_AUTORISE'; end if;
  update public.chat_messages set pinned = false where pinned;
end;
$$;

-- Le staff peut écrire même hors sondage : passage par une fonction dédiée.
create or replace function public.tv_staff_message(
  p_content        text,
  p_reply_to         uuid default null,
  p_reply_discord_id text default null,
  p_reply_username text default null,
  p_reply_content  text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_poll uuid;
begin
  if not public.tv_is_staff() then raise exception 'NON_AUTORISE'; end if;
  select id into v_poll from public.polls where status = 'live' order by starts_at desc limit 1;

  insert into public.chat_messages (poll_id, discord_id, username, avatar_url, content,
                                    reply_to, reply_discord_id, reply_username, reply_content)
  values (
    v_poll,
    public.tv_discord_id(),
    coalesce((select username from public.profiles where discord_id = public.tv_discord_id()), 'Staff'),
    (select avatar_url from public.profiles where discord_id = public.tv_discord_id()),
    p_content,
    p_reply_to, p_reply_discord_id, p_reply_username, p_reply_content
  );
end;
$$;

-- Vide l'historique des sondages terminés (staff).
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

-- Vide définitivement le chat (staff).
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

grant execute on function
  public.tv_clear_polls(),
  public.tv_clear_chat(),
  public.tv_expire_polls(),
  public.tv_cast_vote(uuid, uuid[]),
  public.tv_start_poll(uuid, integer),
  public.tv_close_poll(uuid),
  public.tv_simulate_votes(uuid, integer),
  public.tv_sanction(text, text, text, integer),
  public.tv_unsanction(text),
  public.tv_resolve_user(text),
  public.tv_active_sanction(text),
  public.tv_is_blacklisted(text),
  public.tv_pin_message(uuid),
  public.tv_unpin_all(),
  public.tv_staff_message(text, uuid, text, text, text)
to anon, authenticated;

-- ============================================================
-- 8. RESTRICTIONS DE LA LISTE NOIRE
--    (appliquées ici : la table moderation doit déjà exister)
-- ============================================================

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

-- ============================================================
-- 9. TEMPS RÉEL
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['chat_messages', 'polls', 'poll_options', 'moderation'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
