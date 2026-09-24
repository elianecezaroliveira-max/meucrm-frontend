// Bancada do SERVIDOR: uma conta não pode usar o número/dados de outra, rotas sensíveis
// exigem login, e os caminhos que mandavam a mesma mensagem 2x não repetem.
// Roda o server.js de verdade com um banco de mentira (nada sai para a Meta nem para o Supabase).
// Uso: node testes/servidor-seguranca.js   (ALVO=/caminho/server.js para medir outra versão)
// Termina VERDE (0) ou VERMELHO (1).
const fs = require('fs'), path = require('path'), Module = require('module');
const ALVO = path.resolve(process.env.ALVO || [path.join(__dirname, '..', 'server.js'), path.join(__dirname, '..', '..', 'meucrm-backend', 'server.js')].find(f => fs.existsSync(f)));
const PORTA = 0; // porta livre escolhida pelo sistema (porta fixa às vezes colidia)
{ const http = require('http'), ol = http.Server.prototype.listen;
  http.Server.prototype.listen = function (...a) { const r = ol.apply(this, a); this.once('listening', () => { if (!globalThis.__porta) globalThis.__porta = this.address().port; }); return r; }; }
const LEGADO = 'elianecezaroliveira@gmail.com', B = 'loja.b@exemplo.com', ATEND = 'atendente@exemplo.com';
Object.assign(process.env, { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_KEY: 'x', PORT: String(PORTA), PHONE_NUMBER_ID: 'ENV_NUM', WHATSAPP_TOKEN: 'ENV_TOK', VERIFY_TOKEN: 'vt', WA_EMBEDDED: '0' });

