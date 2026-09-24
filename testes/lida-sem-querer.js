// Bancada: a conversa NUNCA vira "lida" sem você. No app, o único gesto que marca como
// lida sem abrir é arrastar a conversa para a direita — e só com o arrasto inteiro.
// Um "peteleco" curto (rolando a lista na diagonal) não pode marcar.
// Uso: node testes/lida-sem-querer.js   (INDEX=/caminho/index.html para medir outra versão)
const http = require('http'), fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const INDEX = process.env.INDEX || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX, 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/version.txt')) return r.end('1');
  if (q.url === '/' || q.url.startsWith('/?')) { r.setHeader('content-type', 'text/html; charset=utf-8'); return r.end(html); }
  r.statusCode = 404; r.end('');
});
srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  const ctx = await b.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  const pg = await ctx.newPage();
  await pg.route(u => !String(u).startsWith(base), rt => rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await pg.goto(base + '/', { waitUntil: 'load' }); await pg.waitForTimeout(1200);
  // arrasta a linha da conversa: dx pixels para a direita em "ms" milissegundos
  const arrasta = (dx, ms) => pg.evaluate(async ({ dx, ms }) => {
    const agora = new Date().toISOString();
    allContacts = [{ phone: '5511900001111', name: 'Lead', unread_count: 3, first_unread_at: agora, last_message_at: agora, last_message_direction: 'inbound', last_message_preview: 'oi' }];
    document.querySelectorAll('.overlay.open,#login-overlay,#setup-overlay').forEach(e => { e.style.display = 'none'; e.classList.remove('open'); });
    renderContacts(allContacts);
    const wrap = document.querySelector('.contact-swipe-wrap[data-phone="5511900001111"]');
    if (!wrap) throw new Error('linha da conversa não desenhada');
    const alvo = wrap.querySelector('.contact-item'), list = document.getElementById('contacts-list');
    const r = alvo.getBoundingClientRect(), x0 = r.left + 60, y0 = r.top + r.height / 2;
    const toque = (x, y) => new Touch({ identifier: 1, target: alvo, clientX: x, clientY: y });
    const disp = (tipo, x, y) => alvo.dispatchEvent(new TouchEvent(tipo, { bubbles: true, cancelable: true, touches: tipo === 'touchend' ? [] : [toque(x, y)], changedTouches: [toque(x, y)] }));
    window.__lida = 0; const orig = window.fetch;
    window.fetch = (u, o) => { if (/\/read$/.test(String(u))) window.__lida++; return orig(u, o); };
    await new Promise(r => setTimeout(r, 200)); // lista parada
    disp('touchstart', x0, y0);
    const passos = 6;
    for (let i = 1; i <= passos; i++) { await new Promise(r => setTimeout(r, ms / passos)); disp('touchmove', x0 + dx * i / passos, y0 + (dx > 0 ? 3 : 0)); }
    disp('touchend', x0 + dx, y0);
    await new Promise(r => setTimeout(r, 400));
    window.fetch = orig;
    return { lidaServidor: window.__lida, naoLidas: (allContacts.find(c => c.phone === '5511900001111') || {}).unread_count };
  }, { dx, ms });
  const res = {};
  const t = async (nome, fn) => { try { res[nome] = (await fn()) ? 'ok' : 'FALHA'; } catch (e) { res[nome] = 'não medido: ' + e.message; } };
  await t('peteleco curto (25px rápido) ao rolar NÃO marca como lida', async () => { const r = await arrasta(25, 60); return r.lidaServidor === 0 && r.naoLidas === 3; });
  await t('[normal] arrasto inteiro para a direita marca como lida', async () => { const r = await arrasta(90, 250); return r.lidaServidor === 1 && r.naoLidas === 0; });
  let verm = 0;
  for (const [k, v] of Object.entries(res)) { console.log((v === 'ok' ? 'ok       ' : 'FALHA    ') + k + (v === 'ok' || v === 'FALHA' ? '' : ' — ' + v)); if (v !== 'ok') verm++; }
  console.log(verm ? 'VERMELHO (' + verm + ')' : 'VERDE');
  await b.close(); srv.close(); process.exit(verm ? 1 : 0);
});
