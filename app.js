/* C'Lovefluence : profils de dresseurs Cobblemon, swipe, matchs. Données sur Supabase (supabase.sql). */
// Clé publique (anon) : faite pour être dans le site, les droits sont gérés côté serveur
const SB_URL = 'https://oqnaakxtndmferidfkcz.supabase.co', SB_KEY = 'sb_publishable_th67M5nsWrJROYkYXbHQ3Q_RzGfgsyw';
const sb = window.supabase.createClient(SB_URL, SB_KEY);
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const ERR = { 'Invalid login credentials': 'Pseudo ou mot de passe incorrect.', 'User already registered': 'Ce pseudo est déjà pris.' };
const art = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const mini = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${id}.png`;
const pokeId = name => { const i = POKE.findIndex(n => n.toLowerCase() === name.trim().toLowerCase()); return i < 0 ? null : i + 1; };
const TAGS = ['🍔 Nourriture', '💪 Muscu', '⚽ Sport', '🛍️ Shopping', '🎵 Musique', '🎬 Films', '🎮 Jeux vidéo', '✈️ Voyages', '🐾 Animaux', '🎨 Art', '📚 Lecture', '🎉 Soirées',
  '⚔️ Combats', '✨ Shiny hunting', '🎯 Capture', '🏠 Construction', '🧭 Exploration', '💰 Commerce', '🐉 Raids', '🥚 Élevage', '📖 Pokédex', '😌 Chill'];
let me = null, profile = null, deck = [];

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
const must = ({ data, error }) => { if (error) throw new Error(ERR[error.message] || error.message); return data; };

/* ---------- Connexion (même compte que StevenDex) ---------- */
function authScreen() {
  const a = document.createElement('div');
  a.className = 'overlay auth-wrap'; a.id = 'auth';
  a.innerHTML = `<form class="card-box auth"><div class="logo big"><span class="ball"></span><span>C’Love<b>fluence</b></span></div>
    <p>Le site de rencontre des dresseurs de Confluence : swipe, matche, et retrouvez-vous à la taverne !</p>
    <input name="u" placeholder="Pseudo" maxlength="16" autocomplete="username" required pattern="[A-Za-z0-9_\\-]{3,16}" title="3 à 16 lettres, chiffres, _ ou -">
    <input name="p" type="password" placeholder="Mot de passe" minlength="6" autocomplete="current-password" required>
    <p class="err" id="authErr"></p>
    <div class="row"><button class="btn" value="in">Se connecter</button><button class="btn ghost" value="up">Créer un compte</button></div>
    <small>Réservé aux 18 ans et plus.</small></form>`;
  document.body.appendChild(a);
  a.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, up = e.submitter?.value === 'up', pseudo = f.u.value.trim();
    const cred = { email: pseudo.toLowerCase() + '@stevendex.app', password: f.p.value };
    f.querySelectorAll('button').forEach(b => b.disabled = true);
    const { error } = up ? await sb.auth.signUp({ ...cred, options: { data: { pseudo } } }) : await sb.auth.signInWithPassword(cred);
    f.querySelectorAll('button').forEach(b => b.disabled = false);
    if (error) return $('#authErr').textContent = ERR[error.message] || error.message;
    a.remove(); start();
  };
}
async function start() {
  me = (await sb.auth.getUser()).data.user;
  if (!me) return authScreen();
  const [p, c] = await Promise.all([sb.from('cm_profiles').select().eq('id', me.id).maybeSingle(), sb.from('cm_private').select().eq('id', me.id).maybeSingle()]);
  profile = p.data || { id: me.id, pseudo: me.user_metadata?.pseudo || '', bio: '', fav: null, team: [], tags: [], server: '', photos: [] };
  profile.mc = c.data?.mc || ''; profile.birth = c.data?.birth || '';
  fillEdit();
  // Profil vide ou sans date de naissance : on commence par le remplir
  if (!p.data || !c.data) { show('me'); toast('Bienvenue ! Remplis ton profil pour apparaître chez les autres.'); } else loadDeck();
  refreshMatches();
}

/* ---------- Carte de profil ---------- */
function profileCard(p) {
  const photos = p.photos?.length ? p.photos : [];
  const fav = p.fav ? `<span class="fav"><img src="${mini(p.fav)}" alt="">${esc(POKE[p.fav - 1])}</span>` : '';
  return `<div class="pcard" data-id="${p.id}">
    <div class="photos">${photos.length ? photos.map((u, i) => `<img src="${esc(u)}" class="${i ? '' : 'on'}" alt="" draggable="false">`).join('')
      : `<div class="nophoto" style="--c:${hue(p.pseudo)}"><img src="${art(p.fav || 25)}" alt="" draggable="false"></div>`}</div>
    ${photos.length > 1 ? `<div class="bars">${photos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
    <span class="stamp like">OK !</span><span class="stamp nope">NON</span>
    <div class="info">
      <h2>${esc(p.pseudo)}<span class="age">${p.age ?? ''}</span> ${fav}</h2>
      ${p.server ? `<p class="srv">📍 ${esc(p.server)}</p>` : ''}
      ${p.tags?.length ? `<div class="chips">${p.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ''}
      ${p.team?.length ? `<div class="tm">${p.team.map(id => `<img src="${mini(id)}" title="${esc(POKE[id - 1])}" alt="">`).join('')}</div>` : ''}
    </div></div>`;
}
const hue = s => `hsl(${[...String(s)].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360} 70% 62%)`;

/* ---------- Pile à swiper ---------- */
async function loadDeck() {
  deck = must(await sb.rpc('cm_deck'));
  renderStack();
}
function renderStack() {
  const st = $('#stack');
  st.innerHTML = deck.length ? deck.slice(0, 3).reverse().map(profileCard).join('')
    : `<div class="empty"><img src="${art(143)}" alt=""><h2>Plus personne pour l'instant</h2><p>Reviens plus tard : de nouveaux dresseurs arrivent tous les jours.</p><button class="btn" id="reload">Actualiser</button></div>`;
  $('#reload')?.addEventListener('click', loadDeck);
  document.querySelectorAll('.deck-btns .round').forEach(b => b.disabled = !deck.length);
  const top = st.lastElementChild;
  if (top?.classList.contains('pcard')) drag(top);
}
// Glisser la carte du dessus ; un appui court sur la photo passe à la suivante
function drag(card) {
  let x0, y0, dx = 0, dy = 0, down = false;
  card.onpointerdown = e => { down = true; x0 = e.clientX; y0 = e.clientY; dx = dy = 0; card.setPointerCapture(e.pointerId); card.style.transition = 'none'; };
  card.onpointermove = e => {
    if (!down) return;
    dx = e.clientX - x0; dy = e.clientY - y0;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
    card.style.setProperty('--like', Math.max(0, Math.min(1, dx / 110)));
    card.style.setProperty('--nope', Math.max(0, Math.min(1, -dx / 110)));
  };
  card.onpointerup = e => {
    if (!down) return;
    down = false; card.style.transition = '';
    if (Math.abs(dx) > 110) return swipe(dx > 0);
    card.style.transform = ''; card.style.setProperty('--like', 0); card.style.setProperty('--nope', 0);
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) nextPhoto(card, e.clientX > card.getBoundingClientRect().left + card.offsetWidth / 2 ? 1 : -1);
  };
}
function nextPhoto(card, d) {
  const imgs = card.querySelectorAll('.photos img'), bars = card.querySelectorAll('.bars i');
  if (imgs.length < 2) return;
  const i = [...imgs].findIndex(x => x.classList.contains('on')), j = Math.max(0, Math.min(imgs.length - 1, i + d));
  imgs[i].classList.remove('on'); imgs[j].classList.add('on');
  bars[i]?.classList.remove('on'); bars[j]?.classList.add('on');
}
let swiping = false;
async function swipe(like) {
  const card = $('#stack').lastElementChild, p = deck[0];
  if (!p || swiping || !card?.classList.contains('pcard')) return;
  swiping = true;
  card.style.setProperty(like ? '--like' : '--nope', 1);
  card.style.transform = `translate(${like ? 120 : -120}vw, -40px) rotate(${like ? 30 : -30}deg)`;
  card.classList.add('gone');
  try {
    const match = must(await sb.rpc('cm_swipe', { p_to: p.id, p_like: like }));
    if (match) showMatch(p);
  } catch (e) { toast(e.message); }
  setTimeout(() => { deck.shift(); swiping = false; renderStack(); if (deck.length < 3) topUp(); }, 280);
}
async function topUp() {
  const more = must(await sb.rpc('cm_deck')).filter(p => !deck.some(d => d.id === p.id));
  if (!more.length) return;
  const wasEmpty = !deck.length;
  deck.push(...more);
  if (wasEmpty) renderStack();
}
async function showMatch(p) {
  const m = must(await sb.rpc('cm_matches')).find(x => x.id === p.id);
  const o = $('#overlay');
  o.hidden = false; o.className = 'overlay match';
  o.innerHTML = `<div class="match-box"><h2>C'est un match !</h2><p>${esc(p.pseudo)} a aussi craqué pour toi.</p>
    <div class="duo"><img src="${art(profile.fav || 25)}" alt=""><span>♥</span><img src="${art(p.fav || 25)}" alt=""></div>
    ${m?.mc ? `<p>Son prénom : <b>${esc(m.mc)}</b></p>` : ''}<p>Retrouvez-vous à la taverne !</p>
    <button class="btn" id="mOk">Continuer à swiper</button></div>`;
  $('#mOk').onclick = () => { o.hidden = true; };
  o.querySelector('.copy')?.addEventListener('click', e => copy(e.target.textContent));
  refreshMatches();
}
const copy = t => navigator.clipboard?.writeText(t).then(() => toast('Copié !'));
async function report() {
  const p = deck[0];
  if (!p) return;
  const reason = prompt(`Pourquoi signaler ${p.pseudo} ? (photo choquante, insultes, faux profil…)`);
  if (!reason?.trim()) return;
  try { must(await sb.from('cm_reports').insert({ from_id: me.id, to_id: p.id, reason: reason.trim().slice(0, 300) })); toast('Merci, le profil est signalé.'); } catch (e) { toast(e.message); }
  swipe(false);
}
$('#btnNo').onclick = () => swipe(false);
$('#btnYes').onclick = () => swipe(true);
$('#btnFlag').onclick = report;
document.addEventListener('keydown', e => {
  if (!$('#deck').classList.contains('on') || e.target.closest('input, textarea')) return;
  if (e.key === 'ArrowLeft') swipe(false);
  if (e.key === 'ArrowRight') swipe(true);
});

