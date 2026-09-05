# GPS em lote com buffer offline (OTA)

## O que muda
- `src/tasks/gpsTask.js`: a task de background acumula os pontos (todos os que o Android
  entrega, não só o último) num buffer persistente (SecureStore, formato compacto) e envia em
  lote para `POST /motoboys/app/posicoes` (até 20 pontos).
  - Em entrega: envia a cada 2 pontos ou 30 s.  Fora de entrega: a cada 4 pontos ou 90 s.
  - Sem rede: os pontos ficam no buffer (até 40) e vão no próximo ciclo com o horário original.
  - Ao parar o rastreamento / voltar ao app: descarrega o que estiver pendente.
- `src/hooks/useGPS.js`: o fallback de foreground usa o mesmo buffer (nunca 1 request por ponto).

Sem mudança visual, sem permissão nova, sem módulo nativo novo → **OTA**.

## Efeito no servidor
Em entrega: ~2× menos requests. Ocioso: ~4× menos. Nenhum ponto perdido em túnel/sinal fraco.

## Publicar
```powershell
cd $env:USERPROFILE\Downloads\appboylogix
git add -A ; git commit -m "feat(gps): envio em lote com buffer offline (/app/posicoes)" ; git push
eas update --platform android --branch preview --message "GPS em lote com buffer offline"
```
O aparelho recebe na 2ª abertura do app.

## Como validar
1. No app, fique online e abra "Rastreamento sempre ativo": "Última posição há X s" deve
   variar até ~90 s (ocioso) — antes era ~30 s. É esperado.
2. No painel, o mapa continua atualizando (em entrega, no máximo ~30 s de atraso).
3. Modo avião por 2 min com o app online → desligue → em até 1 ciclo os pontos aparecem no
   trajeto da corrida (rota traçada) com os horários corretos.
4. Railway → logs da API: `POST /motoboys/app/posicoes` com status 200 substituindo `/posicao`.
