-- ============================================================
-- TRUE VANILLA - Migration 06
-- Réponses dans le chat (« Répondre à … »).
-- ============================================================

alter table public.chat_messages add column if not exists reply_to       uuid;
alter table public.chat_messages add column if not exists reply_discord_id text;
alter table public.chat_messages add column if not exists reply_username text;
alter table public.chat_messages add column if not exists reply_content  text;

-- Le message cité est conservé en clair : si l'original est supprimé,
-- la citation reste lisible.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_reply_to_fkey'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_reply_to_fkey
      foreign key (reply_to) references public.chat_messages (id) on delete set null;
  end if;
end $$;

create index if not exists chat_reply_idx on public.chat_messages (reply_to);

-- Le staff peut aussi citer un message hors sondage.
drop function if exists public.tv_staff_message(text);

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

grant execute on function public.tv_staff_message(text, uuid, text, text, text) to authenticated;
