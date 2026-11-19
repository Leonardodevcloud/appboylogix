// Ponto de entrada do app (19/11/2026).
//
// As tarefas de segundo plano (rastreamento e "acordar o GPS") PRECISAM ser definidas aqui,
// antes do roteador. Antes, o `defineTask` ficava em app/_layout.jsx — e arquivo de rota só é
// executado quando a TELA é montada. Quando o Android encerrava o app minimizado e religava
// só o serviço de localização (sem tela), a tarefa chegava "não definida": a posição era
// descartada e o próprio expo-task-manager CANCELAVA o rastreamento. O entregador seguia
// "online" sem mandar posição até abrir o app de novo — sumia das ofertas em 10 minutos e
// aparecia como offline no painel depois de 1 hora.
//
// Regra: o que roda com o app fechado é importado NESTE arquivo, e só de módulos leves
// (sem tela, sem som). A ordem importa: tarefas primeiro, roteador por último.
import './src/tasks/gpsTask';
import './src/tasks/pushFundo';
import 'expo-router/entry';
