// Bancada: texto malicioso vindo do lead/equipe NÃO pode executar código no VETRA.
// Uso: node testes/seguranca-injecao.js        (INDEX=/caminho/index.html para medir outra versão)
// Termina VERDE (0) ou VERMELHO (1).
const http = require('http'), fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const INDEX = process.env.INDEX || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX, 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/version.txt')) return r.end('1');
  if (q.url.startsWith('/?') || q.url === '/') { r.setHeader('content-type', 'text/html; charset=utf-8'); return r.end(html); }
  r.statusCode = 404; r.end('');
});
srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined });
  const pg = await b.newPage();
  await pg.route(u => !String(u).startsWith(base), rt => rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(base + '/?handoff=nonce-do-atacante', { waitUntil: 'load' });
  await pg.waitForTimeout(1500);
  const res = await pg.evaluate(async () => {
    const out = {};
    const espera = () => new Promise(r => setTimeout(r, 150));
    const caixa = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
    const clica = (el) => { el && el.querySelectorAll('[onclick],[onchange]').forEach(e => { try { e.onclick && e.onclick(new MouseEvent('click')); } catch (_) {} }); };
    const mede = async (nome, fn) => { window.__x = 0; try { await fn(); await espera(); out[nome] = window.__x ? 'EXECUTOU' : 'ok'; } catch (e) { out[nome] = 'não medido: ' + e.message; } };
    await mede('localização do lead', async () => {
      caixa().innerHTML = renderMessageContent({ type: 'location', content: '📍 https://x"><img/src/onerror=window.__x=1>\nhttps://maps.google.com/?q=1,1' });
    });
    await mede('nome de documento do lead', async () => {
      const d = caixa(); d.innerHTML = renderMessageContent({ type: 'document', media_id: '1', content: "[Documento: x'-__f()-'.pdf]" }); // sem '=' (o encodeURIComponent trocaria)
      window.__f = () => { window.__x = 1; };
      d.querySelectorAll('.media-dl-link').forEach(a => { try { a.onclick(new MouseEvent('click')); } catch (_) {} });
    });
    await mede('etiqueta no filtro do pipeline', async () => {
      allTagsList = ["<img src=x onerror=window.__x=1>"]; populatePipelineFilterTags(); clica(document.body);
    });
    await mede('etiqueta com aspa no filtro do pipeline', async () => {
      allTagsList = ["x');window.__x=1;//"]; populatePipelineFilterTags(); clica(document.getElementById('pf-tags-list') || document.body);
    });
    await mede('nome de coluna do funil', async () => {
      pipelineStages = [{ id: 's1', name: '"><img src=x onerror=window.__x=1>' }]; renderKanbanWith([]);
    });
    await mede('resposta rápida da equipe', async () => {
      quickReplies = [{ title: '"><img src=x onerror=window.__x=1>', message: '</textarea><img src=x onerror=window.__x=1>' }]; showQRForm(0);
    });
    // Login: um link ?handoff= de terceiro NÃO pode mandar a sessão já guardada ao servidor
    await mede('link ?handoff= de terceiro', async () => {
      window.__fetchOriginal = async (u) => { if (String(u).includes('/auth-handoff')) window.__x = 1; return new Response('{}'); };
      try { _supaAuth = _supaAuth || { auth: { stopAutoRefresh() {} } }; } catch (_) {}
      await _entregaSessaoAoApp({ access_token: 'tok-guardado', refresh_token: 'ref-guardado' });
    });
    // ── Funciona igual para o uso normal ──
    const igual = async (nome, fn) => { try { out[nome] = (await fn()) ? 'ok' : 'MUDOU'; } catch (e) { out[nome] = 'não medido: ' + e.message; } };
    await igual('etiqueta normal com acento/aspa chega certa no clique', async () => {
      let got = null; const orig = window.togglePFTag; window.togglePFTag = (t) => { got = t; };
      allTagsList = ["Cliente D'Ávila \"VIP\""]; populatePipelineFilterTags();
      const el = [...document.querySelectorAll('[onclick*="togglePFTag"]')].pop(); el.onclick(new MouseEvent('click'));
      window.togglePFTag = orig; return got === "Cliente D'Ávila \"VIP\"" && el.textContent === got;
    });
    await igual('resposta rápida mostra o texto original', async () => {
      quickReplies = [{ title: 'Preço & "prazo"', message: 'Olá {nome} <b>&amp;</b>' }]; showQRForm(0);
      return document.getElementById('qr-title').value === 'Preço & "prazo"' && document.getElementById('qr-message').value === 'Olá {nome} <b>&amp;</b>';
    });
    await igual('coluna do funil mostra o nome original', async () => {
      pipelineStages = [{ id: 's1', name: 'Negociação "quente"' }]; renderKanbanWith([]);
      const i = document.querySelector('[data-stage-id="s1"] .kanban-col-name'); return i && i.value === 'Negociação "quente"';
    });
    await igual('baixar documento: nome do arquivo chega igual ao servidor', async () => {
      const d = caixa(); d.innerHTML = renderMessageContent({ type: 'document', media_id: '1', content: "[Documento: Contrato d'Ávila (1).pdf]" });
      let u = null; const orig = window.baixarMidia; window.baixarMidia = (x) => { u = x; };
      d.querySelector('.media-dl-link').onclick(new MouseEvent('click')); window.baixarMidia = orig;
      return new URL(u).searchParams.get('filename') === "Contrato d'Ávila (1).pdf";
    });
    await igual('foto do chat leva a chave de mídia da conta', async () => {
      if (typeof _mk !== 'function') return false;
      window._midiaK = 'CHAVE.1.abc';
      const d = caixa(); d.innerHTML = renderMessageContent({ type: 'image', media_id: '77', content: '[Imagem]' });
      const img = d.querySelector('img[src*="media-proxy"]'); return !!img && img.getAttribute('src').includes('k=CHAVE.1.abc');
    });
    return out;
  });
  // Login do iPhone LEGÍTIMO (voltou do Google com o token no endereço) continua entregando
  const pg2 = await b.newPage();
  await pg2.route(u => !String(u).startsWith(base), rt => rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await pg2.goto(base + '/?handoff=nonce-do-app#access_token=tok-novo&refresh_token=ref-novo', { waitUntil: 'load' });
  await pg2.waitForTimeout(1000);
  res['login iPhone legítimo ainda entrega a sessão'] = await pg2.evaluate(async () => {
    let enviou = false; window.__fetchOriginal = async (u) => { if (String(u).includes('/auth-handoff')) enviou = true; return new Response('{}'); };
    try { _supaAuth = _supaAuth || { auth: { stopAutoRefresh() {} } }; } catch (_) {}
    const r = await _entregaSessaoAoApp({ access_token: 'tok-novo', refresh_token: 'ref-novo' });
    return (enviou && r === true) ? 'ok' : 'MUDOU';
  });
  let verm = 0;
  for (const [k, v] of Object.entries(res)) { console.log((v === 'ok' ? 'ok       ' : v === 'EXECUTOU' ? 'FALHA    ' : 'ATENÇÃO  ') + k + (v === 'ok' ? '' : ' — ' + v)); if (v !== 'ok') verm++; }
  console.log(verm ? 'VERMELHO (' + verm + ')' : 'VERDE');
  await b.close(); srv.close(); process.exit(verm ? 1 : 0);
});
