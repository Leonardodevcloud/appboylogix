# Online em segundo plano: rastreamento que sobrevive ao Android encerrar o app (OTA)

## O problema (19/11/2026)
Entregadores ficavam online, minimizavam o app e, depois de um tempo, sumiam das ofertas
(10 minutos sem posição) e apareciam como "Offline" no painel (1 hora sem posição).

## A causa
As tarefas de segundo plano (`logix-gps-background` e `logix-push-fundo`) eram definidas a
partir de `app/_layout.jsx`. Arquivo de rota só é executado quando a tela é montada.

1. O Android encerra o app minimizado (memória, economia de bateria da marca).
2. O serviço de localização é religado sozinho, **sem tela**.
3. A primeira posição chega a uma tarefa que ninguém definiu.
4. O `expo-task-manager` descarta a posição e **cancela o registro da tarefa** — o
   rastreamento para de vez. O mesmo acontece com o push silencioso "acordar o GPS".
5. O entregador segue "online" no servidor, sem mandar posição, até abrir o app de novo.

## A correção
- `index.js` passa a ser o ponto de entrada (`package.json` → `"main": "index.js"`): importa
  `src/tasks/gpsTask` e `src/tasks/pushFundo` e só depois o roteador.
- `src/tasks/pushFundo.js` (novo): a tarefa do push silencioso saiu de `src/push/index.js`,
  que importa interface e som e não deve rodar com o app fechado.
- `test/entrada.test.mjs`: impede a volta do arranjo antigo (`node --test test/entrada.test.mjs`).

Só JavaScript, sem permissão nem módulo nativo novo → **OTA**.

## Publicar
```powershell
cd $env:USERPROFILE\Downloads\appboylogix
git add index.js package.json app/_layout.jsx src/push/index.js src/tasks/pushFundo.js test/entrada.test.mjs ONLINE-SEGUNDO-PLANO.md
git commit -m "Rastreamento: tarefas de segundo plano definidas no ponto de entrada" ; git push
npm run update -- "Online em segundo plano"
git status        # marca.config.js NÃO pode aparecer modificado
```
Os arquivos vão listados no `git add` (e não `-A`) para o `marca.config.js` de uma marca nunca
entrar no commit.

## AAB para a Play (Motty)
A correção é só JavaScript, então o OTA já resolve quem tem o app instalado. O AAB serve para
quem instalar pela loja já vir com ela.
```powershell
Remove-Item Env:MARCA -ErrorAction SilentlyContinue
node scripts/set-marca.js ig      # o marca.config.js local fica SEMPRE na marca base
git status
eas build -p android --profile motty-loja
```
No log tem de aparecer "Using remote Android credentials". Se perguntar
"Generate a new Android Keystore?", responda **não** (Ctrl+C) e confira a marca base.
O aparelho recebe na 2ª abertura do app. Depois de receber, o entregador precisa abrir o
app uma vez e ficar online (é isso que registra o rastreamento de novo).

## Como validar (um aparelho, antes de avisar todo mundo)
1. Abra o app duas vezes (para aplicar a atualização) e fique online.
2. Minimize e deixe 20–30 min com a tela apagada, ou abra vários apps pesados até o Android
   encerrar o app. ("Forçar parada" nas configurações não serve de teste: mata também o serviço.)
3. No painel, em Rastreio, a "última posição" do entregador tem de continuar andando
   (no máximo ~3 min de intervalo com o celular parado, que é o ciclo do push que acorda o GPS).
4. Com o cabo USB: `adb logcat | findstr /i "GPS bg TaskManager"` — NÃO pode aparecer
   `has been executed but looks like it is not defined`.

## O que isto NÃO resolve
- Marca que mata o serviço em primeiro plano (Xiaomi, Samsung "apps em suspensão profunda"):
  continua valendo a tela "Rastreamento sempre ativo" (bateria sem restrição, início automático).
- Celular parado por muito tempo com a tela apagada (modo Doze): o Android desliga o GPS;
  quem segura é o push silencioso, a cada ~3 min.
- Permissão de localização que não seja "o tempo todo": o app cai offline ao voltar.
