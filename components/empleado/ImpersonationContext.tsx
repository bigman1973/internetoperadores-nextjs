'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface Empleado {
  id: string;
  nombreCompleto: string;
  email: string;
  categoria?: string;
}

interface ImpersonationContextType {
  /** El empleado actualmente seleccionado (null = yo mismo) */
  impersonatedEmail: string | null;
  impersonatedEmpleado: Empleado | null;
  /** Lista de empleados disponibles para impersonar */
  empleados: Empleado[];
  /** Si el usuario puede impersonar */
  canImpersonate: boolean;
  /** Cambiar el empleado impersonado */
  setImpersonatedEmail: (email: string | null) => void;
  /** Generar query string para las APIs */
  getQueryParam: () => string;
}

const ImpersonationContext = createContext<ImpersonationContextType>({
  impersonatedEmail: null,
  impersonatedEmpleado: null,
  empleados: [],
  canImpersonate: false,
  setImpersonatedEmail: () => {},
  getQueryParam: () => '',
});

export function useImpersonation() {
  return useContext(ImpersonationContext);
}

// Roles y emails que pueden impersonar (mirror del backend)
const ROLES_ADMIN = ['SUPER_ADMIN', 'GERENTE'];
const EMAILS_ADMIN = [
  'victor@lfgd.es',
  'jordi@farmsplanet.es',
  'lorena.gimeno@internetoperadores.com',
  'david.perez@internetoperadores.com',
];

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [impersonatedEmail, setImpersonatedEmail] = useState<string | null>(null);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [canImpersonateState, setCanImpersonateState] = useState(false);

  useEffect(() => {
    if (!session?.user?.email) return;
    const email = session.user.email.toLowerCase();
    const role = (session.user as any).role || '';
    const isAdmin = ROLES_ADMIN.includes(role) || EMAILS_ADMIN.includes(email);
    setCanImpersonateState(isAdmin);

    if (isAdmin) {
      fetch('/api/empleado/empleados-lista')
        .then(r => r.json())
        .then(data => {
          if (data.empleados) setEmpleados(data.empleados);
        })
        .catch(() => {});
    }
  }, [session]);

  const impersonatedEmpleado = impersonatedEmail
    ? empleados.find(e => e.email === impersonatedEmail) || null
    : null;

  const getQueryParam = useCallback(() => {
    if (!impersonatedEmail) return '';
    return `as=${encodeURIComponent(impersonatedEmail)}`;
  }, [impersonatedEmail]);

  return (
    <ImpersonationContext.Provider
      value={{
        impersonatedEmail,
        impersonatedEmpleado,
        empleados,
        canImpersonate: canImpersonateState,
        setImpersonatedEmail,
        getQueryParam,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}
