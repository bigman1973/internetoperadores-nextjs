import 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    email: string
    name: string
    role?: string
    userType: 'admin' | 'cliente'
  }

  interface Session {
    user: {
      id: string
      email: string
      name: string
      role?: string
      userType: 'admin' | 'cliente'
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role?: string
    userType: 'admin' | 'cliente'
  }
}
