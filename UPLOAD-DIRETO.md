# Upload direto ao storage (OTA)

`src/api/upload.js` — `uploadDireto({ fonte, mime, finalidade, publicoSlug? })`:
pede URL assinada à API, faz PUT direto no R2, devolve a `storage_key`. Se falhar, devolve
`null` e a tela envia base64 como antes (o servidor aceita os dois).

Telas: `concluir.jsx` (fotos → `fotos_keys`, base64 só do que falhou), `cadastro.jsx`
(documentos via endpoint público por slug), `meus-dados.jsx` (documento), `chat.jsx` (foto).

Sem tela nova, sem permissão nova, sem módulo nativo → OTA:
```powershell
cd $env:USERPROFILE\Downloads
Expand-Archive .\appboylogix-upload-direto.zip . -Force
cd appboylogix
git add -A ; git commit -m "feat(upload): fotos e documentos direto ao storage por URL assinada (fallback base64)" ; git push
eas update --platform android --branch preview --message "Upload direto ao storage"
```

Validar: concluir um ponto com foto → no Railway, log da API mostra `POST /api/v1/uploads/app/url`
seguido do `concluir` com corpo pequeno (o header `content-length` do concluir cai de centenas de KB
para poucos KB). No Postgres a linha de `protocolos` começa com `empresas/.../protocolo/`.
