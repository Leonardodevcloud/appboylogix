#!/usr/bin/env node
/**
 * Publica um update OTA para TODAS as marcas (white-label), em um comando.
 *
 * Uso:  node scripts/publicar-update.js "Tela de antecipar saldo"
 *       node scripts/publicar-update.js "mensagem" --marca ig      (só uma)
 *       node scripts/publicar-update.js "mensagem" --simular       (mostra e não publica)
 *
 * POR QUE ISTO EXISTE: a identidade do cliente vive no bundle (marca.config.js é
 * copiado para a raiz antes de empacotar). Um único update não serve duas marcas —
 * ele levaria a marca errada para a segunda. Então, para cada marca em `marcas/`:
 * troca a marca, publica no canal dela, e segue.
 *
 * O canal tem o nome da marca (ver `eas.json`: o profile `ig-loja` publica em `ig`).
 *
 * `--platform android` é intencional: o app.json declara web entre as plataformas e
 * o export para web falha sem `react-native-web`. Publicar web não faz sentido aqui.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = process.cwd();
const args = process.argv.slice(2);
const mensagem = args.find((a) => !a.startsWith('--'));
const simular = args.includes('--simular');
const apenas = (() => {
  const i = args.indexOf('--marca');
  return i >= 0 ? args[i + 1] : null;
})();

if (!mensagem) {
  console.error('Informe a mensagem do update. Ex.: node scripts/publicar-update.js "Tela de antecipar saldo"');
  process.exit(1);
}

function marcas() {
  const dir = path.join(raiz, 'marcas');
  return fs.readdirSync(dir)
    // `_modelo` é gabarito para criar cliente novo, não é cliente.
    .filter((d) => !d.startsWith('_'))
    .filter((d) => fs.existsSync(path.join(dir, d, 'marca.config.js')));
}

// Guarda a marca que está no disco para devolvê-la no fim: quem roda isto na própria
// máquina não pode terminar com o repositório apontando para outro cliente.
const marcaAtual = (() => {
  try { return require(path.join(raiz, 'marca.config.js')).slug; } catch { return null; }
})();

const alvos = apenas ? [apenas] : marcas();
if (!alvos.length) { console.error('Nenhuma marca encontrada em marcas/.'); process.exit(1); }

console.log(`\nMarcas a publicar: ${alvos.join(', ')}${simular ? '  (simulação)' : ''}\n`);

const falhas = [];
for (const slug of alvos) {
  console.log(`── ${slug} ───────────────────────────────`);
  const passos = [
    `node scripts/set-marca.js ${slug}`,
    // Só --branch: o EAS recusa --branch e --channel juntos. O canal do cliente aponta
    // para o branch de mesmo nome (ver `eas channel:list`), então publicar no branch
    // entrega no canal dele.
    `npx eas update --branch ${slug} --platform android --message ${JSON.stringify(mensagem)}`,
  ];
  for (const cmd of passos) {
    console.log(`  $ ${cmd}`);
    if (simular) continue;
    try {
      execSync(cmd, { stdio: 'inherit', cwd: raiz });
    } catch (e) {
      // Uma marca que falha não pode impedir as outras de receber a correção.
      console.error(`  ! ${slug} falhou: ${e.message.split('\n')[0]}`);
      falhas.push(slug);
      break;
    }
  }
  console.log('');
}

// Devolve o disco ao estado em que estava.
if (!simular && marcaAtual) {
  try { execSync(`node scripts/set-marca.js ${marcaAtual}`, { stdio: 'ignore', cwd: raiz }); } catch { /* não crítico */ }
}

if (falhas.length) {
  console.error(`Falharam: ${falhas.join(', ')}. As demais foram publicadas.`);
  process.exit(1);
}
console.log(simular ? 'Simulação concluída.' : `Publicado para ${alvos.length} marca(s).`);
