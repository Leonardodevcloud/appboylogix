// Push SILENCIOSO "acordar o GPS" (18/10/2026): o servidor manda quando o entregador online
// fica alguns minutos sem posição. Não aparece nada para ele — só lê a posição e religa o
// rastreamento. Chega com o app fechado (esta tarefa) ou aberto (listener em src/push).
//
// Fica em arquivo próprio e leve (19/11/2026) para ser importado no index.js, o ponto de
// entrada: com o app fechado não existe tela, e o que estiver só em arquivo de tela não roda.
// Não importe aqui nada de interface, som ou navegação.
import * as TaskManager from 'expo-task-manager';
import { acordarGps } from './gpsTask';

export const TASK_PUSH_FUNDO = 'logix-push-fundo';

export const ehAcordarGps = (dados) => { try { return JSON.stringify(dados || {}).includes('gps_acordar'); } catch { return false; } };

try {
  TaskManager.defineTask(TASK_PUSH_FUNDO, async ({ data, error }) => {
    if (error) return;
    if (ehAcordarGps(data)) { try { await acordarGps(); } catch (e) { console.log('[push] acordar gps:', e?.message); } }
  });
} catch (e) { console.log('[push] task de fundo não registrada:', e?.message); }