/* ---------- Matchs ---------- */
let seenMatches = 0;
try { seenMatches = +localStorage.getItem('cm-seen') || 0; } catch {}
async function refreshMatches() {
  let ms;
  try { ms = must(await sb.rpc('cm_matches')); } catch (e) { return toast(e.message); }
  $('#matchDot').hidden = ms.length <= seenMatches;
  $('#mGrid').innerHTML = ms.map(m => `<div class="mcard">
      <div class="m-ph" style="--c:${hue(m.pseudo)}">${m.photos?.[0] ? `<img src="${esc(m.photos[0])}" alt="">` : `<img class="pk" src="${art(m.fav || 25)}" alt="">`}</div>
      <div class="m-in"><b>${esc(m.pseudo)}, ${m.age}</b>${m.server ? `<small>📍 ${esc(m.server)}</small>` : ''}
        ${m.mc ? `<span class="disc">💌 ${esc(m.mc)}</span>` : ''}
        <button class="link" data-un="${m.id}">Retirer</button></div></div>`).join('')
    || `<div class="empty"><img src="${art(39)}" alt=""><h2>Pas encore de match</h2><p>Swipe à droite les dresseurs qui te plaisent !</p></div>`;
  $('#mGrid').dataset.n = ms.length;
}
$('#mGrid').onclick = async e => {
  const c = e.target.closest('[data-copy]'), u = e.target.closest('[data-un]');
  if (c) copy(c.dataset.copy);
  if (u && confirm('Retirer ce match ?')) { must(await sb.rpc('cm_unmatch', { p_id: u.dataset.un })); refreshMatches(); }
};

