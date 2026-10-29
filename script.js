const $ = (s, r = document) => r.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const NAMES = ['Azul', 'Verde', 'Amarelo', 'Vermelho'];
const COL = ['#00c4f0', '#7bcc3f', '#ffbe2e', '#ff5c54'];
const WIN = 5; // pontos para vencer
const rnd = (a, b) => a + Math.random() * (b - a);
const fresh = () => ({ phase: 'lobby', light: true, scores: [0, 0, 0, 0], locked: [0, 0, 0, 0], seats: [0, 0, 0, 0], win: -1, msg: '' });

const ICE = { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };
const setStatus = t => $('#status').textContent = t || '';
let joinTimer, mode = '', isHost = false, mySeat = -1, roomCode = '', peer, conn, conns = [], timer, S = fresh();

function show(id) { $$('.screen').forEach(e => e.hidden = e.id !== id); }

function leave() {
  clearTimeout(timer);
  const p = peer;
  peer = conn = null; conns = []; mode = ''; isHost = false; mySeat = -1; S = fresh();
  if (p) try { p.destroy(); } catch (e) {}
  clearTimeout(joinTimer); setStatus(''); $('#share').textContent = 'Copiar link da sala';
  document.body.className = 'on';
  show('menu');
}

/* ---------- Motor do jogo (roda no anfitrião / modo local) ---------- */
function push() {
  if (!mode) return;
  render();
  conns.forEach(c => c.open && c.send({ t: 's', s: S, code: roomCode }));
}
function startGame() {
  clearTimeout(timer);
  S.phase = 'play'; S.scores = [0, 0, 0, 0];
  newRound();
}
function newRound() {
  S.win = -1; S.msg = '';
  setLight(true);
}
// light = true  -> diamante SEGURO (guardas olhando): tocar = falta
// light = false -> diamante INSEGURO (escuro): o primeiro a tocar leva o ponto
function setLight(on) {
  clearTimeout(timer);
  S.light = on; S.locked = [0, 0, 0, 0]; S.msg = '';
  push();
  // tempos aleatórios para ninguém prever a hora de agir
  timer = setTimeout(() => setLight(!on), on ? rnd(1800, 4200) : rnd(1500, 3000));
}
function engineTap(p) {
  if (S.phase !== 'play' || S.win >= 0 || S.locked[p] || !S.seats[p]) return;
  if (S.light) { // seguro: quem toca é pego e fica travado até as luzes mudarem
    S.locked[p] = 1;
    S.scores[p] = Math.max(0, S.scores[p] - 1);
    S.msg = NAMES[p] + ' foi pego! −1';
  } else {       // inseguro: o PRIMEIRO a tocar ganha 1 ponto e a rodada acaba
    S.win = p; S.scores[p]++;
    clearTimeout(timer);
    if (S.scores[p] >= WIN) { S.phase = 'over'; S.msg = NAMES[p] + ' venceu!'; }
    else { S.msg = NAMES[p] + ' roubou a joia! +1'; timer = setTimeout(newRound, 1800); }
  }
  push();
}
// se sobrar menos de 2 jogadores no meio da partida, encerra
function checkPlayers() {
  if (S.phase === 'play' && S.seats.filter(Boolean).length < 2) {
    clearTimeout(timer);
    S.phase = 'over'; S.msg = 'Jogadores saíram';
    push();
  }
}

/* ---------- Entrada ---------- */
function tap(i) {
  const el = $$('.pl')[i];
  el.classList.add('reach'); setTimeout(() => el.classList.remove('reach'), 250);
  if (mode === 'online' && !isHost) conn && conn.open && conn.send({ t: 'tap' });
  else engineTap(i);
}
$$('.zone').forEach((z, i) => z.addEventListener('pointerdown', e => {
  e.preventDefault();
  const r = z.getBoundingClientRect(), d = document.createElement('div');
  d.className = 'rip'; d.style.left = (e.clientX - r.left) + 'px'; d.style.top = (e.clientY - r.top) + 'px';
  z.appendChild(d); setTimeout(() => d.remove(), 600);
  if (mode === 'local' || i === mySeat) tap(i);
}));
const KEYS = { q: 0, p: 1, z: 2, m: 3 };
addEventListener('keydown', e => {
  if (e.repeat || $('#game').hidden) return;
  if (mode === 'local') { const i = KEYS[e.key.toLowerCase()]; if (i !== undefined) tap(i); }
  else if (mode === 'online' && mySeat >= 0 && (e.code === 'Space' || e.key === 'Enter')) { e.preventDefault(); tap(mySeat); }
});

