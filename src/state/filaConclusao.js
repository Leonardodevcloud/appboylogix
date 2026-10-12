import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import { api } from '../api';
import { uploadDireto } from '../api/upload';

// Conclusão de entrega sem sinal (ADR-050 do backend, mockup aprovado em 12/10/2026).
//
// Quando a internet cai na hora de concluir, nada se perde: as fotos vão para a pasta do
// app (não o cache, que o Android limpa), e a conclusão — ocorrência, quem recebeu,
// observação, posição e o HORÁRIO em que ele concluiu — vai para uma fila em disco. A
// fila é enviada sozinha, em ordem, quando o sinal volta, quando o app volta para a
// frente, a cada minuto enquanto houver pendência, ou no "Tentar enviar agora".
//
// O backend usa `concluido_em` como horário da entrega e é idempotente por ponto, então
// repetir o envio nunca duplica. Respostas:
//   200            → enviada; sai da fila e as fotos são apagadas
//   sem rede / 5xx → continua na fila, tenta de novo depois
//   404 / 409      → a corrida foi cancelada ou tirada dele: sai da fila e ele é avisado
//   outro 4xx      → fica na fila com o erro (ex.: fora do raio) para ele decidir

const PASTA = FileSystem.documentDirectory + 'fila-conclusao/';
const ARQ = PASTA + 'fila.json';
const INTERVALO_MS = 60 * 1000;

let _itens = [];
let _carregado = false;
let _enviando = false;
let _timer = null;
const _subs = new Set();
let _aoDescartar = null;          // (item, mensagem) => void — a tela avisa o motoboy

function _notificar() { const c = _itens.slice(); _subs.forEach((f) => { try { f(c); } catch {} }); }

async function _salvar() {
  try {
    await FileSystem.makeDirectoryAsync(PASTA, { intermediates: true }).catch(() => {});
    await FileSystem.writeAsStringAsync(ARQ, JSON.stringify(_itens));
  } catch {}
}

async function _carregar() {
  if (_carregado) return _itens;
  try {
    const info = await FileSystem.getInfoAsync(ARQ);
    if (info.exists) {
      const lista = JSON.parse(await FileSystem.readAsStringAsync(ARQ));
      // Um envio interrompido (app fechado no meio) volta a ser pendente.
      _itens = Array.isArray(lista) ? lista.map((i) => (i.estado === 'enviando' ? { ...i, estado: 'pendente' } : i)) : [];
    }
  } catch { _itens = []; }
  _carregado = true;
  _notificar();
  return _itens;
}

export function itensDaFila() { return _itens.slice(); }
export function assinarFila(fn) { _subs.add(fn); try { fn(_itens.slice()); } catch {} return () => _subs.delete(fn); }
export function aoDescartarConclusao(fn) { _aoDescartar = fn; return () => { if (_aoDescartar === fn) _aoDescartar = null; }; }

// Pontos já concluídos no celular (para as telas mostrarem como feitos / "Enviando…").
export function pontosNaFila() {
  return new Set(_itens.map((i) => String(i.pontoId || ('sem:' + i.entregaId))));
}

// Há internet de verdade agora? (sem sinal = não perde 30 s esperando timeout)
export async function temInternet() {
  try {
    const s = await Network.getNetworkStateAsync();
    return !!s.isConnected && s.isInternetReachable !== false;
  } catch { return true; }
}

// Guarda uma conclusão. `fotos`: URIs locais (file://). Devolve o item.
export async function guardarConclusao({ entregaId, pontoId, protocolo, endpoint, corpo, fotos }) {
  await _carregar();
  const id = String(Date.now()) + '-' + Math.floor(Math.random() * 1e6);
  await FileSystem.makeDirectoryAsync(PASTA, { intermediates: true }).catch(() => {});
  const copias = [];
  for (let i = 0; i < (fotos || []).length; i++) {
    const destino = `${PASTA}${id}-${i}.jpg`;
    try { await FileSystem.copyAsync({ from: fotos[i], to: destino }); copias.push(destino); } catch {}
  }
  const item = {
    id, entregaId: String(entregaId), pontoId: pontoId ? String(pontoId) : null, protocolo: protocolo || null,
    endpoint, corpo, fotos: copias, criado_em: new Date().toISOString(), estado: 'pendente', erro: null, tentativas: 0,
  };
  _itens = [..._itens, item];
  await _salvar();
  _notificar();
  _agendar();
  return item;
}

