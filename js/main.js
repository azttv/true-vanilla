/* ============================================================
   TRUE VANILLA — main.js (v2)
   ============================================================ */

// ---------- Menu burger ----------
const burger = document.querySelector('.nav__burger');
const navLinks = document.querySelector('.nav__links');
if (burger && navLinks) {
  burger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    burger.setAttribute('aria-expanded', navLinks.classList.contains('open'));
  });
}

// ---------- Copie de l'IP ----------
document.querySelectorAll('.ip-box').forEach((box) => {
  box.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('play.true-vanilla.fr');
      box.classList.add('is-copied');
      setTimeout(() => box.classList.remove('is-copied'), 1800);
    } catch (e) { /* clipboard indisponible */ }
  });
});

// ---------- Statut live du serveur ----------
async function fetchServerStatus() {
  const pills = document.querySelectorAll('[data-server-status]');
  const elPlayers = document.querySelector('[data-mc-players]');
  const elMax = document.querySelector('[data-mc-max]');
  const elVersion = document.querySelector('[data-mc-version]');
  if (!pills.length && !elPlayers) return;
  try {
    const res = await fetch('https://api.mcstatus.io/v2/status/java/play.true-vanilla.fr');
    const data = await res.json();
    pills.forEach((pill) => {
      const label = pill.querySelector('.status-label');
      if (data.online) {
        pill.classList.add('online');
        pill.classList.remove('offline');
        const on = data.players?.online ?? 0;
        const max = data.players?.max ?? 0;
        label.textContent = `En ligne — ${on}/${max} joueurs`;
      } else {
        pill.classList.add('offline');
        pill.classList.remove('online');
        label.textContent = 'Hors ligne';
      }
    });
    if (data.online) {
      if (elPlayers) elPlayers.textContent = data.players?.online ?? '—';
      if (elMax) elMax.textContent = data.players?.max ?? '—';
      if (elVersion && data.version?.name_clean) {
        // Ne garder que le numéro de version (ex. « Paper 1.21.8 » → « 1.21.8 »)
        const num = data.version.name_clean.match(/\d+(?:\.\d+)+/);
        if (num) elVersion.textContent = num[0];
      }
    } else if (elPlayers) {
      elPlayers.textContent = '0';
    }
  } catch (e) {
    pills.forEach((pill) => {
      pill.classList.add('offline');
      pill.querySelector('.status-label').textContent = 'Statut indisponible';
    });
  }
}
fetchServerStatus();
setInterval(fetchServerStatus, 60000);

// ---------- Statistiques Discord ----------
// NOTE : remplacez INVITE_CODE par le code de votre invitation permanente (discord.gg/XXXX → XXXX)
// et SERVER_ID par l'identifiant du serveur (widget activé dans Paramètres → Widget).
const DISCORD_INVITE_CODE = 'HefFTCS4cp';
const DISCORD_SERVER_ID = '1389693675541631077';

async function fetchDiscordStats() {
  const elMembers = document.querySelector('[data-dc-members]');
  const elOnline = document.querySelector('[data-dc-online]');
  const elVoice = document.querySelector('[data-dc-voice]');
  if (!elMembers && !elVoice) return;

  // Membres totaux + en ligne (API d'invitation)
  try {
    const res = await fetch(`https://discord.com/api/v9/invites/${DISCORD_INVITE_CODE}?with_counts=true`);
    const data = await res.json();
    if (elMembers && data.approximate_member_count != null) {
      elMembers.textContent = data.approximate_member_count.toLocaleString('fr-FR');
    }
    if (elOnline && data.approximate_presence_count != null) {
      elOnline.textContent = data.approximate_presence_count.toLocaleString('fr-FR');
    }
  } catch (e) { /* invitation non configurée */ }

  // Membres en vocal (widget JSON)
  try {
    const res = await fetch(`https://discord.com/api/guilds/${DISCORD_SERVER_ID}/widget.json`);
    const data = await res.json();
    if (elVoice && Array.isArray(data.members)) {
      elVoice.textContent = data.members.filter((m) => m.channel_id).length;
    }
  } catch (e) { /* widget non activé */ }
}
fetchDiscordStats();
setInterval(fetchDiscordStats, 60000);

// ---------- Bouton flottant « Rejoindre » (vient se poser sous « Prêt à nous rejoindre ? ») ----------
const fab = document.querySelector('.fab-join');
const dock = document.querySelector('.join-dock');
const joinCta = document.querySelector('.join-cta');
if (fab && dock) {
  const updateFab = () => {
    // Rétrécit dès que la zone « Prêt à nous rejoindre ? » entre à l'écran
    if (joinCta) {
      fab.classList.toggle('fab-join--small', joinCta.getBoundingClientRect().top < window.innerHeight * 0.85);
    }
    const dockTop = dock.getBoundingClientRect().top;
    const defaultTop = window.innerHeight - 20 - fab.offsetHeight; // position fixe par défaut
    const delta = Math.max(0, defaultTop - dockTop); // remonte le bouton quand le dock arrive
    fab.style.transform = `translateX(-50%) translateY(-${delta}px)`;
  };
  window.addEventListener('scroll', updateFab, { passive: true });
  window.addEventListener('resize', updateFab);
  updateFab();
}

