import {D, step, anchorOf, doseTimes, status, lastTaken, reanchor} from './schedule.js';
/* ====== COLE AQUI o firebaseConfig do seu app da Web (Firebase > Configurações do projeto) ====== */
const cfg = {
  apiKey: "AIzaSyBCiZn_rnvezGnnxcOWv4qFGsJq1iQQBwQ",
  authDomain: "candela-ccb6e.firebaseapp.com",
  databaseURL: "https://candela-ccb6e-default-rtdb.firebaseio.com",
  projectId: "candela-ccb6e",
  storageBucket: "candela-ccb6e.firebasestorage.app",
  messagingSenderId: "317430061799",
  appId: "1:317430061799:web:f6ec67a1f4be6abe37a042"
};
/* ================================================================================================ */

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
const I = n => `<svg class="i"><use href="#i-${n}"/></svg>`;

const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const LN = NATIVE ? window.Capacitor.Plugins.LocalNotifications : null;
if (NATIVE) document.documentElement.classList.add('native');
let meds = LS('rem-cache') || [];
let notified = LS('rem-notified') || {};
let space = LS('rem-space');
const newCode = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; return Array.from(crypto.getRandomValues(new Uint8Array(12)), b => a[b % a.length]).join(''); };
if (!space) { space = newCode(); LS('rem-space', space); }
const path = () => `espacos/${space}/remedios`;

/* ---------- Firebase (carrega só se o config foi preenchido) ---------- */
let db = null, fb = null, unsub = null;
const SYNC = {ok: 'Sincronizado', local: 'Só neste aparelho', off: 'Sem conexão', err: 'Erro ao sincronizar'};
const setSync = k => { $('sync').className = 'chip ' + k; $('sync').textContent = SYNC[k]; };

async function initFirebase() {
  if (cfg.apiKey.startsWith('COLE')) return setSync('local');
  try {
    const V = '10.12.2', U = n => `https://www.gstatic.com/firebasejs/${V}/firebase-${n}.js`;
    const [a, au, d] = await Promise.all([import(U('app')), import(U('auth')), import(U('database'))]);
    const app = a.initializeApp(cfg);
    await au.signInAnonymously(au.getAuth(app));
    db = d.getDatabase(app); fb = d;
    subscribe();
  } catch (e) { console.error(e); setSync('err'); }
}
function subscribe() {
  if (!db) return;
  unsub && unsub();
  unsub = fb.onValue(fb.ref(db, path()), snap => {
    const v = snap.val() || {};
    if (!LS('rem-mig-' + space)) {            // primeira conexão: sobe o que já existia neste aparelho
      LS('rem-mig-' + space, 1);
      if (!Object.keys(v).length && meds.length) { meds.forEach(push); setSync('ok'); return; }
    }
    meds = Object.values(v);
    const q = LS('rem-pending-ack') || {};          // "Já tomei" tocado na notificação antes de conectar
    meds.forEach(m => { if (q[m.id] > (m.ack || 0)) { m.ack = q[m.id]; push(m); } });
    LS('rem-pending-ack', {}); LS('rem-cache', meds);
    setSync(navigator.onLine ? 'ok' : 'off'); render(); check();
  }, () => setSync('err'));
}
const push = m => {
  LS('rem-cache', meds);
  if (db) fb.set(fb.ref(db, `${path()}/${m.id}`), JSON.parse(JSON.stringify(m))).catch(() => setSync('err'));   // o JSON remove campos undefined
};
const drop = m => { meds = meds.filter(x => x !== m); LS('rem-cache', meds); if (db) fb.remove(fb.ref(db, `${path()}/${m.id}`)).catch(() => setSync('err')); };

/* ---------- Doses ---------- */