/* ---------- Renderização ---------- */
function render() {
  const lobby = S.phase === 'lobby' && mode === 'online';
  show(lobby ? 'lobby' : 'game');
  document.body.className = (S.light || lobby ? 'on' : 'off') + (mode === 'local' ? ' local' : '');
  if (lobby) {
    $('#room').textContent = roomCode;
    $('#seats').innerHTML = S.seats.map((s, i) => `<i class="${s ? 'f' : ''}" style="--c:${COL[i]}"></i>`).join('');
    $('#start').hidden = !isHost;
    $('#start').disabled = S.seats.filter(Boolean).length < 2;
    $('#wait').hidden = isHost;
    return;
  }
  $$('.pl').forEach((el, i) => {
    el.hidden = !S.seats[i];
    el.classList.toggle('lock', !!S.locked[i]);
    el.classList.toggle('win', S.win === i);
    el.classList.toggle('me', mode === 'online' && i === mySeat);
    $('.sc b', el).textContent = S.scores[i];
  });
  $$('.zone').forEach((z, i) => {
    const online = mode === 'online';
    z.hidden = !S.seats[i] || (online && i !== mySeat);   // online: só a sua zona, ocupando a tela toda
    z.classList.toggle('full', online && i === mySeat);
    z.classList.toggle('lock', !!S.locked[i]);
    z.classList.toggle('win', S.win === i);
  });
  $('#hint').textContent = mode === 'online' ? 'Toque em qualquer lugar da tela' : 'Cada jogador toca no seu canto';
  $('#gem').dataset.w = S.win;
  $('#gem').classList.toggle('unsafe', !S.light && S.win < 0);
  $('#msg').textContent = S.msg || (S.light ? 'Diamante seguro… não toque!' : 'DIAMANTE INSEGURO! PEGUE!');
  $('#goal').textContent = 'Primeiro a ' + WIN + ' pontos vence';
  $('#over').hidden = S.phase !== 'over';
  $('#winner').textContent = S.msg;
  $('#again').hidden = mode === 'online' && !isHost;
}

/* ---------- Menus ---------- */
$$('[data-go]').forEach(b => b.onclick = () => b.dataset.go === 'menu' ? leave() : show(b.dataset.go));

$('#startLocal').onclick = () => {
  const n = +$('#n').value;
  mode = 'local'; isHost = true; S = fresh();
  S.seats = [0, 1, 2, 3].map(i => +(i < n));
  startGame();
};
$('#again').onclick = () => startGame();
$('#start').onclick = () => startGame();

/* ---------- Online (PeerJS: sala = código de 4 letras) ---------- */
function hostRoom() {
  roomCode = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join('');
  peer = new Peer('lf-' + roomCode, ICE);
  peer.on('open', () => {
    mode = 'online'; isHost = true; mySeat = 0; S = fresh(); S.seats[0] = 1;
    push();
  });
  peer.on('disconnected', () => { if (peer && !peer.destroyed) peer.reconnect(); });
  peer.on('connection', c => {
    const seat = S.seats.indexOf(0);
    if (S.phase !== 'lobby' || seat < 0) {
      c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); });
      return;
    }
    S.seats[seat] = 1; c.seat = seat; conns.push(c);
    c.on('open', () => { c.send({ t: 'seat', seat }); push(); });
    c.on('data', m => m.t === 'tap' && engineTap(c.seat));
    c.on('close', () => {
      if (!peer) return;
      conns = conns.filter(x => x !== c); S.seats[c.seat] = 0;
      push(); checkPlayers();
    });
  });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { peer.destroy(); hostRoom(); }
    else { alert('Erro de conexão: ' + e.type); leave(); }
  });
}
$('#create').onclick = () => { setStatus('Criando sala…'); hostRoom(); };
$('#share').onclick = async () => {
  const url = location.origin + location.pathname + '?sala=' + roomCode;
  try { if (navigator.share) await navigator.share({ title: 'Light Fingers', text: 'Entre na minha sala!', url }); else { await navigator.clipboard.writeText(url); $('#share').textContent = 'Link copiado!'; } }
  catch (e) { prompt('Copie o link da sala:', url); }
};

$('#join').onclick = () => {
  const code = $('#code').value.trim().toUpperCase();
  if (code.length !== 4) return alert('Digite o código de 4 letras');
  setStatus('Conectando…');
  clearTimeout(joinTimer); joinTimer = setTimeout(() => { if (peer && !isHost && mySeat < 0) { alert('Não foi possível conectar. Verifique o código e a internet de ambos.'); leave(); } }, 12000);
  peer = new Peer(undefined, ICE);
  peer.on('open', () => {
    conn = peer.connect('lf-' + code, { reliable: true });
    mode = 'online'; isHost = false; roomCode = code;
    conn.on('data', m => {
      if (m.t === 'seat') { mySeat = m.seat; clearTimeout(joinTimer); setStatus(''); }
      else if (m.t === 'full') { alert('Sala cheia ou partida em andamento'); leave(); }
      else if (m.t === 's') { S = m.s; roomCode = m.code; render(); }
    });
    conn.on('close', () => { if (peer && mode) { alert('Conexão encerrada'); leave(); } });
  });
  peer.on('error', e => { if (peer) { alert(e.type === 'peer-unavailable' ? 'Sala não encontrada' : 'Erro de conexão: ' + e.type); leave(); } });
};

// abrir o link da sala (?sala=ABCD) já preenche o código
const q = new URLSearchParams(location.search).get('sala');
if (q) { $('#code').value = q.toUpperCase().slice(0, 4); show('online'); }
