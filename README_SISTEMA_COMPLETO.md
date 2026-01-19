# Sistema Completo Internet Operadores

Sistema integrado con **Intranet (Admin)**, **Web Pública** y **Extranet (Área Cliente)**.

---

## 🚀 Estado Actual

**Progreso:** ~10% completado
**Última actualización:** 19 de enero de 2026

### ✅ Implementado

- [x] Base de datos completa (14 tablas con Prisma)
- [x] Sistema de autenticación dual (Admin + Cliente)
- [x] Dashboard de admin con estadísticas
- [x] Sidebar de navegación con permisos por rol
- [x] Página de login
- [x] Middleware de protección de rutas
- [x] Utilidades de formateo
- [x] Sistema de roles y permisos

### 🚧 En desarrollo

- [ ] CRUD completo de tarifas
- [ ] Importación desde Excel
- [ ] Subida masiva de precios
- [ ] Web pública (catálogo de tarifas)
- [ ] Extranet (área cliente)

---

## 📦 Instalación

### 1. Instalar dependencias

```bash
pnpm install
```

### 2. Configurar base de datos

Edita el archivo `.env` con tus credenciales:

```env
DATABASE_URL="mysql://usuario:password@host:3306/internetoperadores"
NEXTAUTH_URL="https://staging.internetoperadores.com"
NEXTAUTH_SECRET="tu_secret_super_seguro_aqui"
```

### 3. Generar cliente de Prisma

```bash
pnpm prisma generate
```

### 4. Crear tablas en la base de datos

```bash
pnpm prisma db push
```

### 5. Cargar datos iniciales

```bash
pnpm prisma db seed
```

### 6. Ejecutar en desarrollo

```bash
pnpm dev
```

La aplicación estará disponible en `http://localhost:3000`

---

## 🔑 Credenciales de Prueba

### Administrador
- Email: `david.perez@internetoperadores.com`
- Password: `admin123`
- Rol: Super Admin

### Cliente
- Email: `juan.perez@email.com`
- Password: `cliente123`
- Tipo: Particular

---

## 📁 Estructura del Proyecto

```
/internetoperadores-nextjs
├── prisma/
│   ├── schema.prisma          # Schema de base de datos
│   └── seed.ts                # Datos iniciales
├── lib/
│   ├── prisma.ts              # Cliente de Prisma
│   ├── auth.ts                # Configuración de NextAuth
│   ├── middleware/
│   │   └── auth.ts            # Middleware de protección
│   └── utils/
│       └── format.ts          # Utilidades de formateo
├── types/
│   └── next-auth.d.ts         # Tipos extendidos de NextAuth
├── components/
│   └── admin/
│       ├── AdminSidebar.tsx   # Sidebar de navegación
│       └── AdminHeader.tsx    # Header con logout
├── app/
│   ├── api/
│   │   └── auth/[...nextauth]/route.ts  # API de autenticación
│   ├── login/page.tsx         # Página de login
│   ├── admin/
│   │   ├── layout.tsx         # Layout de admin
│   │   └── page.tsx           # Dashboard principal
│   ├── selector/page.js       # Selector B2B/B2C
│   ├── empresa/page.js        # Página empresas
│   └── particular/page.js     # Página particulares
└── .env                       # Variables de entorno
```

---

## 🗄️ Base de Datos

### Tablas Principales

#### Intranet (Admin)
- `usuarios_admin` - Usuarios administradores con 5 roles
- `tarifas` - Catálogo de tarifas
- `categorias` - Categorías de tarifas
- `historial_cambios` - Auditoría de cambios
- `estadisticas_tarifas` - Métricas de vistas y contrataciones

#### Extranet (Clientes)
- `clientes` - Usuarios clientes
- `servicios_contratados` - Servicios de clientes
- `facturas` - Facturas
- `lineas_factura` - Detalle de facturas
- `consumo_datos` - Consumo de datos móviles
- `tickets_soporte` - Sistema de tickets
- `mensajes_ticket` - Mensajes de tickets
- `notificaciones_cliente` - Notificaciones

### Roles de Admin

1. **SUPER_ADMIN** - Acceso total
2. **GERENTE** - Gestión completa excepto configuración
3. **FINANCIERO** - Gestión de precios y facturación
4. **EDITOR** - Crear y editar tarifas
5. **VISOR** - Solo lectura

---

## 🔐 Autenticación

El sistema usa **NextAuth.js** con autenticación por credenciales (email + password).

### Flujo de autenticación:

1. Usuario ingresa email, password y tipo (admin/cliente)
2. NextAuth valida credenciales contra la base de datos
3. Se crea una sesión JWT con información del usuario
4. El middleware protege las rutas según el tipo de usuario

### Proteger una ruta:

```typescript
import { requireAuth } from '@/lib/middleware/auth'

export default async function MiPagina() {
  const session = await requireAuth('admin') // o 'cliente'
  
  // Tu código aquí
}
```

### Verificar permisos por rol:

```typescript
import { requireAdminRole } from '@/lib/middleware/auth'

export default async function MiPagina() {
  const session = await requireAdminRole(['SUPER_ADMIN', 'GERENTE'])
  
  // Solo Super Admin y Gerente pueden acceder
}
```

---

## 🎨 Diseño

### Principios de diseño:

- **Mobile-first:** Todo diseñado primero para móvil
- **Responsive:** Breakpoints en 640px (sm), 768px (md), 1024px (lg)
- **Pulcro:** Espaciado consistente y jerarquía visual clara
- **Accesible:** Colores con buen contraste, tamaños táctiles adecuados

### Colores corporativos:

- **Naranja:** `#FF6B35` (orange-500 en Tailwind)
- **Negro:** `#000000`
- **Gris:** Escala de grises de Tailwind

---

## 🚀 Despliegue

### Vercel (Staging)

1. Conectar repositorio en Vercel
2. Configurar variables de entorno:
   - `DATABASE_URL`
   - `NEXTAUTH_URL`
   - `NEXTAUTH_SECRET`
3. Desplegar rama `staging`

### Producción

1. Hacer merge de `staging` a `main`
2. Actualizar `NEXTAUTH_URL` a la URL de producción
3. Generar nuevo `NEXTAUTH_SECRET`:
   ```bash
   openssl rand -base64 32
   ```
4. Desplegar

---

## 📊 Comandos Útiles

```bash
# Desarrollo
pnpm dev

# Build de producción
pnpm build

# Ejecutar producción
pnpm start

# Linting
pnpm lint

# Prisma
pnpm prisma studio          # Abrir Prisma Studio (GUI)
pnpm prisma generate        # Generar cliente
pnpm prisma db push         # Sincronizar schema con BD
pnpm prisma db seed         # Cargar datos iniciales
pnpm prisma migrate dev     # Crear migración
```

---

## 🐛 Troubleshooting

### Error: "PrismaClient is unable to run in this browser environment"

Asegúrate de que estás usando Prisma solo en componentes de servidor (no en componentes de cliente).

### Error: "Invalid `prisma.xxx.findMany()` invocation"

Verifica que la conexión a la base de datos en `.env` sea correcta y que las tablas existan.

### Error: "NextAuth: no session"

Verifica que `NEXTAUTH_SECRET` esté configurado en `.env` y que la URL coincida con `NEXTAUTH_URL`.

---

## 📝 Próximos Pasos

Ver archivo `progreso_sistema_completo.md` para el roadmap completo.

---

## 🤝 Contribuir

Este es un proyecto interno de Internet Operadores.

---

## 📄 Licencia

Propietario: Internet Operadores
