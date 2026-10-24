import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import AzureADProvider from 'next-auth/providers/azure-ad'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import prisma from './prisma'
import { verifyClienteCredentials, getClienteByEmail } from './ispgestion/service'
import { reconciliarContactosCrmConClientes } from './crm-contactos'
import {
  buildEffectiveImpersonationToken,
  encodeNextAuthSession,
  isActiveImpersonationToken,
  resolveLiveImpersonation,
  terminateImpersonationToken,
} from './impersonation'

const useSecureAuthCookies = process.env.NEXTAUTH_URL?.startsWith('https://') || process.env.VERCEL === '1'
const REAL_SESSION_MAX_AGE = 30 * 24 * 60 * 60

export const authOptions: NextAuthOptions = {
  // A single bounded session token is used by both normal and effective
  // sessions. NextAuth receives the same attributes when it refreshes
  // /api/auth/session. SameSite must stay Lax (NextAuth's default): the
  // Microsoft sign-in returns through a cross-site redirect chain and a Strict
  // cookie is not sent on it, which would loop users back to /login. Control
  // POSTs are protected separately by the Strict __Host CSRF cookie + Origin.
  useSecureCookies: useSecureAuthCookies,
  cookies: {
    sessionToken: {
      name: useSecureAuthCookies ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: { httpOnly: true, secure: useSecureAuthCookies, sameSite: 'lax', path: '/' },
    },
  },
  providers: [
    // Azure AD (Microsoft) para admins
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      authorization: {
        params: {
          scope: 'openid profile email',
        },
      },
    }),
    // Credentials para admins y clientes (legacy)
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        userType: { label: "User Type", type: "text" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !credentials?.userType) {
          return null
        }

        try {
          if (credentials.userType === 'admin') {
            const admin = await prisma.usuarioAdmin.findUnique({
              where: { email: credentials.email }
            })

            if (!admin || !admin.activo) {
              return null
            }

            const isValidPassword = await bcrypt.compare(
              credentials.password,
              admin.passwordHash
            )

            if (!isValidPassword) {
              return null
            }

            await prisma.usuarioAdmin.update({
              where: { id: admin.id },
              data: { ultimoAcceso: new Date() }
            })

            return {
              id: admin.id.toString(),
              email: admin.email,
              name: admin.nombre,
              role: admin.rol,
              roles: admin.roles || [],
              userType: 'admin'
            }
          } else if (credentials.userType === 'cliente') {
            let cliente = await prisma.clienteWeb.findFirst({
              where: { email: credentials.email, activo: true }
            })

            let isValidPassword = false;

            if (cliente) {
              isValidPassword = await bcrypt.compare(
                credentials.password,
                cliente.passwordHash
              )
            }

            if (!cliente || !isValidPassword) {
              const ispgestionId = await verifyClienteCredentials(credentials.email, credentials.password);

              if (ispgestionId) {
                const clienteData = await getClienteByEmail(credentials.email);
                
                if (clienteData) {
                  const newPasswordHash = await bcrypt.hash(credentials.password, 10);
                  
                  const existingCliente = await prisma.clienteWeb.findFirst({
                    where: { ispGestionId: ispgestionId }
                  });
                  
                  if (existingCliente) {
                    cliente = await prisma.clienteWeb.update({
                      where: { id: existingCliente.id },
                      data: {
                        passwordHash: newPasswordHash,
                        nombre: clienteData.nombre,
                        email: credentials.email,
                      }
                    });
                  } else {
                    const personaFisica = clienteData.personafisica === 1 || clienteData.personafisica === '1' || clienteData.personafisica === true;
                    cliente = await prisma.clienteWeb.create({
                      data: {
                        email: credentials.email,
                        passwordHash: newPasswordHash,
                        nombre: clienteData.nombre,
                        ispGestionId: ispgestionId,
                        personaFisica,
                        segmentoCrm: personaFisica ? 'PARTICULAR' : 'EMPRESA',
                        segmentoCrmActualizadoAt: new Date(),
                        segmentoCrmActualizadoPor: 'Alta desde ISPGestión',
                        newsletterSuscrito: false,
                      }
                    });
                  }
                  isValidPassword = true;
                }
              }
            }

            if (!cliente || !isValidPassword) {
              return null
            }

            await reconciliarContactosCrmConClientes([cliente.email])

            return {
              id: cliente.id.toString(),
              email: cliente.email,
              name: cliente.nombre,
              userType: 'cliente'
            }
          }

          return null
        } catch (error) {
          console.error('Error en authorize:', error)
          return null
        }
      }
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Si es login con Azure AD, verificar que el email es de la organización
      if (account?.provider === 'azure-ad') {
        const email = user.email?.toLowerCase()
        if (!email) return false

        // Dominios permitidos para acceso al panel
        const allowedDomains = ['@internetoperadores.com', '@lfgd.es', '@farmsplanet.es', '@elypseadvisory.com']
        if (!allowedDomains.some(domain => email.endsWith(domain))) {
          return '/login?error=unauthorized'
        }

        // Buscar si ya existe en la tabla usuarios_admin
        let admin = await prisma.usuarioAdmin.findUnique({
          where: { email }
        })

        if (admin && !admin.activo) {
          // Usuario desactivado por el admin
          return '/login?error=disabled'
        }

        if (!admin) {
          // Auto-crear usuario con rol VISOR (solo Portal Empleado)
          admin = await prisma.usuarioAdmin.create({
            data: {
              email,
              nombre: user.name || email.split('@')[0],
              passwordHash: '', // No necesita password, usa Microsoft
              rol: 'VISOR', // Rol mínimo: solo portal empleado
              roles: [], // Sin roles = solo acceso a Portal Empleado
              activo: true,
            }
          })
        }

        // Actualizar último acceso
        await prisma.usuarioAdmin.update({
          where: { id: admin.id },
          data: { ultimoAcceso: new Date() }
        })

        return true
      }
      return true
    },
    async jwt({ token, user, account }) {
      // A new login replaces any prior cookie. Middleware records LOGIN for an
      // existing acting cookie before NextAuth reaches this callback.
      if (isActiveImpersonationToken(token) && !user) {
        const live = await resolveLiveImpersonation(token)
        return buildEffectiveImpersonationToken(token, live)
      }

      if (user) {
        // A real sign-in replaces any previous effective identity. Do not let
        // a provider callback carry an old encrypted acting/original envelope
        // into the new account's JWT.
        delete token.impersonation
        delete token.original
        // `jti` is reissued by NextAuth whenever it encodes a JWE. Keep a
        // separate opaque source-session id encrypted in the JWT for ledger
        // binding and CSRF; it is deliberately never copied to Session.
        token.ioActuationSourceId = randomUUID()
        token.id = user.id
        token.role = user.role
        token.roles = user.roles || []
        token.userType = user.userType
        // Keep the source session's absolute expiry separately from a JWE exp
        // that NextAuth may refresh. An acting token can restore only this
        // encrypted original proof, never an extended super-admin session.
        token.sourceExpiresAt = Math.floor(Date.now() / 1000) + REAL_SESSION_MAX_AGE
      }

      // Si es login con Azure AD, obtener rol del usuario de la BD
      if (account?.provider === 'azure-ad' && user?.email) {
        const admin = await prisma.usuarioAdmin.findUnique({
          where: { email: user.email.toLowerCase() }
        })
        if (admin) {
          token.id = admin.id.toString()
          token.role = admin.rol
          token.roles = admin.roles || []
          token.userType = 'admin'
        }
      }

      return token
    },
    async session({ session, token }) {
      // Re-read the immutable ledger and both current accounts on every
      // getServerSession/useSession pass. A stale JWT role is never authority.
      if (isActiveImpersonationToken(token)) {
        const live = await resolveLiveImpersonation(token)
        const effective = await buildEffectiveImpersonationToken(token, live)
        token = effective
      }
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.role = token.role as string
        session.user.roles = (token.roles as string[]) || []
        session.user.userType = token.userType as 'admin' | 'cliente'
        const raw = token.impersonation as any
        if (raw) {
          session.impersonation = {
            sessionId: raw.sessionId,
            actorId: raw.actorId,
            actorName: raw.actorName,
            targetId: raw.targetId,
            targetName: raw.targetName,
            expiresAt: raw.expiresAt,
          }
        }
      }
      return session
    }
  },
  jwt: {
    encode: encodeNextAuthSession,
  },
  events: {
    async signOut({ token }) {
      // Errors are intentionally absorbed by the terminal append-only helper:
      // logout must still clear the browser cookie and can never preserve access.
      await terminateImpersonationToken(token, 'SIGN_OUT')
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: REAL_SESSION_MAX_AGE, // 30 días
  },
  secret: process.env.NEXTAUTH_SECRET,
}
