import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import prisma from './prisma'
import { verifyClienteCredentials, getClienteByEmail } from './ispgestion/service'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        userType: { label: "User Type", type: "text" } // 'admin' o 'cliente'
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !credentials?.userType) {
          return null
        }

        try {
          if (credentials.userType === 'admin') {
            // Login de admin
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

            // Actualizar último acceso
            await prisma.usuarioAdmin.update({
              where: { id: admin.id },
              data: { ultimoAcceso: new Date() }
            })

            return {
              id: admin.id.toString(),
              email: admin.email,
              name: admin.nombre,
              role: admin.rol,
              userType: 'admin'
            }
          } else if (credentials.userType === 'cliente') {
            // Login de cliente
            let cliente = await prisma.clienteWeb.findUnique({
              where: { email: credentials.email }
            })

            let isValidPassword = false;

            if (cliente) {
              // 1. Intentar login con la contraseña local
              isValidPassword = await bcrypt.compare(
                credentials.password,
                cliente.passwordHash
              )
            }

            if (!cliente || !isValidPassword) {
              // 2. Si falla o no existe, intentar validar contra ISPGestión
              const ispgestionId = await verifyClienteCredentials(credentials.email, credentials.password);

              if (ispgestionId) {
                // 3. Si es válido en ISPGestión, sincronizar y crear/actualizar localmente
                const clienteData = await getClienteByEmail(credentials.email);
                
                if (clienteData) {
                  const newPasswordHash = await bcrypt.hash(credentials.password, 10);
                  
                  cliente = await prisma.clienteWeb.upsert({
                    where: { email: credentials.email },
                    update: {
                      passwordHash: newPasswordHash,
                      nombre: clienteData.nombre, // Asumiendo que ISPGestión devuelve el nombre
                      ispGestionId: ispgestionId,
                    },
                    create: {
                      email: credentials.email,
                      passwordHash: newPasswordHash,
                      nombre: clienteData.nombre,
                      ispGestionId: ispgestionId,
                      newsletterSuscrito: false, // Por defecto, se puede actualizar después
                    }
                  });
                  isValidPassword = true; // El login fue exitoso vía ISPGestión
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.userType = user.userType
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
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
