# Publicar atualização (OTA) para todos os clientes

```powershell
npm run update -- "Tela de antecipar saldo"
```

Um comando, todas as marcas. Para conferir antes sem publicar:

```powershell
npm run update -- "mensagem" --simular
```

Uma marca só, quando a correção é específica:

```powershell
npm run update -- "mensagem" --marca ig
```

---

## O canal não é o slug

Cada marca declara `canal` no seu `marca.config.js`: é o canal do EAS que o app **já
instalado** escuta, e vem do `channel` do profile que gerou aquela build. Pode não ter
o nome da marca.

Foi o caso do IG em 16/09/2026: o APK em uso foi construído pelo profile `preview`,
então escuta o canal `preview` — publicar no canal `ig` subia o update e não chegava
em ninguém, porque nenhum canal aponta para esse branch.

Como conferir:

```powershell
npx eas channel:list      # qual canal recebeu updates de verdade
```

O rodapé da tela Perfil, no app, também mostra o canal do aparelho.

Ao migrar o IG para uma build do profile `ig-loja` (que publica no canal `ig`), troque
`canal` para `'ig'` em `marcas/ig/marca.config.js` — e lembre que quem já tem o APK
antigo continua no `preview` até instalar a build nova.

## Por que é uma publicação por marca

A identidade do cliente **vive dentro do bundle**: `scripts/set-marca.js` copia
`marcas/<slug>/marca.config.js` para a raiz antes de empacotar, e o app inteiro lê
dali — nome, slug do tenant, cores, ícone. Um único pacote JavaScript não serve dois
clientes: ele levaria a marca errada para o segundo.

Por isso cada cliente tem seu canal (ver `eas.json`: o profile `ig-loja` publica no
canal `ig`), e o script acima percorre `marcas/`, troca a marca, publica, e repete.
Ele devolve a marca original ao disco no fim, e uma marca que falha não impede as
outras de receberem a correção.

## O que o OTA alcança

- **Só JavaScript.** Mudança que exija módulo nativo novo, permissão nova ou troca de
  ícone precisa de build e passa pelas lojas.
- **Só o mesmo `runtimeVersion`.** O `app.json` usa a política `appVersion`: quem está
  numa versão anterior instalada continua sem a novidade até atualizar pela loja.
- **Nunca antes do backend.** Se a tela nova chamar endpoint que ainda não existe, o
  profissional vê erro. A ordem é: deploy do Logix, depois o update.

## Conferir depois

```powershell
npx eas channel:list          # confirma que o canal do cliente aponta para o branch de mesmo nome
npx eas update:list --branch ig --limit 3
```

> O update é publicado com `--branch <slug>`, sem `--channel`: o EAS recusa os dois
> juntos. É o canal que aponta para o branch, e é por ele que o app baixa.

## Caminho para publicar uma vez só (ainda não feito)

Enquanto a marca estiver no bundle, serão N publicações. Para virar uma:
o app buscaria o branding do backend no login (`empresa_branding` já existe no Logix
e já serve o painel), deixando no bundle apenas um padrão neutro. Aí um canal serve
todos os clientes e `npm run update` vira uma chamada só.

O custo é real e precisa ser decidido, não improvisado: o app passa a depender de uma
chamada de rede para se pintar, a primeira tela antes do login fica sem marca (ou com
a última usada, em cache), e ícone e nome na loja **continuam** sendo build por
cliente — isso o OTA nunca resolve. Vale quando houver muitos clientes; com dois ou
três, o laço acima é mais simples e mais previsível.
