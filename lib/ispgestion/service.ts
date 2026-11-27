import axios from 'axios';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth';
import { runWithIspSourceWriteTx } from '../isp-origen-server';

const API_URL = process.env.ISPGESTION_API_URL || 'https://internetoperadores.ispgestion.com/api';
const API_USER = process.env.ISPGESTION_API_USER || 'VOLA';
const API_HASH = process.env.ISPGESTION_API_HASH || '04b7c2df9d9656133e54f5f4ca3ce2ec';
const RAILWAY_PROXY_URL = 'https://ispgestion-middleware-production.up.railway.app/api/ispgestion-proxy';

const ispgestionDirect = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(`${API_USER}:${API_HASH}`).toString('base64')}`,
  },
  timeout: 30000,
});

const ISP_READ_PARAMS: Record<string, readonly string[]> = { clientes: ['email', 'mostrar'], contratos_todos: ['mostrar', 'pagina'], tarifas: ['mostrar_todas', 'todas', 'campos_adicionales'], facturacion: ['mostrar'], remesas: ['mostrar'] };
const ISP_READ_ENDPOINTS = new Set(Object.keys(ISP_READ_PARAMS));
export function assertIspReadRequest(endpoint: unknown, method: unknown = 'GET', data: unknown = null, params: unknown = null): asserts endpoint is string {
  if (typeof endpoint !== 'string' || !ISP_READ_ENDPOINTS.has(endpoint) || method !== 'GET' || data !== null
    || (params !== null && (typeof params !== 'object' || Array.isArray(params)
      || Object.entries(params).some(([key, value]) => !ISP_READ_PARAMS[endpoint].includes(key) || !/^[a-z_]{1,48}$/.test(key)
        || ['user', 'password', 'hash', 'authorization', 'method', 'endpoint', 'data', 'pass'].includes(key)
        || !['string', 'number', 'boolean'].includes(typeof value))))) {
    throw Object.assign(new Error('La conexión ISP sólo admite lecturas revisadas.'), { code: 'ISP_REMOTE_READ_ONLY', status: 409 });
  }
}
// Transporte privado; sólo el login fijo puede usar POST. Nunca se exporta.
async function transport(endpoint: string, method: 'GET' | 'POST', data: unknown, params: unknown = null) {
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.IS_RAILWAY;
  if (isRailway) {
    return (await ispgestionDirect({ url: endpoint, method, data, params })).data;
  }
  return (await axios.post(RAILWAY_PROXY_URL, { endpoint, method, data, params }, { timeout: 30000 })).data;
}
async function request(endpoint: string, method = 'GET', data: any = null, params: any = null) {
  assertIspReadRequest(endpoint, method, data, params);
  return transport(endpoint, 'GET', null, params);
}

/** Revalidación viva dentro de cada tx; el permiso HTTP genérico no concede carga. */
export async function requireIspSyncActor(tx: any) {
  if (process.env.FINANCE_DEPLOYMENT_READ_ONLY === '1' || process.env.IO_PRODUCTION_READ_ONLY === '1') {
    throw Object.assign(new Error('Carga ISP cerrada en modo sólo lectura.'), { code: 'ISP_SYNC_READ_ONLY', status: 403 });
  }
  const session = await getServerSession(authOptions);
  const id = Number(session?.user?.id);
  if (!session || session.user.userType !== 'admin' || session.impersonation || !Number.isSafeInteger(id) || id < 1) {
    throw Object.assign(new Error('Carga ISP no autorizada.'), { code: 'ISP_SYNC_UNAUTHORIZED', status: 403 });
  }
  const actor = await tx.usuarioAdmin.findUnique({ where: { id }, select: { activo: true, rol: true } });
  if (!actor?.activo || actor.rol !== 'SUPER_ADMIN') {
    throw Object.assign(new Error('Carga ISP no autorizada.'), { code: 'ISP_SYNC_UNAUTHORIZED', status: 403 });
  }
}

export async function verifyClienteCredentials(email: string, pass: string): Promise<string | null> {
  try {
    const data = await transport('clientes/login', 'POST', { email, pass });
    return data && data.success ? (data.cliente_id || data.id)?.toString() : null;
  } catch (error) {
    console.error('Error verificando credenciales en ISPGestión:', error);
    return null;
  }
}

export async function getClienteByEmail(email: string) {
  try {
    const data = await request('clientes', 'GET', null, { email });
    if (Array.isArray(data)) return data[0];
    if (data.clientes && Array.isArray(data.clientes)) return data.clientes[0];
    return null;
  } catch (error) {
    console.error('Error obteniendo cliente por email en ISPGestión:', error);
    return null;
  }
}

/** Sólo origen: sin bajas por ausencia, vínculos/personas ni clasificación CRM. */
export async function syncClients() {
  // La autorización ocurre antes de cualquier red y se revalida en la tx aplicada.
  await prisma.$transaction(async (tx) => requireIspSyncActor(tx));
  const externalClients = await getAllClientes();
  const defaultPasswordHash = await bcrypt.hash('cliente123', 10);
  return applyIspClientsSnapshot(prisma, externalClients, defaultPasswordHash);
}

export async function applyIspClientsSnapshot(db: typeof prisma, externalClients: any[], defaultPasswordHash: string) {
  const keys = externalClients.map((c) => String(c.id ?? ''));
  if (keys.some((key) => !/^[1-9]\d*$/.test(key)) || new Set(keys).size !== keys.length) {
    throw Object.assign(new Error('Snapshot ISP con identidad inválida.'), { code: 'ISP_SNAPSHOT_INVALID', status: 409 });
  }
  return db.$transaction(async (tx) => {
    await requireIspSyncActor(tx);
    await runWithIspSourceWriteTx('isp-clients', tx, async (writerTx) => {
      for (const client of externalClients) {
        const ispGestionId = String(client.id);
        const personaFisica = client.personafisica === 1 || client.personafisica === '1' || client.personafisica === true;
        const source = {
          email: (client.email || '').split(',')[0].trim() || `sin-email-${ispGestionId}@placeholder.local`,
          nombre: client.nombrecompleto || `${client.nombre || ''} ${client.apellidos || ''}`.trim() || 'Sin nombre',
          clienteIdIsp: client.clienteid != null && client.clienteid !== '' ? String(client.clienteid) : null, codigo: client.codigo || null, nif: client.nif || null, cif: client.cif || null,
          personaFisica, nombreComercial: client.nombre_comercial || null, apellidos: client.apellidos || null, nombrePila: client.nombre || null,
          telefono: client.telefono1 || null, movil: client.movil || null, fax: client.fax || null,
          web: client.web && client.web !== 'http://' ? client.web : null, movilSms: client.movil_sms || null,
          tipoCalle: client.tipo_calle || null, domicilio: client.domicilio || null, numero: client.numero || null,
          edificio: client.edificio || null, bloque: client.bloque || null, escalera: client.escalera || null,
          piso: client.piso || null, puerta: client.puerta || null, municipio: client.municipio || null,
          localidad: client.nombre_localidad || null, codigoPostal: client.postal || null, provincia: client.provincia || null,
          pais: client.pais || 'ES', coordenadas: client.coordenadas || null, cuentaCargo: client.ccargo || null,
          cuentaContable: client.ccontable || null, formaPago: client.efectos_forma_pago || null, tipoIva: client.iva != null && client.iva !== '' ? String(client.iva) : null,
          facturaElectronica: client.factura_electronica === 1, facturaMail: client.factura_mail === 1,
          facturaPapel: client.factura_papel === 1, alertaFacturacion: client.alerta_facturacion?.toString() || null,
          representante: client.representante || null, cargoRepresentante: client.cargo || null, nifRepresentante: client.nif_representante || null,
          activo: !client.fecha_fin, baneado: client.baneado === true,
          fechaAlta: client.fecha_inicio ? new Date(client.fecha_inicio) : null, fechaBaja: client.fecha_fin ? new Date(client.fecha_fin) : null,
          idioma: client.idioma || null, categoria: client.categoria ? Number(client.categoria) : null,
          oficinaContable: client.oficina_contable || null, organoGestor: client.organo_gestor || null, unidadTramitadora: client.unidad_tramitadora || null,
        };
        // La actualización conserva campos mixtos bytevalue. El alta usa defaults
        // conservadores locales; no inventa consentimiento ni clasificación comercial.
        const existing = await writerTx.clienteWeb.findUnique({ where: { ispGestionId }, select: { id: true } });
        if (existing) await writerTx.clienteWeb.update({ where: { id: existing.id }, data: (({ clienteIdIsp, ...rest }) => rest)(source) });
        else await writerTx.clienteWeb.create({ data: { ispGestionId, ...source, passwordHash: defaultPasswordHash,
          // No se acredita consentimiento con el snapshot.
        } });
      }
    });
    return { success: true, count: externalClients.length, upserted: externalClients.length, deactivated: 0,
      activos: externalClients.filter((c) => !c.fecha_fin).length, inactivos: externalClients.filter((c) => c.fecha_fin).length,
      contactosConvertidos: 0, errors: 0, snapshotComplete: false, warning: 'ISP_SNAPSHOT_PRESENCE_UNVERIFIED' };
  });
}

export async function getAllClientes() {
  try {
    console.log(`[ISPGestión] Obteniendo todos los clientes...`);
    const data = await request('clientes', 'GET', null, { mostrar: 2000 });
    
    if (Array.isArray(data)) {
      console.log(`[ISPGestión] Obtenidos ${data.length} clientes`);
      return data;
    }
    if (data && data.clientes && Array.isArray(data.clientes)) return data.clientes;
    if (data && data.data && Array.isArray(data.data)) return data.data;
    
    throw new Error('Formato de respuesta inesperado');
  } catch (error: any) {
    console.error('Error obteniendo clientes:', error.message);
    throw error;
  }
}

export async function syncContratos() {
  await prisma.$transaction(async (tx) => requireIspSyncActor(tx));
  const allContratos: any[] = [];
  for (let pagina = 1; pagina <= 1000; pagina++) {
    const data = await request('contratos_todos', 'GET', null, { mostrar: 500, pagina });
    if (!Array.isArray(data)) throw new Error('ISP_CONTRACT_SNAPSHOT_INVALID');
    allContratos.push(...data);
    if (data.length < 500) break;
    if (pagina === 1000) throw new Error('ISP_CONTRACT_SNAPSHOT_TRUNCATED');
  }
  return prisma.$transaction(async (tx) => {
    await requireIspSyncActor(tx);
    await runWithIspSourceWriteTx('isp-contracts', tx, async (writerTx) => {
      for (const c of allContratos) {
        const ispGestionContratoId = Number(c.id);
        if (!Number.isSafeInteger(ispGestionContratoId) || ispGestionContratoId < 1 || !c.clienteid) throw new Error('ISP_CONTRACT_ID_INVALID');
        const source = { clienteId: String(c.clienteid), titulo: c.titulo || '', tarifa: c.tarifa || '', precio: c.precio || '0',
          importeRemesar: c.importe_remesar || null, descuentoTotal: c.descuento_total || null,
          fechaInicio: c.fechainicio ? new Date(c.fechainicio) : null, fechaBaja: c.fecha_baja ? new Date(c.fecha_baja) : null,
          causaBaja: c.causa_baja || null, conceptoFacturacion: c.concepto_facturacion || null,
          permanencia: Number(c.permanencia) || 0, fechaPermanencia: c.fecha_permanencia ? new Date(c.fecha_permanencia) : null,
          categoria: c.categoria || null, tipoAlta: c.tipo_alta || null, telefonosContrato: c.telefonos_contrato || null,
          observaciones: c.observaciones || null, activo: !c.fecha_baja };
        const existing = await writerTx.contratoServicio.findUnique({ where: { ispGestionContratoId }, select: { id: true } });
        if (existing) await writerTx.contratoServicio.update({ where: { id: existing.id }, data: source });
        else await writerTx.contratoServicio.create({ data: { ispGestionContratoId, ...source } });
      }
    });
    return { success: true, total: allContratos.length, upserted: allContratos.length, errors: 0,
      activos: allContratos.filter(c => !c.fecha_baja).length, bajas: allContratos.filter(c => c.fecha_baja).length };
  });
}

export async function syncTarifas() {
  try {
    // Obtener TODAS las tarifas de ISP Gestión (incluyendo las no publicadas en web)
    const allTarifas = await request('tarifas', 'GET', null, { mostrar_todas: 1, todas: 1, campos_adicionales: 1 });
    
    if (!Array.isArray(allTarifas)) {
      throw new Error('La respuesta de tarifas no es un array');
    }
    
    // Filtrar solo las activas
    const activeTarifas = allTarifas.filter((t: any) => t.activo === 1);
    console.log(`[ISPGestión] Total tarifas: ${allTarifas.length}, Activas: ${activeTarifas.length}`);
    
    // Mapeo de tipo_id a categoría legible
    const TIPO_CATEGORIA: Record<number, string> = {
      159: 'EQUIPOS Y HARDWARE',
      47: 'INTERNET 4G/WIMAX',
      59: 'BACKUP Y CLOUD',
      56: 'TELEFONÍA MÓVIL',
      26: 'TELEFONÍA MÓVIL (BASE)',
      57: 'HOTSPOT Y GESTIÓN',
      58: 'FIBRA',
      52: 'TELEFONÍA FIJA',
      67: 'HOSTING',
      68: 'HOSTING',
      69: 'FIBRA FTTH',
      160: 'TELEFONÍA FIJA (TARIFA PLANA)',
      42: 'IP Y REDES',
      64: 'SERVICIOS IT',
      53: 'TERMINALES',
      161: 'SERVIDORES Y CLOUD',
      30: 'TELEFONÍA FIJA (TARIFA PLANA)',
      29: 'LÍNEA FIJA',
      158: 'CENTRALITAS PBX',
      62: 'INTERCONEXIÓN OPERADOR',
      46: 'BONOS MÓVIL',
      65: 'SERVICIOS CLOUD',
      63: 'SERVICIOS OPERADOR',
      61: 'DATACENTER',
      51: 'MANTENIMIENTO',
      36: 'PBX CLOUD WILDIX',
      54: 'ALQUILER Y SOFTWARE',
      162: 'BONOS FIJO',
      55: 'LÍNEA ADICIONAL',
      50: 'INTERNET COMUNITAT',
      41: 'HOTSPOT',
      28: 'CUOTAS DE ALTA',
      27: 'LÍNEA MÓVIL (BASE)',
      155: 'COMPARTE GB',
      60: 'BACKUP',
      70: 'FTTH VoIP',
    };
    
    // Función para determinar la categoría basada en tipo_id de ISP Gestión
    function getCategoria(tarifa: any): string {
      const tipoId = tarifa.tipo;
      if (tipoId && TIPO_CATEGORIA[tipoId]) return TIPO_CATEGORIA[tipoId];
      
      // Fallback por flags
      if (tarifa.movil === 1) return 'TELEFONÍA MÓVIL';
      if (tarifa.fijo === 1) return 'TELEFONÍA FIJA';
      if (tarifa.internet === 1) return 'INTERNET';
      
      return 'OTROS SERVICIOS';
    }
    
    // Función para determinar tipo_cliente
    function getTipoCliente(tarifa: any): string {
      const nombre = (tarifa.nombre || '').toUpperCase();
      if (nombre.includes('PARTICULAR')) return 'PARTICULAR';
      if (nombre.includes('EMPRESA')) return 'EMPRESA';
      // Por defecto empresa ya que es B2B
      return 'EMPRESA';
    }
    
    // Función para extraer velocidad combinada
    function getVelocidad(tarifa: any): string | null {
      const bajada = tarifa.bajada || tarifa.fibra_bajada;
      const subida = tarifa.subida || tarifa.fibra_subida;
      if (bajada && subida) return `${bajada}/${subida} Mbps`;
      if (bajada) return `${bajada} Mbps`;
      return null;
    }
    
    // Recoger los IDs de ISP Gestión de las tarifas activas
    const activeIspIds = activeTarifas.map((t: any) => t.id.toString());
    
    // Marcar como inactivas las tarifas que ya no están activas en ISP Gestión
    // (solo las que tienen isp_gestion_id, para no tocar tarifas manuales)
    const deactivated = await prisma.$executeRaw`
      UPDATE tarifas SET activa = false, updated_at = NOW()
      WHERE isp_gestion_id IS NOT NULL 
        AND isp_gestion_id != ''
        AND isp_gestion_id NOT IN (SELECT unnest(${activeIspIds}::text[]))
        AND activa = true
    `;
    console.log(`[ISPGestión] Tarifas marcadas como inactivas: ${deactivated}`);
    
    let upserted = 0;
    let created = 0;
    let updated = 0;
    let errors = 0;
    
    for (const t of activeTarifas) {
      try {
        const ispId = t.id.toString();
        const nombre = t.nombre_comercial || t.nombre || 'Sin nombre';
        const categoria = getCategoria(t);
        const tipoCliente = getTipoCliente(t);
        const precioSinIva = parseFloat(t.total || '0');
        let precioConIva = parseFloat(t.total_iva || '0');
        if (precioConIva === 0 && precioSinIva > 0) precioConIva = Math.round(precioSinIva * 1.21 * 100) / 100;
        const costeOperador = t.precio_costo && parseFloat(t.precio_costo) > 0 ? parseFloat(t.precio_costo) : null;
        const permanenciaTexto = t.duracion_permanencia ? `${t.duracion_permanencia} meses` : null;
        const penalizacion = t.penalizacion && parseFloat(t.penalizacion) > 0 ? `${t.penalizacion}€` : null;
        const velocidad = getVelocidad(t);
        const descripcionCorta = t.descripcion_web || null;
        const descripcionLarga = t.descripcion_web_ampliacion || null;
        const destacada = t.destacado === 1;
        const fechaInicio = t.desdefecha ? new Date(t.desdefecha) : null;
        let fechaFin = t.hastafecha ? new Date(t.hastafecha) : null;
        if (t.hastafecha === '2999-01-01') fechaFin = null;
        
        // Campos adicionales de producto
        const ispTipoId = t.tipo || null;
        const esMovil = t.movil === 1;
        const esFijo = t.fijo === 1;
        const esInternet = t.internet === 1;
        const esTv = t.tv === 1;
        const esCompuesta = t.compuesta === 1;
        const velocidadBajada = t.bajada ? String(t.bajada) : null;
        const velocidadSubida = t.subida ? String(t.subida) : null;
        const fibraBajada = t.fibra_bajada ? String(t.fibra_bajada) : null;
        const fibraSubida = t.fibra_subida ? String(t.fibra_subida) : null;
        const datosIncluidos = t.datos && t.datos !== '0' ? String(t.datos) : null;
        const minutosIncluidos = t.minutos ? String(t.minutos) : null;
        const smsIncluidos = t.sms ? String(t.sms) : null;
        const conceptoFacturacion = t.concepto_facturacion || null;
        const servicioPppoe = t.servicio || null;
        const duracionPermanenciaMeses = t.duracion_permanencia ? parseInt(t.duracion_permanencia) : null;
        const observacionesPermanencia = t.observaciones_permanencia || null;
        const tarifaPlanaId = t.tarifa_plana && t.tarifa_plana > 0 ? t.tarifa_plana : null;
        const noFacturar = t.no_facturar === 1;
        const noProrrateable = t.no_prorrateable === 1;
        const publicarWeb = t.publicar_web === 1;
        const tipoPeriodicidad = t.tipo_periocidad || 1;
        const precioPeriodo = t.total_periodo ? parseFloat(t.total_periodo) : null;
        const precioPeriodoIva = t.total_iva_periodo ? parseFloat(t.total_iva_periodo) : null;
        
        // Upsert: si ya existe por isp_gestion_id, actualizar; si no, crear
        const result = await prisma.$executeRaw`
          INSERT INTO tarifas (
            tipo_cliente, categoria, nombre, descripcion_corta, descripcion_larga,
            velocidad, precio_sin_iva, precio_con_iva, coste_operador,
            permanencia, penalizacion, destacada, activa,
            solo_clientes_existentes, fecha_inicio, fecha_fin, orden,
            isp_gestion_id, created_at, updated_at,
            isp_tipo_id, es_movil, es_fijo, es_internet, es_tv, es_compuesta,
            velocidad_bajada, velocidad_subida, fibra_bajada, fibra_subida,
            datos_incluidos, minutos_incluidos, sms_incluidos,
            concepto_facturacion, servicio_pppoe,
            duracion_permanencia_meses, observaciones_permanencia,
            tarifa_plana_id, no_facturar, no_prorrateable, publicar_web,
            tipo_periodicidad, precio_periodo, precio_periodo_iva
          ) VALUES (
            ${tipoCliente}::"TipoCliente", ${categoria}, ${nombre}, ${descripcionCorta}, ${descripcionLarga},
            ${velocidad}, ${precioSinIva}, ${precioConIva}, ${costeOperador},
            ${permanenciaTexto}, ${penalizacion}, ${destacada}, true,
            false, ${fechaInicio}, ${fechaFin}, 0,
            ${ispId}, NOW(), NOW(),
            ${ispTipoId}, ${esMovil}, ${esFijo}, ${esInternet}, ${esTv}, ${esCompuesta},
            ${velocidadBajada}, ${velocidadSubida}, ${fibraBajada}, ${fibraSubida},
            ${datosIncluidos}, ${minutosIncluidos}, ${smsIncluidos},
            ${conceptoFacturacion}, ${servicioPppoe},
            ${duracionPermanenciaMeses}, ${observacionesPermanencia},
            ${tarifaPlanaId}, ${noFacturar}, ${noProrrateable}, ${publicarWeb},
            ${tipoPeriodicidad}, ${precioPeriodo}, ${precioPeriodoIva}
          )
          ON CONFLICT (isp_gestion_id) DO UPDATE SET
            tipo_cliente = EXCLUDED.tipo_cliente,
            categoria = EXCLUDED.categoria,
            nombre = EXCLUDED.nombre,
            descripcion_corta = EXCLUDED.descripcion_corta,
            descripcion_larga = EXCLUDED.descripcion_larga,
            velocidad = EXCLUDED.velocidad,
            precio_sin_iva = EXCLUDED.precio_sin_iva,
            precio_con_iva = EXCLUDED.precio_con_iva,
            coste_operador = EXCLUDED.coste_operador,
            permanencia = EXCLUDED.permanencia,
            penalizacion = EXCLUDED.penalizacion,
            destacada = EXCLUDED.destacada,
            activa = true,
            fecha_inicio = EXCLUDED.fecha_inicio,
            fecha_fin = EXCLUDED.fecha_fin,
            isp_tipo_id = EXCLUDED.isp_tipo_id,
            es_movil = EXCLUDED.es_movil,
            es_fijo = EXCLUDED.es_fijo,
            es_internet = EXCLUDED.es_internet,
            es_tv = EXCLUDED.es_tv,
            es_compuesta = EXCLUDED.es_compuesta,
            velocidad_bajada = EXCLUDED.velocidad_bajada,
            velocidad_subida = EXCLUDED.velocidad_subida,
            fibra_bajada = EXCLUDED.fibra_bajada,
            fibra_subida = EXCLUDED.fibra_subida,
            datos_incluidos = EXCLUDED.datos_incluidos,
            minutos_incluidos = EXCLUDED.minutos_incluidos,
            sms_incluidos = EXCLUDED.sms_incluidos,
            concepto_facturacion = EXCLUDED.concepto_facturacion,
            servicio_pppoe = EXCLUDED.servicio_pppoe,
            duracion_permanencia_meses = EXCLUDED.duracion_permanencia_meses,
            observaciones_permanencia = EXCLUDED.observaciones_permanencia,
            tarifa_plana_id = EXCLUDED.tarifa_plana_id,
            no_facturar = EXCLUDED.no_facturar,
            no_prorrateable = EXCLUDED.no_prorrateable,
            publicar_web = EXCLUDED.publicar_web,
            tipo_periodicidad = EXCLUDED.tipo_periodicidad,
            precio_periodo = EXCLUDED.precio_periodo,
            precio_periodo_iva = EXCLUDED.precio_periodo_iva,
            updated_at = NOW()
        `;
        upserted++;
      } catch (err: any) {
        errors++;
        if (errors <= 5) console.error(`Error upserting tarifa ${t.id}:`, err.message);
      }
    }
    
    return {
      success: true,
      totalISP: allTarifas.length,
      activas: activeTarifas.length,
      upserted,
      deactivated: Number(deactivated),
      errors
    };
  } catch (error: any) {
    console.error('Error en syncTarifas:', error);
    throw error;
  }
}

export async function testConnection() {
  try {
    const data = await request('clientes', 'GET', null, { mostrar: 1 });
    return { success: true, data };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.response?.data?.error || error.message || 'Error desconocido' 
    };
  }
}

export default request;

// ==========================================
// SINCRONIZACIÓN DE FACTURAS
// ==========================================

export async function getAllFacturas() {
  try {
    console.log(`[ISPGestión] Obteniendo todas las facturas...`);
    const data = await request('facturacion', 'GET', null, { mostrar: 5000 });
    
    if (Array.isArray(data)) {
      console.log(`[ISPGestión] Obtenidas ${data.length} facturas`);
      return data;
    }
    console.log(`[ISPGestión] Respuesta inesperada:`, typeof data);
    return [];
  } catch (error: any) {
    console.error('Error obteniendo facturas de ISPGestión:', error.message);
    throw error;
  }
}

export async function syncFacturas() {
  // Mismo writer ya existente, sin crear una ruta externa nueva.
  const { syncFacturasBatch } = await import('./sync-facturas');
  return syncFacturasBatch();
}
// ==========================================
// SINCRONIZACIÓN DE REMESAS
// ==========================================

export async function getAllRemesas() {
  try {
    console.log(`[ISPGestión] Obteniendo todas las remesas...`);
    const data = await request('remesas', 'GET', null, { mostrar: 500 });
    
    if (Array.isArray(data)) {
      console.log(`[ISPGestión] Obtenidas ${data.length} remesas`);
      return data;
    }
    console.log(`[ISPGestión] Respuesta inesperada:`, typeof data);
    return [];
  } catch (error: any) {
    console.error('Error obteniendo remesas de ISPGestión:', error.message);
    throw error;
  }
}

export async function syncRemesas() {
  const { syncRemesasBatch } = await import('./sync-facturas');
  return syncRemesasBatch();
}
