# Onda 10 — WebSocket: auth pela primeira mensagem (13/09/2026)

## Por quê
Desde 12/09 o backend (Onda 6) **não aceita mais o token na URL** do WebSocket
(`/ws?token=…` fecha com código 4003). O app usava exatamente isso em 6 telas: o canal de
tempo real estava morto — "nova corrida", "corrida atribuída", "ponto liberado" e os avisos
de cadastro só chegavam por push ou pelo polling de 8 s da tela de ofertas, e cada aparelho
reconectava a cada 4 s.

## O que muda (JS-only → OTA)
- `src/realtime/socket.js` (novo): `abrirSocket(token)` abre `/ws` e manda
  `{ tipo: 'auth', token }` na abertura. É o ÚNICO lugar que sabe como autenticar o socket.
- `app/home.jsx`, `app/corrida.jsx`, `app/concluir.jsx`, `app/cadastro-status.jsx`,
  `app/ofertas.jsx`, `src/realtime/alertas.js`: passam a usar `abrirSocket`; o resto
  (`ws.onmessage`, `close()`) fica igual.
- `src/realtime/alertas.js`: fechamento de sessão (4001/4003/1008) espera 60 s para
  reconectar em vez de 4 s.

Sem mudança visual, sem permissão nova, sem módulo nativo → `eas update`.

## Publicar
```powershell
cd $env:USERPROFILE\Downloads\appboylogix
git add -A ; git commit -m "fix(ws): auth pela primeira mensagem; backoff em fechamento de sessão" ; git push
eas update --platform android --branch preview --message "WS auth por mensagem"
```
Aparelho recebe na 2ª abertura.

## Validar
1. Home aberta, motoboy online e dentro do raio de um cliente → central dispara → alerta chega
   na hora (não só o push).
2. Railway → `/metrics`: `logix_ws_auth_url_recusada_total` para de subir.
3. Log do servidor: `ws.autenticado` com `sala: motoboy:<id>` a cada abertura do app.

## Contrato REST
Antes de mexer em rota, WS ou token, do lado do backend:
`node scripts/checar-contrato-api.js --app <caminho do appboylogix>` — 37 chamadas do app,
todas com rota em 13/09.
