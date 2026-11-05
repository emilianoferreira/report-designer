import { ReportTemplate } from '../../../core/models/template.model';
import { CFE_TYPES, ValidationContext } from '../../../core/models/fiscal.model';

export type RuleStatus = 'pass' | 'fail' | 'not-applicable' | 'pending';
export interface RuleResult {
  id: string;
  title: string;
  status: RuleStatus;
  category: 'normative' | 'technical';
  message: string;
  action: string;
  source: string;
  reference: string;
  elements: Array<{ id: string; section: 'header' | 'detail' | 'footer' }>;
}
export interface StaticFiscalReport {
  catalogueVersion: 'stage-0.2';
  scope: 'static-browser';
  status: 'violations' | 'incomplete' | 'no-detected-failures';
  results: RuleResult[];
}
const source = 'https://www.efactura.dgi.gub.uy/files/formato_cfe_v25-2-pdf?es';
/** The agreed catalogue remains visible even where static evidence cannot decide.
 * No role, binding or font size is accepted as proof of printed contents.
 */
const deferred: Array<[string, string, string, string]> = [
  ['LEG-01', 'Borde sin letras de 5 mm', 'p. 80', 'Requiere medir las letras impresas; la caja del elemento no prueba sus límites.'],
  ['LEG-02', 'Altura de caracteres', 'pp. 80–85', 'Revisión manual de altura real; los puntos CSS no prueban milímetros de caracteres.'],
  ['LEG-03', 'Interlineado simple', 'p. 80', 'Revisión manual del interlineado efectivo.'],
  ['LEG-04', 'Color negro y legibilidad', 'pp. 79–80', 'Requiere contenido y estilos efectivos; se admiten las excepciones de logo y fondo.'],
  ['DIS-01', 'Distribución y secuencia de bloques', 'pp. 80–84', 'Requiere identificar bloques efectivos; la alternativa secuencial también es admisible.'],
  ['DIS-02', 'Dimensión del logo', 'p. 80', 'Revisión manual del límite de un quinto, sin imponer una interpretación geométrica.'],
  ['ID-01', 'Identificación del emisor', 'p. 81', 'Requiere datos y contenido efectivamente impreso.'],
  ['ID-02', 'Tipo, RUT, serie, número y pago', 'p. 81', 'Requiere denominación y datos impresos; el código CFE aislado no prueba su denominación.'],
  ['ID-03', 'Datos preimpresos', 'p. 81', 'Requiere evidencia del soporte preimpreso declarado.'],
  ['REC-01', 'Identificación del receptor de e-Factura', 'p. 82', 'Requiere condición del receptor y datos efectivos.'],
  ['REC-02', 'Recuadro CONSUMO FINAL', 'p. 82', 'Requiere contenido, recuadro y condición del documento.'],
  ['REC-03', 'Identificación por umbral en UI', 'pp. 82 y 90', 'El umbral es mayor a 5.000 UI netas; requiere UI del cierre del año anterior y excepciones del receptor.'],
  ['REC-04', 'Identificación por retenciones/percepciones', 'pp. 82 y 90', 'Requiere conocer retenciones/percepciones e identificación, cualquiera sea el importe.'],
  ['REG-01', 'Exoneración y norma legal', 'p. 81', 'Requiere régimen y norma de exoneración efectivos.'],
  ['REG-02', 'Leyenda IVA mínimo', 'p. 81', 'Requiere régimen y leyenda efectiva.'],
  ['REG-03', 'Leyenda monotributo', 'p. 81', 'Requiere régimen y leyenda efectiva.'],
  ['REG-04', 'Leyenda monotributo social MIDES', 'p. 81', 'Requiere régimen y leyenda efectiva.'],
  ['REG-05', 'Recuadro y ubicación del régimen', 'p. 81', 'Requiere recuadro impreso de 40 × 10 mm, ubicación y caracteres de 3 mm.'],
  ['REG-06', 'Menciones de IVA mínimo y excepciones', 'p. 83', 'Requiere conocer las excepciones de la operación y su contenido.'],
  ['REG-07', 'Menciones de IVA en monotributo', 'p. 83', 'Requiere régimen y contenido efectivo.'],
  ['CON-01', 'Fecha de emisión', 'p. 83', 'Requiere fecha del documento y contenido efectivo.'],
  ['CON-02', 'Detalle de bienes y servicios', 'p. 83', 'Los servicios pueden omitir cantidad y precio unitario; requiere detalle efectivo.'],
  ['CON-03', 'Totales e IVA por tasa', 'p. 83', 'Requiere importes, tasas y excepciones por tipo y régimen.'],
  ['CON-04', 'Moneda y total a pagar', 'pp. 83–84', 'Si total y total a pagar coinciden puede imprimirse un solo importe; requiere datos efectivos.'],
  ['REF-01', 'Necesidad de referencias', 'pp. 65 y 83', 'Requiere tipo y operación: notas, cobranza propia y otros supuestos condicionados.'],
  ['REF-02', 'Referencia global y razón', 'p. 65', 'Requiere razón cuando no pueden identificarse documentos; no sustituye el límite de referencias.'],
  ['QR-01', 'QR de consulta', 'p. 84', 'Un rol o un elemento QR no prueba la presencia de un símbolo válido impreso.'],
  ['QR-02', 'Dimensiones y margen del QR', 'p. 84', 'Requiere medir símbolo y margen por separado; no interpolar entre los extremos normativos.'],
  ['QR-03', 'Contenido del QR', 'p. 84', 'Requiere tipo, importe aplicable, fecha de firma y hash completo; no derivarlos del código de seguridad.'],
  ['QR-04', 'Código de seguridad', 'p. 84', 'Requiere los seis primeros caracteres del hash y su impresión debajo del QR.'],
  ['PIE-01', 'Ingreso y sitio de verificación', 'p. 84', 'Requiere ingreso o resolución aplicable y sitio según el tipo CFE.'],
  ['PIE-02', 'CAE, rango y vencimiento', 'p. 84', 'Requiere datos efectivos, recuadro y ubicación del vencimiento.'],
  ['PIE-03', 'Leyenda de IVA', 'p. 84', 'Requiere conocer su aplicabilidad e impresión.'],
  ['ADE-01', 'Separación de ADENDA', 'p. 85', 'Requiere contenido, rótulo y separación impresa; se admiten las alternativas del catálogo.'],
  ['ADE-02', 'Constancias obligatorias', 'p. 85', 'Requiere conocer las constancias y ubicaciones especiales de la operación.'],
  ['EXC-01', 'Secreto profesional', 'p. 82', 'Requiere declaración y tratamiento de la identificación en adenda.'],
  ['EXT-01', 'Papel, gramaje y resolución', 'p. 79', 'Verificación externa del papel e impresora.'],
  ['EXT-02', 'Papel térmico y disponibilidad web', 'p. 79', 'Verificación externa según tipo CFE y plazo aplicable.'],
  ['EXT-03', 'Multipágina', 'p. 80', 'Requiere comprobar los saltos, la numeración y los datos repetidos en la salida.']
];
const adjustments = [
  'Descuento del ítem: B.13; porcentaje solo no sustituye importe',
  'Recargo del ítem: B.17; porcentaje solo no sustituye importe',
  'Ajustes globales: D.5 y D.6; distinguir descuento y recargo',
  'Agrupación por indicador o total; sustitución de importes de ítem requiere revisión manual',
  'Signo de importes con indicador 7; NC no implica todos los importes negativos',
  'Signo de ajustes con D.7; evitar una interpretación de doble signo',
  'Monto no facturable A.129; se admite etiqueta conceptual y cero no es ausencia',
  'Nombre e importe de retención/percepción A.127 y A.128; no inventar glosas',
  'Totales A.125 y A.125.1 separados cuando correspondan',
  'Constancia sectorial B.22.1 cuando sea obligatoria',
  'B.20–B.23 no son universalmente obligatorios en la impresión'
];
const references = [
  'Tipo en palabras, serie y número asociados; referencia global excluida',
  'Razón F.6 obligatoria global; si se informa en referencia identificada debe imprimirse',
  'Documentos sin codificación: conservar identificación; suficiencia del texto requiere revisión manual',
  'Fecha F.7 opcional en MVP; si se informa debe imprimirse; global excluida',
  'Importe F.8 si aplica y se informa; cero válido y parcial no equivale al total original',
  'Moneda F.9 del documento original si aplica y se informa; no inferir por símbolo ambiguo',
  'F.1, F.2 y F.10 no son universalmente obligatorios en la impresión',
  'Conservar y asociar todas las referencias informadas sin mezclar ni recortar'
];
for (const [prefix, titles, ref] of [['CON-05', adjustments, 'pp. 44–61 y 83'], ['REF-03', references, 'p. 65']] as const) {
  titles.forEach((title, i) => deferred.push([`${prefix}.${String(i + 1).padStart(2, '0')}`, title, ref,
    'Requiere datos completos y evidencia impresa. Ausencia en el origen se diagnostica por separado; no demuestra una omisión del molde.']));
}

