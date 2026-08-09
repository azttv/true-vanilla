-- ============================================================
-- TRUE VANILLA - Migration 03
-- Vider l'historique des sondages / vider le chat (staff).
-- ============================================================

-- Supprime définitivement les sondages terminés (options, votes et
-- participations partent en cascade). Le sondage en direct et les
-- brouillons sont conservés.
create or replace function public.tv_clear_polls()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.tv_is_staff() then raise exception 'NON_AUTORISE'; end if;

  with removed as (
    delete from public.polls where status = 'closed' returning 1
  )
  select count(*) into v_count from removed;

  return v_count;
end;
$$;

-- Supprime définitivement tous les messages du chat.
create or replace function public.tv_clear_chat()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.tv_is_staff() then raise exception 'NON_AUTORISE'; end if;

  with removed as (
    delete from public.chat_messages returning 1
  )
  select count(*) into v_count from removed;

  return v_count;
end;
$$;

grant execute on function public.tv_clear_polls(), public.tv_clear_chat() to authenticated;