/* ---------- Formatação ---------- */
const hm = t => new Date(t).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
function when(t) {
  const d = new Date(t), diff = Math.round((new Date(d).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / D);
  const day = diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : diff === -1 ? 'ontem' : d.toLocaleDateString('pt-BR', {weekday: 'short', day: '2-digit', month: '2-digit'});
  return `${day} às ${hm(t)}`;
}
function rel(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'menos de 1 min';
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return h + ' h' + (r ? ' ' + r + ' min' : '');
  return Math.floor(h / 24) + ' d' + (h % 24 ? ' ' + (h % 24) + ' h' : '');
}
const hue = m => [175, 18, 262, 38, 212, 340][[...(m.patient || m.id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 6];

/* ---------- Interface ---------- */
let first = true, filter = '';
function heroHTML(S, now) {
  const d = S.find(x => x.s.due);
  if (d) { const {m, s} = d;
    return `<section class="hero due"><span class="ic big pulse" style="--h:${hue(m)}">${I('pill')}</span><div class="hb"><div class="k">Hora de tomar${m.patient ? ' · ' + esc(m.patient) : ''}</div><div class="t">${esc(m.name)}</div><div class="meta">${esc(m.dose)} · dose das ${hm(s.due)} (<span class="cd" data-ts="${s.due}" data-m="since"></span>)</div></div><button class="btn" data-a="ack" data-id="${m.id}">${I('check')}Já tomei</button></section>`; }
  const n = S.filter(x => x.s.next).sort((a, b) => a.s.next - b.s.next)[0];
  if (n) { const {m, s} = n, st = step(m), f = Math.min(1, Math.max(0, (now - (s.next - st)) / st)), C = 2 * Math.PI * 34;
    return `<section class="hero"><div class="ring"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34"/><circle class="pg" cx="40" cy="40" r="34" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}"/></svg><span class="ic" style="--h:${hue(m)}">${I('pill')}</span></div><div class="hb"><div class="k">Próxima dose em <span class="cd" data-ts="${s.next}" data-m="until"></span></div><div class="t">${esc(m.name)}</div><div class="meta">${m.patient ? esc(m.patient) + ' · ' : ''}${esc(m.dose)} · ${when(s.next)}</div></div></section>`; }
  return `<section class="hero"><div class="hb"><div class="t">${meds.length ? 'Tudo em dia' : 'Vamos começar?'}</div><div class="meta">${meds.length ? 'Nenhuma dose pendente no momento.' : 'Toque em “Novo remédio” para criar seu primeiro lembrete.'}</div></div></section>`;
}
function cardHTML({m, s}, i, now) {
  const dayN = Math.min(m.days, Math.max(1, Math.floor((now - m.start) / D) + 1)), pct = Math.min(100, Math.max(0, (now - m.start) / (m.days * D) * 100));
  const tag = s.due ? `<span class="tag warm">Hora de tomar · <span class="cd" data-ts="${s.due}" data-m="since"></span></span>` : s.next ? `<span class="tag">Em <span class="cd" data-ts="${s.next}" data-m="until"></span> · ${when(s.next)}</span>` : '<span class="tag okk">Concluído</span>';
  return `<article class="card${s.due ? ' due' : ''}" style="--h:${hue(m)};--i:${i}" data-id="${m.id}">
    <div class="top"><span class="ic">${I('pill')}</span><div>${m.patient ? `<span class="who">${esc(m.patient)}</span>` : ''}<div class="t">${esc(m.name)}</div><div class="meta">${esc(m.dose)} · a cada ${m.hours} h</div></div></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="row">${tag}<span class="meta">${now < m.start ? 'Começa ' + when(m.start) : 'Dia ' + dayN + ' de ' + m.days}</span></div>
    ${lastTaken(m) ? `<div class="meta">Última dose: ${when(lastTaken(m))}</div>` : ''}
    <div class="acts">${s.due ? `<button class="btn sm" data-a="ack" data-id="${m.id}">Já tomei</button>` : ''}<button class="ghost" data-a="edit" data-id="${m.id}">${I('edit')}Editar</button><button class="ghost" data-a="ics" data-id="${m.id}">${I('cal')}Calendário</button><button class="ghost danger" data-a="del" data-id="${m.id}" aria-label="Remover ${esc(m.name)}">${I('trash')}</button></div></article>`;
}
function render() {
  const now = Date.now(), h = new Date().getHours();
  $('hi').textContent = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const S = meds.map(m => ({m, s: status(m, now)})).sort((a, b) => (!!b.s.due - !!a.s.due) || ((a.s.next || 9e15) - (b.s.next || 9e15)));
  document.body.classList.toggle('first', first);
  const pats = [...new Set(meds.map(m => m.patient).filter(Boolean))].sort();
  if (!pats.includes(filter)) filter = '';
  $('flt').hidden = pats.length < 2;
  $('flt').innerHTML = ['', ...pats].map(p => `<button type="button" data-p="${esc(p)}" aria-pressed="${p === filter}">${p ? esc(p) : 'Todos'}</button>`).join('');
  $('hero').innerHTML = heroHTML(S, now);
  const L = filter ? S.filter(x => x.m.patient === filter) : S;
  $('list').innerHTML = L.length ? L.map((x, i) => cardHTML(x, i, now)).join('') : '';
  first = false; lastSig = sig(); tick(); scheduleNative();
}
let tt, lastSig = '', beat = 0;
const sig = () => meds.map(m => m.id + ':' + (status(m, Date.now()).due || 0)).join();
function tick() {
  const now = Date.now();
  document.querySelectorAll('.cd').forEach(e => {
    const d = now - e.dataset.ts, since = e.dataset.m === 'since', late = since && d >= 1800000;
    e.textContent = since ? (late ? 'atrasado há ' : 'há ') + rel(d) : rel(-d);
    e.classList.toggle('late', late);
  });
}
function heartbeat() {
  if (sig() !== lastSig) return check();          // uma dose venceu ou foi marcada: redesenha e avisa
  tick();
  if (++beat % 6 === 0 && !document.querySelector('button:active')) render();   // ~1x por minuto: atualiza anel e barras
}
function toast(text, label, fn) {
  const e = $('toast'); e.textContent = text;
  if (label) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.onclick = () => { fn(); e.classList.remove('on'); };
    e.append(b);
  }
  e.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('on'), label ? 6000 : 2400);
}

/* ---------- Eventos ---------- */
const commit = m => { push(m); render(); };

function takeDose(m) {
  const due = status(m, Date.now()).due;
  if (!due) return render();
  const prev = {ack: m.ack || 0, taken: m.taken || 0, anchor: anchorOf(m)};
  Object.assign(m, {ack: due, taken: Date.now()}); commit(m);
  toast('Dose registrada', 'Desfazer', () => { Object.assign(m, prev); commit(m); });
}
function removeMed(m) {
  drop(m); render();
  toast('Remédio removido', 'Desfazer', () => { meds.push(m); commit(m); });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const m = meds.find(x => x.id === b.dataset.id); if (!m) return;
  switch (b.dataset.a) {
    case 'ics': return downloadIcs(m);
    case 'edit': return openForm(m);
    case 'del': return removeMed(m);
    case 'ack':
      b.closest('.card,.hero').classList.add('done'); navigator.vibrate && navigator.vibrate(30);
      setTimeout(() => takeDose(m), 450);
  }
});
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

