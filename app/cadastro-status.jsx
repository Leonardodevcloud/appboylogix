import { useState, useEffect, useRef } from 'react';
import { abrirSocket } from '../src/realtime/socket';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image, StatusBar, Modal, RefreshControl, KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { api, getToken, EMPRESA_NOME } from '../src/api';
import { T } from '../src/tema';
import { Alerta } from '../src/utils/avisar';
import { dataBR, nomeEmpresa } from '../src/utils/termo';
import Icone from '../src/componentes/Icone';
import EscolherRegiao, { nomeMunicipio } from '../src/componentes/EscolherRegiao';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  navy900: T.profundo, azulP: T.primario, azulV: T.vivo, azulC: T.claro,
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5',
  ok: '#1f9d6b', okBg: '#e7f6ef', erro: '#dc2626', erroBg: '#fef2f2',
  amber: '#b45309', amberBg: '#fef3c7',
  aten: '#c98a1a', atenBg: '#fbf1dd', atenBd: '#ecd3a0', atenTx: '#5c3f06', atenForte: '#8a5a07',
  desativado: '#9fb3c8',
};

const DOCS = [
  { tipo: 'selfie', rotulo: 'Selfie', soCamera: true },
  { tipo: 'habilitacao', rotulo: 'Habilitação (CNH)' },
  { tipo: 'comprovante_endereco', rotulo: 'Comprovante de endereço' },
  { tipo: 'antecedentes', rotulo: 'Antecedentes criminais' },
];

// Eventos do servidor que mudam esta tela (o de região liberada também chega por push/e-mail).
const EVENTOS_RECARREGAR = new Set(['cadastro.reenvio', 'cadastro.recusado', 'cadastro.regiao_liberada', 'motoboy.regiao_liberada']);