export function evaluateStaticFiscalRules(template: ReportTemplate, context: ValidationContext): StaticFiscalReport {
  const results: RuleResult[] = [];
  const add = (id: string, title: string, status: RuleStatus, message: string, reference: string,
    action = 'Completar el contexto o revisar la evidencia indicada.', category: RuleResult['category'] = 'normative',
    elements: RuleResult['elements'] = []) => results.push({ id, title, status, message, reference, action, category, elements,
      source: category === 'normative' ? source : '' });
  const p = template.compliance;
  const compatible = p?.schemaVersion === '1.0' && p.jurisdiction === 'UY' && p.output === 'browser';
  const supported = compatible && CFE_TYPES.some(t => t.value === p.cfeType);
  const contextProblem = context.diagnostics.length > 0;
  add('COB-01', 'Cobertura del análisis', 'pending', supported ?
    'Análisis estático del diseño. La evidencia impresa y las verificaciones manuales todavía no están disponibles.' :
    'Definí un perfil compatible y un tipo CFE del MVP para evaluar las dimensiones normativas.', 'Catálogo 0.2',
    'Completar el perfil y las verificaciones pendientes.', 'technical');
  const w = template.page.width, h = template.page.height;
  const validSize = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  for (const medium of ['sheet', 'roll'] as const) {
    const id = medium === 'sheet' ? 'PAP-01' : 'PAP-02';
    const title = medium === 'sheet' ? 'Dimensiones de hoja' : 'Ancho de rollo';
    if (!supported || !p?.medium || !['sheet', 'roll'].includes(p.medium) || contextProblem || !validSize) {
      add(id, title, 'pending', 'Falta contexto inequívoco o dimensiones válidas para determinar la aplicación.', 'p. 79');
    } else if (p.medium !== medium) add(id, title, 'not-applicable', 'El soporte declarado es otro.', 'p. 79');
    else {
      const short = Math.min(w, h), long = Math.max(w, h);
      const fits = medium === 'roll' ? w >= 57 : short >= 57 && long >= 150 && short <= 216 && long <= 356;
      add(id, title, fits ? 'pass' : 'fail', `${w} × ${h} mm declarados. ` + (medium === 'roll' ?
        'Ancho mínimo de rollo: 57 mm; no se impone un largo máximo.' :
        'Hoja entre 150 × 57 y 356 × 216 mm, admitiendo ambas orientaciones.'), 'p. 79',
        'Revisar el tamaño del papel en Diseño. La medida física se verificará al imprimir.');
    }
  }
  for (const [id, title, reference, message] of deferred) add(id, title, 'pending', message, reference);
  add('TEC-01', 'Consistencia del contexto', contextProblem ? 'pending' : 'pass', contextProblem ?
    context.diagnostics.map(d => d.message).join(' ') : 'No se detectaron contradicciones en los datos aportados; los datos ausentes siguen desconocidos.',
    'Contrato de datos de etapa 1', 'Revisar las fuentes y el perfil; no completar datos fiscales por inferencia.', 'technical');
  add('TEC-02', 'Expresiones y recursos', 'pending', 'No se ejecutan fórmulas ni se cargan imágenes para este análisis.',
    'Alcance de etapa 2', 'Verificar su resolución en una etapa posterior.', 'technical');
  add('TEC-03', 'Vigencia del resultado', 'pass', 'Resultado calculado sobre el estado actual del molde; se recalcula al editar.',
    'Alcance de etapa 2', 'Revisar nuevamente después de cada modificación.', 'technical');
  add('TEC-04', 'Correspondencia con la salida', 'pending', 'La salida renderizada todavía no se inspecciona.',
    'Alcance de etapa 2', 'Pendiente de la etapa de validación renderizada.', 'technical');
  const ids = new Set<string>();
  for (const section of ['header', 'detail', 'footer'] as const) for (const el of template.sections[section].elements) {
    if (!el.id || ids.has(el.id)) add('TEC-ID', 'Identificador de elemento ambiguo', 'fail',
      'Un elemento no tiene identificador único; no puede localizarse de forma inequívoca.', 'Contrato del diseñador',
      'Revisar el identificador del elemento en el molde.', 'technical', [{ id: el.id, section }]);
    ids.add(el.id);
  }
  return { catalogueVersion: 'stage-0.2', scope: 'static-browser',
    status: results.some(r => r.status === 'fail') ? 'violations' : results.some(r => r.status === 'pending') ? 'incomplete' : 'no-detected-failures', results };
}