const toLocalInput = t => { const d = new Date(t); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
let editingId = null;
/** Abre o formulário vazio (novo remédio) ou preenchido com `m` (edição). */
function openForm(m) {
  editingId = m ? m.id : null;
  const taken = m ? lastTaken(m) : 0;
  $('tAdd').textContent = m ? 'Editar lembrete' : 'Novo remédio';
  $('bSave').textContent = m ? 'Salvar alterações' : 'Salvar remédio';
  $('lastWrap').hidden = !m;
  $('firstWrap').hidden = !!taken;                      // com dose já tomada, a grade parte da última dose
  $('patient').value = m ? m.patient || '' : LS('rem-last-patient') || '';
  $('name').value = m ? m.name : ''; $('dose').value = m ? m.dose : '';
  $('hours').value = m ? m.hours : 8; $('days').value = m ? m.days : 7;
  $('start').value = toLocalInput(m ? m.start : Date.now());
  $('last').value = taken ? toLocalInput(taken) : ''; $('last').setCustomValidity('');
  syncChips(); drawPChips(); $('dAdd').showModal();
}
const syncChips = () => document.querySelectorAll('#chips button').forEach(b => b.setAttribute('aria-pressed', b.dataset.h === $('hours').value));
$('chips').onclick = e => { const b = e.target.closest('button'); if (b) { $('hours').value = b.dataset.h; syncChips(); } };
$('hours').oninput = syncChips;
function drawPChips() {
  const pats = [...new Set(meds.map(m => m.patient).filter(Boolean))].sort(), cur = $('patient').value.trim();
  $('pchips').innerHTML = pats.map(p => `<button type="button" data-p="${esc(p)}" aria-pressed="${p === cur}">${esc(p)}</button>`).join('');
}
$('pchips').onclick = e => { const b = e.target.closest('button'); if (b) { $('patient').value = b.dataset.p; drawPChips(); } };
$('patient').oninput = drawPChips;
$('flt').onclick = e => { const b = e.target.closest('button'); if (b) { filter = b.dataset.p; render(); } };
$('bAdd').onclick = () => openForm();

/** Lê e valida o formulário; devolve null se inválido. */
function readForm() {
  const last = $('last').value ? new Date($('last').value).getTime() : 0;
  if (last > Date.now() + 60000) { $('last').setCustomValidity('A última dose não pode estar no futuro.'); $('last').reportValidity(); return null; }
  const start = new Date($('start').value).getTime(); if (isNaN(start)) return null;
  return {patient: $('patient').value.trim(), name: $('name').value.trim(), dose: $('dose').value.trim(),
    hours: Math.min(72, Math.max(1, +$('hours').value)), days: Math.min(90, Math.max(1, +$('days').value)), start, last};
}
function addMed(v) {
  const m = {id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), patient: v.patient, name: v.name, dose: v.dose,
    hours: v.hours, days: v.days, start: v.start, end: v.start + v.days * D, ack: 0};
  LS('rem-last-patient', m.patient); meds.push(m); commit(m); check(); toast('Remédio adicionado');
}
function updateMed(m, v) {
  const before = lastTaken(m), minute = t => Math.floor(t / 60000);
  Object.assign(m, {patient: v.patient, name: v.name, dose: v.dose, hours: v.hours, days: v.days});
  if (v.last && minute(v.last) !== minute(before)) Object.assign(m, reanchor(v.last));   // nova última dose: os próximos horários partem dela
  else if (!before) Object.assign(m, {start: v.start, anchor: v.start});
  m.end = m.start + m.days * D;
  commit(m); check(); toast('Lembrete atualizado');
}
$('last').oninput = () => $('last').setCustomValidity('');
$('bNow').onclick = () => { $('last').value = toLocalInput(Date.now()); $('last').setCustomValidity(''); };
$('f').onsubmit = e => {
  e.preventDefault();
  const v = readForm(); if (!v) return;
  const m = editingId && meds.find(x => x.id === editingId);
  m ? updateMed(m, v) : addMed(v);
  $('dAdd').close();
};

