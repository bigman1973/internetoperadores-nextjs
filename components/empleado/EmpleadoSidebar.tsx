'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  ReceiptPercentIcon,
  HomeIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  CheckBadgeIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  ClockIcon,
  ChatBubbleLeftEllipsisIcon,
} from '@heroicons/react/24/outline';
import { useImpersonation } from './ImpersonationContext';

interface EmpleadoSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string;
  };
}

// Roles que pueden aprobar
const ROLES_APROBADOR = ['SUPER_ADMIN', 'GERENTE'];
const EMAILS_APROBADOR = [
  'jordi@farmsplanet.es',
  'lorena.gimeno@internetoperadores.com',
  'david.perez@internetoperadores.com',
];

// Categorías de empleado que implican rol de aprobador
const CATEGORIAS_APROBADOR = ['GERENTE'];

function esEmpleadoAprobador(email?: string | null, categoria?: string | null): boolean {
  if (email && EMAILS_APROBADOR.includes(email.toLowerCase())) return true;
  if (categoria && CATEGORIAS_APROBADOR.includes(categoria.toUpperCase())) return true;
  return false;
}

export default function EmpleadoSidebar({ user }: EmpleadoSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { impersonatedEmail, impersonatedEmpleado } = useImpersonation();

  const esAprobador = ROLES_APROBADOR.includes(user.role || '') ||
    EMAILS_APROBADOR.includes(user.email?.toLowerCase() || '');
  
  const esSuperAdmin = user.role === 'SUPER_ADMIN';

  // Cuando se impersona, verificar si el empleado impersonado tiene permisos de aprobador
  const isImpersonating = !!impersonatedEmail;
  const impersonadoEsAprobador = isImpersonating && impersonatedEmpleado
    ? esEmpleadoAprobador(impersonatedEmpleado.email, impersonatedEmpleado.categoria)
    : false;

  // Mostrar "Aprobar Tickets" si:
  // - No se está impersonando Y el usuario real es aprobador
  // - O se está impersonando Y el empleado impersonado es aprobador
  const mostrarAprobar = isImpersonating ? impersonadoEsAprobador : esAprobador;

  const navItems = [
    { href: '/empleado', label: 'Inicio', icon: HomeIcon },
    { href: '/empleado/nominas', label: isImpersonating ? 'Nóminas' : 'Mis Nóminas', icon: DocumentTextIcon },
    { href: '/empleado/imputaciones', label: 'Imputación de Horas', icon: ClockIcon },
    { href: '/empleado/gastos', label: isImpersonating ? 'Tickets de Gasto' : 'Mis Tickets de Gasto', icon: ReceiptPercentIcon },
    { href: '/peticiones', label: 'Peticiones y Mejoras', icon: ChatBubbleLeftEllipsisIcon },
  ];

  if (mostrarAprobar) {
    navItems.push({
      href: '/empleado/gastos/aprobar',
      label: 'Aprobar Tickets',
      icon: CheckBadgeIcon,
    });
  }

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        {mobileOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r transform transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-6 py-5 border-b">
            <h1 className="text-lg font-bold text-gray-900">Internet Operadores</h1>
            <p className="text-xs text-gray-500 mt-0.5">Portal Empleado</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map(item => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-orange-50 text-orange-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-orange-600' : 'text-gray-400'}`} />
                  {item.label}
                </Link>
              );
            })}

            {/* Link al panel admin si tiene acceso (SUPER_ADMIN, GERENTE, o permisos granulares) */}
            {(esSuperAdmin || user.role === 'GERENTE' || (user as any).permisos?.length > 0 || (user as any).perfilAsignado) && (
              <div className="pt-4 mt-4 border-t">
                <Link
                  href="/admin"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  <ShieldCheckIcon className="h-5 w-5 text-gray-400" />
                  Panel Admin
                </Link>
              </div>
            )}
          </nav>

          {/* User info */}
          <div className="px-4 py-4 border-t">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                <span className="text-sm font-bold text-orange-700">
                  {user.name?.[0] || user.email?.[0] || '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="mt-3 w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 rounded-lg hover:bg-red-50"
            >
              <ArrowLeftOnRectangleIcon className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
