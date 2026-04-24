'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogIn, Mail, KeyRound } from 'lucide-react'
import { loginStep1, loginStep2 } from './actions'

export default function LoginPage() {
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const fd = new FormData()
    fd.set('email', email)
    fd.set('password', password)
    const result = await loginStep1(fd)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    if (result.klant) { router.push('/portaal'); router.refresh(); return }
    if (result.twofa) { setStep(2); return }
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const fd = new FormData()
    fd.set('code', code)
    const result = await loginStep2(fd)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    router.push('/')
    router.refresh()
  }

  async function vraagNieuweCode() {
    setError(''); setLoading(true)
    const fd = new FormData()
    fd.set('email', email); fd.set('password', password)
    const result = await loginStep1(fd)
    setLoading(false)
    if (result.error) setError(result.error)
    else setError('Nieuwe code verstuurd')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Rebu</h1>
            <p className="text-gray-500 mt-1">{step === 1 ? 'Log in op uw account' : 'Bevestig met code uit uw e-mail'}</p>
          </div>

          {step === 1 ? (
            <form onSubmit={handleStep1} className="space-y-4">
              {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">E-mailadres</label>
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="uw@email.nl" autoComplete="email" />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Wachtwoord</label>
                <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="••••••••" autoComplete="current-password" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <LogIn className="h-4 w-4" />
                {loading ? 'Bezig...' : 'Inloggen'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleStep2} className="space-y-4">
              <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-md p-3 flex items-start gap-2">
                <Mail className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <span>We hebben een 6-cijferige code gestuurd naar <strong>{email}</strong>. De code is 5 minuten geldig.</span>
              </div>
              {error && <div className={`${error === 'Nieuwe code verstuurd' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'} text-sm p-3 rounded-md`}>{error}</div>}
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">Inlogcode</label>
                <input id="code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="000000" autoComplete="one-time-code" />
              </div>
              <button type="submit" disabled={loading || code.length !== 6}
                className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <KeyRound className="h-4 w-4" />
                {loading ? 'Controleren...' : 'Bevestigen'}
              </button>
              <div className="text-center text-xs text-gray-500">
                Geen code ontvangen?{' '}
                <button type="button" onClick={vraagNieuweCode} disabled={loading} className="text-primary hover:underline disabled:opacity-50">
                  Stuur nieuwe code
                </button>
                <span className="mx-2">·</span>
                <button type="button" onClick={() => { setStep(1); setCode(''); setError('') }} className="text-primary hover:underline">
                  Terug
                </button>
              </div>
            </form>
          )}

          {step === 1 && (
            <div className="mt-6 text-center text-sm text-gray-500 space-y-2">
              <p>
                <Link href="/wachtwoord-vergeten" className="text-primary hover:underline">Wachtwoord vergeten?</Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
