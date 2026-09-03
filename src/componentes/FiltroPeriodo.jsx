import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';

const C = { navy: '#042C53', azulP: '#185FA5', azulV: '#378ADD', tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc', fundo: '#eef4fb', sup: '#fff', sup2: '#f6faff', linha: '#dde9f5', ok: '#1f9d6b' };
const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const br = (isoStr) => { if (!isoStr) return '—'; const [a, m, d] = isoStr.split('-'); return `${d}/${m}`; };

// Calendário simples (sem dependência nativa). Escolhe início e fim (toque 2x).
function Calendario({ de, ate, aoMudar }) {
  const hoje = new Date();
  const [ref, setRef] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const ano = ref.getFullYear(), mes = ref.getMonth();
  const primeiroDow = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < primeiroDow; i++) cells.push(null);
  for (let d = 1; d <= diasNoMes; d++) cells.push(iso(new Date(ano, mes, d)));

  function tocar(dia) {
    if (!de || (de && ate)) { aoMudar(dia, null); return; }   // começa novo range
    if (dia < de) { aoMudar(dia, de); return; }                 // inverteu → ajusta
    aoMudar(de, dia);
  }
  const dentro = (dia) => de && ate && dia >= de && dia <= ate;
  const ponta = (dia) => dia === de || dia === ate;

  return (
    <View>
      <View style={s.calTopo}>
        <TouchableOpacity onPress={() => setRef(new Date(ano, mes - 1, 1))} style={s.calNav}><Text style={s.calNavTxt}>‹</Text></TouchableOpacity>
        <Text style={s.calMes}>{MES[mes]} {ano}</Text>
        <TouchableOpacity onPress={() => setRef(new Date(ano, mes + 1, 1))} style={s.calNav}><Text style={s.calNavTxt}>›</Text></TouchableOpacity>
      </View>
      <View style={s.calSemana}>{DOW.map((d, i) => <Text key={i} style={s.calDow}>{d}</Text>)}</View>
      <View style={s.calGrid}>
        {cells.map((dia, i) => (
          <View key={i} style={s.calCelWrap}>
            {dia ? (
              <TouchableOpacity onPress={() => tocar(dia)} style={[s.calCel, dentro(dia) && s.calCelRange, ponta(dia) && s.calCelPonta]}>
                <Text style={[s.calDia, (dentro(dia) || ponta(dia)) && s.calDiaSel, ponta(dia) && { fontWeight: '800' }]}>{Number(dia.slice(-2))}</Text>
              </TouchableOpacity>
            ) : <View style={s.calCel} />}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function FiltroPeriodo({ valor, aoSelecionar }) {
  // valor: { tipo:'hoje'|'semana'|'mes'|'custom', de, ate }
  const [modal, setModal] = useState(false);
  const [de, setDe] = useState(valor?.de || null);
  const [ate, setAte] = useState(valor?.ate || null);
  const tipo = valor?.tipo || 'mes';
  const chip = (id, rot) => (
    <TouchableOpacity style={[s.chip, tipo === id && s.chipOn]} onPress={() => aoSelecionar({ tipo: id })}>
      <Text style={[s.chipTxt, tipo === id && s.chipTxtOn]}>{rot}</Text>
    </TouchableOpacity>
  );
  return (
    <View>
      <View style={s.chips}>
        {chip('hoje', 'Hoje')}{chip('semana', 'Semana')}{chip('mes', 'Mês')}
        <TouchableOpacity style={[s.chip, tipo === 'custom' && s.chipOn]} onPress={() => { setDe(valor?.de || null); setAte(valor?.ate || null); setModal(true); }}>
          <Text style={[s.chipTxt, tipo === 'custom' && s.chipTxtOn]}>📅 Período</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={s.ov}>
          <View style={s.sheet}>
            <Text style={s.sheetTit}>Escolha o período</Text>
            <View style={s.rangeInfo}>
              <View style={s.rangeCol}><Text style={s.rangeLbl}>De</Text><Text style={s.rangeVal}>{br(de)}</Text></View>
              <Text style={s.rangeSeta}>→</Text>
              <View style={s.rangeCol}><Text style={s.rangeLbl}>Até</Text><Text style={s.rangeVal}>{br(ate)}</Text></View>
            </View>
            <Calendario de={de} ate={ate} aoMudar={(d, a) => { setDe(d); setAte(a); }} />
            <View style={s.acoes}>
              <TouchableOpacity style={s.btnCancelar} onPress={() => setModal(false)}><Text style={s.btnCancelarTxt}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btnAplicar, !(de && ate) && { opacity: 0.5 }]} disabled={!(de && ate)}
                onPress={() => { setModal(false); aoSelecionar({ tipo: 'custom', de, ate }); }}>
                <Text style={s.btnAplicarTxt}>Aplicar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  chip: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 99, backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha },
  chipOn: { backgroundColor: C.azulP, borderColor: C.azulP },
  chipTxt: { fontSize: 12.5, fontWeight: '700', color: C.tinta2 },
  chipTxtOn: { color: '#fff' },
  ov: { flex: 1, backgroundColor: 'rgba(4,16,32,0.55)', justifyContent: 'center', padding: 22 },
  sheet: { backgroundColor: '#fff', borderRadius: 18, padding: 16 },
  sheetTit: { fontSize: 15, fontWeight: '800', color: C.tinta, marginBottom: 12 },
  rangeInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 12 },
  rangeCol: { alignItems: 'center' },
  rangeLbl: { fontSize: 10, fontWeight: '700', color: C.tinta3, textTransform: 'uppercase' },
  rangeVal: { fontSize: 18, fontWeight: '800', color: C.azulP },
  rangeSeta: { fontSize: 16, color: C.tinta3, fontWeight: '800' },
  calTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calNav: { width: 40, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: C.sup2 },
  calNavTxt: { fontSize: 20, color: C.azulP, fontWeight: '800' },
  calMes: { fontSize: 14, fontWeight: '800', color: C.tinta },
  calSemana: { flexDirection: 'row' },
  calDow: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '800', color: C.tinta3, paddingVertical: 4 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCelWrap: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  calCel: { flex: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  calCelRange: { backgroundColor: '#e6f0fb' },
  calCelPonta: { backgroundColor: C.azulP },
  calDia: { fontSize: 13, color: C.tinta, fontWeight: '600' },
  calDiaSel: { color: C.azulP },
  acoes: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btnCancelar: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.linha },
  btnCancelarTxt: { color: C.tinta2, fontWeight: '800', fontSize: 13.5 },
  btnAplicar: { flex: 1.4, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: C.azulP },
  btnAplicarTxt: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
});
