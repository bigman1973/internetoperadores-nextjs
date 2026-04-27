import axios from 'axios';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';

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

async function request(endpoint: string, method = 'GET', data: any = null, params: any = null) {
  // Limpiar endpoint para evitar doble barra
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  
  // ISP Gestión filtra por IP. Desde Railway se puede llamar directamente.
  // Desde Vercel u otros entornos, usamos el proxy de Railway como intermediario.
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.IS_RAILWAY;
  
  if (isRailway) {
    console.log(`[ISPGestión] Petición directa ${method} a ${cleanEndpoint}`);
    const response = await ispgestionDirect({ 
      url: cleanEndpoint, 
      method, 
      data, 
      params 
    });
    return response.data;
  } else {
    console.log(`[ISPGestión] Petición via proxy Railway ${method} a ${cleanEndpoint}`);
    const response = await axios.post(RAILWAY_PROXY_URL, {
      endpoint: cleanEndpoint,
      method,
      data,
      params
    }, { timeout: 30000 });
    return response.data;
  }
}

export async function verifyClienteCredentials(email: string, pass: string): Promise<string | null> {
  try {
    const data = await request('clientes/login', 'POST', { email, pass });
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

export async function syncClients() {
  try {
    const externalClients = await getAllClientes();
    const defaultPasswordHash = await bcrypt.hash('cliente123', 10);
    
    // Recoger los IDs de ISP Gestión de todos los clientes recibidos
    const allIspIds = externalClients
      .map((c: any) => c.id?.toString())
      .filter((id: string | undefined) => id);
    
    // Marcar como inactivos los clientes que ya no están en ISP Gestión
    const deactivated = await prisma.$executeRaw`
      UPDATE clientes_web SET activo = false, updated_at = NOW()
      WHERE isp_gestion_id IS NOT NULL 
        AND isp_gestion_id != ''
        AND isp_gestion_id NOT IN (SELECT unnest(${allIspIds}::text[]))
        AND activo = true
    `;
    console.log(`[ISPGestión] Clientes marcados como inactivos: ${deactivated}`);
    
    let upserted = 0;
    let errors = 0;
    
    for (const client of externalClients) {
      try {
        const ispId = client.id?.toString();
        if (!ispId) continue;
        
        // El email puede tener varios separados por coma, coger el primero
        const rawEmail = client.email || '';
        const email = rawEmail.split(',')[0].trim();
        if (!email) continue;
        
        const nombreCompleto = client.nombrecompleto || `${client.nombre || ''} ${client.apellidos || ''}`.trim() || 'Sin nombre';
        const activo = !client.fecha_fin;
        const fechaAlta = client.fecha_inicio || null;
        const fechaBaja = client.fecha_fin || null;
        
        await prisma.$executeRaw`
          INSERT INTO clientes_web (
            email, password_hash, isp_gestion_id, nombre, newsletter_suscrito,
            cliente_id_isp, codigo, nif, cif, persona_fisica, nombre_comercial,
            apellidos, nombre_pila, telefono, movil, fax, web, movil_sms,
            tipo_calle, domicilio, numero, edificio, bloque, escalera, piso, puerta,
            municipio, localidad, codigo_postal, provincia, pais, coordenadas,
            cuenta_cargo, cuenta_contable, forma_pago, tipo_iva,
            factura_electronica, factura_mail, factura_papel, alerta_facturacion,
            representante, cargo_representante, nif_representante,
            activo, baneado, fecha_alta, fecha_baja,
            idioma, categoria, recibe_publicidad, acepto_lopd,
            comercial, agente, origen,
            oficina_contable, organo_gestor, unidad_tramitadora,
            created_at, updated_at
          ) VALUES (
            ${email}, ${defaultPasswordHash}, ${ispId}, ${nombreCompleto}, false,
            ${client.clienteid || null}, ${client.codigo || null},
            ${client.nif || null}, ${client.cif || null},
            ${client.personafisica === 1}, ${client.nombre_comercial || null},
            ${client.apellidos || null}, ${client.nombre || null},
            ${client.telefono1 || null}, ${client.movil || null},
            ${client.fax || null}, ${client.web && client.web !== 'http://' ? client.web : null},
            ${client.movil_sms || null},
            ${client.tipo_calle || null}, ${client.domicilio || null},
            ${client.numero || null}, ${client.edificio || null},
            ${client.bloque || null}, ${client.escalera || null},
            ${client.piso || null}, ${client.puerta || null},
            ${client.municipio || null}, ${client.nombre_localidad || null},
            ${client.postal || null}, ${client.provincia || null},
            ${client.pais || 'ES'}, ${client.coordenadas || null},
            ${client.ccargo || null}, ${client.ccontable || null},
            ${client.efectos_forma_pago || null}, ${client.iva || null},
            ${client.factura_electronica === 1}, ${client.factura_mail === 1},
            ${client.factura_papel === 1}, ${client.alerta_facturacion?.toString() || null},
            ${client.representante || null}, ${client.cargo || null},
            ${client.nif_representante || null},
            ${activo}, ${client.baneado === true},
            ${fechaAlta ? new Date(fechaAlta) : null}, ${fechaBaja ? new Date(fechaBaja) : null},
            ${client.idioma || null}, ${client.categoria || null},
            ${client.recibepublicidad === 1}, ${client.acepto_lopd ? true : null},
            ${client.comercial || null}, ${client.agente || null},
            ${client.nombre_origen || null},
            ${client.oficina_contable || null}, ${client.organo_gestor || null},
            ${client.unidad_tramitadora || null},
            NOW(), NOW()
          )
          ON CONFLICT (isp_gestion_id) DO UPDATE SET
            nombre = EXCLUDED.nombre,
            email = EXCLUDED.email,
            cliente_id_isp = EXCLUDED.cliente_id_isp,
            codigo = EXCLUDED.codigo,
            nif = EXCLUDED.nif,
            cif = EXCLUDED.cif,
            persona_fisica = EXCLUDED.persona_fisica,
            nombre_comercial = EXCLUDED.nombre_comercial,
            apellidos = EXCLUDED.apellidos,
            nombre_pila = EXCLUDED.nombre_pila,
            telefono = EXCLUDED.telefono,
            movil = EXCLUDED.movil,
            fax = EXCLUDED.fax,
            web = EXCLUDED.web,
            movil_sms = EXCLUDED.movil_sms,
            tipo_calle = EXCLUDED.tipo_calle,
            domicilio = EXCLUDED.domicilio,
            numero = EXCLUDED.numero,
            edificio = EXCLUDED.edificio,
            bloque = EXCLUDED.bloque,
            escalera = EXCLUDED.escalera,
            piso = EXCLUDED.piso,
            puerta = EXCLUDED.puerta,
            municipio = EXCLUDED.municipio,
            localidad = EXCLUDED.localidad,
            codigo_postal = EXCLUDED.codigo_postal,
            provincia = EXCLUDED.provincia,
            pais = EXCLUDED.pais,
            coordenadas = EXCLUDED.coordenadas,
            cuenta_cargo = EXCLUDED.cuenta_cargo,
            cuenta_contable = EXCLUDED.cuenta_contable,
            forma_pago = EXCLUDED.forma_pago,
            tipo_iva = EXCLUDED.tipo_iva,
            factura_electronica = EXCLUDED.factura_electronica,
            factura_mail = EXCLUDED.factura_mail,
            factura_papel = EXCLUDED.factura_papel,
            alerta_facturacion = EXCLUDED.alerta_facturacion,
            representante = EXCLUDED.representante,
            cargo_representante = EXCLUDED.cargo_representante,
            nif_representante = EXCLUDED.nif_representante,
            activo = EXCLUDED.activo,
            baneado = EXCLUDED.baneado,
            fecha_alta = EXCLUDED.fecha_alta,
            fecha_baja = EXCLUDED.fecha_baja,
            idioma = EXCLUDED.idioma,
            categoria = EXCLUDED.categoria,
            recibe_publicidad = EXCLUDED.recibe_publicidad,
            acepto_lopd = EXCLUDED.acepto_lopd,
            comercial = EXCLUDED.comercial,
            agente = EXCLUDED.agente,
            origen = EXCLUDED.origen,
            oficina_contable = EXCLUDED.oficina_contable,
            organo_gestor = EXCLUDED.organo_gestor,
            unidad_tramitadora = EXCLUDED.unidad_tramitadora,
            updated_at = NOW()
        `;
        upserted++;
      } catch (err: any) {
        errors++;
        if (errors <= 5) console.error(`Error upserting cliente ${client.id}:`, err.message);
      }
    }
    
    const totalActivos = externalClients.filter((c: any) => !c.fecha_fin).length;
    const totalInactivos = externalClients.filter((c: any) => c.fecha_fin).length;
    
    return { 
      success: true, 
      count: externalClients.length, 
      upserted, 
      deactivated: Number(deactivated),
      activos: totalActivos,
      inactivos: totalInactivos,
      errors 
    };
  } catch (error: any) {
    console.error('Error en syncClients:', error);
    throw error;
  }
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
  try {
    let allContratos: any[] = [];
    let page = 1;
    const pageSize = 500;
    
    // Obtener todos los contratos con paginación
    while (true) {
      console.log(`[ISPGestión] Obteniendo contratos página ${page}...`);
      const data = await request('contratos_todos', 'GET', null, { mostrar: pageSize, pagina: page });
      
      if (Array.isArray(data) && data.length > 0) {
        allContratos = allContratos.concat(data);
        console.log(`[ISPGestión] Página ${page}: ${data.length} contratos (total: ${allContratos.length})`);
        if (data.length < pageSize) break;
        page++;
      } else {
        break;
      }
    }
    
    console.log(`[ISPGestión] Total contratos obtenidos: ${allContratos.length}`);
    
    let upserted = 0;
    let errors = 0;
    
    for (const contrato of allContratos) {
      try {
        const contratoId = parseInt(contrato.id);
        if (!contratoId || !contrato.clienteid) continue;
        
        const precio = parseFloat(contrato.precio) || 0;
        const importeRemesar = contrato.importe_remesar ? parseFloat(contrato.importe_remesar) : null;
        const descuentoTotal = contrato.descuento_total ? parseFloat(contrato.descuento_total) : null;
        const fechaInicio = contrato.fechainicio ? new Date(contrato.fechainicio) : null;
        const fechaBaja = contrato.fecha_baja ? new Date(contrato.fecha_baja) : null;
        const activo = !contrato.fecha_baja;
        
        await prisma.$executeRaw`
          INSERT INTO contratos_servicio (
            isp_gestion_contrato_id, cliente_id, titulo, tarifa, precio,
            importe_remesar, descuento_total, fecha_inicio, fecha_baja,
            causa_baja, concepto_facturacion, permanencia, fecha_permanencia,
            categoria, tipo_alta, telefonos_contrato, observaciones, activo,
            created_at, updated_at
          ) VALUES (
            ${contratoId}, ${contrato.clienteid}, ${contrato.titulo || ''}, ${contrato.tarifa || ''},
            ${precio}, ${importeRemesar}, ${descuentoTotal},
            ${fechaInicio}, ${fechaBaja},
            ${contrato.causa_baja || null}, ${contrato.concepto_facturacion || null},
            ${contrato.permanencia || 0}, ${contrato.fecha_permanencia ? new Date(contrato.fecha_permanencia) : null},
            ${contrato.categoria || null}, ${contrato.tipo_alta || null},
            ${contrato.telefonos_contrato || null}, ${contrato.observaciones || null},
            ${activo}, NOW(), NOW()
          )
          ON CONFLICT (isp_gestion_contrato_id) DO UPDATE SET
            cliente_id = EXCLUDED.cliente_id,
            titulo = EXCLUDED.titulo,
            tarifa = EXCLUDED.tarifa,
            precio = EXCLUDED.precio,
            importe_remesar = EXCLUDED.importe_remesar,
            descuento_total = EXCLUDED.descuento_total,
            fecha_inicio = EXCLUDED.fecha_inicio,
            fecha_baja = EXCLUDED.fecha_baja,
            causa_baja = EXCLUDED.causa_baja,
            concepto_facturacion = EXCLUDED.concepto_facturacion,
            permanencia = EXCLUDED.permanencia,
            fecha_permanencia = EXCLUDED.fecha_permanencia,
            categoria = EXCLUDED.categoria,
            tipo_alta = EXCLUDED.tipo_alta,
            telefonos_contrato = EXCLUDED.telefonos_contrato,
            observaciones = EXCLUDED.observaciones,
            activo = EXCLUDED.activo,
            updated_at = NOW()
        `;
        upserted++;
      } catch (err: any) {
        errors++;
        if (errors <= 5) console.error(`Error upserting contrato ${contrato.id}:`, err.message);
      }
    }
    
    return { 
      success: true, 
      total: allContratos.length, 
      upserted, 
      errors,
      activos: allContratos.filter(c => !c.fecha_baja).length,
      bajas: allContratos.filter(c => c.fecha_baja).length
    };
  } catch (error: any) {
    console.error('Error en syncContratos:', error);
    throw error;
  }
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
  try {
    const allFacturas = await getAllFacturas();
    
    if (!allFacturas.length) {
      return { success: true, total: 0, upserted: 0, errors: 0 };
    }
    
    let upserted = 0;
    let errors = 0;
    
    for (const f of allFacturas) {
      try {
        const ispId = parseInt(f.id);
        if (!ispId) continue;
        
        const fecha = f.fecha ? new Date(f.fecha) : new Date();
        const ejercicio = fecha.getFullYear();
        
        await prisma.$executeRaw`
          INSERT INTO facturas (
            isp_gestion_id, serie_factura, numero_documento, documento,
            fecha, id_cliente, codigo_cliente, nombre_completo, nif_cif,
            base, total_impuesto, total, situacion, total_pendiente,
            ejercicio, created_at, updated_at
          ) VALUES (
            ${ispId}, ${f.serie_factura || ''}, ${f.numero_documento || ''},
            ${f.documento || null},
            ${fecha}, ${parseInt(f.id_cliente) || 0}, ${f.codigo_cliente || ''},
            ${f.nombrecompleto || ''}, ${f.nif_cif || null},
            ${parseFloat(f.base) || 0}, ${parseFloat(f.total_impuesto) || 0},
            ${parseFloat(f.total) || 0}, ${f.situacion || 'PENDIENTE'},
            ${parseFloat(f.total_pendiente) || 0},
            ${ejercicio}, NOW(), NOW()
          )
          ON CONFLICT (isp_gestion_id) DO UPDATE SET
            serie_factura = EXCLUDED.serie_factura,
            numero_documento = EXCLUDED.numero_documento,
            documento = EXCLUDED.documento,
            fecha = EXCLUDED.fecha,
            id_cliente = EXCLUDED.id_cliente,
            codigo_cliente = EXCLUDED.codigo_cliente,
            nombre_completo = EXCLUDED.nombre_completo,
            nif_cif = EXCLUDED.nif_cif,
            base = EXCLUDED.base,
            total_impuesto = EXCLUDED.total_impuesto,
            total = EXCLUDED.total,
            situacion = EXCLUDED.situacion,
            total_pendiente = EXCLUDED.total_pendiente,
            ejercicio = EXCLUDED.ejercicio,
            updated_at = NOW()
        `;
        upserted++;
      } catch (err: any) {
        errors++;
        if (errors <= 5) console.error(`Error upserting factura ${f.id}:`, err.message);
      }
    }
    
    // Estadísticas
    const cobradas = allFacturas.filter((f: any) => f.situacion === 'COBRADA').length;
    const pendientes = allFacturas.filter((f: any) => f.situacion === 'PENDIENTE').length;
    const totalFacturado = allFacturas.reduce((sum: number, f: any) => sum + (parseFloat(f.total) || 0), 0);
    
    return {
      success: true,
      total: allFacturas.length,
      upserted,
      cobradas,
      pendientes,
      totalFacturado: Math.round(totalFacturado * 100) / 100,
      errors
    };
  } catch (error: any) {
    console.error('Error en syncFacturas:', error);
    throw error;
  }
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
  try {
    const allRemesas = await getAllRemesas();
    
    if (!allRemesas.length) {
      return { success: true, total: 0, upserted: 0, errors: 0 };
    }
    
    let upserted = 0;
    let errors = 0;
    
    for (const r of allRemesas) {
      try {
        const ispId = parseInt(r.id);
        if (!ispId) continue;
        
        const fecha = r.fecha ? new Date(r.fecha) : new Date();
        const ejercicio = fecha.getFullYear();
        
        await prisma.$executeRaw`
          INSERT INTO remesas (
            isp_gestion_id, nombre, fecha, nif_presentador, nombre_presentador,
            iban_acreedor, remesado, contabilizado, total_importe, numero_registros,
            archivo_generado, ejercicio, created_at, updated_at
          ) VALUES (
            ${ispId}, ${r.nombre || ''}, ${fecha},
            ${r.nif_presentador || null}, ${r.nombre_presentador || null},
            ${r.iban_acredor || r.iban_acreedor || null},
            ${r.remesado === '1' || r.remesado === true},
            ${r.contabilizado === '1' || r.contabilizado === true},
            ${parseFloat(r.total_importe) || 0}, ${parseInt(r.numero_registros) || 0},
            ${r.archivo_generado || null},
            ${ejercicio}, NOW(), NOW()
          )
          ON CONFLICT (isp_gestion_id) DO UPDATE SET
            nombre = EXCLUDED.nombre,
            fecha = EXCLUDED.fecha,
            nif_presentador = EXCLUDED.nif_presentador,
            nombre_presentador = EXCLUDED.nombre_presentador,
            iban_acreedor = EXCLUDED.iban_acreedor,
            remesado = EXCLUDED.remesado,
            contabilizado = EXCLUDED.contabilizado,
            total_importe = EXCLUDED.total_importe,
            numero_registros = EXCLUDED.numero_registros,
            archivo_generado = EXCLUDED.archivo_generado,
            ejercicio = EXCLUDED.ejercicio,
            updated_at = NOW()
        `;
        upserted++;
      } catch (err: any) {
        errors++;
        if (errors <= 5) console.error(`Error upserting remesa ${r.id}:`, err.message);
      }
    }
    
    const totalRemesado = allRemesas.reduce((sum: number, r: any) => sum + (parseFloat(r.total_importe) || 0), 0);
    
    return {
      success: true,
      total: allRemesas.length,
      upserted,
      totalRemesado: Math.round(totalRemesado * 100) / 100,
      errors
    };
  } catch (error: any) {
    console.error('Error en syncRemesas:', error);
    throw error;
  }
}
