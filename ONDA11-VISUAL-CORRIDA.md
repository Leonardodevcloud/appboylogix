# Onda 11 — visual do fluxo da corrida (mockup v1 aprovado em 13/09/2026)

Cinco telas redesenhadas em cima do `mockup-app-motoboy-v1.html`, sem mudar nenhuma regra,
rota ou payload. JS-only → OTA.

## O que entrou
- `src/tema/index.js` — paleta (marca.config + verde de ganho) e helpers `reais/hora/km/curto`.
- `src/componentes/DeslizarParaConfirmar.jsx` — botão deslizante (PanResponder + Animated do
  núcleo do RN; sem reanimated/gesture-handler para continuar OTA). Usado para aceitar
  corrida e para confirmar entrega. Solta antes do fim → volta; chega ao fim → vibra e chama
  `onConfirmar`; se a tela recusar (ex.: sem foto), a bolinha volta e o gesto pode repetir.
- `src/componentes/CartaoCorrida.jsx` — cartão da lista (valor → cliente → 3 números → rota).
- `src/componentes/Parada.jsx` — parada da corrida (feita / agora / depois) com ações dentro.
- `app/ofertas.jsx` — lista: a mais perto sobe com borda azul; "Ver e aceitar" abre o
  detalhe (não se aceita de um toque na lista). Mesma lógica de WS, polling e alerta sonoro.
- `app/oferta-detalhe.jsx` — "Nova corrida": topo escuro com o valor grande e os três
  números, folha clara com a rota, mapa sob demanda ("Ver no mapa"), deslizar para aceitar,
  "recusar" pequeno (chama `/app/ofertas/:id/recusar`).
- `app/corrida.jsx` — barra de etapas (coleta + cada entrega), prazo com "faltam X min",
  uma parada em foco, um botão fixo que muda de texto. Máquina de estados intocada.
- `app/concluir.jsx` — foto primeiro e grande; resultado em botões grandes (tipos vêm da
  central); "quem recebeu" só no sucesso; geofence e liberação no mesmo lugar; deslizar
  para confirmar (vermelho quando é ocorrência). Carimbo da foto e upload iguais.
- `app/home.jsx` — só dois ajustes: "Online · GPS enviado há X s" sob a saudação (vermelho
  quando passa de 10 min — a validade da posição no servidor) e o banner das corridas
  disponíveis com o número em destaque.

## Fora desta onda (de propósito)
- Fonte Manrope: exige `expo-font` (módulo nativo) → entra no próximo build nativo.
- "Entregar até HH:MM" na lista/detalhe de ofertas: a API de ofertas ainda não devolve
  `prazo_em` (o cálculo de SLA vive em entregas.execucao); o app já mostra se vier.

## Publicar
```powershell
cd $env:USERPROFILE\Downloads\appboylogix
git add -A ; git commit -m "feat(ui): fluxo da corrida redesenhado (mockup v1) — deslizar para aceitar/confirmar, paradas em foco, foto primeiro" ; git push
eas update --platform android --branch preview --message "Visual do fluxo da corrida (Onda 11)"
```

## Validar no aparelho (2ª abertura após o OTA)
1. Ofertas → cartão com valor grande e "mais perto" no de menor km; "Ver e aceitar" abre o detalhe.
2. Detalhe → deslizar até o fim aceita e cai na corrida; soltar antes volta; "recusar" some da lista.
3. Corrida → barra de etapas; parada em foco com Navegar/Ligar/Chat; botão muda de texto a cada etapa.
4. Marcar → sem foto o deslize volta e avisa; com foto + resultado + nome, deslizar confirma.
5. Home → "GPS enviado há X s" abaixo do nome quando online.
