// Mapa "limpo" (pedido de 24/10/2026): sem os ícones de comércio, restaurantes, ônibus e
// pontos do Google — fica só a rua com o nome, os nossos pinos e os raios de demanda.
//
// Android (Google Maps): customMapStyle esconde POI e transporte. iOS (mapa da Apple):
// showsPointsOfInterest={false}. Estilo é JSON no próprio app: não gasta crédito da API
// (o Maps SDK para celular é ilimitado e grátis).
export const ESTILO_MAPA_LIMPO = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }] },   // a área verde do parque ajuda a se localizar; o ícone, não
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },   // escudos/ícones de rodovia
];

export const PROPS_MAPA_LIMPO = {
  customMapStyle: ESTILO_MAPA_LIMPO,
  showsPointsOfInterest: false,
  showsIndoors: false,
  toolbarEnabled: false,
};
