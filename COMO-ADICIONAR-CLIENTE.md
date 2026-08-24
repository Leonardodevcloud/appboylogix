# Novo cliente white-label = novo app

A marca "ativa" fica em `marca.config.js` (raiz), lida por app.config.js e src/api.
O script `scripts/set-marca.js` troca essa marca a partir de `marcas/<slug>/`.
No build do EAS roda sozinho (gancho eas-build-pre-install) lendo a env MARCA do profile.

## Adicionar um cliente
1. Copie marcas/_modelo/  ->  marcas/<slug>/  e edite (slug, nomeApp, PACOTE unico, scheme unico, cores, caminhos dos icones).
2. Crie assets/marca/<slug>/ com: icon.png (1024), adaptive-icon.png (1024), splash-icon.png, logo.png.
3. Adicione no eas.json 2 profiles (copie os blocos "cliente-exemplo" e "cliente-exemplo-loja"), trocando o slug.
4. (Push) adicione o novo PACOTE como app Android no seu Firebase e rebaixe google-services.json.
5. Build de teste (APK):   eas build -p android --profile <slug>
6. Build de loja (AAB):    eas build -p android --profile <slug>-loja
7. Enviar pra loja:        eas submit -p android --profile <slug>-loja
8. Atualizacao so JS:      eas update --branch <slug> --channel <slug> --platform android

## Testar uma marca localmente
   node scripts/set-marca.js <slug>
   npx expo start

## Regras
- PACOTE (applicationId) e SCHEME unicos por cliente.
- versionCode: contador compartilhado no projeto EAS; se conflitar na Play, suba manual.
- Conta Play de EMPRESA (isenta do teste de 12 usuarios). Apps quase identicos na mesma conta = risco de "spam".