/* ---------- Mon profil ---------- */
$('#pokeList').innerHTML = POKE.map(n => `<option value="${n}">`).join('');
function fillEdit() {
  $('#fBio').value = profile.bio; $('#bioN').textContent = `${profile.bio.length}/300`;
  $('#fFav').value = profile.fav ? POKE[profile.fav - 1] : ''; favPreview();
  $('#fServer').value = profile.server; $('#fMc').value = profile.mc;
  $('#fBirth').value = profile.birth; $('#fBirth').disabled = !!profile.birth;
  $('#fBirth').max = new Date(Date.now() - 18 * 365.25 * 864e5).toISOString().slice(0, 10);
  renderPhotos(); renderTeam(); renderTags();
}
function renderPhotos() {
  $('#phGrid').innerHTML = profile.photos.map((u, i) => `<div class="ph"><img src="${esc(u)}" alt=""><button type="button" data-del="${i}" aria-label="Retirer">✕</button></div>`).join('')
    + (profile.photos.length < 4 ? '<button type="button" class="ph add" id="phAdd">＋<small>Ajouter</small></button>' : '');
  $('#phAdd')?.addEventListener('click', () => $('#phFile').click());
}
function renderTeam() {
  $('#team').innerHTML = profile.team.map((id, i) => `<button type="button" class="tm-c" data-rm="${i}" title="Retirer ${esc(POKE[id - 1])}"><img src="${mini(id)}" alt="">${esc(POKE[id - 1])} ✕</button>`).join('');
  $('#fTeam').disabled = profile.team.length >= 6;
}
function renderTags() {
  $('#tags').innerHTML = TAGS.map(t => `<button type="button" class="tag${profile.tags.includes(t) ? ' on' : ''}">${t}</button>`).join('');
}
function favPreview() { const id = pokeId($('#fFav').value); $('#favImg').src = id ? mini(id) : ''; $('#favImg').hidden = !id; }
$('#fFav').oninput = favPreview;
$('#fBio').oninput = e => { $('#bioN').textContent = `${e.target.value.length}/300`; };
$('#fTeam').onkeydown = e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const id = pokeId(e.target.value);
  if (!id) return toast('Pokémon inconnu : choisis-le dans la liste.');
  if (profile.team.length < 6) profile.team.push(id);
  e.target.value = ''; renderTeam();
};
$('#fTeam').onchange = e => { const id = pokeId(e.target.value); if (id && profile.team.length < 6) { profile.team.push(id); e.target.value = ''; renderTeam(); } };
$('#team').onclick = e => { const b = e.target.closest('[data-rm]'); if (b) { profile.team.splice(+b.dataset.rm, 1); renderTeam(); } };
$('#tags').onclick = e => {
  const b = e.target.closest('.tag');
  if (!b) return;
  const t = b.textContent, i = profile.tags.indexOf(t);
  if (i >= 0) profile.tags.splice(i, 1); else if (profile.tags.length < 6) profile.tags.push(t); else return toast('6 choix maximum.');
  renderTags();
};
$('#phGrid').onclick = async e => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  const [u] = profile.photos.splice(+b.dataset.del, 1);
  renderPhotos();
  await sb.storage.from('cm-photos').remove([u.split('/cm-photos/')[1]]);
};
// Photo réduite à 1080 px en WebP avant l'envoi (plus léger, et les métadonnées comme la position GPS disparaissent)
$('#phFile').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const bmp = await createImageBitmap(f), k = Math.min(1, 1080 / Math.max(bmp.width, bmp.height));
    const cv = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, 'image/webp', .85));
    const path = `${me.id}/${Date.now()}.webp`;
    must(await sb.storage.from('cm-photos').upload(path, blob, { contentType: 'image/webp' }));
    profile.photos.push(sb.storage.from('cm-photos').getPublicUrl(path).data.publicUrl);
    renderPhotos();
  } catch (err) { toast('Envoi impossible : ' + err.message); }
};
$('#edit').onsubmit = async e => {
  e.preventDefault();
  const fav = pokeId($('#fFav').value);
  if ($('#fFav').value.trim() && !fav) return toast('Pokémon préféré inconnu : choisis-le dans la liste.');
  Object.assign(profile, { bio: $('#fBio').value.trim(), fav, server: $('#fServer').value.trim(), mc: $('#fMc').value.trim(), birth: $('#fBirth').value });
  const { mc, birth, ...row } = profile;
  $('#save').disabled = true;
  try {
    must(await sb.from('cm_private').upsert({ id: me.id, birth, mc })); // refusé par le serveur avant 18 ans
    must(await sb.from('cm_profiles').upsert(row));
    $('#fBirth').disabled = true;
    toast('Profil enregistré !');
    if (!deck.length) loadDeck();
  } catch (err) { toast(err.message); }
  $('#save').disabled = false;
};
$('#logout').onclick = async () => { await sb.auth.signOut(); location.reload(); };

/* ---------- Onglets ---------- */
function show(v) {
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('on', e.id === v));
  document.querySelectorAll('.tabs button').forEach(e => e.classList.toggle('on', e.dataset.view === v));
  if (v === 'matches') { seenMatches = +$('#mGrid').dataset.n || 0; try { localStorage.setItem('cm-seen', seenMatches); } catch {} $('#matchDot').hidden = true; refreshMatches(); }
}
document.querySelector('.tabs').onclick = e => { const b = e.target.closest('button'); if (b) show(b.dataset.view); };

sb.auth.getSession().then(({ data }) => data.session ? start() : authScreen());