export default function CadastroStatus() {
  const insetBaixo = useSafeAreaInsets().bottom;   // botões do Android no rodapé: o conteúdo fica acima deles
  const [estado, setEstado] = useState(null); // { situacao, motivo, documentos, aguardando_regiao?, regiao?, aviso_regiao? }
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [docs, setDocs] = useState({});
  const [camAberta, setCamAberta] = useState(null);
  const [permCam, pedirPermCam] = useCameraPermissions();
  const camRef = useRef(null);
  const wsRef = useRef(null);

  // "Mudar minha cidade" (cadastro aguardando a região).
  const [mudandoCidade, setMudandoCidade] = useState(false);
  const [ctxCad, setCtxCad] = useState(null);         // contexto do cadastro (regras de região)
  const [novaUf, setNovaUf] = useState(null);
  const [novaCidade, setNovaCidade] = useState(null);
  const [salvandoCidade, setSalvandoCidade] = useState(false);

  async function carregar() {
    try {
      const r = await api.meuCadastro();
      setEstado(r);
      // Se foi aprovado, libera para a home.
      if (r.situacao === 'aprovado') { router.replace('/home'); return; }
    } catch (e) { console.log('[STATUS] erro:', e?.message); }
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // WebSocket: reage a aprovação/reenvio em tempo real.
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const ws = abrirSocket(token);
        wsRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const { evento } = JSON.parse(ev.data);
            if (evento === 'cadastro.aprovado') { Alerta.alert('Aprovado!', 'Seu cadastro foi aprovado. Bem-vindo!', [{ text: 'Começar', onPress: () => router.replace('/home') }]); }
            else if (EVENTOS_RECARREGAR.has(evento)) { carregar(); }
          } catch {}
        };
      } catch {}
    })();
    return () => { try { wsRef.current?.close(); } catch {} };
  }, []);

  // ── Captura de documentos (só no modo reenvio) ──
  async function tirarFoto(tipo) {
    if (!permCam?.granted) { const r = await pedirPermCam(); if (!r.granted) { Alerta.alert('Permissão', 'Precisamos da câmera.'); return; } }
    setCamAberta(tipo);
  }
  async function capturar() {
    if (!camRef.current) return;
    const foto = await camRef.current.takePictureAsync({ quality: 0.4, base64: true });
    setDocs(d => ({ ...d, [camAberta]: `data:image/jpeg;base64,${foto.base64}` }));
    setCamAberta(null);
  }
  async function daGaleria(tipo) {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.4, base64: true });
    if (!r.canceled && r.assets?.[0]?.base64) setDocs(d => ({ ...d, [tipo]: `data:${r.assets[0].mimeType || 'image/jpeg'};base64,${r.assets[0].base64}` }));
  }

  async function reenviar() {
    setEnviando(true);
    try {
      await api.reenviarCadastro({ documentos: docs });
      Alerta.alert('Reenviado!', 'Seus dados foram reenviados para análise.', [{ text: 'OK' }]);
      setDocs({});
      carregar();
    } catch (e) { Alerta.alert('Erro', e.message || 'Falha ao reenviar'); }
    setEnviando(false);
  }

  // ── Mudar minha cidade ──
  async function abrirMudarCidade() {
    const reg = estado?.regiao || null;
    setNovaUf(reg?.uf || null);
    setNovaCidade(reg?.municipio ? { codigo: Number(reg.municipio), nome: reg.nome || nomeMunicipio(reg.municipio) || '', uf: reg.uf, atendida: false } : null);
    setMudandoCidade(true);
    if (!ctxCad) {
      try { setCtxCad(await api.contextoCadastro()); }
      catch { setCtxCad({}); }   // sem as regras: lista todas as cidades sem marcar as atendidas
    }
  }
  async function salvarCidade() {
    if (!novaCidade || salvandoCidade) return;
    setSalvandoCidade(true);
    try {
      const r = await api.minhaRegiao(novaCidade.codigo);
      setMudandoCidade(false);
      if (r && r.situacao) setEstado(r); else await carregar();
      const liberado = r && r.aguardando_regiao === false;
      Alerta.alert('Pronto', liberado
        ? `A ${EMPRESA_NOME} já atende ${novaCidade.nome}. Seu cadastro foi para análise.`
        : `Sua cidade agora é ${novaCidade.nome}. Avisamos você aqui e por e-mail quando começarmos a operar nela.`);
      if (r && r.situacao === 'aprovado') router.replace('/home');
    } catch (e) { Alerta.alert('Não foi possível', e?.message || 'Não deu para mudar a cidade. Tente de novo.'); }
    setSalvandoCidade(false);
  }

  async function atualizar() { setAtualizando(true); await carregar(); setAtualizando(false); }
  async function sair() { await api.logout(); router.replace('/'); }

  if (carregando) return (
    <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>
  );

  // Câmera
  if (camAberta) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={camRef} style={{ flex: 1 }} facing={camAberta === 'selfie' ? 'front' : 'back'} />
        <View style={[st.camBar, { paddingBottom: Math.max(40, 20 + insetBaixo) }]}>
          <TouchableOpacity onPress={() => setCamAberta(null)}><Text style={st.camCancel}>Cancelar</Text></TouchableOpacity>
          <TouchableOpacity style={st.camBtn} onPress={capturar}><View style={st.camBtnInner} /></TouchableOpacity>
          <View style={{ width: 70 }} />
        </View>
      </View>
    );
  }

  const sit = estado?.situacao || 'pendente';
  // Cadastro guardado esperando a empresa chegar na cidade dele (mockup AppAguardando).
  // Correção pedida ou recusa têm prioridade sobre a espera.
  const aguardando = !!estado?.aguardando_regiao && sit !== 'reenvio' && sit !== 'recusado';
  const regiao = estado?.regiao || null;
  const enviadoEm = estado?.enviado_em || estado?.criado_em || estado?.created_at || null;

  // Documentos que faltam (foram removidos pela central no reenvio).
  const tiposPresentes = new Set((estado?.documentos || []).map(d => d.tipo));
  const docsFaltando = DOCS.filter(d => !tiposPresentes.has(d.tipo));

  const modalCidade = (
    <Modal visible={mudandoCidade} animationType="slide" onRequestClose={() => setMudandoCidade(false)}>
      <View style={st.root}>
        <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
        <View style={st.mHeader}>
          <TouchableOpacity onPress={() => setMudandoCidade(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fechar">
            <Icone nome="fechar" tam={22} cor="#fff" traco={2.4} />
          </TouchableOpacity>
          <Text style={st.mTit}>Mudar minha cidade</Text>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12 }}>
            {!ctxCad ? (
              <ActivityIndicator color={C.azulP} style={{ marginTop: 40 }} />
            ) : (
              <EscolherRegiao
                regioes={ctxCad.regioes ? { ...ctxCad.regioes, pedir: true } : null}
                empresa={nomeEmpresa(ctxCad)}
                uf={novaUf}
                cidade={novaCidade}
                onEscolherUf={setNovaUf}
                onEscolherCidade={setNovaCidade}
              />
            )}
          </View>
          <View style={[st.mRodape, { paddingBottom: Math.max(18, 12 + insetBaixo) }]}>
            {(() => {
              const mesma = !novaCidade || Number(novaCidade.codigo) === Number(regiao?.municipio);
              return (
                <TouchableOpacity style={[st.btnPrincipal, { marginTop: 0 }, mesma && { backgroundColor: C.desativado }, salvandoCidade && { opacity: 0.6 }]}
                  onPress={salvarCidade} disabled={mesma || salvandoCidade} activeOpacity={0.85}
                  accessibilityRole="button" accessibilityState={{ disabled: mesma || salvandoCidade }}>
                  {salvandoCidade ? <ActivityIndicator color="#fff" /> : <Text style={st.btnPrincipalTxt}>Salvar cidade</Text>}
                </TouchableOpacity>
              );
            })()}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  if (aguardando) {
    const cidadeNome = regiao?.nome || (regiao?.municipio ? nomeMunicipio(regiao.municipio) : null);
    return (
      <View style={[st.root, { backgroundColor: '#f4f8fd' }]}>
        <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
        <ScrollView contentContainerStyle={{ paddingBottom: 24 + insetBaixo }}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={C.azulV} />}>
          <View style={st.heroAg}>
            <View style={st.heroAgIco}><Icone nome="pin" tam={26} cor="#fff" /></View>
            <Text style={st.heroAgTit}>{cidadeNome ? `Cadastro recebido. Ainda não estamos em ${cidadeNome}.` : 'Cadastro recebido. Ainda não estamos na sua região.'}</Text>
            <Text style={st.heroAgSub}>Guardamos tudo. Quando a {EMPRESA_NOME} começar a operar na sua região, seu cadastro vai para análise e você recebe um aviso aqui e por e-mail.</Text>
          </View>

          <View style={st.agCorpo}>
            <View style={st.agCartao}>
              <LinhaInfo rot="Sua região" val={cidadeNome ? `${cidadeNome}${regiao?.uf ? ` · ${regiao.uf}` : ''}` : '—'} />
              {!!enviadoEm && <LinhaInfo rot="Enviado em" val={dataBR(enviadoEm)} />}
              <LinhaInfo rot="Situação" val="Aguardando a região" cor={C.atenForte} />
            </View>

            {!!estado?.aviso_regiao && (
              <View style={st.agAviso}>
                <Icone nome="info" tam={16} cor={C.atenTx} />
                <Text style={st.agAvisoTxt}>{estado.aviso_regiao}</Text>
              </View>
            )}

            <View style={st.agMenu}>
              <ItemMenu tt="Meus dados" onPress={() => router.push('/meus-dados')} />
              <ItemMenu tt="Mudar minha cidade" onPress={abrirMudarCidade} />
              <ItemMenu tt="Termo de uso" onPress={() => router.push('/termo')} ultimo />
            </View>

            <TouchableOpacity style={st.btnSairAg} onPress={sair} activeOpacity={0.85} accessibilityRole="button">
              <Text style={st.btnSairAgTxt}>Sair</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        {modalCidade}
      </View>
    );
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insetBaixo }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={C.azulV} />}>
        {/* Topo conforme situação */}
        {sit === 'pendente' && (
          <View style={[st.hero, { backgroundColor: C.navy900 }]}>
            <View style={st.heroEmoji}><Icone nome="ampulheta" tam={30} cor={'#fff'} traco={1.8} /></View>
            <Text style={st.heroTit}>Cadastro em análise</Text>
            <Text style={st.heroSub}>Recebemos seu cadastro! Nossa equipe está analisando seus dados e documentos. Você será avisado assim que for aprovado.</Text>
          </View>
        )}
        {sit === 'recusado' && (
          <View style={[st.hero, { backgroundColor: '#7f1d1d' }]}>
            <View style={st.heroEmoji}><Icone nome="fechar" tam={30} cor={'#fff'} traco={2.2} /></View>
            <Text style={st.heroTit}>Cadastro não aprovado</Text>
            <Text style={st.heroSub}>{estado.motivo || 'Seu cadastro não foi aprovado. Entre em contato com a central para mais informações.'}</Text>
          </View>
        )}
        {sit === 'reenvio' && (
          <View style={[st.hero, { backgroundColor: C.amber }]}>
            <View style={st.heroEmoji}><Icone nome="prancheta" tam={30} cor={'#fff'} traco={1.8} /></View>
            <Text style={st.heroTit}>Ação necessária</Text>
            <Text style={st.heroSub}>A central pediu uma correção no seu cadastro. Veja o que precisa e reenvie para continuar.</Text>
          </View>
        )}

        <View style={st.body}>
          {sit === 'reenvio' && (
            <>
              {!!estado.motivo && (
                <View style={st.motivoBox}>
                  <Text style={st.motivoLabel}>O que precisa ser corrigido:</Text>
                  <Text style={st.motivoTxt}>{estado.motivo}</Text>
                </View>
              )}

              {docsFaltando.length > 0 && (
                <>
                  <Text style={st.secTit}>Reenvie os documentos</Text>
                  {docsFaltando.map(d => {
                    const enviado = !!docs[d.tipo];
                    return (
                      <View key={d.tipo} style={st.docCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          {enviado
                            ? <Image source={{ uri: docs[d.tipo] }} style={st.docThumb} />
                            : <View style={[st.docThumb, st.docThumbVazio]}><Icone nome={d.tipo === 'selfie' ? 'selfie' : 'documento'} tam={20} cor={C.azulP} /></View>}
                          <View style={{ flex: 1 }}>
                            <Text style={st.docNome}>{d.rotulo}</Text>
                            <Text style={st.docSub}>{enviado ? 'Pronto' : 'Pendente'}</Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                          <TouchableOpacity style={st.docBtn} onPress={() => tirarFoto(d.tipo)}><Text style={st.docBtnTxt}>{enviado ? 'Refazer' : 'Câmera'}</Text></TouchableOpacity>
                          {!d.soCamera && <TouchableOpacity style={[st.docBtn, st.docBtnAlt]} onPress={() => daGaleria(d.tipo)}><Text style={[st.docBtnTxt, { color: C.azulP }]}>Galeria</Text></TouchableOpacity>}
                        </View>
                      </View>
                    );
                  })}
                </>
              )}

              <TouchableOpacity style={[st.btnPrincipal, enviando && { opacity: 0.6 }]} onPress={reenviar} disabled={enviando} activeOpacity={0.85}>
                {enviando ? <ActivityIndicator color="#fff" /> : <Text style={st.btnPrincipalTxt}>Reenviar para análise</Text>}
              </TouchableOpacity>
            </>
          )}

          {sit === 'pendente' && (
            <View style={st.infoCard}>
              <Text style={st.infoTxt}>Assim que seu cadastro for aprovado, esta tela libera o acesso automaticamente. Você pode fechar o app — avisaremos quando estiver tudo certo.</Text>
              <TouchableOpacity style={st.btnAtualizar} onPress={carregar}><Text style={st.btnAtualizarTxt}>Verificar novamente</Text></TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={st.btnSair} onPress={sair}><Text style={st.btnSairTxt}>Sair</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function LinhaInfo({ rot, val, cor }) {
  return (
    <View style={st.agLinha}>
      <Text style={st.agRot}>{rot}</Text>
      <Text style={[st.agVal, cor && { color: cor }]}>{val}</Text>
    </View>
  );
}

function ItemMenu({ tt, onPress, ultimo }) {
  return (
    <TouchableOpacity style={[st.agItem, ultimo && { borderBottomWidth: 0 }]} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <Text style={st.agItemTxt}>{tt}</Text>
      <Icone nome="seta" tam={18} cor={C.tinta2} />
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  hero: { paddingTop: 70, paddingBottom: 36, paddingHorizontal: 24, alignItems: 'center', borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  heroEmoji: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroTit: { color: '#fff', fontSize: 21, fontWeight: '800', textAlign: 'center' },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13.5, textAlign: 'center', marginTop: 10, lineHeight: 20 },

  body: { padding: 18 },
  motivoBox: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 14, padding: 16, marginBottom: 18 },
  motivoLabel: { fontSize: 12, fontWeight: '800', color: C.amber, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  motivoTxt: { fontSize: 14, color: '#7c2d12', lineHeight: 20 },

  secTit: { fontSize: 15, fontWeight: '800', color: C.tinta, marginBottom: 12 },
  docCard: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, padding: 14, marginBottom: 12 },
  docThumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: C.sup2 },
  docThumbVazio: { justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.linha, borderStyle: 'dashed' },
  docNome: { fontSize: 14, fontWeight: '700', color: C.tinta },
  docSub: { fontSize: 12, color: C.tinta2, marginTop: 2 },
  docBtn: { flex: 1, backgroundColor: C.navy900, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  docBtnAlt: { backgroundColor: '#eaf3fc' },
  docBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  btnPrincipal: { backgroundColor: C.azulP, paddingVertical: 16, borderRadius: 13, alignItems: 'center', marginTop: 8 },
  btnPrincipalTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },

  infoCard: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, padding: 18 },
  infoTxt: { fontSize: 13.5, color: C.tinta2, lineHeight: 20, textAlign: 'center' },
  btnAtualizar: { marginTop: 16, paddingVertical: 13, borderRadius: 11, borderWidth: 1.5, borderColor: C.azulP, alignItems: 'center' },
  btnAtualizarTxt: { color: C.azulP, fontSize: 14, fontWeight: '700' },

  btnSair: { marginTop: 22, alignItems: 'center', padding: 12 },
  btnSairTxt: { color: C.tinta3, fontSize: 14, fontWeight: '700' },

  // Aguardando a região (mockup AppAguardando)
  heroAg: { backgroundColor: C.navy900, paddingTop: 60, paddingBottom: 26, paddingHorizontal: 18, gap: 8, alignItems: 'flex-start' },
  heroAgIco: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.aten, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroAgTit: { color: '#fff', fontSize: 20, fontWeight: '800', lineHeight: 25 },
  heroAgSub: { color: C.azulC, fontSize: 13.5, lineHeight: 20 },
  agCorpo: { paddingHorizontal: 12, paddingTop: 14, gap: 10 },
  agCartao: { backgroundColor: C.sup, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: C.linha },
  agLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  agRot: { fontSize: 13.5, color: C.tinta2 },
  agVal: { flexShrink: 1, fontSize: 13.5, fontWeight: '800', color: C.tinta, textAlign: 'right' },
  agAviso: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: C.atenBg, borderWidth: 1, borderColor: C.atenBd, borderRadius: 14, padding: 12 },
  agAvisoTxt: { flex: 1, fontSize: 13, color: C.atenTx, lineHeight: 19 },
  agMenu: { backgroundColor: C.sup, borderRadius: 16, borderWidth: 1, borderColor: C.linha, overflow: 'hidden' },
  agItem: { minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.linha },
  agItemTxt: { fontSize: 14, fontWeight: '600', color: C.tinta },
  btnSairAg: { marginTop: 8, minHeight: 48, borderWidth: 1.5, borderColor: C.linha, borderRadius: 14, backgroundColor: C.sup, alignItems: 'center', justifyContent: 'center' },
  btnSairAgTxt: { color: C.azulP, fontSize: 14, fontWeight: '700' },

  // Modal "Mudar minha cidade"
  mHeader: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  mTit: { color: '#fff', fontSize: 17, fontWeight: '800' },
  mRodape: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: C.sup, borderTopWidth: 1, borderTopColor: C.linha },

  camBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 40, paddingTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30, backgroundColor: 'rgba(0,0,0,0.4)' },
  camCancel: { color: '#fff', fontSize: 15, fontWeight: '700', width: 70 },
  camBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  camBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
});
