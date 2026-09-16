# Como entra um cliente novo (white-label)

> Documentado para quando for a hora. **Nada disso é necessário enquanto houver só o IG.**
> Escrito em 16/09/2026, com o app rodando por APK no canal `preview`.

## O que NÃO muda

O repositório é um só. Não existe fork nem cópia por cliente: o código das telas —
corrida, chat, ganhos, antecipação — é compartilhado. Correção feita hoje vale para
todos os clientes no próximo `npm run update`.

O que varia por cliente é a **casca**: nome, cores, ícone, pacote Android e o slug que
diz ao backend de qual empresa aquele app é.

## Passo a passo

**1. Marca.** Copie `marcas/_modelo/` para `marcas/<slug>/` e preencha o
`marca.config.js`: `slug` (o mesmo da empresa no Logix), nomes, cores, `pacote`,
`scheme` e `canal`.

**2. Ícones.** Crie `assets/marca/<slug>/` com `icon.png`, `adaptive-icon.png` e
`splash-icon.png`.

**3. Perfis de build.** No `eas.json`, espelhe os dois perfis do IG:

```json
"<slug>":      { "extends": "preview",    "channel": "<slug>", "env": { "MARCA": "<slug>" },
                 "android": { "buildType": "apk" } },
"<slug>-loja": { "extends": "production", "channel": "<slug>", "env": { "MARCA": "<slug>" } }
```

**4. Firebase.** Gere o `google-services.json` para o pacote novo, no projeto do
Firebase. O arquivo atual serve **apenas** ao pacote do IG.

**5. Empresa no Logix.** Crie o tenant com o mesmo `slug`, pelo painel do master.

**6. Build.** `eas build --profile <slug>-loja` (Play Store) ou `--profile <slug>`
(APK interno). **O canal é criado pelo próprio EAS nesta build** — não existe passo de
criar canal à mão.

**7. Publicar.** A partir daí, `npm run update -- "mensagem"` alcança todas as marcas,
cada uma no seu canal.

## Três armadilhas

**O pacote Android é imutável.** Depois de publicado na Play Store, `br.com.cliente.motoboy`
não muda. Errar significa app novo e todo mundo reinstalando. Defina um padrão de
nomenclatura antes do segundo cliente.

**O `google-services.json` é por pacote.** Sem o do cliente novo, tudo funciona menos o
push — e o sintoma é silencioso: ninguém reclama, só param de chegar as ofertas.

**Cada cliente é uma ficha na Play Store**, com conta, política de privacidade e
revisão. É trabalho de loja, não de código, e leva dias na primeira vez.

## Automação disponível, quando quiser

Um `npm run nova-marca <slug>` que cria a pasta, preenche o gabarito, acrescenta os dois
perfis no `eas.json` e prepara os assets — deixando só Firebase e Play Store para fazer
à mão. Não foi feito ainda porque com um cliente não se paga.
