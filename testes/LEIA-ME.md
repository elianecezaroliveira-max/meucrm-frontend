# Bancadas

- `seguranca-injecao.js` — texto malicioso do lead/equipe (localização, nome de documento, etiquetas, coluna do funil, resposta rápida) e link `?handoff=` de terceiro não executam nada; confere também que o uso normal segue igual. `node testes/seguranca-injecao.js` (aceita `INDEX=`). Vermelha na v482, verde na v483.
- `servidor-seguranca.js` — roda o server.js com banco de mentira: uma conta não usa número/dados de outra, rotas sensíveis pedem login, citação com queda de rede e resposta tardia ao bot não duplicam; confere o uso normal. `node testes/servidor-seguranca.js` (aceita `ALVO=`). Vermelha na v311 (10), verde na v312.
