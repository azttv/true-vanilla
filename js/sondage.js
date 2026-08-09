const SUPABASE_URL = 'https://lnszzmonnomfdkxaldyw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxuc3p6bW9ubm9tZmRreGFsZHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyMzg1MzksImV4cCI6MjA4NDgxNDUzOX0.JxslMDVBhGziQ2JfqOAgm9KdvMBE_w9xfHVXYlYmFNw';              // ← à remplacer

const STAFF_IDS = ['217271015892451328', '303167270891290625'];

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/* ============================================================
   1. RACCOURCIS & OUTILS
   ============================================================ */

const $ = (sel) => document.querySelector(sel);
const el = {
  gate: $('#gate'), gateLogin: $('#gate-login'), gateError: $('#gate-error'),
  meBar: $('#me-bar'), meAvatar: $('#me-avatar'), meUsername: $('#me-username'),
  meStaff: $('#me-staff'), meLogout: $('#me-logout'),

  pollPill: $('#poll-pill'), pollPillText: $('#poll-pill-text'),
  pollSkeleton: $('#poll-skeleton'), pollEmpty: $('#poll-empty'), pollLive: $('#poll-live'),
  pollQuestion: $('#poll-question'), pollMode: $('#poll-mode'),
  pollOptions: $('#poll-options'), pollMeta: $('#poll-meta'), pollVote: $('#poll-vote'),

  chatPill: $('#chat-pill'), chatPillText: $('#chat-pill-text'),
  chatList: $('#chat-list'), chatSkeleton: $('#chat-skeleton'), chatEmpty: $('#chat-empty'),
  chatPin: $('#chat-pin'), pinUser: $('#pin-user'), pinText: $('#pin-text'),
  chatInput: $('#chat-input'), chatSend: $('#chat-send'), chatInputRow: $('#chat-input-row'),
  chatLocked: $('#chat-locked'), lockTitle: $('#lock-title'),
  lockReason: $('#lock-reason'), lockDuration: $('#lock-duration'),
  cmdList: $('#cmd-list'),

  staffPoll: $('#staff-poll'), staffChat: $('#staff-chat'),
  spQuestion: $('#sp-question'), spMode: $('#sp-mode'), spDuration: $('#sp-duration'),
  spOptions: $('#sp-options'), spAddOption: $('#sp-add-option'),
  spSave: $('#sp-save'), spStart: $('#sp-start'), spClose: $('#sp-close'),
  spSimCount: $('#sp-sim-count'), spSimulate: $('#sp-simulate'),
  spHistory: $('#sp-history'), spStatus: $('#sp-status'),

  scBans: $('#sc-bans'), scTimeouts: $('#sc-timeouts'),
  scWord: $('#sc-word'), scWordAdd: $('#sc-word-add'), scWords: $('#sc-words'),
  scUnpin: $('#sc-unpin'), scStatus: $('#sc-status'),

  profileModal: $('#profile-modal'), profileAvatar: $('#profile-avatar'),
  profileName: $('#profile-name'), profileId: $('#profile-id'), profileMsgs: $('#profile-msgs'),
  blockedModal: $('#blocked-modal'), blockedWords: $('#blocked-words'),
  toast: $('#toast'),
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const show = (node, visible = true) => { if (node) node.hidden = !visible; };

let toastTimer = null;
function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3200);
}

// Couleur stable et lisible à partir de l'identifiant Discord.
function userHue(id) {
  let h = 0;
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) % 360;
  return h;
}
const userColors = (id) => {
  const h = userHue(id);
  return { light: `hsl(${h}, 62%, 34%)`, dark: `hsl(${h}, 78%, 70%)` };
};

const fmtTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// « 2 j 4 h », « 12 min 30 s », « 45 s »
function fmtLeft(ms) {
  if (ms <= 0) return 'terminé';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} j ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${sec} s`;
  return `${sec} s`;
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/* ============================================================
   2. MODÉRATION AUTOMATIQUE (filter.yml + mots du staff)
   ============================================================ */

const FILTER = {
  regex: (window.TV_FILTER?.RX || []).map((r) => {
    try { return new RegExp(r, 'i'); } catch (e) { return null; }
  }).filter(Boolean),
  words: [...(window.TV_FILTER?.WORDS || [])],
};

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '€': 'e', '!': 'i', '|': 'l' };

function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[0134578@$€!|]/g, (c) => LEET[c] || c);
}
const squeeze = (s) => s.replace(/(.)\1+/g, '$1');
const flatten = (s) => normalize(s).replace(/[^a-z0-9]/g, '');

// Renvoie la liste des éléments interdits trouvés dans le message.
function scanMessage(text) {
  const found = new Set();

  FILTER.regex.forEach((rx) => { if (rx.test(text)) found.add('lien / adresse IP'); });

  const flat = flatten(text);
  const flatSq = squeeze(flat);
  const tokens = normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
  const tokensSq = tokens.map(squeeze);

  FILTER.words.forEach((word) => {
    const w = flatten(word);
    if (!w) return;
    const wSq = squeeze(w);
    const hit = w.length <= 3
      ? tokens.includes(w) || tokensSq.includes(wSq)
      : flat.includes(w) || flatSq.includes(wSq);
    if (hit) found.add(word);
  });

  return [...found];
}

/* ============================================================
   3. ÉTAT
   ============================================================ */

const state = {
  me: null,           // { id, username, avatar, staff }
  poll: null,         // sondage affiché
  options: [],
  myOptions: [],      // options déjà votées
  hasVoted: false,
  picked: new Set(),
  messages: [],
  pinned: null,
  sanction: null,
  draftId: null,
  loading: true,
};

const isLive = () => !!state.poll && state.poll.status === 'live' && new Date(state.poll.ends_at) > new Date();
const canChat = () => state.me && isLive() && !state.sanction;

/* ============================================================
   4. AUTHENTIFICATION DISCORD
   ============================================================ */

el.gateLogin.addEventListener('click', async () => {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: location.origin + location.pathname, scopes: 'identify' },
  });
  if (error) el.gateError.textContent = 'Connexion impossible : ' + error.message;
});

el.meLogout.addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

function closeGate() {
  if (el.gate.hidden) return;
  el.gate.classList.add('is-leaving');
  setTimeout(() => { el.gate.hidden = true; el.gate.classList.remove('is-leaving'); }, 450);
}

async function applySession(session) {
  if (!session) {
    state.me = null;
    show(el.meBar, false);
    show(el.gate, true);
    return;
  }
  const m = session.user.user_metadata || {};
  const id = m.provider_id || m.sub || session.user.id;

  state.me = {
    id,
    username: m.custom_claims?.global_name || m.full_name || m.name || m.user_name || 'Joueur',
    avatar: m.avatar_url || '',
    staff: STAFF_IDS.includes(id),
  };

  el.meAvatar.src = state.me.avatar;
  el.meUsername.textContent = state.me.username;
  show(el.meStaff, state.me.staff);
  show(el.meBar, true);
  show(el.staffPoll, state.me.staff);
  show(el.staffChat, state.me.staff);
  closeGate();

  await sb.from('profiles').upsert({
    id: session.user.id,
    discord_id: id,
    username: state.me.username,
    avatar_url: state.me.avatar,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  await refreshSanction();
  await loadMyVote();
  if (state.me.staff) { loadStaffData(); loadDraft(); }
  renderPoll();
  renderChat();
  renderComposer();
}

/* ============================================================
   5. CHARGEMENT DES DONNÉES
   ============================================================ */

async function loadPoll() {
  await sb.rpc('tv_expire_polls');

  let { data } = await sb.from('polls').select('*').eq('status', 'live')
    .order('starts_at', { ascending: false }).limit(1);

  if (!data || !data.length) {
    ({ data } = await sb.from('polls').select('*').eq('status', 'closed')
      .order('starts_at', { ascending: false, nullsFirst: false }).limit(1));
  }

  state.poll = (data && data[0]) || null;
  state.options = [];
  state.picked.clear();
  state.hasVoted = false;
  state.myOptions = [];

  if (state.poll) await loadOptions();
  if (state.poll && state.me) await loadMyVote();
}

async function loadOptions() {
  const { data } = await sb.from('poll_options').select('*')
    .eq('poll_id', state.poll.id).order('position');
  state.options = data || [];
}

async function loadMyVote() {
  if (!state.me || !state.poll) return;
  const { data } = await sb.from('votes').select('option_id')
    .eq('poll_id', state.poll.id).eq('discord_id', state.me.id);
  state.myOptions = (data || []).map((v) => v.option_id);
  state.hasVoted = state.myOptions.length > 0;
}

async function loadMessages() {
  const { data } = await sb.from('chat_messages').select('*')
    .eq('deleted', false).order('created_at', { ascending: false }).limit(120);
  state.messages = (data || []).reverse();
  state.pinned = state.messages.find((m) => m.pinned) || null;
}

async function refreshSanction() {
  state.sanction = null;
  if (!state.me) return;
  const { data } = await sb.from('moderation').select('*')
    .eq('discord_id', state.me.id).eq('active', true)
    .order('created_at', { ascending: false });

  const now = Date.now();
  state.sanction = (data || []).find(
    (s) => s.kind === 'ban' || (s.expires_at && new Date(s.expires_at).getTime() > now)
  ) || null;
}

async function loadFilterWords() {
  const { data } = await sb.from('filter_words').select('word');
  (data || []).forEach((r) => { if (!FILTER.words.includes(r.word)) FILTER.words.push(r.word); });
}

/* ============================================================
   6. RENDU DU SONDAGE
   ============================================================ */

// Tant que la personne n'est pas connectée, on laisse le squelette derrière la modale.
const busy = () => state.loading || !state.me;

function renderPoll() {
  show(el.pollSkeleton, busy());
  if (busy()) { show(el.pollEmpty, false); show(el.pollLive, false); return; }

  if (!state.poll) {
    show(el.pollEmpty, true);
    show(el.pollLive, false);
    el.pollPill.classList.add('is-off');
    el.pollPillText.textContent = 'Hors ligne';
    return;
  }

  const live = isLive();
  show(el.pollEmpty, false);
  show(el.pollLive, true);
  el.pollPill.classList.toggle('is-off', !live);
  el.pollPillText.textContent = live ? 'En direct' : 'Terminé';

  el.pollQuestion.textContent = state.poll.question;
  el.pollMode.textContent = state.poll.multiple ? 'Choix multiples' : 'Choix unique';

  const base = state.poll.participants || 0;
  const revealed = state.hasVoted || !live;

  el.pollOptions.innerHTML = state.options.map((o) => {
    const pct = base ? Math.round((o.votes / base) * 100) : 0;
    const mine = state.myOptions.includes(o.id);
    const picked = state.picked.has(o.id);
    const cls = [
      'opt',
      state.poll.multiple ? 'opt--check' : 'opt--radio',
      picked ? 'is-picked' : '',
      mine ? 'is-mine' : '',
      revealed || !live ? 'is-locked' : '',
    ].join(' ');

    return `
      <button type="button" class="${cls}" data-option="${o.id}" ${revealed || !live ? 'disabled' : ''}>
        <span class="opt__fill" style="width:${pct}%"></span>
        <span class="opt__box">${picked || mine ? '<i class="fa-solid fa-check"></i>' : ''}</span>
        <span class="opt__label">${esc(o.label)}</span>
        ${revealed ? `<span class="opt__score"><b>${pct}&nbsp;%</b><small>${plural(o.votes, 'vote')}</small></span>` : ''}
      </button>`;
  }).join('');

  el.pollOptions.querySelectorAll('[data-option]').forEach((btn) => {
    btn.addEventListener('click', () => togglePick(btn.dataset.option));
  });

  show(el.pollVote, live && !state.hasVoted);
  el.pollVote.disabled = state.picked.size === 0;

  renderPollMeta();
}

function renderPollMeta() {
  if (!state.poll) return;
  const total = state.poll.participants || 0;
  const votes = `<b>${plural(total, 'vote')}</b>`;

  if (isLive()) {
    const left = new Date(state.poll.ends_at) - Date.now();
    el.pollMeta.innerHTML = `${votes}<span class="sep">•</span>Fin dans ${fmtLeft(left)}`;
  } else if (state.poll.ends_at) {
    el.pollMeta.innerHTML = `${votes}<span class="sep">•</span>Terminé le ${fmtDate(state.poll.ends_at)}`;
  } else {
    el.pollMeta.innerHTML = votes;
  }
}

function togglePick(id) {
  if (state.hasVoted || !isLive()) return;
  if (state.poll.multiple) {
    state.picked.has(id) ? state.picked.delete(id) : state.picked.add(id);
  } else {
    const already = state.picked.has(id);
    state.picked.clear();
    if (!already) state.picked.add(id);
  }
  renderPoll();
}

el.pollVote.addEventListener('click', async () => {
  if (!state.me || state.picked.size === 0) return;
  el.pollVote.disabled = true;

  const { error } = await sb.rpc('tv_cast_vote', {
    p_poll: state.poll.id,
    p_options: [...state.picked],
  });

  if (error) {
    const messages = {
      DEJA_VOTE: 'Vous avez déjà voté pour ce sondage.',
      SONDAGE_INACTIF: "Ce sondage n'est plus ouvert.",
      SANCTIONNE: 'Votre compte est sanctionné.',
      CHOIX_UNIQUE: 'Ce sondage n\'accepte qu\'un seul choix.',
    };
    const key = Object.keys(messages).find((k) => error.message.includes(k));
    toast(messages[key] || 'Le vote a échoué. Réessayez.');
    el.pollVote.disabled = false;
    return;
  }

  state.myOptions = [...state.picked];
  state.hasVoted = true;
  await Promise.all([loadOptions(), refreshPollRow()]);
  renderPoll();
  toast('Vote enregistré. Merci !');
});

async function refreshPollRow() {
  if (!state.poll) return;
  const { data } = await sb.from('polls').select('*').eq('id', state.poll.id).single();
  if (data) state.poll = data;
}

/* ============================================================
   7. RENDU DU CHAT
   ============================================================ */

function messageHTML(m) {
  const c = userColors(m.discord_id);
  const pin = state.me?.staff
    ? `<button class="msg__pin" data-pin="${m.id}" title="Épingler"><i class="fa-solid fa-thumbtack"></i></button>`
    : '';
  return `
    <div class="msg" data-message="${m.id}">
      <span class="msg__time">${fmtTime(m.created_at)}${pin}</span>
      <span class="msg__user" style="--u-light:${c.light};--u-dark:${c.dark}"
            data-user="${esc(m.discord_id)}">${esc(m.username)}</span><span class="msg__text"> : ${esc(m.content)}</span>
    </div>`;
}

function renderChat() {
  el.chatPill.classList.toggle('is-off', !isLive());
  el.chatPillText.textContent = isLive() ? 'Ouvert' : 'Fermé';

  show(el.chatSkeleton, busy());
  if (busy()) return;

  const pinned = state.pinned;
  show(el.chatPin, !!pinned);
  if (pinned) {
    el.pinUser.textContent = pinned.username;
    el.pinText.textContent = pinned.content;
  }

  if (!state.messages.filter((m) => !m.pinned).length) {
    el.chatList.innerHTML = '';
    el.chatList.appendChild(el.chatEmpty);
    show(el.chatEmpty, true);
    return;
  }

  const atBottom = el.chatList.scrollHeight - el.chatList.scrollTop - el.chatList.clientHeight < 60;
  el.chatList.innerHTML = state.messages
    .filter((m) => !m.pinned)
    .map(messageHTML).join('');
  if (atBottom) el.chatList.scrollTop = el.chatList.scrollHeight;

  el.chatList.querySelectorAll('[data-user]').forEach((node) => {
    node.addEventListener('click', () => openProfile(node.dataset.user));
  });
  el.chatList.querySelectorAll('[data-pin]').forEach((node) => {
    node.addEventListener('click', async () => {
      await sb.rpc('tv_pin_message', { p_message: node.dataset.pin });
      toast('Message épinglé.');
    });
  });
}

let lockTimer = null;

function renderComposer() {
  clearInterval(lockTimer);

  if (state.sanction) {
    show(el.chatInputRow, false);
    show(el.chatLocked, true);
    const s = state.sanction;

    if (s.kind === 'ban') {
      el.lockTitle.textContent = 'Tu es banni !';
      el.lockReason.textContent = `Raison : ${s.reason}`;
      el.lockDuration.textContent = '';
    } else {
      el.lockTitle.textContent = 'Tu es temporairement banni !';
      el.lockReason.textContent = `Raison : ${s.reason}`;
      const tick = () => {
        const left = new Date(s.expires_at) - Date.now();
        if (left <= 0) { clearInterval(lockTimer); refreshSanction().then(renderComposer); return; }
        el.lockDuration.textContent = `Durée : ${fmtLeft(left)}`;
      };
      tick();
      lockTimer = setInterval(tick, 1000);
    }
    return;
  }

  show(el.chatLocked, false);
  show(el.chatInputRow, true);

  const open = canChat() || state.me?.staff;
  el.chatInput.disabled = !open;
  el.chatSend.disabled = !open;
  el.chatInput.placeholder = open
    ? (state.me?.staff ? 'Votre message ou une commande (/)…' : 'Votre message…')
    : "Chat activé uniquement lors d'un sondage.";
}

/* ============================================================
   8. ENVOI DE MESSAGE & COMMANDES
   ============================================================ */

const COMMANDS = [
  { name: '/ban', usage: '/ban <pseudo|id> <raison>', desc: 'Bannir définitivement un joueur du chat.' },
  { name: '/timeout', usage: '/timeout <pseudo|id> [durée] <raison>', desc: 'Exclure temporairement un joueur (alias /to). Durée : 30s, 10m, 2h, 1j.' },
  { name: '/to', usage: '/to <pseudo|id> [durée] <raison>', desc: 'Alias de /timeout.' },
  { name: '/unban', usage: '/unban <pseudo|id>', desc: 'Lever toutes les sanctions d\'un joueur.' },
  { name: '/pin', usage: '/pin <pseudo|id>', desc: 'Épingler le dernier message de ce joueur en haut du chat.' },
  { name: '/unpin', usage: '/unpin', desc: 'Retirer le message épinglé.' },
  { name: '/filter', usage: '/filter <mot>', desc: 'Ajouter un mot au filtre automatique.' },
  { name: '/clear', usage: '/clear', desc: 'Masquer tous les messages du chat.' },
  { name: '/help', usage: '/help', desc: 'Afficher la liste des commandes.' },
];

function renderCommandList() {
  const value = el.chatInput.value;
  if (!value.startsWith('/')) { show(el.cmdList, false); return; }

  if (!state.me?.staff) {
    el.cmdList.innerHTML = '<div class="cmd"><code>Commandes indisponibles</code><small>Les commandes sont réservées au staff.</small></div>';
    show(el.cmdList, true);
    return;
  }

  const typed = value.split(/\s+/)[0].toLowerCase();
  const matches = COMMANDS.filter((c) => c.name.startsWith(typed) || typed === '/');
  if (!matches.length) { show(el.cmdList, false); return; }

  el.cmdList.innerHTML = matches.map((c) => `
    <button type="button" class="cmd" data-cmd="${c.name}">
      <code>${esc(c.usage)}</code>
      <small>${esc(c.desc)}</small>
    </button>`).join('');

  el.cmdList.querySelectorAll('[data-cmd]').forEach((b) => {
    b.addEventListener('click', () => {
      el.chatInput.value = b.dataset.cmd + ' ';
      el.chatInput.focus();
      renderCommandList();
    });
  });
  show(el.cmdList, true);
}

function parseDuration(token) {
  const m = /^(\d+)\s*(s|sec|m|min|h|j|d)$/i.exec(token || '');
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('s')) return n;
  if (unit.startsWith('m')) return n * 60;
  if (unit === 'h') return n * 3600;
  return n * 86400;
}

function systemMessage(text, kind = 'system') {
  const node = document.createElement('div');
  node.className = `msg msg--${kind}`;
  node.innerHTML = esc(text);
  el.chatList.appendChild(node);
  el.chatList.scrollTop = el.chatList.scrollHeight;
}

async function runCommand(raw) {
  if (!state.me?.staff) { systemMessage('Les commandes sont réservées au staff.', 'error'); return; }

  const parts = raw.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const target = parts[1];

  const fail = (msg) => systemMessage(msg, 'error');
  const RPC_ERRORS = {
    JOUEUR_INTROUVABLE: "Joueur introuvable. Il doit s'être connecté au moins une fois.",
    CIBLE_STAFF: 'Impossible de sanctionner un membre du staff.',
    NON_AUTORISE: 'Action réservée au staff.',
  };
  const rpcError = (error) => {
    const key = Object.keys(RPC_ERRORS).find((k) => error.message.includes(k));
    fail(key ? RPC_ERRORS[key] : 'Échec : ' + error.message);
  };

  if (cmd === '/help') {
    COMMANDS.forEach((c) => systemMessage(`${c.usage} — ${c.desc}`));
    return;
  }

  if (cmd === '/ban') {
    if (!target) return fail('Utilisation : /ban <pseudo|id> <raison>');
    const reason = parts.slice(2).join(' ') || 'Non précisé';
    const { error } = await sb.rpc('tv_sanction', { p_target: target, p_kind: 'ban', p_reason: reason, p_seconds: null });
    if (error) return rpcError(error);
    systemMessage(`${target} a été banni. Raison : ${reason}`);
    loadStaffData();
    return;
  }

  if (cmd === '/timeout' || cmd === '/to') {
    if (!target) return fail('Utilisation : /timeout <pseudo|id> [durée] <raison>');
    const maybe = parseDuration(parts[2]);
    const seconds = maybe ?? 600;
    const reason = parts.slice(maybe ? 3 : 2).join(' ') || 'Non précisé';
    const { error } = await sb.rpc('tv_sanction', { p_target: target, p_kind: 'timeout', p_reason: reason, p_seconds: seconds });
    if (error) return rpcError(error);
    systemMessage(`${target} est exclu pour ${fmtLeft(seconds * 1000)}. Raison : ${reason}`);
    loadStaffData();
    return;
  }

  if (cmd === '/unban') {
    if (!target) return fail('Utilisation : /unban <pseudo|id>');
    const { error } = await sb.rpc('tv_unsanction', { p_target: target });
    if (error) return rpcError(error);
    systemMessage(`Sanctions levées pour ${target}.`);
    loadStaffData();
    return;
  }

  if (cmd === '/pin') {
    if (!target) return fail('Utilisation : /pin <pseudo|id>');
    const last = [...state.messages].reverse().find(
      (m) => m.discord_id === target || m.username.toLowerCase() === target.toLowerCase()
    );
    if (!last) return fail('Aucun message de ce joueur dans le chat.');
    await sb.rpc('tv_pin_message', { p_message: last.id });
    systemMessage('Message épinglé.');
    return;
  }

  if (cmd === '/unpin') {
    await sb.rpc('tv_unpin_all');
    state.pinned = null;
    show(el.chatPin, false);
    systemMessage('Épingle retirée.');
    return;
  }

  if (cmd === '/filter') {
    const word = parts.slice(1).join(' ').trim();
    if (!word) return fail('Utilisation : /filter <mot>');
    const { error } = await sb.from('filter_words').insert({ word: word.toLowerCase(), added_by: state.me.id });
    if (error) return fail('Échec : ' + error.message);
    if (!FILTER.words.includes(word.toLowerCase())) FILTER.words.push(word.toLowerCase());
    systemMessage(`« ${word} » a été ajouté au filtre.`);
    loadStaffData();
    return;
  }

  if (cmd === '/clear') {
    const { error } = await sb.from('chat_messages').update({ deleted: true }).eq('deleted', false);
    if (error) return fail('Échec : ' + error.message);
    state.messages = [];
    state.pinned = null;
    renderChat();
    systemMessage('Chat vidé.');
    return;
  }

  fail(`Commande inconnue : ${cmd}. Tapez /help.`);
}

function showBlocked(words) {
  el.blockedWords.innerHTML = words.map((w) => `<span class="blocked-word">${esc(w)}</span>`).join('');
  el.blockedModal.classList.add('show');
}

async function sendMessage() {
  const text = el.chatInput.value.trim();
  if (!text || !state.me) return;

  if (text.startsWith('/')) {
    el.chatInput.value = '';
    show(el.cmdList, false);
    await runCommand(text);
    return;
  }

  if (state.sanction) return;

  const bad = scanMessage(text);
  if (bad.length) { showBlocked(bad); return; }

  el.chatSend.disabled = true;
  let error = null;

  if (isLive()) {
    ({ error } = await sb.from('chat_messages').insert({
      poll_id: state.poll.id,
      discord_id: state.me.id,
      username: state.me.username,
      avatar_url: state.me.avatar,
      content: text,
    }));
  } else if (state.me.staff) {
    ({ error } = await sb.rpc('tv_staff_message', { p_content: text }));
  } else {
    error = { message: 'CHAT_FERME' };
  }

  el.chatSend.disabled = false;

  if (error) {
    if (error.message.includes('MESSAGE_FILTRE')) {
      showBlocked([error.message.split('MESSAGE_FILTRE:')[1] || 'mot interdit']);
    } else if (error.message.includes('CHAT_FERME')) {
      toast("Chat activé uniquement lors d'un sondage.");
    } else {
      toast("Message non envoyé : " + error.message);
    }
    return;
  }

  el.chatInput.value = '';
  el.chatInput.style.height = '42px';
}

el.chatSend.addEventListener('click', sendMessage);
el.chatInput.addEventListener('input', () => {
  el.chatInput.style.height = '42px';
  el.chatInput.style.height = Math.min(el.chatInput.scrollHeight, 120) + 'px';
  renderCommandList();
});
el.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  if (e.key === 'Escape') show(el.cmdList, false);
});

/* ============================================================
   9. PROFIL D'UN JOUEUR
   ============================================================ */

async function openProfile(discordId) {
  const { data: profile } = await sb.from('profiles').select('*').eq('discord_id', discordId).maybeSingle();
  const { data: msgs } = await sb.from('chat_messages').select('*')
    .eq('discord_id', discordId).eq('deleted', false)
    .order('created_at', { ascending: false }).limit(30);

  const fallback = state.messages.find((m) => m.discord_id === discordId);
  const name = profile?.username || fallback?.username || 'Joueur';
  const avatar = profile?.avatar_url || fallback?.avatar_url
    || `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordId) >> 22n) % 6}.png`;

  el.profileAvatar.src = avatar;
  el.profileName.textContent = name;
  el.profileId.textContent = `ID Discord : ${discordId}`;
  el.profileMsgs.innerHTML = (msgs || []).length
    ? msgs.map((m) => `<div class="msg"><span class="msg__time">${fmtTime(m.created_at)}</span>${esc(m.content)}</div>`).join('')
    : '<p class="muted" style="font-size:.85rem">Aucun message pour le moment.</p>';

  el.profileModal.classList.add('show');
}

document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.querySelector('.modal__close')?.addEventListener('click', () => overlay.classList.remove('show'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('show'); });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.show').forEach((o) => o.classList.remove('show'));
});

/* ============================================================
   10. PANNEAU STAFF
   ============================================================ */

function optionRow(value = '') {
  const row = document.createElement('div');
  row.className = 'opt-edit';
  row.innerHTML = `
    <input type="text" maxlength="90" placeholder="Intitulé du choix" value="${esc(value)}">
    <button type="button" aria-label="Supprimer ce choix"><i class="fa-solid fa-trash"></i></button>`;
  row.querySelector('button').addEventListener('click', () => row.remove());
  return row;
}

el.spAddOption?.addEventListener('click', () => el.spOptions.appendChild(optionRow()));

function draftOptions() {
  return [...el.spOptions.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
}

async function loadDraft() {
  const { data } = await sb.from('polls').select('*, poll_options(*)')
    .eq('status', 'draft').order('created_at', { ascending: false }).limit(1);

  el.spOptions.innerHTML = '';
  if (data && data.length) {
    const d = data[0];
    state.draftId = d.id;
    el.spQuestion.value = d.question;
    el.spMode.value = d.multiple ? 'multiple' : 'single';
    (d.poll_options || []).sort((a, b) => a.position - b.position)
      .forEach((o) => el.spOptions.appendChild(optionRow(o.label)));
  } else {
    state.draftId = null;
    el.spOptions.appendChild(optionRow());
    el.spOptions.appendChild(optionRow());
  }
}

async function saveDraft() {
  const question = el.spQuestion.value.trim();
  const options = draftOptions();
  if (question.length < 5) { el.spStatus.textContent = 'La question est trop courte.'; return null; }
  if (options.length < 2) { el.spStatus.textContent = 'Il faut au moins deux choix.'; return null; }

  const payload = {
    question,
    multiple: el.spMode.value === 'multiple',
    status: 'draft',
    created_by: state.me.id,
  };

  let pollId = state.draftId;
  if (pollId) {
    await sb.from('polls').update(payload).eq('id', pollId);
    await sb.from('poll_options').delete().eq('poll_id', pollId);
  } else {
    const { data, error } = await sb.from('polls').insert(payload).select().single();
    if (error) { el.spStatus.textContent = 'Échec : ' + error.message; return null; }
    pollId = data.id;
    state.draftId = pollId;
  }

  const { error } = await sb.from('poll_options').insert(
    options.map((label, i) => ({ poll_id: pollId, label, position: i }))
  );
  if (error) { el.spStatus.textContent = 'Échec : ' + error.message; return null; }

  el.spStatus.textContent = 'Brouillon enregistré.';
  return pollId;
}

el.spSave?.addEventListener('click', saveDraft);

el.spStart?.addEventListener('click', async () => {
  const pollId = await saveDraft();
  if (!pollId) return;
  const minutes = Math.max(1, Number(el.spDuration.value) || 60);
  const { error } = await sb.rpc('tv_start_poll', { p_poll: pollId, p_minutes: minutes });
  if (error) { el.spStatus.textContent = 'Échec : ' + error.message; return; }
  state.draftId = null;
  el.spStatus.textContent = 'Sondage lancé en direct.';
  await refreshAll();
  loadDraft();
});

el.spClose?.addEventListener('click', async () => {
  if (!state.poll) return;
  const { error } = await sb.rpc('tv_close_poll', { p_poll: state.poll.id });
  el.spStatus.textContent = error ? 'Échec : ' + error.message : 'Sondage terminé.';
  await refreshAll();
});

el.spSimulate?.addEventListener('click', async () => {
  if (!state.poll) return;
  const n = Math.max(1, Number(el.spSimCount.value) || 10);
  const { error } = await sb.rpc('tv_simulate_votes', { p_poll: state.poll.id, p_count: n });
  el.spStatus.textContent = error ? 'Échec : ' + error.message : `${plural(n, 'vote')} simulé${n > 1 ? 's' : ''}.`;
  await Promise.all([loadOptions(), refreshPollRow()]);
  renderPoll();
});

async function loadStaffData() {
  if (!state.me?.staff) return;

  const { data: mods } = await sb.from('moderation').select('*').eq('active', true)
    .order('created_at', { ascending: false });

  const now = Date.now();
  const bans = (mods || []).filter((m) => m.kind === 'ban');
  const timeouts = (mods || []).filter((m) => m.kind === 'timeout' && new Date(m.expires_at) > now);

  const modItem = (m, extra = '') => `
    <div class="mod-item">
      <span class="who">${esc(m.username || m.discord_id)}</span>
      <span class="why">${esc(m.reason)}${extra}</span>
      <button type="button" data-unban="${esc(m.discord_id)}">Lever</button>
    </div>`;

  el.scBans.innerHTML = bans.length ? bans.map((m) => modItem(m)).join('')
    : '<p class="staff-note">Aucun joueur banni.</p>';
  el.scTimeouts.innerHTML = timeouts.length
    ? timeouts.map((m) => modItem(m, ` — ${fmtLeft(new Date(m.expires_at) - now)}`)).join('')
    : '<p class="staff-note">Aucune exclusion en cours.</p>';

  document.querySelectorAll('[data-unban]').forEach((b) => {
    b.addEventListener('click', async () => {
      await sb.rpc('tv_unsanction', { p_target: b.dataset.unban });
      loadStaffData();
    });
  });

  const { data: words } = await sb.from('filter_words').select('word')
    .neq('added_by', 'seed').order('word');
  el.scWords.innerHTML = (words || []).length
    ? words.map((w) => `<span class="chip">${esc(w.word)}<button type="button" data-word="${esc(w.word)}"><i class="fa-solid fa-xmark"></i></button></span>`).join('')
    : '<p class="staff-note">Aucun mot ajouté depuis le site.</p>';

  el.scWords.querySelectorAll('[data-word]').forEach((b) => {
    b.addEventListener('click', async () => {
      await sb.from('filter_words').delete().eq('word', b.dataset.word);
      FILTER.words = FILTER.words.filter((w) => w !== b.dataset.word);
      loadStaffData();
    });
  });

  const { data: history } = await sb.from('polls').select('*')
    .neq('status', 'draft').order('created_at', { ascending: false }).limit(8);

  el.spHistory.innerHTML = (history || []).length
    ? history.map((p) => `
        <div class="mod-item">
          <span class="who">${esc(p.question)}</span>
          <span class="why">${plural(p.participants, 'vote')}</span>
          <button type="button" data-load-poll="${p.id}">Afficher</button>
        </div>`).join('')
    : '<p class="staff-note">Aucun sondage passé.</p>';

  el.spHistory.querySelectorAll('[data-load-poll]').forEach((b) => {
    b.addEventListener('click', async () => {
      const { data } = await sb.from('polls').select('*').eq('id', b.dataset.loadPoll).single();
      state.poll = data;
      await loadOptions();
      await loadMyVote();
      renderPoll();
    });
  });
}

el.scWordAdd?.addEventListener('click', async () => {
  const word = el.scWord.value.trim().toLowerCase();
  if (!word) return;
  const { error } = await sb.from('filter_words').insert({ word, added_by: state.me.id });
  el.scStatus.textContent = error ? 'Échec : ' + error.message : `« ${word} » ajouté au filtre.`;
  if (!error && !FILTER.words.includes(word)) FILTER.words.push(word);
  el.scWord.value = '';
  loadStaffData();
});

el.scUnpin?.addEventListener('click', async () => {
  await sb.rpc('tv_unpin_all');
  state.pinned = null;
  show(el.chatPin, false);
  el.scStatus.textContent = 'Épingle retirée.';
});

/* ============================================================
   11. TEMPS RÉEL
   ============================================================ */

function subscribe() {
  sb.channel('true-vanilla-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, async () => {
      await refreshAll();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poll_options' }, async (payload) => {
      const opt = state.options.find((o) => o.id === payload.new.id);
      if (!opt) return;
      Object.assign(opt, payload.new);
      await refreshPollRow();
      renderPoll();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
      state.messages.push(payload.new);
      if (state.messages.length > 200) state.messages.shift();
      renderChat();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, async () => {
      await loadMessages();
      renderChat();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'moderation' }, async () => {
      await refreshSanction();
      renderComposer();
      loadStaffData();
    })
    .subscribe();
}

/* ============================================================
   12. DÉMARRAGE
   ============================================================ */

async function refreshAll() {
  await loadPoll();
  await loadMessages();
  renderPoll();
  renderChat();
  renderComposer();
  if (state.me?.staff) loadStaffData();
}

async function start() {
  try {
    await loadFilterWords();
  } catch (e) { /* filtre de base utilisé */ }

  const { data: { session } } = await sb.auth.getSession();
  await applySession(session);

  await loadPoll();
  await loadMessages();
  state.loading = false;

  renderPoll();
  renderChat();
  renderComposer();
  subscribe();

  sb.auth.onAuthStateChange((_event, s) => { applySession(s); });

  // Compte à rebours + fermeture automatique du sondage.
  setInterval(async () => {
    if (!state.poll) return;
    renderPollMeta();
    if (state.poll.status === 'live' && new Date(state.poll.ends_at) <= new Date()) {
      await sb.rpc('tv_expire_polls');
      await refreshAll();
    }
  }, 1000);
}

start();