// ── banco de mentira ──
const DB = {
  accounts: [
    { id: 'acc-legado', owner: LEGADO, phone_number_id: 'NUM_LEGADO', token: 'TOK_LEGADO', name: 'Principal', created_at: '2026-01-01' },
    { id: 'acc-vitima', owner: LEGADO, phone_number_id: 'NUM_VITIMA', token: 'TOK_VITIMA', name: 'Vítima', created_at: '2026-01-02' },
  ],
  bots: [{ id: 'bot-b', owner: B, name: 'Bot da B', active: true }],
  bot_nodes: [], bot_edges: [], contacts: [], messages: [{ id: 'q1', owner: B, phone: '5511999990000', wamid: 'wamid.Q1', content: 'oi', direction: 'inbound' }, { id: 'm1', owner: LEGADO, phone: '5511977770000', media_id: 'M1', type: 'image' }, { id: 'm2', owner: B, phone: '5511977770001', media_id: 'M2', type: 'image' }],
  bot_runs: [{ id: 'run-legado', owner: LEGADO, contact_phone: '5511988887777', status: 'waiting_reply', pause_until: null, current_node_id: 'n1', bot_id: 'bot-x' }],
  settings: [
    { key: 'api_token::' + LEGADO, value: 'vetra_tok_legado' },
    { key: 'owner_aliases', value: JSON.stringify({ [ATEND]: B }) },
    { key: 'equipe_papel::' + B, value: JSON.stringify({ [ATEND]: 'atendente' }) },
    { key: 'pagamento_cfg', value: JSON.stringify({ token: 'pagtok', ciclo_dias: 30 }) },
  ],
};
const escritas = [];
function Q(tabela) {
  const st = { f: [], op: 'select', payload: null, single: false, head: false };
  const rows = () => (DB[tabela] = DB[tabela] || []);
  const casa = r => st.f.every(fn => fn(r));
  const run = () => {
    let data = null;
    if (st.op === 'select') data = rows().filter(casa);
    else if (st.op === 'update') { data = rows().filter(casa); data.forEach(r => Object.assign(r, st.payload)); escritas.push({ tabela, op: 'update', n: data.length, payload: st.payload, filtros: st.f.length }); }
    else if (st.op === 'insert' || st.op === 'upsert') {
      const arr = [].concat(st.payload), ch = String(st.chave || (tabela === 'settings' ? 'key' : tabela === 'contacts' ? 'owner,phone' : 'id')).split(',').map(x => x.trim());
      arr.forEach(p => { const ja = st.op === 'upsert' && ch.every(k => p[k] != null) && rows().find(r => ch.every(k => String(r[k]) === String(p[k]))); if (ja) Object.assign(ja, p); else rows().push({ id: 'id' + Math.random().toString(36).slice(2, 8), ...p }); });
      data = arr; escritas.push({ tabela, op: st.op }); }
    else if (st.op === 'delete') { const fora = rows().filter(casa); DB[tabela] = rows().filter(r => !casa(r)); data = fora; }
    if (st.single) data = (data && data[0]) || null;
    return { data: st.head ? null : data, error: null, count: Array.isArray(data) ? data.length : 0 };
  };
  const b = {
    select(_, o) { if (o && o.head) st.head = true; return b; },
    update(p) { st.op = 'update'; st.payload = p; return b; }, insert(p) { st.op = 'insert'; st.payload = p; return b; },
    upsert(p, o) { st.op = 'upsert'; st.payload = p; st.chave = o && o.onConflict; return b; }, delete() { st.op = 'delete'; return b; },
    eq(c, v) { st.f.push(r => String(r[c]) === String(v)); return b; }, neq(c, v) { st.f.push(r => String(r[c]) !== String(v)); return b; },
    in(c, vs) { st.f.push(r => vs.map(String).includes(String(r[c]))); return b; },
    not(c, op, v) { if (op === 'is' && v === null) st.f.push(r => r[c] != null); return b; },
    is(c, v) { if (v === null) st.f.push(r => r[c] == null); return b; },
    like(c, pat) { const re = new RegExp('^' + String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$'); st.f.push(r => re.test(String(r[c]))); return b; }, // igual ao banco: _ e % são curingas
    lte() { return b; }, gte() { return b; }, lt() { return b; }, gt() { return b; }, ilike() { return b; }, or() { return b; },
    order() { return b; }, limit() { return b; }, range() { return b; }, contains() { return b; }, filter() { return b; }, match() { return b; },
    maybeSingle() { st.single = true; return b; }, single() { st.single = true; return b; },
    then(ok, no) { try { return Promise.resolve(run()).then(ok, no); } catch (e) { return Promise.reject(e).then(ok, no); } },
  };
  return b;
}
const fakeSupa = { from: Q, storage: { from: () => ({ list: async () => ({ data: [] }), download: async (c) => String(c).startsWith('api/M') || String(c).startsWith('qr/') ? ({ data: new Blob(['arquivo'], { type: 'image/jpeg' }), error: null }) : ({ data: null, error: { message: 'x' } }), upload: async () => ({ error: null }), remove: async () => ({}), getPublicUrl: () => ({ data: { publicUrl: '' } }), createSignedUrl: async () => ({ data: null }) }) }, rpc: async () => ({ data: null }), channel: () => ({ on() { return this; }, subscribe() { return this; } }) };

// ── rede de mentira: login do Supabase + Meta ──
const TOKENS = { 'tok-legado': LEGADO, 'tok-b': B, 'tok-atend': ATEND };
const enviosMeta = [], buscas = [];
let metaFalhaSemResposta = 0;
const axios = require(require.resolve('axios', { paths: [path.dirname(ALVO)] }));
const falso = async (metodo, url, body, cfg) => {
  url = String(url);
  if (url.includes('/auth/v1/user')) { const t = String((cfg && cfg.headers && cfg.headers.Authorization) || '').replace('Bearer ', ''); if (TOKENS[t]) return { data: { email: TOKENS[t] } }; const e = new Error('401'); e.response = { status: 401 }; throw e; }
  if (url.includes('graph.facebook.com')) {
    if (metodo === 'post') { enviosMeta.push({ url, body }); if (metaFalhaSemResposta > 0) { metaFalhaSemResposta--; const e = new Error('timeout of 30000ms exceeded'); e.code = 'ECONNABORTED'; throw e; } return { data: { messages: [{ id: 'wamid.X' + enviosMeta.length }] } }; }
    return { data: {} };
  }
  if (metodo === 'get') buscas.push(url);
  return { data: {} };
};
axios.get = (u, c) => falso('get', u, null, c); axios.post = (u, b, c) => falso('post', u, b, c);
axios.put = (u, b, c) => falso('put', u, b, c); axios.delete = (u, c) => falso('delete', u, null, c);

const reqOrig = Module.prototype.require;
Module.prototype.require = function (id) { if (id === '@supabase/supabase-js') return { createClient: () => fakeSupa }; return reqOrig.apply(this, arguments); };
const origLog = console.log, origErr = console.error, origWarn = console.warn;
console.log = console.error = console.warn = () => {};
const m = new Module(ALVO, module); m.filename = ALVO; m.paths = Module._nodeModulePaths(path.dirname(ALVO));
m._compile(fs.readFileSync(ALVO, 'utf8') + '\n;globalThis.__srv={handleBotReply:typeof handleBotReply==="function"?handleBotReply:null,csv:typeof _csvCampo==="function"?_csvCampo:null,plano:typeof _planoBruto==="function"?_planoBruto:null,bkp:typeof _backupAutoDe==="function"?_backupAutoDe:null,typing:typeof botTypingPulse==="function"?botTypingPulse:null,enviaAuto:typeof sendBotMsg==="function"?sendBotMsg:null};', ALVO);

let base = '';
const chama = async (metodo, rota, { tok, api, body } = {}) => {
  const h = { 'Content-Type': 'application/json' }; if (tok) h.Authorization = 'Bearer ' + tok; if (api) h['X-Api-Token'] = api;
  const r = await fetch(base + rota, { method: metodo, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, j };
};
const espera = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  // espera o servidor responder (tempo fixo deixava a medição instável)
  for (let i = 0; i < 60 && !globalThis.__porta; i++) await espera(250);
  base = 'http://127.0.0.1:' + globalThis.__porta;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/')).ok) break; } catch (_) {} await espera(250); }
  await espera(300);
  const res = {};
  const t = async (nome, fn) => { try { res[nome] = (await fn()) ? 'ok' : 'FALHA'; } catch (e) { res[nome] = 'não medido: ' + e.message; } };
  await t('/send da conta B sem número não sai pelo número principal (.env)', async () => {
    enviosMeta.length = 0; await chama('POST', '/send', { tok: 'tok-b', body: { to: '5511911112222', message: 'oi' } });
    return !enviosMeta.some(e => e.url.includes('ENV_NUM'));
  });
  await t('/react da conta B não usa o número de outra conta', async () => {
    enviosMeta.length = 0; await chama('POST', '/react', { tok: 'tok-b', body: { to: '5511911112222', wamid: 'wamid.Z', emoji: '👍', account_id: 'acc-vitima' } });
    return !enviosMeta.some(e => /NUM_VITIMA|ENV_NUM/.test(e.url));
  });
  await t('bot da conta B não dispara pelo número de outra conta', async () => {
    const r = await chama('POST', '/bots/bot-b/start', { tok: 'tok-b', body: { phone: '5511911112222', account_id: 'acc-vitima' } });
    return r.status === 403;
  });
  await t('/versao (pública) não mostra números de contatos', async () => {
    const r = await chama('GET', '/versao'); return r.status === 200 && r.j && !('exemplos' in r.j);
  });
  await t('atendente não pega o token de integração', async () => {
    const r = await chama('GET', '/integration/token', { tok: 'tok-atend' }); return r.status === 403;
  });
  await t('token de integração não vira fornecedora do sistema', async () => {
    const r = await chama('GET', '/wa/debug', { api: 'vetra_tok_legado' }); return r.status === 403;
  });
  await t('/send-template sem login não para bots de ninguém', async () => {
    DB.bot_runs[0].status = 'waiting_reply';
    const r = await chama('POST', '/send-template', { body: { to: '5511988887777', account_id: 'x', template_name: 'x' } });
    return r.status === 401 && DB.bot_runs[0].status === 'waiting_reply';
  });
  await t('/notices exige login', async () => (await chama('GET', '/notices')).status === 401);
  await t('/send com citação + queda de rede NÃO reenvia (mensagem dupla)', async () => {
    DB.accounts.push({ id: 'acc-b', owner: B, phone_number_id: 'NUM_B', token: 'TOK_B', created_at: '2026-01-03' });
    enviosMeta.length = 0; metaFalhaSemResposta = 1;
    await chama('POST', '/send', { tok: 'tok-b', body: { to: '5511999990000', message: 'resposta', account_id: 'acc-b', quoted_id: 'q1', client_id: 'c' + Date.now() } });
    metaFalhaSemResposta = 0; return enviosMeta.filter(e => e.url.includes('NUM_B')).length === 1;
  });
  await t('resposta do lead depois que o prazo venceu não segue o bot 2x', async () => {
    if (!globalThis.__srv.handleBotReply) throw new Error('handleBotReply não achado');
    // o ciclo de 30s já pegou a espera (pause_until zerado): a resposta não pode levar adiante de novo
    DB.bot_runs.push({ id: 'run-b', owner: B, contact_phone: '5511955554444', status: 'waiting_reply', pause_until: null, current_node_id: 'nw', bot_id: 'bot-b', updated_at: new Date().toISOString() });
    DB.bot_nodes.push({ id: 'nw', bot_id: 'bot-b', owner: B, type: 'wait_reply', config: {} }, { id: 'nm', bot_id: 'bot-b', owner: B, type: 'message', config: { text: 'passo 2' } });
    DB.bot_edges.push({ id: 'e1', bot_id: 'bot-b', owner: B, from_node_id: 'nw', to_node_id: 'nm', label: '' });
    await globalThis.__srv.handleBotReply('5511955554444', 'oi', B);
    const r = DB.bot_runs.find(x => x.id === 'run-b'); return r.current_node_id === 'nw';
  });
  // ── fotos/arquivos (chave de mídia) ──
  const chave = async (tok) => { const r = await chama('GET', '/meu-acesso', { tok }); return (r.j && r.j.midia_k) || ''; };
  await t('foto sem login e sem chave não abre', async () => (await chama('GET', '/media-proxy/M1')).status === 401);
  await t('conta B não abre foto da conta principal com a própria chave', async () => {
    const k = await chave('tok-b'); return !!k && (await chama('GET', '/media-proxy/M1?k=' + encodeURIComponent(k))).status === 403;
  });
  await t('chave adulterada não abre', async () => {
    const k = await chave('tok-b'); const falsa = Buffer.from(LEGADO).toString('base64url') + k.slice(k.indexOf('.'));
    return !!k && (await chama('GET', '/media-proxy/M1?k=' + encodeURIComponent(falsa))).status === 401;
  });
  await t('arquivo não vira página (mime=text/html)', async () => {
    const k = await chave('tok-legado'); const r = await fetch(base + '/media-proxy/M1?mime=text/html&k=' + encodeURIComponent(k));
    return r.status === 200 && !/html/.test(r.headers.get('content-type') || '');
  });
  await t('[normal] dona abre a própria foto pela chave', async () => {
    const k = await chave('tok-legado'); const r = await fetch(base + '/media-proxy/M1?mime=image/jpeg&k=' + encodeURIComponent(k));
    return r.status === 200 && (r.headers.get('content-type') || '').startsWith('image/jpeg');
  });
  await t('[normal] atendente da B abre foto da B pela chave', async () => {
    const k = await chave('tok-atend'); return !!k && (await chama('GET', '/media-proxy/M2?k=' + encodeURIComponent(k))).status === 200;
  });
  await t('[normal] app com login (fetch) abre a própria foto sem chave', async () => (await chama('GET', '/media-proxy/M2', { tok: 'tok-b' })).status === 200);
  await t('[normal] foto de bot continua pública (a Meta busca sem login)', async () => (await chama('GET', '/media-proxy/bot%2Fx.jpg')).status !== 401);
  // ── lote 3 ──
  await t('disparo em massa: 2º clique não dispara de novo', async () => {
    DB.contacts.push({ phone: '5511900000001', owner: B }, { phone: '5511900000002', owner: B });
    const b1 = { tok: 'tok-b', body: { phones: ['5511900000001', '5511900000002'] } };
    const [r1, r2] = await Promise.all([chama('POST', '/bots/bot-b/start-bulk', b1), chama('POST', '/bots/bot-b/start-bulk', b1)]);
    return [r1.status, r2.status].sort().join() === '200,409';
  });
  await t('pagamento avisado 2x (mesmo id) renova só 1x', async () => {
    const corpo = { event: 'PAYMENT_RECEIVED', email: 'cliente@exemplo.com', payment: { id: 'pay_123', status: 'RECEIVED' } };
    await chama('POST', '/pagamento/webhook?token=pagtok', { body: corpo }); const v1 = globalThis.__srv.plano('cliente@exemplo.com').validade;
    await chama('POST', '/pagamento/webhook?token=pagtok', { body: { ...corpo, event: 'PAYMENT_CONFIRMED' } }); const v2 = globalThis.__srv.plano('cliente@exemplo.com').validade;
    return v1 && v1 === v2;
  });
  await t('planilha: texto do lead não vira fórmula', async () => { const c = globalThis.__srv.csv; return !!c && c('=HYPERLINK("http://x","clique")').startsWith(`"'=`); });
  await t('prévia de link sem login não busca nada', async () => (await chama('GET', '/link-preview?url=' + encodeURIComponent('http://93.184.216.34/'))).status === 401);
  await t('prévia de link não busca nome que aponta para rede interna', async () => {
    buscas.length = 0; await chama('GET', '/link-preview?url=' + encodeURIComponent('http://127.0.0.1.nip.io/'), { tok: 'tok-b' });
    await chama('GET', '/link-preview?url=' + encodeURIComponent('http://localtest.me/'), { tok: 'tok-b' });
    return !buscas.some(u => /nip\.io|localtest/.test(u));
  });
  await t('cópia diária de "j_hn@" não apaga as cópias de "john@"', async () => {
    // no LIKE do banco o "_" vale qualquer letra: a busca de j_hn@ também traz as de john@
    DB.bots.push({ id: 'bot-jhn', owner: 'j_hn@x.com', name: 'x' });
    for (let i = 1; i <= 10; i++) DB.settings.push({ key: 'bkp::john@x.com::2026-01-' + String(i).padStart(2, '0'), value: '' });
    await globalThis.__srv.bkp('j_hn@x.com');
    return DB.settings.filter(r => r.key.startsWith('bkp::john@x.com::')).length === 10;
  });
  await t('cadastro pelo Facebook exige login', async () => (await chama('POST', '/auth/whatsapp', { body: { code: 'x' } })).status === 401);
  await t('[normal] disparo em massa responde ok', async () => {
    DB.bots.push({ id: 'bot-b2', owner: B, name: 'Outro' });
    return (await chama('POST', '/bots/bot-b2/start-bulk', { tok: 'tok-b', body: { phones: ['5511900000001'] } })).status === 200;
  });
  await t('[normal] pagamento novo (outro id) renova', async () => {
    const antes = globalThis.__srv.plano('cliente@exemplo.com').validade;
    await chama('POST', '/pagamento/webhook?token=pagtok', { body: { event: 'PAYMENT_RECEIVED', email: 'cliente@exemplo.com', payment: { id: 'pay_456' } } });
    return globalThis.__srv.plano('cliente@exemplo.com').validade > antes;
  });
  await t('[normal] planilha: telefone +55 e número negativo ficam iguais', async () => { const c = globalThis.__srv.csv; return c('+55 11 99999-0000') === '"+55 11 99999-0000"' && c('-12') === '"-12"'; });
  await t('[normal] prévia de link de site público busca', async () => {
    buscas.length = 0; await chama('GET', '/link-preview?url=' + encodeURIComponent('http://93.184.216.34/pagina'), { tok: 'tok-b' });
    return buscas.some(u => u.includes('93.184.216.34'));
  });
  // ── lote 4 ──
  await t('salvar fluxo não puxa passo de outro bot (id alheio)', async () => {
    DB.bots.push({ id: 'bot-vit', owner: LEGADO, name: 'Vítima' });
    DB.bot_nodes.push({ id: 'n-vit', bot_id: 'bot-vit', owner: LEGADO, type: 'message', config: { text: 'segredo' } });
    DB.bots.push({ id: 'bot-b4', owner: B, name: 'Quarto' });
    await chama('PUT', '/bots/bot-b4/flow', { tok: 'tok-b', body: { nodes: [{ id: 'n-vit', type: 'message', config: { text: 'meu' } }], edges: [] } });
    const n = DB.bot_nodes.find(x => x.id === 'n-vit'); return n.bot_id === 'bot-vit' && n.config.text === 'segredo';
  });
  await t('painel de armazenamento não mostra pastas de todas as contas a um cliente', async () => (await chama('GET', '/storage-uso', { tok: 'tok-b' })).status === 401);
  await t('anexo de nota: e-mails parecidos não abrem a nota um do outro', async () => {
    // "contato.loja1@" e "contato.loja2@" têm as mesmas 12 primeiras letras
    TOKENS['tok-l1'] = 'contato.loja1@x.com'; TOKENS['tok-l2'] = 'contato.loja2@x.com';
    const pasta = Buffer.from('contato.loja1@x.com').toString('hex').slice(0, 24);
    DB.messages.push({ id: 'nota1', owner: 'contato.loja1@x.com', media_id: 'notas/' + pasta + '/a.jpg', type: 'note' });
    return (await chama('GET', '/media-proxy/' + encodeURIComponent('notas/' + pasta + '/a.jpg'), { tok: 'tok-l2' })).status === 403;
  });
  await t('[normal] dona da nota abre o próprio anexo', async () => {
    const pasta = Buffer.from('contato.loja1@x.com').toString('hex').slice(0, 24);
    DB.messages.push({ id: 'nota1b', owner: 'contato.loja1@x.com', media_id: 'qr/x/' + pasta, type: 'note' });
    const r = await chama('GET', '/media-proxy/' + encodeURIComponent('notas/' + pasta + '/a.jpg'), { tok: 'tok-l1' });
    return r.status !== 403 && r.status !== 401;
  });
  await t('[normal] salvar o próprio fluxo continua gravando', async () => {
    DB.bots.push({ id: 'bot-b3', owner: B, name: 'Terceiro' });
    const r = await chama('PUT', '/bots/bot-b3/flow', { tok: 'tok-b', body: { nodes: [{ id: 'n-b1', type: 'message', config: { text: 'oi' } }], edges: [] } });
    return r.status === 200 && DB.bot_nodes.some(x => x.id === 'n-b1' && x.bot_id === 'bot-b3');
  });
  // ── conversa marcada como LIDA sem você ──
  await t('[normal] mensagem enviada pelo BOT marca a conversa como lida', async () => {
    DB.contacts.push({ phone: '5511944440000', owner: B, unread_count: 3, first_unread_at: new Date().toISOString(), last_message_direction: 'inbound' });
    DB.bot_runs.push({ id: 'run-l', owner: B, contact_phone: '5511944440000', status: 'waiting_reply', pause_until: new Date(Date.now() + 3600e3).toISOString(), current_node_id: 'lw', bot_id: 'bot-l', updated_at: new Date().toISOString() });
    DB.bots.push({ id: 'bot-l', owner: B, name: 'L' });
    DB.bot_nodes.push({ id: 'lw', bot_id: 'bot-l', owner: B, type: 'wait_reply', config: {} }, { id: 'lm', bot_id: 'bot-l', owner: B, type: 'message', config: { text: 'resposta do bot', account_id: 'acc-b' } });
    DB.bot_edges.push({ id: 'le', bot_id: 'bot-l', owner: B, from_node_id: 'lw', to_node_id: 'lm', label: '' });
    enviosMeta.length = 0;
    await globalThis.__srv.handleBotReply('5511944440000', 'oi', B); await espera(300);
    const c = DB.contacts.find(x => x.phone === '5511944440000');
    if (!enviosMeta.some(e => e.url.includes('NUM_B'))) throw new Error('o bot não enviou');
    return c.unread_count === 0;
  });
  await t('resposta da IA / mensagem agendada não marca como lida', async () => {
    // IA e agendada usam o mesmo envio do bot, mas SEM ser passo de bot
    DB.contacts.push({ phone: '5511944440009', owner: B, unread_count: 2, last_message_direction: 'inbound' });
    enviosMeta.length = 0; await globalThis.__srv.enviaAuto('5511944440009', 'acc-b', 'resposta da IA', B, 'acc-b', null);
    if (!enviosMeta.some(e => e.url.includes('NUM_B'))) throw new Error('não enviou');
    return DB.contacts.find(x => x.phone === '5511944440009').unread_count === 2;
  });
  await t('[normal] "digitando…" do bot aparece na API oficial', async () => {
    DB.messages.push({ id: 'in1', owner: B, phone: '5511944440001', direction: 'inbound', account_id: 'acc-b', wamid: 'wamid.IN1', timestamp: new Date().toISOString() });
    enviosMeta.length = 0; const via = await globalThis.__srv.typing('5511944440001', 'acc-b');
    return via === 'cloud' && enviosMeta.some(e => e.body && e.body.typing_indicator);
  });
  await t('envio pela integração (n8n) não marca como lida', async () => {
    DB.contacts.push({ phone: '5511944440002', owner: LEGADO, unread_count: 2, last_message_direction: 'inbound' });
    await chama('POST', '/send', { api: 'vetra_tok_legado', body: { to: '5511944440002', message: 'auto', account_id: 'acc-legado', client_id: 'g' + Date.now() } });
    return DB.contacts.find(x => x.phone === '5511944440002').unread_count === 2;
  });
  await t('[normal] você respondendo pelo VETRA marca como lida', async () => {
    DB.contacts.push({ phone: '5511944440003', owner: LEGADO, unread_count: 2, last_message_direction: 'inbound' });
    await chama('POST', '/send', { tok: 'tok-legado', body: { to: '5511944440003', message: 'oi', account_id: 'acc-legado', client_id: 'h' + Date.now() } });
    return DB.contacts.find(x => x.phone === '5511944440003').unread_count === 0;
  });
  await t('[normal] botão "marcar como lida" funciona', async () => {
    DB.contacts.push({ phone: '5511944440004', owner: B, unread_count: 4 });
    await chama('PUT', '/contacts/5511944440004/read', { tok: 'tok-b' });
    return DB.contacts.find(x => x.phone === '5511944440004').unread_count === 0;
  });
  // ── uso normal continua igual ──
  await t('[normal] conta principal envia pelo próprio número', async () => {
    enviosMeta.length = 0; const r = await chama('POST', '/send', { tok: 'tok-legado', body: { to: '5511911112222', message: 'oi', account_id: 'acc-legado', client_id: 'd' + Date.now() } });
    return r.status === 200 && enviosMeta.some(e => e.url.includes('NUM_LEGADO'));
  });
  await t('[normal] conta principal sem número ainda usa o .env', async () => {
    enviosMeta.length = 0; await chama('POST', '/send', { tok: 'tok-legado', body: { to: '5511911113333', message: 'oi', client_id: 'e' + Date.now() } });
    return enviosMeta.some(e => e.url.includes('ENV_NUM'));
  });
  await t('[normal] conta B envia pelo próprio número', async () => {
    enviosMeta.length = 0; const r = await chama('POST', '/send', { tok: 'tok-b', body: { to: '5511911114444', message: 'oi', account_id: 'acc-b', client_id: 'f' + Date.now() } });
    return r.status === 200 && enviosMeta.some(e => e.url.includes('NUM_B'));
  });
  await t('[normal] bot da B dispara pelo número da própria B', async () => {
    const r = await chama('POST', '/bots/bot-b/start', { tok: 'tok-b', body: { phone: '5511911115555', account_id: 'acc-b' } }); return r.status !== 403;
  });
  await t('[normal] dona pega o token de integração', async () => (await chama('GET', '/integration/token', { tok: 'tok-legado' })).status === 200);
  await t('[normal] resposta do lead no prazo leva o bot adiante', async () => {
    DB.bot_runs.push({ id: 'run-c', owner: B, contact_phone: '5511955556666', status: 'waiting_reply', pause_until: new Date(Date.now() + 3600e3).toISOString(), current_node_id: 'nw', bot_id: 'bot-b', updated_at: new Date().toISOString() });
    await globalThis.__srv.handleBotReply('5511955556666', 'oi', B);
    return DB.bot_runs.find(x => x.id === 'run-c').current_node_id === 'nm';
  });
  console.log = origLog;
  let verm = 0;
  for (const [k, v] of Object.entries(res)) { console.log((v === 'ok' ? 'ok       ' : 'FALHA    ') + k + (v === 'ok' || v === 'FALHA' ? '' : ' — ' + v)); if (v !== 'ok') verm++; }
  console.log(verm ? 'VERMELHO (' + verm + ')' : 'VERDE');
  process.exit(verm ? 1 : 0);
})();
