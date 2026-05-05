"use client";
export const dynamic = "force-dynamic";

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [userType, setUserType] = useState<'admin' | 'cliente'>('admin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const errorParam = searchParams.get('error')

  const handleMicrosoftLogin = () => {
    setLoading(true)
    signIn('azure-ad', { callbackUrl: '/admin' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const csrfRes = await fetch('/api/auth/csrf')
      const csrfData = await csrfRes.json()

      const loginRes = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email,
          password,
          userType,
          csrfToken: csrfData.csrfToken,
          json: 'true',
        }),
        redirect: 'follow',
      })

      const sessionRes = await fetch('/api/auth/session')
      const session = await sessionRes.json()

      if (session?.user?.email) {
        const callbackUrl = searchParams.get('callbackUrl')
        if (callbackUrl) {
          window.location.href = callbackUrl
        } else {
          window.location.href = userType === 'admin' ? '/admin' : '/cliente'
        }
      } else {
        setError('Email o contraseña incorrectos')
        setLoading(false)
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('Error al iniciar sesión. Inténtelo de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        {/* Logo */}
        <div className="flex justify-center">
          <span className="text-3xl font-bold">
            <span className="text-black">internet</span>
            <span className="text-orange-500">operadores</span>
          </span>
        </div>

        <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
          Iniciar sesión
        </h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        {/* Error messages */}
        {(error || errorParam === 'unauthorized') && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">
              {errorParam === 'unauthorized' 
                ? 'Tu cuenta de Microsoft no está autorizada para acceder al panel. Contacta con el administrador.'
                : error}
            </p>
          </div>
        )}

        {/* Selector de tipo de usuario */}
        <div className="mb-6">
          <div className="flex rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setUserType('admin')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                userType === 'admin'
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Administrador
            </button>
            <button
              type="button"
              onClick={() => setUserType('cliente')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                userType === 'cliente'
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Cliente
            </button>
          </div>
        </div>

        {/* Botón Microsoft - solo para admins */}
        {userType === 'admin' && (
          <>
            <button
              type="button"
              onClick={handleMicrosoftLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-md bg-[#2F2F2F] px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1a1a1a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F2F2F] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
              </svg>
              {loading ? 'Conectando...' : 'Iniciar sesión con Microsoft'}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-gray-50 px-2 text-gray-500">o con email y contraseña</span>
              </div>
            </div>
          </>
        )}

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-900">
              Email
            </label>
            <div className="mt-2">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm sm:leading-6"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium leading-6 text-gray-900">
              Contraseña
            </label>
            <div className="mt-2">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-md border-0 px-3 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm sm:leading-6"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-md bg-orange-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-orange-600 border-r-transparent"></div>
          <p className="mt-2 text-sm text-gray-600">Cargando...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
