import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import AzureADProvider from 'next-auth/providers/azure-ad'
import bcrypt from 'bcryptjs'
import prisma from './prisma'
import { verifyClienteCredentials, getClienteByEmail } from './ispgestion/service'

export const authOptions: NextAuthOptions = {
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
                    cliente = await prisma.clienteWeb.create({
                      data: {
                        email: credentials.email,
                        passwordHash: newPasswordHash,
                        nombre: clienteData.nombre,
                        ispGestionId: ispgestionId,
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
          // Auto-crear usuario sin roles (solo Portal Empleado)
          admin = await prisma.usuarioAdmin.create({
            data: {
              email,
              nombre: user.name || email.split('@')[0],
              passwordHash: '', // No necesita password, usa Microsoft
              rol: 'VENTAS', // Rol mínimo requerido por el enum
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
      if (user) {
        token.id = user.id
        token.role = user.role
        token.roles = user.roles || []
        token.userType = user.userType
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
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.roles = (token.roles as string[]) || []
        session.user.userType = token.userType as 'admin' | 'cliente'
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
  secret: process.env.NEXTAUTH_SECRET,
}
