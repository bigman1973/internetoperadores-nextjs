# Patrón de Trazabilidad del Proceso de Venta

## Resumen

Cada producto/solución que tenga un proceso de venta con leads debe implementar este patrón para garantizar la trazabilidad temporal de cada paso del pipeline comercial.

---

## Arquitectura

### 1. Campos de fecha en el modelo Prisma

Cada modelo de lead debe incluir campos `DateTime?` para cada paso del proceso de venta. Los nombres siguen la convención `fecha{NombrePaso}`.

```prisma
// Ejemplo para un nuevo producto
model LeadNuevoProducto {
  // ... campos del lead ...
  
  // Fechas del proceso de venta (trazabilidad)
  fechaOfertaGenerada     DateTime? @map("fecha_oferta_generada")
  fechaEmailEnviado       DateTime? @map("fecha_email_enviado")
  fechaCuestionarioEnviado DateTime? @map("fecha_cuestionario_enviado")
  fechaCuestionarioCompletado DateTime? @map("fecha_cuestionario_completado")
  fechaPropuestaGenerada  DateTime? @map("fecha_propuesta_generada")
  fechaPropuestaEnviada   DateTime? @map("fecha_propuesta_enviada")
  fechaPropuestaAceptada  DateTime? @map("fecha_propuesta_aceptada")
  fechaReunionAgendada    DateTime? @map("fecha_reunion_agendada")
  fechaContratoFirmado    DateTime? @map("fecha_contrato_firmado")
  fechaCierre             DateTime? @map("fecha_cierre")
}
```

### 2. Registro automático en APIs de acción

Cada API que ejecuta una acción del proceso de venta debe registrar la fecha correspondiente:

| API / Acción | Campo que actualiza |
|---|---|
| Generar oferta/auditoría | `fechaOfertaGenerada` |
| Enviar email | `fechaEmailEnviado` + `fechaCuestionarioEnviado` |
| Cliente completa cuestionario | `fechaCuestionarioCompletado` |
| Generar propuesta económica | `fechaPropuestaGenerada` |
| Enviar propuesta al cliente | `fechaPropuestaEnviada` |
| Cambio manual de estado | Según el `fechaMap` |

### 3. Registro automático en API PATCH (cambio manual de estado)

La API PATCH del lead debe incluir un `fechaMap` que registre la fecha cuando el comercial cambia el estado manualmente:

```typescript
const fechaMap: Record<string, string> = {
  'EN_PROCESO': 'fechaEmailEnviado',
  'CUESTIONARIO_COMPLETADO': 'fechaCuestionarioCompletado',
  'PRESUPUESTO_ENVIADO': 'fechaPropuestaEnviada',
  'PROPUESTA_PREACEPTADA': 'fechaPropuestaAceptada',
  'REUNION_AGENDADA': 'fechaReunionAgendada',
  'CONTRATO_FIRMADO': 'fechaContratoFirmado',
  'GANADO': 'fechaCierre',
  'PERDIDO': 'fechaCierre',
};

if (fechaMap[estado]) {
  updateData[fechaMap[estado]] = new Date();
}
```

### 4. Visualización en el timeline del componente

El timeline del componente debe:
1. Definir un array de `pasos` con `{ id, label, action, fecha }`
2. Usar `formatFecha()` para mostrar la fecha en formato `dd/mmm HH:MM`
3. Mostrar la fecha debajo del label solo en pasos completados o activos

```tsx
const formatFecha = (fecha: string | null | undefined) => {
  if (!fecha) return null;
  const d = new Date(fecha);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', timeZone: 'Europe/Madrid' }) 
    + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
};

// En el JSX del paso:
{fechaFormateada && (completado || activo) && (
  <p className="text-[10px] text-gray-400 mt-0.5">{fechaFormateada}</p>
)}
```

---

## Productos implementados

| Producto | Modelo | Campos de fecha | Timeline con fechas |
|---|---|---|---|
| Mantenimiento IT | `LeadSolucion` | 10 campos | Sí |
| Migración Web | `LeadMigracionWeb` | 8 campos | Sí |

---

## Checklist para nuevo producto

- [ ] Añadir campos `DateTime?` al modelo Prisma
- [ ] Ejecutar SQL `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
- [ ] Regenerar cliente Prisma (`npx prisma generate`)
- [ ] Actualizar API de generar oferta/auditoría → `fechaOfertaGenerada`
- [ ] Actualizar API de enviar email → `fechaEmailEnviado`
- [ ] Actualizar API/webhook de cuestionario completado → `fechaCuestionarioCompletado`
- [ ] Actualizar API de generar propuesta → `fechaPropuestaGenerada`
- [ ] Actualizar API PATCH con `fechaMap` para cambios manuales
- [ ] Añadir campos a la interfaz TypeScript del componente
- [ ] Actualizar timeline del componente con array de `pasos` + `fecha`
- [ ] Verificar build y desplegar

---

## Notas

- Las fechas se almacenan en UTC en la BD
- Se muestran en timezone `Europe/Madrid` en el frontend
- Si un paso se ejecuta varias veces (ej: regenerar propuesta), se sobreescribe la fecha con la más reciente
- Los campos son opcionales (`DateTime?`) para no romper leads existentes
- El `fechaMap` en PATCH es un safety net: si la API de acción ya registró la fecha, el PATCH no la sobreescribe (solo actúa si el campo está null)
