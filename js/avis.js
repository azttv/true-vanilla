/* ============================================================
   TRUE VANILLA - avis.js
   Connexion Discord (OAuth2 implicite) + envoi d'avis via webhook.

   CONFIGURATION :
   1. Créez une application sur https://discord.com/developers/applications
   2. OAuth2 → ajoutez l'URL de redirection : https://true-vanilla.fr/avis.html
   3. Copiez le Client ID ci-dessous.

   ⚠️ SÉCURITÉ : l'URL du webhook est visible dans ce fichier côté client.
   N'importe qui peut la récupérer et spammer le salon. Dès que possible,
   remplacez WEBHOOK_URL par un petit Worker Cloudflare qui relaie la
   requête (et gardez la vraie URL du webhook secrète côté Worker).
   ============================================================ */

const DISCORD_CLIENT_ID = '1372683898378522634'; // ← à remplacer
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1425992093305802793/6o1yk4DEu8-6lpPwl0BUkam5gVjB4ZT2QnbGfn1y2kzk1W956gkkqCex2x2Bg9wsXHuM';
const EMBED_COLOR = 0x00e5ff; // aqua, comme la bordure de l'embed

const gate = document.querySelector('#avis-gate');
const panel = document.querySelector('#avis-panel');
const success = document.querySelector('#avis-success');

if (gate && panel) {
  const loginBtn = document.querySelector('#discord-login');
  const logoutBtn = document.querySelector('#avis-logout');
  const avatarEl = document.querySelector('#avis-avatar');
  const usernameEl = document.querySelector('#avis-username');
  const ingameEl = document.querySelector('#avis-ingame');
  const messageEl = document.querySelector('#avis-message');
  const statusEl = document.querySelector('#avis-status');
  const sendBtn = document.querySelector('#avis-send');
  const starPicker = document.querySelector('#star-picker');
  const starValue = document.querySelector('#star-value');
  const starBtns = [...starPicker.querySelectorAll('[data-star]')];

  const redirectUri = location.origin + location.pathname;
  loginBtn.href = 'https://discord.com/oauth2/authorize'
    + `?client_id=${DISCORD_CLIENT_ID}`
    + '&response_type=token'
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + '&scope=identify';

  // sessionStorage peut être bloqué → repli mémoire
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return this._m?.[k] ?? null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { (this._m ??= {})[k] = v; } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { if (this._m) delete this._m[k]; } },
  };

  let user = null;
  let rating = 5;

  // ---------- Note (0 à 5 étoiles) ----------
  const renderStars = () => {
    starBtns.forEach((b) => b.classList.toggle('on', Number(b.dataset.star) <= rating));
    starValue.textContent = `${rating}/5`;
  };
  starBtns.forEach((b) => {
    b.addEventListener('click', () => {
      const n = Number(b.dataset.star);
      rating = (n === 1 && rating === 1) ? 0 : n; // recliquer la 1re étoile → 0
      renderStars();
    });
  });
  renderStars();

  // ---------- Connexion Discord ----------
  const avatarUrl = (u) => u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;

  // Masquage robuste : le style inline gagne toujours sur le CSS (.avis-gate est en display:flex)
  const hideEl = (el) => { el.hidden = true; el.style.display = 'none'; };
  const showEl = (el) => { el.hidden = false; el.style.display = ''; };

  const showPanel = () => {
    hideEl(gate);
    showEl(panel);
    avatarEl.src = avatarUrl(user);
    usernameEl.textContent = user.global_name || user.username;
  };

  const tryLogin = async (token) => {
    try {
      const res = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('token invalide');
      user = await res.json();
      store.set('tv-avis-token', token);
      showPanel();
    } catch (e) {
      store.del('tv-avis-token');
    }
  };

  // Retour d'OAuth : token dans le fragment #access_token=…
  const hash = new URLSearchParams(location.hash.slice(1));
  const newToken = hash.get('access_token');
  if (newToken) {
    history.replaceState(null, '', location.pathname); // nettoie l'URL
    tryLogin(newToken);
  } else if (store.get('tv-avis-token')) {
    tryLogin(store.get('tv-avis-token'));
  }

  logoutBtn.addEventListener('click', () => {
    store.del('tv-avis-token');
    user = null;
    hideEl(panel);
    showEl(gate);
  });

  // ---------- Envoi de l'avis ----------
  const setStatus = (msg, isErr) => {
    statusEl.textContent = msg;
    statusEl.classList.toggle('err', !!isErr);
  };

  sendBtn.addEventListener('click', async () => {
    if (!user) return;
    if (store.get('tv-avis-sent')) { setStatus('Vous avez déjà envoyé un avis. Merci !', true); return; }

    const ingame = ingameEl.value.trim();
    const message = messageEl.value.trim();
    if (ingame.length < 3) { setStatus('Indiquez votre pseudo en jeu (3 caractères minimum).', true); return; }
    if (message.length < 10) { setStatus('Votre avis est un peu court (10 caractères minimum).', true); return; }

    sendBtn.disabled = true;
    setStatus('Envoi en cours…');

    const stars = rating > 0 ? '⭐'.repeat(rating) : '-';
    const payload = {
      username: 'Avis',
      embeds: [{
        title: '⭐ Nouvel Avis',
        color: EMBED_COLOR,
        thumbnail: { url: avatarUrl(user) },
        fields: [
          { name: '👤 Utilisateur Discord', value: `<@${user.id}> (${user.username})` },
          { name: '🎮 Pseudo en jeu', value: ingame },
          { name: '⭐ Note', value: `${stars} (${rating}/5)` },
          { name: '💬 Avis', value: message },
        ],
        footer: { text: "True Vanilla - Système d'avis" },
        timestamp: new Date().toISOString(),
      }],
    };

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`webhook ${res.status}`);
      store.set('tv-avis-sent', '1');
      hideEl(panel);
      showEl(success);
    } catch (e) {
      sendBtn.disabled = false;
      setStatus("L'envoi a échoué. Réessayez dans un instant.", true);
    }
  });
}
