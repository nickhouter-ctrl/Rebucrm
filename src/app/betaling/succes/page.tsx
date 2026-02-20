import Link from 'next/link'
import { CheckCircle } from 'lucide-react'

export default function BetalingSuccesPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="h-10 w-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Betaling geslaagd!</h1>
        <p className="text-gray-600 mb-6">
          Uw betaling is succesvol verwerkt. U ontvangt een bevestiging per e-mail.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-white hover:bg-primary/90"
        >
          Terug naar home
        </Link>
      </div>
    </div>
  )
}
