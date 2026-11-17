# Testes, lint e CI do app

Desde 17/11/2026. Antes, o app não tinha nenhum dos três.

## Rodar

```powershell
npm ci
npm run check     # lint + testes (o que o CI roda)
```

- `npm run lint` — ESLint só com regra de **correção**: variável que não existe, hook do React
  fora de ordem, chave duplicada, código inalcançável. Nada de estilo. Config: `eslint.config.mjs`.
- `npm test` — `node --test` (Node 22, sem dependência nova). Arquivos em `test/`.

## O que os testes travam hoje

| Arquivo | Trava |
|---|---|
| `test/dinheiro.test.mjs` | Valor digitado → centavos. Nasceu do bug em que "50.5" virava R$ 505,00 na antecipação. |
| `test/config-unica.test.mjs` | O endereço da API existe só em `src/config.js`. |
| `test/marcas.test.cjs` | Cada marca em `marcas/` tem slug = pasta, pacote, canal, cores, ícones e os perfis `<slug>` e `<slug>-loja` no `eas.json`; sem pacote/scheme repetido. |

## Regra para o que vier

- Conta ou conversão (dinheiro, data, distância, texto digitado) não mora na tela: vai para
  `src/utils/` como função pura e ganha teste. A tela só chama.
- Teste novo = arquivo `test/<assunto>.test.mjs` (ou `.cjs` para ler arquivo CommonJS).
- O que depende de tela, aparelho ou módulo nativo continua sendo validado no aparelho.

## CI (`.github/workflows/ci.yml`)

Três jobs em todo PR e push na `main`: **Checagens** (lint e testes), **Pacote Android monta**
(o mesmo passo de montagem do `eas update`) e **Segredos** (gitleaks nos commits novos;
exceções em `.gitleaks.toml`).

## Outro ambiente

`src/config.js` lê `EXPO_PUBLIC_API_URL`. Sem ela, produção.

```powershell
$env:EXPO_PUBLIC_API_URL = "https://<servidor>/api/v1" ; npx expo start
```

Não defina essa variável ao publicar OTA ou build de loja.
