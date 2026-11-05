import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Image, StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { api, EMPRESA_SLUG } from '../src/api';
import { uploadDireto } from '../src/api/upload';
import { T } from '../src/tema';
import { mascararPix, conferirPix, campoPix } from '../src/utils/pix';
import {
  so, mascararCpf, erroCpf, mascararTelefone, erroTelefone, telefoneParaEnvio,
  normalizarEmail, erroEmail, sugerirEmail,
} from '../src/utils/validarPessoa';
import { dataBR, nomeEmpresa } from '../src/utils/termo';
import { Alerta } from '../src/utils/avisar';
import Icone from '../src/componentes/Icone';
import EscolherRegiao from '../src/componentes/EscolherRegiao';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  navy900: T.profundo, navy800: '#0a3a66',
  azulP: T.primario, azulV: T.vivo, azulC: T.claro,
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5',
  ok: '#1f9d6b', okBg: '#e7f6ef', erro: '#dc2626', erroBg: '#fef2f2',
  erroCampo: '#d0584f', erroTx: '#b23b32', aten: '#c98a1a', atenBg: '#fbf1dd',
  desativado: '#9fb3c8',
};

const DOCS = [
  { tipo: 'selfie', rotulo: 'Selfie', sub: 'Só pela câmera', soCamera: true, flag: 'doc_selfie' },
  { tipo: 'habilitacao', rotulo: 'Habilitação (CNH)', sub: 'Câmera ou galeria', flag: 'doc_habilitacao' },
  { tipo: 'comprovante_endereco', rotulo: 'Comprovante de endereço', sub: 'Câmera ou galeria', flag: 'doc_comprovante_endereco' },
  { tipo: 'antecedentes', rotulo: 'Antecedentes criminais', sub: 'Câmera ou galeria', flag: 'doc_antecedentes' },
];

// Etapas do cadastro. "Sua região" só entra quando a empresa pede (contexto.regioes.pedir);
// servidor antigo, sem `regioes`, segue com as 5 etapas de antes.
const TITULOS = {
  regiao: 'Sua região', modalidade: 'Modalidade', dados: 'Seus dados',
  endereco: 'Endereço', bancario: 'Dados bancários', docs: 'Documentos',
};
const CAMPOS_DADOS = ['nome_completo', 'cpf', 'data_nascimento', 'telefone_principal', 'telefone_emergencia', 'email', 'senha'];

