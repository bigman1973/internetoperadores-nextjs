import 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    email: string
    name: string
    role?: string
    roles?: string[]
    userType: 'admin' | 'cliente'
  }

  interface Session {
    user: {
      id: string
      email: string
      name: string
      role?: string
      roles?: string[]
      userType: 'admin' | 'cliente'
    }
    /** Trazabilidad de una identidad efectiva; no concede ningún permiso. */
    impersonation?: {
      sessionId: string
      actorId: string
      actorName: string
      targetId: string
      targetName: string
      expiresAt: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role?: string
    roles?: string[]
    userType: 'admin' | 'cliente'
    impersonation?: {
      v: 'v1'
      sessionId: string
      actorId: string
      actorName: string
      targetId: string
      targetName: string
      expiresAt: string
      sourceSessionHash: string
    }
    /** Cifrado dentro del JWE; nunca se expone en Session ni se persiste. */
    original?: JWT
    sourceExpiresAt?: number
    /** Identificador opaco estable frente a la rotación de `jti` del encoder. */
    ioActuationSourceId?: string
    /** Epoch opaco interno para rotar CSRF tras una restauración explícita. */
    ioActuationCsrfEpoch?: string
  }
}
