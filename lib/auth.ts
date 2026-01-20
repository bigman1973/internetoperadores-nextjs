import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import prisma from './prisma'

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
            const cliente = await prisma.clienteWeb.findUnique({
              where: { email: credentials.email }
            })

            if (!cliente) {
              return null
            }

            const isValidPassword = await bcrypt.compare(
              credentials.password,
              cliente.passwordHash
            )

            if (!isValidPassword) {
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