async function _apagarFotos(item) {
  for (const f of item.fotos || []) { try { await FileSystem.deleteAsync(f, { idempotent: true }); } catch {} }
}

async function _remover(id) {
  const item = _itens.find((i) => i.id === id);
  _itens = _itens.filter((i) => i.id !== id);
  await _salvar();
  _notificar();
  if (item) await _apagarFotos(item);
}

async function _atualizar(id, mudanca) {
  _itens = _itens.map((i) => (i.id === id ? { ...i, ...mudanca } : i));
  await _salvar();
  _notificar();
}

export async function descartarConclusao(id) { await _carregar(); await _remover(id); }
export async function reabrirConclusao(id) { await _carregar(); await _atualizar(id, { estado: 'pendente', erro: null }); return enviarFila(); }

// Envia uma conclusão. Devolve 'ok' | 'rede' | 'descartar' | 'erro'.
async function _enviarUm(item) {
  const fotos_keys = [];
  const fotos_urls = [];
  for (const uri of item.fotos || []) {
    const key = await uploadDireto({ fonte: uri, mime: 'image/jpeg', finalidade: 'protocolo' });
    if (key) { fotos_keys.push(key); continue; }
    try { fotos_urls.push(await FileSystem.readAsStringAsync(uri, { encoding: 'base64' })); } catch {}
  }
  try {
    await api.post(item.endpoint, { ...item.corpo, fotos_keys, fotos_urls });
    return { r: 'ok' };
  } catch (e) {
    const st = e?.status;
    if (!st || st >= 500) return { r: 'rede' };
    if (st === 404 || st === 409) return { r: 'descartar', mensagem: e.message };
    return { r: 'erro', mensagem: e?.dados?.mensagem || e.message, foraDoRaio: e?.dados?.erro === 'FORA_DO_RAIO' };
  }
}

// Envia tudo o que está pendente, em ordem. Para no primeiro sem rede.
export async function enviarFila() {
  await _carregar();
  if (_enviando) return;
  if (!_itens.some((i) => i.estado === 'pendente')) return;
  if (!(await temInternet())) { _agendar(); return; }
  _enviando = true;
  try {
    for (const item of _itens.filter((i) => i.estado === 'pendente')) {
      await _atualizar(item.id, { estado: 'enviando', tentativas: (item.tentativas || 0) + 1 });
      const res = await _enviarUm(item);
      if (res.r === 'ok') { await _remover(item.id); continue; }
      if (res.r === 'descartar') {
        await _remover(item.id);
        try { _aoDescartar && _aoDescartar(item, res.mensagem); } catch {}
        continue;
      }
      if (res.r === 'erro') { await _atualizar(item.id, { estado: 'erro', erro: res.mensagem || 'Não foi aceita.', foraDoRaio: !!res.foraDoRaio }); continue; }
      await _atualizar(item.id, { estado: 'pendente' });
      break;   // sem rede: o resto espera o próximo gatilho
    }
  } finally {
    _enviando = false;
    _agendar();
  }
}

function _agendar() {
  clearTimeout(_timer);
  if (_itens.some((i) => i.estado === 'pendente')) _timer = setTimeout(() => { enviarFila(); }, INTERVALO_MS);
}

// Montado uma vez (no _layout): carrega a fila e liga os gatilhos de envio.
let _iniciado = false;
export function iniciarFilaConclusao() {
  if (_iniciado) return;
  _iniciado = true;
  _carregar().then(() => enviarFila());
  try {
    Network.addNetworkStateListener((s) => { if (s.isConnected && s.isInternetReachable !== false) enviarFila(); });
  } catch {}
  AppState.addEventListener('change', (st) => { if (st === 'active') enviarFila(); });
}
