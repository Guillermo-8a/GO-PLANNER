// Módulos que no guardan su data en el estado global (dataKey: null) sino en
// su propio localStorage — para la barra "Datos:" del header.
export const LOCAL_DATA_KEYS = {
  traslados: ['gop_traslados_exc', 'gop_traslados_nec', 'gop_traslados_niv'],
  eventos:   ['gop_eventos'],
  chequera:  ['chequera_externa', 'chequera_propia'],
  dayli:     ['gop_daily_v3'],
  planning:  ['gop_forecast_setup'],
  suplementarios: ['gop_suplementarios'],
  allocation: ['gop_allocation_files'],
  pedidos: ['gop_pedidos_has'],
  nulo: ['gop_nulo_files'],
  validador: ['gop_validador_files'],
  demanda: ['gop_demanda_files'],
  comparador: ['gop_comparador'],
};
