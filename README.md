# Logix Motoboy App

App React Native / Expo para motoboys da plataforma Logix.

## Setup rápido

```bash
npm install
npx expo start
```

Escanear QR code com Expo Go (Android/iOS).

## Variável de ambiente

Editar `src/api/index.js` → `API_URL` para apontar para seu backend.

## Fluxo do motoboy

1. Login com telefone + PIN (definido pelo operador no painel)
2. Tela principal mostra fila de entregas atribuídas
3. Botão "Iniciar coleta" → status `em_coleta`
4. Botão "Confirmar coleta" → status `em_rota`
5. Botão "Entregar" em cada ponto → tela de confirmação com foto
6. Foto tirada → endpoint `/concluir` → entrega fechada

## GPS

Posição reportada automaticamente a cada 30s via `useGPS` hook.
Visível em tempo real no painel do cliente em Rastreio → mapa.
