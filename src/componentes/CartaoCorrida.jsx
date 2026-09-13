// Cartão de corrida da lista "Corridas disponíveis" (mockup v1, tela 2).
// Hierarquia fixa: valor → cliente → serviço/prazo → 3 números → coleta/destino → ações.
// Só mostra o que a API devolveu (valor 0 = sem linha de valor; sem km = sem bloco).
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { T, reais, hora, km, curto } from '../tema';

export default function CartaoCorrida({ oferta: o, destaque = false, onVer, onMapa }) {
  const totalDest = Number(o.qtd_pontos) || 1;
  const ateColeta = km(o.distancia_km), rota = Number(o.rota_km) > 0 ? km(o.rota_km) : null;
  return (
    <View style={[st.cartao, destaque && st.destaque]}>
      <View style={st.topo}>
        <View style={{ flex: 1 }}>
          {Number(o.valor_motoboy_cent) > 0 && <Text style={st.valor}>{reais(o.valor_motoboy_cent)}</Text>}
          {!!o.cliente_nome && <Text style={st.cliente} numberOfLines={1}>{o.cliente_nome}</Text>}
          <Text style={st.os}>Serviço {o.protocolo}{o.prazo_em ? ` · até ${hora(o.prazo_em)}` : ''}</Text>
        </View>
        {destaque && <View style={st.tag}><Text style={st.tagTxt}>mais perto</Text></View>}
      </View>

      <View style={st.kms}>
        {!!ateColeta && <View style={st.km}><Text style={st.kmB}>{ateColeta}</Text><Text style={st.kmL}>até a coleta</Text></View>}
        {!!rota && <View style={st.km}><Text style={st.kmB}>{rota}</Text><Text style={st.kmL}>de rota</Text></View>}
        <View style={st.km}><Text style={st.kmB}>{totalDest}</Text><Text style={st.kmL}>{totalDest === 1 ? 'entrega' : 'entregas'}</Text></View>
      </View>

      <View style={st.rota}>
        <View style={st.p}><View style={[st.bola, { backgroundColor: T.vivo }]} /><Text style={st.pTxt} numberOfLines={1}>{o.coleta_nome ? o.coleta_nome + ' — ' : ''}{curto(o.coleta_endereco)}</Text></View>
        <View style={st.traco} />
        <View style={st.p}><View style={[st.bola, { backgroundColor: T.ganho }]} /><Text style={st.pTxt} numberOfLines={1}>{curto(o.primeiro_destino)}{totalDest > 1 ? ` · +${totalDest - 1} ${totalDest - 1 === 1 ? 'parada' : 'paradas'}` : ''}</Text></View>
      </View>

      <View style={st.acoes}>
        <TouchableOpacity style={st.btnMapa} onPress={onMapa} activeOpacity={0.8}><Text style={st.btnMapaTxt}>◎</Text></TouchableOpacity>
        <TouchableOpacity style={st.btnVer} onPress={onVer} activeOpacity={0.85}><Text style={st.btnVerTxt}>Ver e aceitar</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  cartao: { backgroundColor: T.sup, borderWidth: 1, borderColor: T.linha, borderRadius: T.r, padding: 16, marginBottom: 12 },
  destaque: { borderColor: T.vivo, borderWidth: 2, shadowColor: T.primario, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  valor: { fontSize: 30, fontWeight: '800', color: T.ganhoEsc, letterSpacing: -0.5, lineHeight: 34 },
  cliente: { fontSize: 15, fontWeight: '800', color: T.tinta, marginTop: 4 },
  os: { fontSize: 12, color: T.tinta3, fontWeight: '600', marginTop: 2 },
  tag: { backgroundColor: T.ganhoBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  tagTxt: { color: T.ganhoEsc, fontSize: 12.5, fontWeight: '700' },
  kms: { flexDirection: 'row', gap: 8, marginTop: 12 },
  km: { flex: 1, backgroundColor: T.suave, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 },
  kmB: { fontSize: 17, fontWeight: '800', color: T.tinta },
  kmL: { fontSize: 11.5, color: T.tinta2, fontWeight: '600' },
  rota: { marginTop: 12 },
  p: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bola: { width: 10, height: 10, borderRadius: 5 },
  traco: { width: 2, height: 10, backgroundColor: T.claro, marginLeft: 4, marginVertical: 2 },
  pTxt: { flex: 1, fontSize: 13.5, color: T.tinta },
  acoes: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btnMapa: { width: 52, height: 50, borderRadius: 14, backgroundColor: T.suave, alignItems: 'center', justifyContent: 'center' },
  btnMapaTxt: { color: T.primario, fontSize: 22, fontWeight: '800' },
  btnVer: { flex: 1, height: 50, borderRadius: 14, backgroundColor: T.ganho, alignItems: 'center', justifyContent: 'center' },
  btnVerTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
