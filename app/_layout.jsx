import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
// Importa a task de GPS para registra-la no app (defineTask roda no import).
import '../src/tasks/gpsTask';
import { configurarNotificacoes, aoTocarNotificacao, aoReceberNotificacao, notificacaoQueAbriuApp } from '../src/push';
import AvisoHost from '../src/componentes/AvisoHost';
import ErroBoundary from '../src/componentes/ErroBoundary';
import BannerHost from '../src/componentes/BannerHost';
import SheetNavegacao from '../src/componentes/SheetNavegacao';
import { carregarPrefs } from '../src/state/prefsAlerta';
import { carregarNavegacao } from '../src/state/navegacao';
import { iniciarFilaConclusao, aoDescartarConclusao } from '../src/state/filaConclusao';
import { Alerta } from '../src/utils/avisar';
import { anotarDestino, marcarOfertaAberta } from '../src/state/navegacaoPendente';

// Decide para onde navegar quando o motoboy toca em uma notificacao.
function navegarPorNotificacao(dados) {
  if (!dados || !dados.tipo) return;
  switch (dados.tipo) {
    case 'oferta':
      if (dados.ofertaId) { marcarOfertaAberta(String(dados.ofertaId)); router.push('/oferta-detalhe?oferta_id=' + dados.ofertaId); }
      else router.push('/ofertas');
      break;
    case 'chat':
      if (dados.entregaId) router.push('/chat?entregaId=' + dados.entregaId + '&tipo=' + (dados.chatTipo || 'suporte'));
      else router.push('/mensagens');
      break;
    case 'antecipacao':
      // Aprovado: a tela do pedido (acompanha ao vivo). Paga, recusada ou devolvida: o
      // histórico mostra a conta (pediu, taxa, recebeu).
      router.push(dados.status === 'processando' ? '/antecipar' : '/antecipar?aba=historico');
      break;
    case 'acerto':
      // "Acerto pago": abre o comprovante (ADR-049 do backend).
      router.push(dados.fechamentoId ? '/comprovante?id=' + dados.fechamentoId : '/ganhos?aba=acertos');
      break;
    case 'atribuida':
    case 'atribuida_lote':
    case 'editada':
    case 'removida':
    default:
      router.push('/home');
      break;
  }
}

export default function Layout() {
  useEffect(() => {
    // Carrega as preferências de alerta (som/vibração/som escolhido) cedo,
    // para o primeiro alerta já sair certo.
    carregarPrefs();
    // Waze ou Google Maps: a escolha salva já fica em memória antes da primeira rota.
    carregarNavegacao();
    // Conclusões guardadas sem sinal: envia sozinho quando a rede volta (ADR-050).
    iniciarFilaConclusao();
    const soltarDescarte = aoDescartarConclusao((item) => {
      Alerta.alert('Corrida cancelada', `A corrida ${item.protocolo || ''} foi cancelada ou passada para outro entregador enquanto você estava sem sinal. A entrega guardada foi descartada.`.replace('  ', ' '), [{ text: 'Entendi' }], { tom: 'atencao' });
    });
    configurarNotificacoes();
    // App aberto pelo toque na notificacao (estava fechado).
    // App aberto pelo toque (estava fechado): NÃO navega agora — o index.jsx ainda vai fazer
    // replace('/home') ao confirmar o login e passaria por cima. Só anota; a Home consome.
    notificacaoQueAbriuApp().then((dados) => {
      if (!dados || !dados.tipo) return;
      if (dados.tipo === 'oferta' && dados.ofertaId) anotarDestino('/oferta-detalhe?oferta_id=' + dados.ofertaId);
      else if (dados.tipo === 'chat' && dados.entregaId) anotarDestino('/chat?entregaId=' + dados.entregaId + '&tipo=' + (dados.chatTipo || 'suporte'));
      else if (dados.tipo === 'antecipacao') anotarDestino(dados.status === 'processando' ? '/antecipar' : '/antecipar?aba=historico');
      else if (dados.tipo === 'acerto') anotarDestino(dados.fechamentoId ? '/comprovante?id=' + dados.fechamentoId : '/ganhos?aba=acertos');
    });
    // App ja aberto: toque na notificacao.
    const limpar = aoTocarNotificacao(navegarPorNotificacao);
    // App vivo: toca o alerta interno (som+vibracao garantidos) ao receber push.
    const limparReceber = aoReceberNotificacao();
    return () => { limpar(); limparReceber(); soltarDescarte(); };
  }, []);

  return (
    <ErroBoundary>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
      {/* Modal nativo do app (avisos de permissão etc.) — renderizado uma vez, por cima de tudo. */}
      <AvisoHost />
      {/* Banner animado de notificação (nova corrida, atribuída, editada, removida, ponto liberado). */}
      <BannerHost />
      {/* Folha "Abrir a rota com" (Waze ou Google Maps). */}
      <SheetNavegacao />
    </ErroBoundary>
  );
}