export default function Cadastro() {
  const insetBaixo = useSafeAreaInsets().bottom;   // botões do Android no rodapé: o conteúdo fica acima deles
  const [carregando, setCarregando] = useState(true);
  const [ctx, setCtx] = useState(null);       // { empresa, modalidades, campos, regioes?, termo? }
  const [etapa, setEtapa] = useState(0);       // índice em `etapas`
  const [enviando, setEnviando] = useState(false);

  const [form, setForm] = useState({
    modalidade_interesse_id: null,
    nome_completo: '', cpf: '', data_nascimento: '', telefone_principal: '', telefone_emergencia: '',
    email: '', senha: '',
    cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
    pix_tipo: 'cpf', pix_chave: '', titular_nome: '', titular_doc: '',
    banco_codigo: '', banco_nome: '', agencia: '', conta: '', conta_tipo: 'corrente',
  });
  const [docs, setDocs] = useState({}); // { tipo: dataUri }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Região (1ª etapa, quando a empresa pede).
  const [regiaoUf, setRegiaoUf] = useState(null);
  const [cidade, setCidade] = useState(null);   // { codigo, nome, uf, atendida }

  // Erros embaixo dos campos: aparecem ao sair do campo (ou ao tentar avançar) e somem assim
  // que o valor fica certo.
  const [tocado, setTocado] = useState({});
  const tocar = (k) => setTocado(t => (t[k] ? t : { ...t, [k]: true }));

  // Termo de uso: o aceite NUNCA vem marcado — o entregador tem de marcar.
  const [aceiteTermo, setAceiteTermo] = useState(false);

  const [camAberta, setCamAberta] = useState(null); // tipo do doc sendo capturado
  const [permCam, pedirPermCam] = useCameraPermissions();
  const camRef = useRef(null);

  useEffect(() => {
    api.contextoCadastro()
      .then(c => { setCtx(c); setCarregando(false); })
      .catch(e => { Alerta.alert('Erro', e.message || 'Não foi possível carregar o cadastro'); router.back(); });
  }, []);

  const obrig = (campo) => ctx?.campos?.[campo] !== false;
  const empresa = nomeEmpresa(ctx);
  const pedirRegiao = !!ctx?.regioes?.pedir;
  const termo = ctx?.termo || null;
  const etapas = [...(pedirRegiao ? ['regiao'] : []), 'modalidade', 'dados', 'endereco', 'bancario', 'docs'];
  const chave = etapas[etapa];
  const ultima = etapa === etapas.length - 1;

  // ── Captura de documentos ──
  async function tirarFoto(tipo) {
    if (!permCam?.granted) { const r = await pedirPermCam(); if (!r.granted) { Alerta.alert('Permissão', 'Precisamos da câmera para a foto.'); return; } }
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
    if (!r.canceled && r.assets?.[0]?.base64) {
      const a = r.assets[0];
      const mime = a.mimeType || 'image/jpeg';
      setDocs(d => ({ ...d, [tipo]: `data:${mime};base64,${a.base64}` }));
    }
  }

  // ── CEP ──
  const [buscandoCep, setBuscandoCep] = useState(false);
  async function buscarCep(valor) {
    const cep = String(valor).replace(/\D/g, '');
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await api.cepCadastro(cep);
      setForm(f => ({ ...f, logradouro: r.logradouro || f.logradouro, bairro: r.bairro || f.bairro, cidade: r.cidade || f.cidade, estado: r.uf || f.estado }));
    } catch { /* preenche manual */ }
    setBuscandoCep(false);
  }

  // ── Seus dados: erro de cada campo (null = ok) ──
  function errosDados() {
    return {
      nome_completo: obrig('nome_completo') && !form.nome_completo.trim() ? 'Informe o nome completo' : null,
      cpf: obrig('cpf') && !so(form.cpf) ? 'Informe o CPF' : erroCpf(form.cpf),
      data_nascimento: obrig('data_nascimento') && !form.data_nascimento ? 'Informe a data de nascimento' : null,
      telefone_principal: obrig('telefone_principal') && !so(form.telefone_principal) ? 'Informe o telefone' : erroTelefone(form.telefone_principal),
      telefone_emergencia: !obrig('telefone_emergencia') ? null : (!so(form.telefone_emergencia) ? 'Informe o telefone de emergência' : erroTelefone(form.telefone_emergencia)),
      email: obrig('email') && !form.email.trim() ? 'Informe o e-mail' : erroEmail(form.email),
      senha: obrig('senha') && form.senha.length < 6 ? 'A senha precisa de no mínimo 6 caracteres' : null,
    };
  }
  const erros = chave === 'dados' ? errosDados() : {};
  const erroDe = (k) => (tocado[k] ? erros[k] : null);
  const sugestaoEmail = tocado.email ? sugerirEmail(form.email) : null;

  // ── Validação por etapa ──
  function validarEtapa() {
    if (chave === 'regiao') { if (!cidade) return 'Escolha a cidade onde você vai trabalhar'; return null; }
    if (chave === 'modalidade') { if ((ctx.modalidades || []).length && !form.modalidade_interesse_id) return 'Selecione uma modalidade'; return null; }
    if (chave === 'dados') {
      const e = errosDados();
      const primeiro = CAMPOS_DADOS.find(k => e[k]);
      return primeiro ? e[primeiro] : null;
    }
    if (chave === 'endereco') {
      if (obrig('cep') && form.cep.replace(/\D/g, '').length !== 8) return 'CEP inválido';
      if (obrig('logradouro') && !form.logradouro.trim()) return 'Informe o logradouro';
      if (obrig('numero') && !form.numero.trim()) return 'Informe o número';
      if (obrig('bairro') && !form.bairro.trim()) return 'Informe o bairro';
      if (obrig('cidade') && !form.cidade.trim()) return 'Informe a cidade';
      if (obrig('estado') && !form.estado.trim()) return 'Informe o estado';
      return null;
    }
    if (chave === 'bancario') {
      // Dados bancários são OPCIONAIS — só valida formato leve se preenchido.
      if (form.pix_chave.trim() && !form.pix_tipo) return 'Escolha o tipo da chave Pix';
      if (conferirPix(form.pix_tipo, form.pix_chave)) return conferirPix(form.pix_tipo, form.pix_chave);
      return null;
    }
    if (chave === 'docs') {
      for (const d of DOCS) { if (ctx.campos[d.flag] !== false && !docs[d.tipo]) return `Envie: ${d.rotulo}`; }
      if (termo && !aceiteTermo) return 'Aceite o termo de uso para enviar o cadastro.';
      return null;
    }
    return null;
  }

  function avancar() {
    if (chave === 'dados') setTocado(Object.fromEntries(CAMPOS_DADOS.map(k => [k, true])));
    const err = validarEtapa();
    if (err) { Alerta.alert('Atenção', err); return; }
    // A cidade escolhida na região já adianta o endereço (o CEP corrige depois, se vier outro).
    if (chave === 'regiao' && cidade) setForm(f => (f.cidade.trim() ? f : { ...f, cidade: cidade.nome, estado: cidade.uf || f.estado }));
    if (!ultima) setEtapa(etapa + 1);
    else enviar();
  }

  async function enviar() {
    setEnviando(true);
    try {
      // Documentos: upload direto ao storage (endpoint público por slug); o que não
      // subir vai em base64 como antes. Em ambos os casos o servidor grava só a chave.
      const documentos = {};
      for (const tipo of Object.keys(docs)) {
        if (!docs[tipo]) continue;
        const mime = (/^data:([^;]+);/.exec(docs[tipo]) || [])[1] || 'image/jpeg';
        const key = await uploadDireto({ fonte: docs[tipo], mime, finalidade: 'cadastro', publicoSlug: EMPRESA_SLUG });
        documentos[tipo] = key || docs[tipo];
      }
      const email = normalizarEmail(form.email);
      const payload = {
        ...form,
        cpf: so(form.cpf),
        telefone_principal: telefoneParaEnvio(form.telefone_principal),
        telefone_emergencia: telefoneParaEnvio(form.telefone_emergencia),
        email,
        documentos,
      };
      if (pedirRegiao && cidade) payload.regiao_municipio = cidade.codigo;
      if (termo) payload.termo_versao_aceita = termo.versao;
      const r = await api.enviarCadastro(payload);
      const modalidade = r.modalidade ? `\n\nModalidade escolhida: ${r.modalidade}` : '';
      // Login automático com o e-mail/senha recém-cadastrados, para o motoboy
      // já entrar logado e ver a tela de "em análise" sem precisar relogar.
      let logou = false;
      try { await api.loginEmail(email, form.senha); logou = true; } catch {}
      const seguir = () => router.replace(logou ? '/cadastro-status' : '/');
      if (r.aguardando_regiao) {
        Alerta.alert('Cadastro recebido', `Ainda não estamos em ${cidade?.nome || 'sua cidade'}. Guardamos tudo: quando a ${empresa} começar a operar na sua região, seu cadastro vai para análise e você recebe um aviso aqui no app e por e-mail.`, [
          { text: 'OK', onPress: seguir },
        ], { tom: 'atencao' });
      } else {
        Alerta.alert('Cadastro enviado!', `Seu cadastro foi enviado para análise.${modalidade}\n\nVocê receberá um aviso quando for aprovado.`, [
          { text: 'OK', onPress: seguir },
        ]);
      }
    } catch (e) {
      // Termo trocou de versão enquanto ele preenchia: recarrega o termo e pede o aceite de novo.
      if (e?.status === 422 && /termo/i.test(e.message || '')) {
        setAceiteTermo(false);
        api.contextoCadastro().then(c => setCtx(c)).catch(() => {});
      }
      Alerta.alert('Erro', e.message || 'Falha ao enviar');
    }
    setEnviando(false);
  }

  if (carregando) return (
    <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>
  );

  // ── Câmera aberta (overlay) ──
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

  const foraRegiao = chave === 'regiao' && !!cidade && !cidade.atendida;
  const travadoTermo = chave === 'docs' && !!termo && !aceiteTermo;
  const textoBotao = foraRegiao ? 'Continuar o cadastro' : (ultima ? 'Enviar cadastro' : 'Continuar');

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      {/* Header com progresso */}
      <View style={st.header}>
        <View style={st.headerTop}>
          <TouchableOpacity onPress={() => etapa === 0 ? router.back() : setEtapa(etapa - 1)} style={{ width: 60 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><Icone nome="voltar" tam={18} cor={C.azulC} traco={2.4} /><Text style={st.voltarTxt}>Voltar</Text></View>
          </TouchableOpacity>
          <Text style={st.headerTitle}>Criar conta</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={st.progresso}>
          {etapas.map((k, i) => <View key={k} style={[st.progItem, { backgroundColor: i <= etapa ? C.azulV : C.navy800 }]} />)}
        </View>
        <Text style={st.etapaLabel}>Etapa {etapa + 1} de {etapas.length} · {TITULOS[chave]}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        {chave === 'regiao' ? (
          // A lista de cidades tem rolagem própria (FlatList): fica fora do ScrollView.
          <View style={[st.body, { paddingBottom: 12 }]}>
            <EscolherRegiao
              regioes={ctx.regioes}
              empresa={empresa}
              uf={regiaoUf}
              cidade={cidade}
              onEscolherUf={setRegiaoUf}
              onEscolherCidade={setCidade}
            />
          </View>
        ) : (
        <ScrollView style={st.body} contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          {chave === 'modalidade' && (
            <View>
              <Text style={st.secTit}>Qual modalidade te interessa?</Text>
              <Text style={st.secSub}>Escolha como você quer operar. Você pode confirmar com a central depois.</Text>
              {(!ctx.modalidades || !ctx.modalidades.length) && <Text style={st.aviso}>Nenhuma modalidade disponível no momento — você pode prosseguir.</Text>}
              {(ctx.modalidades || []).map(m => {
                const sel = form.modalidade_interesse_id === m.id;
                return (
                  <TouchableOpacity key={m.id} style={[st.modCard, sel && st.modCardSel]} onPress={() => set('modalidade_interesse_id', m.id)} activeOpacity={0.8}>
                    <View style={[st.modDot, { backgroundColor: m.cor || C.azulV }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={st.modNome}>{m.nome}</Text>
                      {!!m.descricao && <Text style={st.modDesc}>{m.descricao}</Text>}
                    </View>
                    <View style={[st.radio, sel && st.radioSel]}>{sel && <View style={st.radioInner} />}</View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {chave === 'dados' && (
            <View>
              <Campo label="Nome completo" obrig={obrig('nome_completo')} value={form.nome_completo} onChangeText={t => set('nome_completo', t)}
                onBlur={() => tocar('nome_completo')} erro={erroDe('nome_completo')} autoCapitalize="words" />
              <Campo label="CPF" obrig={obrig('cpf')} value={form.cpf} onChangeText={t => set('cpf', mascararCpf(t))}
                onBlur={() => tocar('cpf')} erro={erroDe('cpf')} keyboardType="number-pad" placeholder="000.000.000-00" maxLength={14} />
              <Campo label="Data de nascimento (DD/MM/AAAA)" obrig={obrig('data_nascimento')} value={form.data_nascimento} onChangeText={t => set('data_nascimento', formatarData(t))}
                onBlur={() => tocar('data_nascimento')} erro={erroDe('data_nascimento')} keyboardType="numeric" placeholder="00/00/0000" />
              <Campo label="Telefone (WhatsApp)" obrig={obrig('telefone_principal')} value={form.telefone_principal} onChangeText={t => set('telefone_principal', mascararTelefone(t))}
                onBlur={() => tocar('telefone_principal')} erro={erroDe('telefone_principal')} keyboardType="phone-pad" placeholder="(71) 99876-5432" maxLength={15} />
              {obrig('telefone_emergencia') !== false && (
                <Campo label="Telefone de emergência" obrig={obrig('telefone_emergencia')} value={form.telefone_emergencia} onChangeText={t => set('telefone_emergencia', mascararTelefone(t))}
                  onBlur={() => tocar('telefone_emergencia')} erro={erroDe('telefone_emergencia')} keyboardType="phone-pad" placeholder="(71) 99876-5432" maxLength={15} />
              )}
              <Campo label="E-mail (será seu login)" obrig={obrig('email')} value={form.email} onChangeText={t => set('email', t.replace(/\s+/g, '').toLowerCase())}
                onBlur={() => { tocar('email'); set('email', normalizarEmail(form.email)); }} erro={erroDe('email')} alerta={!!sugestaoEmail}
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" placeholder="seu@email.com">
                {!!sugestaoEmail && !erroDe('email') && (
                  <View style={st.sugestao}>
                    <Text style={st.sugestaoTxt}>Você quis dizer <Text style={{ fontWeight: '800' }}>{sugestaoEmail}</Text>?</Text>
                    <TouchableOpacity style={st.sugestaoBtn} onPress={() => set('email', sugestaoEmail)} activeOpacity={0.85} accessibilityRole="button">
                      <Text style={st.sugestaoBtnTxt}>Corrigir</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Campo>
              <Campo label="Senha" obrig={obrig('senha')} value={form.senha} onChangeText={t => set('senha', t)}
                onBlur={() => tocar('senha')} erro={erroDe('senha')} dica="Mínimo de 6 caracteres." secureTextEntry />
            </View>
          )}

          {chave === 'endereco' && (
            <View>
              <View style={{ position: 'relative' }}>
                <Campo label="CEP" obrig={obrig('cep')} value={form.cep} onChangeText={t => { set('cep', t); if (t.replace(/\D/g, '').length === 8) buscarCep(t); }} keyboardType="numeric" placeholder="00000-000" />
                {buscandoCep && <ActivityIndicator color={C.azulV} style={{ position: 'absolute', right: 14, top: 38 }} />}
              </View>
              <Text style={st.dicaCep}>Digite o CEP que o endereço será preenchido. Se não vier, preencha manualmente.</Text>
              <Campo label="Logradouro" obrig={obrig('logradouro')} value={form.logradouro} onChangeText={t => set('logradouro', t)} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Campo label="Número" obrig={obrig('numero')} value={form.numero} onChangeText={t => set('numero', t)} keyboardType="numeric" /></View>
                <View style={{ flex: 1.4 }}><Campo label="Complemento" value={form.complemento} onChangeText={t => set('complemento', t)} /></View>
              </View>
              <Campo label="Bairro" obrig={obrig('bairro')} value={form.bairro} onChangeText={t => set('bairro', t)} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 2 }}><Campo label="Cidade" obrig={obrig('cidade')} value={form.cidade} onChangeText={t => set('cidade', t)} /></View>
                <View style={{ flex: 1 }}><Campo label="UF" obrig={obrig('estado')} value={form.estado} onChangeText={t => set('estado', t.toUpperCase().slice(0, 2))} autoCapitalize="characters" /></View>
              </View>
            </View>
          )}

          {chave === 'bancario' && (
            <View>
              <Text style={st.secTit}>Onde você recebe</Text>
              <Text style={st.secSub}>É a conta que a central usa para pagar seus repasses. Você pode preencher agora ou depois, no seu perfil.</Text>

              <Text style={st.label}>Tipo de chave Pix</Text>
              <Segmento
                opcoes={[['cpf', 'CPF'], ['cnpj', 'CNPJ'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['aleatoria', 'Aleatória']]}
                valor={form.pix_tipo} onEscolher={v => setForm(f => ({ ...f, pix_tipo: v, pix_chave: mascararPix(v, f.pix_chave) }))} />
              <View style={{ height: 12 }} />
              <Campo label="Chave Pix" value={form.pix_chave} onChangeText={t => set('pix_chave', mascararPix(form.pix_tipo, t))}
                autoCapitalize="none" autoCorrect={false} {...campoPix(form.pix_tipo)} />

              <TouchableOpacity style={st.chkline} activeOpacity={0.8}
                onPress={() => setForm(f => ({ ...f, titular_nome: f.nome_completo || f.titular_nome, titular_doc: so(f.cpf) || f.titular_doc }))}>
                <View style={st.chk}><Icone nome="check" tam={13} cor={'#fff'} traco={3} /></View>
                <Text style={st.chkTxt}>A conta é minha (usar meu nome e CPF do cadastro)</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1.4 }}><Campo label="Titular da conta" value={form.titular_nome} onChangeText={t => set('titular_nome', t)} /></View>
                <View style={{ flex: 1 }}><Campo label="CPF/CNPJ do titular" value={form.titular_doc} onChangeText={t => set('titular_doc', t)} keyboardType="numeric" /></View>
              </View>

              <View style={st.divisor}><View style={st.divLinha} /><Text style={st.divTxt}>Dados bancários — opcional (TED)</Text><View style={st.divLinha} /></View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Campo label="Banco (código)" value={form.banco_codigo} onChangeText={t => set('banco_codigo', t)} keyboardType="numeric" placeholder="260" /></View>
                <View style={{ flex: 2 }}><Campo label="Nome do banco" value={form.banco_nome} onChangeText={t => set('banco_nome', t)} placeholder="Nubank" /></View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Campo label="Agência" value={form.agencia} onChangeText={t => set('agencia', t)} keyboardType="numeric" /></View>
                <View style={{ flex: 1.4 }}><Campo label="Conta c/ dígito" value={form.conta} onChangeText={t => set('conta', t)} keyboardType="numeric" placeholder="00000-0" /></View>
              </View>
              <Text style={st.label}>Tipo de conta</Text>
              <Segmento
                opcoes={[['corrente', 'Corrente'], ['poupanca', 'Poupança']]}
                valor={form.conta_tipo} onEscolher={v => set('conta_tipo', v)} />

              <View style={st.infoBox}>
                <Icone nome="cadeado" tam={15} cor={C.azulP} />
                <Text style={st.infoTxt}>Usamos esses dados só para pagar seus repasses. Você pode alterar depois no seu perfil.</Text>
              </View>
            </View>
          )}

          {chave === 'docs' && (
            <View>
              <Text style={st.secTit}>Envie seus documentos</Text>
              <Text style={st.secSub}>A selfie é só pela câmera. Os demais você pode enviar da galeria.</Text>
              {DOCS.filter(d => ctx.campos[d.flag] !== false).map(d => {
                const enviado = !!docs[d.tipo];
                return (
                  <View key={d.tipo} style={st.docCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {enviado
                        ? <Image source={{ uri: docs[d.tipo] }} style={st.docThumb} />
                        : <View style={[st.docThumb, st.docThumbVazio]}><Icone nome={d.tipo === 'selfie' ? 'selfie' : 'documento'} tam={22} cor={C.azulP} /></View>}
                      <View style={{ flex: 1 }}>
                        <Text style={st.docNome}>{d.rotulo}</Text>
                        <Text style={st.docSub}>{enviado ? 'Enviado' : d.sub}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity style={st.docBtn} onPress={() => tirarFoto(d.tipo)}>
                        <Text style={st.docBtnTxt}>{enviado ? 'Refazer foto' : 'Câmera'}</Text>
                      </TouchableOpacity>
                      {!d.soCamera && (
                        <TouchableOpacity style={[st.docBtn, st.docBtnAlt]} onPress={() => daGaleria(d.tipo)}>
                          <Text style={[st.docBtnTxt, { color: C.azulP }]}>Galeria</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* Termo de uso (mockup AppAceite): o aceite começa DESMARCADO. */}
              {!!termo && (
                <>
                  <View style={st.termoCard}>
                    <View style={st.termoTopo}>
                      <View style={{ flex: 1 }}>
                        <Text style={st.termoTit}>Termo de uso da {empresa}</Text>
                        <Text style={st.termoSub}>Versão {termo.versao}{termo.publicado_em ? ` · publicada em ${dataBR(termo.publicado_em)}` : ''}</Text>
                      </View>
                      <TouchableOpacity onPress={() => router.push({ pathname: '/termo', params: { slug: EMPRESA_SLUG } })} hitSlop={10}
                        style={st.termoLink} accessibilityRole="link" accessibilityLabel="Ler o termo de uso">
                        <Text style={st.termoLinkTxt}>Ler o termo</Text>
                        <Icone nome="seta" tam={14} cor={C.azulP} traco={2.6} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={st.aceite} onPress={() => setAceiteTermo(v => !v)} activeOpacity={0.8}
                      accessibilityRole="checkbox" accessibilityState={{ checked: aceiteTermo }} accessibilityLabel="Li e aceito o termo de uso">
                      <View style={[st.caixa, aceiteTermo && st.caixaOn]}>{aceiteTermo && <Icone nome="check" tam={15} cor="#fff" traco={3} />}</View>
                      <Text style={st.aceiteTxt}>Li e aceito o termo de uso</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={st.termoNota}>Sem o aceite, o cadastro não pode ser enviado. O termo fica no seu Perfil para consultar quando quiser.</Text>
                </>
              )}
            </View>
          )}
        </ScrollView>
        )}

        <View style={[st.footer, { paddingBottom: Math.max(28, 16 + insetBaixo) }]}>
          <TouchableOpacity
            style={[st.btnAvancar, travadoTermo && st.btnDesativado, enviando && { opacity: 0.6 }]}
            onPress={avancar} disabled={enviando || travadoTermo} activeOpacity={0.85}
            accessibilityRole="button" accessibilityState={{ disabled: enviando || travadoTermo }}>
            {enviando ? <ActivityIndicator color="#fff" /> : <Text style={st.btnAvancarTxt}>{textoBotao}</Text>}
          </TouchableOpacity>
          {foraRegiao && (
            <TouchableOpacity style={st.btnOutra} onPress={() => setCidade(null)} activeOpacity={0.7} accessibilityRole="button">
              <Text style={st.btnOutraTxt}>Escolher outra cidade</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Campo({ label, obrig, erro, alerta, dica, children, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={st.label}>{label}{obrig && <Text style={{ color: C.erro }}> *</Text>}</Text>
      <TextInput style={[st.input, alerta && st.inputAlerta, !!erro && st.inputErro]} placeholderTextColor={C.tinta3} {...props} />
      {!!erro && <Text style={st.erroTxt} accessibilityLiveRegion="polite">{erro}</Text>}
      {!erro && !!dica && <Text style={st.dicaTxt}>{dica}</Text>}
      {children}
    </View>
  );
}

function Segmento({ opcoes, valor, onEscolher }) {
  return (
    <View style={st.seg}>
      {opcoes.map(([v, rot]) => {
        const on = valor === v;
        return (
          <TouchableOpacity key={v} activeOpacity={0.8} onPress={() => onEscolher(v)} style={[st.segItem, on && st.segItemOn]}>
            <Text style={[st.segTxt, on && st.segTxtOn]}>{rot}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function formatarData(t) {
  const n = t.replace(/\D/g, '').slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  voltarTxt: { color: C.azulC, fontSize: 14, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  progresso: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  progItem: { flex: 1, height: 4, borderRadius: 2 },
  etapaLabel: { color: C.azulC, fontSize: 12, fontWeight: '700' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 18 },
  secTit: { fontSize: 17, fontWeight: '800', color: C.tinta, marginBottom: 4 },
  secSub: { fontSize: 13, color: C.tinta2, marginBottom: 16, lineHeight: 18 },
  aviso: { fontSize: 12.5, color: C.tinta3, marginBottom: 12 },

  modCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: C.sup, borderWidth: 1.5, borderColor: C.linha, borderRadius: 14, marginBottom: 10 },
  modCardSel: { borderColor: C.azulV, backgroundColor: '#f0f7ff' },
  modDot: { width: 10, height: 10, borderRadius: 5 },
  modNome: { fontSize: 15, fontWeight: '700', color: C.tinta },
  modDesc: { fontSize: 12.5, color: C.tinta2, marginTop: 3, lineHeight: 17 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.tinta3, justifyContent: 'center', alignItems: 'center' },
  radioSel: { borderColor: C.azulV },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.azulV },

  label: { fontSize: 12.5, fontWeight: '700', color: C.tinta2, marginBottom: 6 },
  input: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.tinta },
  inputErro: { borderColor: C.erroCampo, borderWidth: 1.5 },
  inputAlerta: { borderColor: C.aten, borderWidth: 1.5 },
  erroTxt: { fontSize: 12, color: C.erroTx, fontWeight: '600', marginTop: 5, lineHeight: 16 },
  dicaTxt: { fontSize: 11.5, color: C.tinta2, marginTop: 5 },
  dicaCep: { fontSize: 11.5, color: C.tinta3, marginTop: -8, marginBottom: 14, lineHeight: 16 },

  sugestao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: C.atenBg, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginTop: 6 },
  sugestaoTxt: { flex: 1, fontSize: 12.5, color: C.tinta, lineHeight: 17 },
  sugestaoBtn: { backgroundColor: C.azulP, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  sugestaoBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  segItem: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 9, borderWidth: 1, borderColor: C.linha, backgroundColor: C.sup },
  segItemOn: { borderColor: C.azulV, backgroundColor: '#eaf3fc' },
  segTxt: { fontSize: 12.5, fontWeight: '700', color: C.tinta2 },
  segTxtOn: { color: C.azulP },
  chkline: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.sup2, borderWidth: 1, borderColor: C.linha, borderRadius: 11, padding: 11, marginTop: 14, marginBottom: 14 },
  chk: { width: 20, height: 20, borderRadius: 6, backgroundColor: C.azulP, alignItems: 'center', justifyContent: 'center' },
  chkTxt: { flex: 1, fontSize: 12, color: C.tinta, fontWeight: '600' },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10 },
  divLinha: { flex: 1, height: 1, backgroundColor: C.linha },
  divTxt: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: C.tinta3 },
  infoBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#eef6ff', borderWidth: 1, borderColor: '#cfe3fb', borderRadius: 11, padding: 11, marginTop: 14 },
  infoTxt: { flex: 1, fontSize: 11.5, color: '#1f4b78', lineHeight: 17 },

  docCard: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, padding: 14, marginBottom: 12 },
  docThumb: { width: 54, height: 54, borderRadius: 10, backgroundColor: C.sup2 },
  docThumbVazio: { justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.linha, borderStyle: 'dashed' },
  docNome: { fontSize: 14, fontWeight: '700', color: C.tinta },
  docSub: { fontSize: 12, color: C.tinta2, marginTop: 2 },
  docBtn: { flex: 1, backgroundColor: C.navy900, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  docBtnAlt: { backgroundColor: '#eaf3fc' },
  docBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  termoCard: { marginTop: 6, borderWidth: 1.5, borderColor: C.azulP, borderRadius: 16, padding: 14, gap: 12, backgroundColor: '#f4f8fd' },
  termoTopo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  termoTit: { fontSize: 15, fontWeight: '800', color: C.tinta },
  termoSub: { fontSize: 12, color: C.tinta2, marginTop: 2 },
  termoLink: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4 },
  termoLinkTxt: { fontSize: 13, fontWeight: '800', color: C.azulP },
  aceite: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  caixa: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.tinta3, backgroundColor: C.sup, alignItems: 'center', justifyContent: 'center' },
  caixaOn: { borderColor: C.azulP, backgroundColor: C.azulP },
  aceiteTxt: { flex: 1, fontSize: 14, fontWeight: '600', color: C.tinta },
  termoNota: { fontSize: 11.5, color: C.tinta2, marginTop: 8, lineHeight: 16 },

  footer: { padding: 16, paddingBottom: 28, backgroundColor: C.sup, borderTopWidth: 1, borderTopColor: C.linha },
  btnAvancar: { backgroundColor: C.azulP, paddingVertical: 16, borderRadius: 13, alignItems: 'center' },
  btnDesativado: { backgroundColor: C.desativado },
  btnAvancarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnOutra: { marginTop: 6, paddingVertical: 11, alignItems: 'center' },
  btnOutraTxt: { color: C.azulP, fontSize: 13.5, fontWeight: '700' },

  camBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 40, paddingTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30, backgroundColor: 'rgba(0,0,0,0.4)' },
  camCancel: { color: '#fff', fontSize: 15, fontWeight: '700', width: 70 },
  camBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  camBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
});