// ---------- Modale « Rejoindre » ----------
const joinModal = document.querySelector('#join-modal');
if (joinModal) {
  const video = joinModal.querySelector('iframe[data-src]');

  const openJoin = () => {
    if (video && !video.src) video.src = video.dataset.src; // chargement différé
    joinModal.classList.add('show');
    document.body.style.overflow = 'hidden';
  };
  const closeJoin = () => {
    joinModal.classList.remove('show');
    document.body.style.overflow = '';
    if (video) video.src = ''; // coupe la vidéo à la fermeture
  };

  document.querySelectorAll('.js-open-join').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.preventDefault(); openJoin(); });
  });
  joinModal.querySelector('.modal__close').addEventListener('click', closeJoin);
  joinModal.addEventListener('click', (e) => { if (e.target === joinModal) closeJoin(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && joinModal.classList.contains('show')) closeJoin();
  });
}

// ---------- Carrousel des serveurs (fondu, infini) ----------
document.querySelectorAll('[data-carousel]').forEach((car) => {
  const slides = car.querySelectorAll('.carousel__slide');
  if (!slides.length) return;
  let i = Math.max(0, [...slides].findIndex((s) => s.classList.contains('is-active')));
  const show = (n) => {
    slides[i].classList.remove('is-active');
    i = (n + slides.length) % slides.length; // boucle infinie
    slides[i].classList.add('is-active');
  };
  car.querySelector('.carousel__arrow--prev')?.addEventListener('click', () => show(i - 1));
  car.querySelector('.carousel__arrow--next')?.addEventListener('click', () => show(i + 1));
});

// ---------- Compteurs d'abonnés (@truevanillafr) ----------
// Instagram/TikTok bloquent les requêtes directes depuis un navigateur (CORS) :
// il faut un petit endpoint (Worker Cloudflare) qui renvoie {"instagram":1234,"tiktok":5678,"youtube":910}.
// YouTube fonctionne en direct avec une clé YouTube Data API v3 (console.cloud.google.com).
const SOCIAL_STATS_ENDPOINT = ''; // ex. 'https://stats.true-vanilla.fr/socials'
const YOUTUBE_API_KEY = '';       // optionnel, utilisé si l'endpoint est vide
const SOCIAL_FALLBACK = { instagram: null, tiktok: null, youtube: null }; // valeurs fixes de secours

const fmtCompact = (n) => new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

async function fetchSocialStats() {
  const slots = document.querySelectorAll('[data-social-count]');
  if (!slots.length) return;
  const set = (k, v) => {
    const el = document.querySelector(`[data-social-count="${k}"]`);
    if (el && v != null && !Number.isNaN(Number(v))) el.textContent = fmtCompact(Number(v));
  };
  Object.entries(SOCIAL_FALLBACK).forEach(([k, v]) => set(k, v));
  if (SOCIAL_STATS_ENDPOINT) {
    try {
      const d = await (await fetch(SOCIAL_STATS_ENDPOINT)).json();
      ['instagram', 'tiktok', 'youtube'].forEach((k) => set(k, d[k]));
      return;
    } catch (e) { /* endpoint indisponible */ }
  }
  if (YOUTUBE_API_KEY) {
    try {
      const d = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&forHandle=truevanillafr&key=${YOUTUBE_API_KEY}`)).json();
      const c = d.items?.[0]?.statistics?.subscriberCount;
      if (c) set('youtube', c);
    } catch (e) { /* clé invalide */ }
  }
}
fetchSocialStats();

// ---------- Onglets génériques ([data-tab] / [data-panel]) ----------
document.querySelectorAll('[data-tabs]').forEach((group) => {
  const buttons = group.querySelectorAll('[data-tab]');
  const root = group.closest('[data-tabs-root]') || document;
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      root.querySelectorAll('[data-panel]').forEach((p) => {
        p.classList.toggle('is-active', p.dataset.panel === btn.dataset.tab);
      });
    });
  });
});

// ---------- Avertissement boutique ----------
const warnOverlay = document.querySelector('#shop-warning');
if (warnOverlay) {
  const checkbox = warnOverlay.querySelector('#shop-warning-check');
  const confirmBtn = warnOverlay.querySelector('#shop-warning-btn');

  // localStorage peut être bloqué (navigation privée…) → repli mémoire
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return this._m?.[k] ?? null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { (this._m ??= {})[k] = v; } },
  };

  if (!store.get('tv-shop-warning-ok')) {
    warnOverlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  checkbox.addEventListener('change', () => {
    confirmBtn.disabled = !checkbox.checked;
  });

  confirmBtn.addEventListener('click', () => {
    if (!checkbox.checked) return;
    store.set('tv-shop-warning-ok', '1');
    warnOverlay.classList.remove('show');
    document.body.style.overflow = '';
  });
}

// ---------- Don : minimum 1 € ----------
const donInput = document.querySelector('#don-amount');
const donBtn = document.querySelector('#don-btn');
if (donInput && donBtn) {
  const check = () => {
    const v = parseFloat(String(donInput.value).replace(',', '.'));
    donBtn.disabled = !(v >= 1);
  };
  donInput.addEventListener('input', check);
  check();
}

// ---------- Animation d'apparition au scroll (fondu + glissement vers le haut) ----------
const revealEls = document.querySelectorAll(
  'section .container > *, section > .marquee, section > .reviews__cta, footer .footer__grid, footer .footer__legal'
);
if ('IntersectionObserver' in window && revealEls.length) {
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        revealIO.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });
  revealEls.forEach((el) => { el.classList.add('reveal'); revealIO.observe(el); });
}
