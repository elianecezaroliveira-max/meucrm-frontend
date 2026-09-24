// Bancada do SERVIDOR: uma conta não pode usar o número/dados de outra, rotas sensíveis
// exigem login, e os caminhos que mandavam a mesma mensagem 2x não repetem.
// Roda o server.js de verdade com um banco de mentira (nada sai para a Meta nem para o Supabase).
// Uso: node testes/servidor-seguranca.js   (ALVO=/caminho/server.js para medir outra versão)
// Termina VERDE (0) ou VERMELHO (1).
const fs = require('fs'), path = require('path'), Module = require('module');
const ALVO = path.resolve(process.env.ALVO || [path.join(__dirname, '..', 'server.js'), path.join(__dirname, '..', '..', 'meucrm-backend', 'server.js')].find(f => fs.existsSync(f)));
const PORTA = 39000 + Math.floor(Math.random() * 500);
const LEGADO = 'elianecezaroliveira@gmail.com', B = 'loja.b@exemplo.com', ATEND = 'atendente@exemplo.com';
Object.assign(process.env, { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_KEY: 'x', PORT: String(PORTA), PHONE_NUMBER_ID: 'ENV_NUM', WHATSAPP_TOKEN: 'ENV_TOK', VERIFY_TOKEN: 'vt', WA_EMBEDDED: '0' });

// ── banco de mentira ──
const DB = {
  accounts: [
    { id: 'acc-legado', owner: LEGADO, phone_number_id: 'NUM_LEGADO', token: 'TOK_LEGADO', name: 'Principal', created_at: '2026-01-01' },
    { id: 'acc-vitima', owner: LEGADO, phone_number_id: 'NUM_VITIMA', token: 'TOK_VITIMA', name: 'Vítima', created_at: '2026-01-02' },
  ],
  bots: [{ id: 'bot-b', owner: B, name: 'Bot da B', active: true }],
  bot_nodes: [], bot_edges: [], contacts: [], messages: [{ id: 'q1', owner: B, phone: '5511999990000', wamid: 'wamid.Q1', content: 'oi', direction: 'inbound' }],
  bot_runs: [{ id: 'run-legado', owner: LEGADO, contact_phone: '5511988887777', status: 'waiting_reply', pause_until: null, current_node_id: 'n1', bot_id: 'bot-x' }],
  settings: [
    { key: 'api_token::' + LEGADO, value: 'vetra_tok_legado' },
    { key: 'owner_aliases', value: JSON.stringify({ [ATEND]: B }) },
    { key: 'equipe_papel::' + B, value: JSON.stringify({ [ATEND]: 'atendente' }) },
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
    else if (st.op === 'insert' || st.op === 'upsert') { const arr = [].concat(st.payload); arr.forEach(p => rows().push({ id: 'id' + Math.random().toString(36).slice(2, 8), ...p })); data = arr; escritas.push({ tabela, op: st.op }); }
    else if (st.op === 'delete') { const fora = rows().filter(casa); DB[tabela] = rows().filter(r => !casa(r)); data = fora; }
    if (st.single) data = (data && data[0]) || null;
    return { data: st.head ? null : data, error: null, count: Array.isArray(data) ? data.length : 0 };
  };
  const b = {
    select(_, o) { if (o && o.head) st.head = true; return b; },
    update(p) { st.op = 'update'; st.payload = p; return b; }, insert(p) { st.op = 'insert'; st.payload = p; return b; },
    upsert(p) { st.op = 'upsert'; st.payload = p; return b; }, delete() { st.op = 'delete'; return b; },
    eq(c, v) { st.f.push(r => String(r[c]) === String(v)); return b; }, neq(c, v) { st.f.push(r => String(r[c]) !== String(v)); return b; },
    in(c, vs) { st.f.push(r => vs.map(String).includes(String(r[c]))); return b; },
    not(c, op, v) { if (op === 'is' && v === null) st.f.push(r => r[c] != null); return b; },
    is(c, v) { if (v === null) st.f.push(r => r[c] == null); return b; },
    lte() { return b; }, gte() { return b; }, lt() { return b; }, gt() { return b; }, like() { return b; }, ilike() { return b; }, or() { return b; },
    order() { return b; }, limit() { return b; }, range() { return b; }, contains() { return b; }, filter() { return b; }, match() { return b; },
    maybeSingle() { st.single = true; return b; }, single() { st.single = true; return b; },
    then(ok, no) { try { return Promise.resolve(run()).then(ok, no); } catch (e) { return Promise.reject(e).then(ok, no); } },
  };
  return b;
}
const fakeSupa = { from: Q, storage: { from: () => ({ list: async () => ({ data: [] }), download: async () => ({ data: null, error: { message: 'x' } }), upload: async () => ({ error: null }), remove: async () => ({}), getPublicUrl: () => ({ data: { publicUrl: '' } }), createSignedUrl: async () => ({ data: null }) }) }, rpc: async () => ({ data: null }), channel: () => ({ on() { return this; }, subscribe() { return this; } }) };

// ── rede de mentira: login do Supabase + Meta ──
const TOKENS = { 'tok-legado': LEGADO, 'tok-b': B, 'tok-atend': ATEND };
const enviosMeta = [];
let metaFalhaSemResposta = 0;
const axios = require(require.resolve('axios', { paths: [path.dirname(ALVO)] }));
const falso = async (metodo, url, body, cfg) => {
  url = String(url);
  if (url.includes('/auth/v1/user')) { const t = String((cfg && cfg.headers && cfg.headers.Authorization) || '').replace('Bearer ', ''); if (TOKENS[t]) return { data: { email: TOKENS[t] } }; const e = new Error('401'); e.response = { status: 401 }; throw e; }
  if (url.includes('graph.facebook.com')) {
    if (metodo === 'post') { enviosMeta.push({ url, body }); if (metaFalhaSemResposta > 0) { metaFalhaSemResposta--; const e = new Error('timeout of 30000ms exceeded'); e.code = 'ECONNABORTED'; throw e; } return { data: { messages: [{ id: 'wamid.X' + enviosMeta.length }] } }; }
    return { data: {} };
  }
  return { data: {} };
};
axios.get = (u, c) => falso('get', u, null, c); axios.post = (u, b, c) => falso('post', u, b, c);
axios.put = (u, b, c) => falso('put', u, b, c); axios.delete = (u, c) => falso('delete', u, null, c);

const reqOrig = Module.prototype.require;
Module.prototype.require = function (id) { if (id === '@supabase/supabase-js') return { createClient: () => fakeSupa }; return reqOrig.apply(this, arguments); };
const origLog = console.log, origErr = console.error, origWarn = console.warn;
console.log = console.error = console.warn = () => {};
const m = new Module(ALVO, module); m.filename = ALVO; m.paths = Module._nodeModulePaths(path.dirname(ALVO));
m._compile(fs.readFileSync(ALVO, 'utf8') + '\n;globalThis.__srv={handleBotReply:typeof handleBotReply==="function"?handleBotReply:null};', ALVO);

const base = 'http://127.0.0.1:' + PORTA;
const chama = async (metodo, rota, { tok, api, body } = {}) => {
  const h = { 'Content-Type': 'application/json' }; if (tok) h.Authorization = 'Bearer ' + tok; if (api) h['X-Api-Token'] = api;
  const r = await fetch(base + rota, { method: metodo, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, j };
};
const espera = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await espera(1500);
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
