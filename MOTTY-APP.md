# App do Motty — marca, build e loja (22/09/2026)

## O que este pacote muda
| Onde | O quê |
|---|---|
| `marcas/motty/marca.config.js` | marca Motty: slug `motty`, pacote `br.com.motty.entregador`, scheme `mottyentregas`, canal `motty`, paleta (#12386B / #1A4A83 / #FB5012 / #D8E4F3) |
| `assets/marca/motty/` | `icon`, `adaptive-icon`, `splash-icon`, `logo` **PLACEHOLDER** (monograma "M") + `play-icon-512.png` para a Console. Trocar pelos oficiais antes da loja — mesmas dimensões |
| `eas.json` | perfis `motty` (APK interno, canal `motty`) e `motty-loja` (AAB produção, canal `motty`) |
| `app.config.js` | `googleServicesFile` por marca (`marca.googleServices`, com aviso e fallback), cor da notificação = primária da marca, `extra.marca` |
| `src/tema/index.js` | as 4 cores de marca agora vêm do `marca.config.js` ativo |
| 16 telas em `app/` + 7 arquivos em `src/` | azul IG escrito à mão (#042C53 #185FA5 #378ADD #B5D4F4) → `T.profundo/primario/vivo/claro`. **Sem isso o app do Motty saía azul IG.** Zero ocorrência restante; 45 arquivos passam no parser |
| `marcas/_modelo` | ganha o campo `googleServices` |

IG não muda: `set-marca.js ig` produz o mesmo bundle de antes com as mesmas cores.

## Antes do primeiro build
1. **Firebase**: projeto do IG → Adicionar app → Android → `br.com.motty.entregador` → baixar `google-services.json` → salvar em `marcas/motty/google-services.json` e commitar. (Sem ele: build passa, push não chega.)
2. **Google Maps** (Cloud Console → credenciais → a chave do app.json): adicionar restrição de app Android `br.com.motty.entregador` + SHA-1 do keystore do Motty (sai no passo 4).
3. **Ícones oficiais** em `assets/marca/motty/` (1024 icon, 1024 adaptive com símbolo na zona segura central ~66%, 1242 splash, 512 logo transparente).
4. **Empresa `motty`** já existe no Logix com slug `motty` (confere em Empresas).

## Build
```powershell
cd $env:USERPROFILE\Downloads\appboylogix
git checkout main ; git pull
# extraiu o zip por cima → git add -A ; git commit -m "feat(marca): app Motty (2º cliente) + tema por marca" ; git push
eas build -p android --profile motty          # APK: validar no aparelho (marca, login slug motty, GPS, oferta, push, foto)
eas credentials -p android                    # profile motty → anotar SHA-1 → Google Maps + Firebase
eas build -p android --profile motty-loja     # AAB para a Play (autoIncrement do versionCode)
```
Primeiro build do perfil `motty`: deixar o EAS **gerar e guardar** o keystore (é a chave de upload; a Play faz o app signing).

## OTA
`npm run update -- "mensagem"` publica em todas as marcas (IG no canal `preview`, Motty no `motty`). Só o Motty: `npm run update -- "mensagem" --marca motty`.

## Checklist de validação no APK
- Login por e-mail entra na empresa Motty (não pede slug); cadastro pelo app cria pendente no painel do Motty.
- Cores: fundo/splash azul-marinho Motty, botões #1A4A83, ofertas/destaques laranja #FB5012.
- "Ficar online" mostra a tela de divulgação antes do pedido de permissão; GPS chega em `painel.motty.com.br/#/rastreio`.
- Oferta em tela cheia + push com app fechado (só depois do google-services.json do Motty).
- Marcar ponto com foto; comprovante abre no painel do Motty com a marca dele.