$('bFam').onclick = () => { $('code').textContent = space; $('dFam').showModal(); };
$('bCopy').onclick = async () => { try { await navigator.clipboard.writeText(space); toast('Código copiado'); } catch (e) { toast('Copie o código manualmente'); } };
$('bJoin').onclick = () => {
  const c = $('join').value.trim().toLowerCase();
  if (!/^[a-z0-9]{8,24}$/.test(c)) return toast('Código inválido');
  space = c; LS('rem-space', c); meds = []; LS('rem-cache', meds); $('join').value = ''; $('dFam').close();
  render(); subscribe(); toast(db ? 'Você entrou na lista compartilhada' : 'Ative o Firebase para compartilhar');
};

/* ---------- Calendário (.ics) ---------- */
const utc = t => new Date(t).toISOString().replace(/[-:]|\.\d{3}/g, '');
const ics = s => String(s).replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');
function downloadIcs(m) {
  const stamp = utc(Date.now());
  const ev = doseTimes(m).filter(t => t > (m.ack || 0)).map((t, i) => ['BEGIN:VEVENT', `UID:${m.id}-${i}@hora-do-remedio`, `DTSTAMP:${stamp}`, `DTSTART:${utc(t)}`, `DTEND:${utc(t + 300000)}`,
    `SUMMARY:${ics((m.patient ? m.patient + ': ' : '') + 'Tomar ' + m.name + ' (' + m.dose + ')')}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${ics('Tomar ' + m.name)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT'].join('\r\n'));
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hora do remedio//PT', ...ev, 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([body], {type: 'text/calendar;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = m.name.replace(/[^\w-]+/g, '_') + '.ics';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- Notificações ---------- */
let swReg = null;
if (!NATIVE && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(r => swReg = r).catch(() => {});
async function updatePerm() {
  if (LN) { try { const p = await LN.checkPermissions(); $('bBell').classList.toggle('dot', p.display !== 'granted'); } catch (e) {} return; }
  $('bBell').classList.toggle('dot', !('Notification' in window) || Notification.permission !== 'granted');
}
$('bBell').onclick = async () => {
  if (LN) return enableNative(false);
  if (!('Notification' in window)) return toast('Este navegador não suporta notificações');
  if (Notification.permission === 'granted') return toast('Notificações já estão ativas');
  await Notification.requestPermission(); updatePerm();
  if (Notification.permission === 'denied') toast('Permita notificações nas configurações do site');
};
function notify(m) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const o = {body: `${m.patient ? m.patient + ': ' : ''}${m.name} — ${m.dose}`, tag: m.id, requireInteraction: true, vibrate: [300, 100, 300], icon: 'icon.svg'};
  if (swReg) swReg.showNotification('Hora do remédio', o).catch(() => {});
  else { try { new Notification('Hora do remédio', o); } catch (e) {} }
}
function check() {
  const now = Date.now();
  meds.forEach(m => { const s = status(m, now); if (s.due && s.due > (notified[m.id] || 0)) { notified[m.id] = s.due; LS('rem-notified', notified); if (!LN) notify(m); } });
  render();
}

/* ---------- App nativo (Capacitor): alarmes agendados no próprio celular ---------- */
// Cada aparelho agenda as próprias notificações a partir da lista de remédios.
// Elas disparam com o app fechado e sem internet. Até 3 avisos por dose: na hora, +10 min e +20 min.
const hash = str => { let h = 5381; for (const c of str) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return (h & 0x7fffffff) || 1; };
let schedKey = '', schedBusy = false;
async function scheduleNative(force) {
  if (!LN || schedBusy) return;
  const key = JSON.stringify(meds.map(m => [m.id, m.start, m.anchor, m.end, m.hours, m.days, m.ack, m.name, m.dose, m.patient]));
  if (!force && key === schedKey) return;
  schedBusy = true; schedKey = key;
  try {
    if ((await LN.checkPermissions()).display !== 'granted') return;
    const pend = await LN.getPending();
    if (pend.notifications.length) await LN.cancel({notifications: pend.notifications.map(n => ({id: n.id}))});
    const now = Date.now(), items = [];
    meds.forEach(m => doseTimes(m).forEach((t, k) => {
      if (t <= (m.ack || 0)) return;
      [0, 10, 20].forEach(r => { const at = t + r * 60000; if (at > now) items.push({m, t, r, at, k}); });
    }));
    items.sort((a, b) => a.at - b.at);
    const list = items.slice(0, 120).map(({m, t, r, at, k}) => ({
      id: hash(`${m.id}:${k}:${r}`),
      title: r ? 'Lembrete: já tomou o remédio?' : 'Hora do remédio',
      body: `${m.patient ? m.patient + ': ' : ''}${m.name} — ${m.dose}`,
      schedule: {at: new Date(at), allowWhileIdle: true},
      channelId: 'doses', actionTypeId: 'DOSE', extra: {medId: m.id, t}
    }));
    if (list.length) await LN.schedule({notifications: list});
  } catch (e) { console.error(e); schedKey = ''; } finally { schedBusy = false; }
}
async function enableNative(silent) {
  const r = await LN.requestPermissions();
  if (r.display !== 'granted') { if (!silent) toast('Permita as notificações nas configurações do app'); return updatePerm(); }
  try { const x = await LN.checkExactNotificationSetting(); if (x.exact_alarm !== 'granted') await LN.changeExactNotificationSetting(); } catch (e) {}
  await scheduleNative(true); updatePerm(); if (!silent) toast('Alarmes ativados');
}
function applyAck(id, t) {
  const q = LS('rem-pending-ack') || {}; q[id] = Math.max(q[id] || 0, t); LS('rem-pending-ack', q);
  const m = meds.find(x => x.id === id);
  if (m) { m.ack = Math.max(m.ack || 0, t); m.taken = Date.now(); commit(m); toast('Dose registrada'); }
}
async function initNative() {
  if (!LN) return;
  try {
    await LN.createChannel({id: 'doses', name: 'Doses de remédio', description: 'Avisos na hora de tomar', importance: 5, visibility: 1, vibration: true, lights: true});
    await LN.registerActionTypes({types: [{id: 'DOSE', actions: [{id: 'tomei', title: 'Já tomei'}]}]});
    LN.addListener('localNotificationActionPerformed', ev => { if (ev.actionId === 'tomei' && ev.notification.extra) applyAck(ev.notification.extra.medId, ev.notification.extra.t); });
    await enableNative(true);
  } catch (e) { console.error(e); }
}

/* ---------- Início ---------- */
window.addEventListener('offline', () => setSync('off'));
window.addEventListener('online', () => setSync(db ? 'ok' : 'local'));
document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); scheduleNative(true); } });
setInterval(heartbeat, 10000);
updatePerm(); render(); check(); initFirebase(); initNative();
