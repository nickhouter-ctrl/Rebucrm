'use client'

import { useState } from 'react'
import { acceptOffertePublic } from '@/lib/actions'
import { Check, FileText } from 'lucide-react'
import Image from 'next/image'

interface Regel {
  omschrijving: string
  aantal: number
  prijs: number
  btw_percentage: number
  totaal: number
}

interface Offerte {
  id: string
  offertenummer: string
  datum: string
  geldig_tot: string | null
  status: string
  onderwerp: string | null
  subtotaal: number
  btw_totaal: number
  totaal: number
  opmerkingen: string | null
  relatie: { bedrijfsnaam: string; contactpersoon: string | null } | null
  regels: Regel[]
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount)
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function OffertePublic({ offerte, token }: { offerte: Offerte; token: string }) {
  const [status, setStatus] = useState(offerte.status)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAccept() {
    if (!confirm('Weet u zeker dat u deze offerte wilt accepteren?')) return
    setLoading(true)
    setError('')
    const result = await acceptOffertePublic(token)
    if (result.error) {
      setError(result.error)
    } else {
      setStatus('geaccepteerd')
    }
    setLoading(false)
  }

  const isAccepted = status === 'geaccepteerd'
  const isExpired = status === 'verlopen' || status === 'afgewezen'
  const canAccept = status === 'verzonden' || status === 'concept'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-black">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <Image src="/images/logo-rebu.png" alt="Rebu Kozijnen" width={180} height={60} className="h-12 w-auto" />
            <div className="text-right">
              <p className="text-sm text-gray-400">Offerte</p>
              <p className="text-lg font-semibold text-white">{offerte.offertenummer}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Status banner */}
        {isAccepted && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <Check className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800">Offerte geaccepteerd</p>
              <p className="text-sm text-green-600">Bedankt! Wij nemen zo snel mogelijk contact met u op.</p>
            </div>
          </div>
        )}

        {isExpired && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="font-medium text-red-800">
              Deze offerte is {status === 'verlopen' ? 'verlopen' : 'afgewezen'}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Offerte details */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500">Aan</p>
                <p className="font-semibold text-gray-900 text-lg">{offerte.relatie?.bedrijfsnaam}</p>
                {offerte.relatie?.contactpersoon && (
                  <p className="text-sm text-gray-600">t.a.v. {offerte.relatie.contactpersoon}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Datum: {formatDate(offerte.datum)}</p>
                {offerte.geldig_tot && (
                  <p className="text-sm text-gray-500">Geldig tot: {formatDate(offerte.geldig_tot)}</p>
                )}
              </div>
            </div>
            {offerte.onderwerp && (
              <p className="mt-3 text-gray-700">Betreft: {offerte.onderwerp}</p>
            )}
          </div>

          {/* Regelitems */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Omschrijving</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Aantal</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Prijs</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">BTW</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Totaal</th>
                </tr>
              </thead>
              <tbody>
                {offerte.regels.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-6 py-3 text-sm">{r.omschrijving}</td>
                    <td className="px-4 py-3 text-sm text-right">{r.aantal}</td>
                    <td className="px-4 py-3 text-sm text-right">{formatCurrency(r.prijs)}</td>
                    <td className="px-4 py-3 text-sm text-right">{r.btw_percentage}%</td>
                    <td className="px-6 py-3 text-sm text-right font-medium">{formatCurrency(r.aantal * r.prijs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totalen */}
          <div className="p-6 bg-gray-50 border-t border-gray-200">
            <div className="flex justify-end">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Subtotaal</span><span>{formatCurrency(offerte.subtotaal)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">BTW</span><span>{formatCurrency(offerte.btw_totaal)}</span></div>
                <div className="flex justify-between font-bold text-lg border-t border-gray-300 pt-2 mt-2">
                  <span>Totaal</span>
                  <span>{formatCurrency(offerte.totaal)}</span>
                </div>
              </div>
            </div>
          </div>

          {offerte.opmerkingen && (
            <div className="p-6 border-t border-gray-200">
              <p className="text-sm text-gray-500 mb-1">Opmerkingen</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{offerte.opmerkingen}</p>
            </div>
          )}
        </div>

        {/* Accepteren knop */}
        {canAccept && (
          <div className="mt-8 text-center">
            <button
              onClick={handleAccept}
              disabled={loading}
              className="inline-flex items-center gap-2 px-8 py-4 text-white font-semibold rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#00a66e' }}
            >
              <Check className="h-5 w-5" />
              {loading ? 'Bezig...' : 'Offerte accepteren'}
            </button>
            <p className="text-sm text-gray-500 mt-3">
              Door te accepteren gaat u akkoord met de voorwaarden in deze offerte.
            </p>
          </div>
        )}

        {/* PDF Download */}
        <div className="mt-6 text-center">
          <a
            href={`/api/pdf/offerte/${offerte.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 underline"
          >
            <FileText className="h-4 w-4" />
            Offerte PDF downloaden
          </a>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-xs text-gray-400 pb-8">
          <p>Rebu kozijnen B.V. | KVK: 907 204 74 | BTW: NL 865 427 926 B01</p>
          <p>Samsonweg 26F, 1521 RM Wormerveer | +31 6 58 86 60 70 | info@rebukozijnen.nl</p>
        </div>
      </div>
    </div>
  )
}
