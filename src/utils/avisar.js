// Avisos e confirmações com a cara do app (pedido do Tutts em 11/10/2026).
//
// `Alerta.alert(titulo, mensagem, botoes)` aceita EXATAMENTE a assinatura do Alert.alert do
// React Native — trocar um pelo outro não muda o comportamento da tela, só a aparência:
// em vez da caixa branca do sistema, sobe a folha do <AvisoHost/> com as cores da marca.
//
//   · botão com style 'cancel'      → vira o link discreto embaixo ("Voltar", "Cancelar");
//   · botão com style 'destructive' → botão vermelho (ação sem volta);
//   · tocar fora / voltar do Android → o 'cancel', se houver; senão o único botão (assim
//     um "OK" que navega para outra tela nunca fica sem acontecer).
//
// O tom do ícone sai do título (Erro → perigo, Atenção → atenção, Pronto → ok…) e pode ser
// forçado em `opcoes.tom`. `opcoes` também aceita linhas/sub do AvisoHost.
import { mostrarAviso } from './aviso';

const PERIGO = /^(erro|ops|não foi possível|nao foi possivel|falha|não consegui)/i;
const ATENCAO = /^(atenção|atencao|permissão|permissao|conexão instável|conexao instavel|confira|sem rota|ação necessária)/i;
const OK = /^(pronto|enviado|aprovado|corrida aceita|reenviado|senha alterada|cadastro enviado|solicitação enviada|ponto liberado|confira seu e-mail)/i;

function tomDoTitulo(titulo, temDestrutivo) {
  if (temDestrutivo) return 'perigo';
  const t = String(titulo || '').trim();
  if (PERIGO.test(t)) return 'perigo';
  if (ATENCAO.test(t)) return 'atencao';
  if (OK.test(t)) return 'ok';
  return 'info';
}

async function alert(titulo, mensagem, botoes, opcoes = {}) {
  const lista = Array.isArray(botoes) && botoes.length ? botoes : [{ text: 'OK' }];
  const cancelar = lista.find((b) => b.style === 'cancel') || null;
  const acoes = lista.filter((b) => b !== cancelar);
  const temDestrutivo = acoes.some((b) => b.style === 'destructive');

  // A ação principal fica em cima, a secundária abaixo e o cancelar por último.
  const ordem = [...acoes, ...(cancelar ? [cancelar] : [])];
  const cfg = {
    tom: opcoes.tom || tomDoTitulo(titulo, temDestrutivo),
    titulo: titulo || '',
    lead: mensagem || '',
    ...opcoes,
    botoes: ordem.map((b, i) => ({
      chave: String(i),
      texto: b.text || 'OK',
      estilo: b === cancelar ? 'ghost' : b.style === 'destructive' ? 'perigo' : (acoes.indexOf(b) === 0 ? 'primario' : 'secundario'),
    })),
    chaveFechar: cancelar ? String(ordem.indexOf(cancelar)) : (ordem.length === 1 ? '0' : 'fechar'),
  };
  const escolha = await mostrarAviso(cfg);
  const b = ordem[Number(escolha)];
  if (b && typeof b.onPress === 'function') {
    try { await b.onPress(); } catch { /* quem chamou trata o próprio erro */ }
  }
  return b ? b.text : null;
}

export const Alerta = { alert };
