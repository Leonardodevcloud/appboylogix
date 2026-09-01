import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
// Importa a task de GPS para registra-la no app (defineTask roda no import).
import '../src/tasks/gpsTask';
import { configurarNotificacoes, aoTocarNotificacao, aoReceberNotificacao, notificacaoQueAbriuApp } from '../src/push';
import AvisoHost from '../src/componentes/AvisoHost';
import ErroBoundary from '../src/componentes/ErroBoundary';

// Decide para onde navegar quando o motoboy toca em uma notificacao.
function navegarPorNotificacao(dados) {
  if (!dados || !dados.tipo) return;
  switch (dados.tipo) {
    case 'oferta':
      if (dados.ofertaId) router.push('/oferta-detalhe?id=' + dados.ofertaId);
      else router.push('/ofertas');
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
    configurarNotificacoes();
    // App aberto pelo toque na notificacao (estava fechado).
    notificacaoQueAbriuApp().then((dados) => {
      if (dados) setTimeout(() => navegarPorNotificacao(dados), 600);
    });
    // App ja aberto: toque na notificacao.
    const limpar = aoTocarNotificacao(navegarPorNotificacao);
    // App vivo: toca o alerta interno (som+vibracao garantidos) ao receber push.
    const limparReceber = aoReceberNotificacao();
    return () => { limpar(); limparReceber(); };
  }, []);

  return (
    <ErroBoundary>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
      {/* Modal nativo do app (avisos de permissão etc.) — renderizado uma vez, por cima de tudo. */}
      <AvisoHost />
    </ErroBoundary>
  );
}
