'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Mail, CheckCircle, XCircle, Clock, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { updateAanvraagStatus } from '@/lib/actions'

interface Aanvraag {
  id: string
  titel: string
  omschrijving: string | null
  status: string
  prioriteit: string
  created_at: string
  relatie_id: string | null
  relatie_naam: string | null
  offerte_id: string | null
}

export function AanvragenView({ aanvragen }: { aanvragen: Aanvraag[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<'alle' | 'open' | 'afgerond'>('open')
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const filtered = aanvragen.filter(a => {
    if (filter === 'open') return a.status !== 'afgerond'
    if (filter === 'afgerond') return a.status === 'afgerond'
    return true
  })

  const openCount = aanvragen.filter(a => a.status !== 'afgerond').length
  const afgerondCount = aanvragen.filter(a => a.status === 'afgerond').length

  async function handleStatusChange(id: string, status: string) {
    setLoadingId(id)
    await updateAanvraagStatus(id, status)
    setLoadingId(null)
    router.refresh()
  }

  const filterButtons = [
    { label: `Open (${openCount})`, value: 'open' as const },
    { label: `Afgerond (${afgerondCount})`, value: 'afgerond' as const },
    { label: `Alle (${aanvragen.length})`, value: 'alle' as const },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offerte aanvragen</h1>
          <p className="text-sm text-gray-500 mt-1">Aanvragen uit e-mail die nog verwerkt moeten worden</p>
        </div>
      </div>

      <div className="flex gap-1">
        {filterButtons.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              filter === f.value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Geen aanvragen gevonden</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {filtered.map(aanvraag => {
                // Extract email info from omschrijving
                const emailMatch = aanvraag.omschrijving?.match(/E-mail van (.+?): "(.+)"/)
                const afzender = emailMatch?.[1] || 'Onbekend'
                const onderwerp = emailMatch?.[2] || aanvraag.omschrijving || '-'

                return (
                  <div key={aanvraag.id} className="px-4 py-3 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                    <div className="mt-1">
                      {aanvraag.status === 'afgerond' ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <Clock className="h-5 w-5 text-orange-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{onderwerp}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-500">Van: {afzender}</p>
                        {aanvraag.relatie_naam && (
                          <span className="text-xs font-medium text-primary">→ {aanvraag.relatie_naam}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge status={aanvraag.prioriteit}>{aanvraag.prioriteit}</Badge>
                        <Badge status={aanvraag.status}>{aanvraag.status}</Badge>
                        <span className="text-xs text-gray-400">
                          {format(new Date(aanvraag.created_at), 'd MMM yyyy HH:mm', { locale: nl })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {aanvraag.status !== 'afgerond' && (
                        <>
                          {aanvraag.relatie_id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                setLoadingId(aanvraag.id)
                                await updateAanvraagStatus(aanvraag.id, 'in_uitvoering')
                                if (aanvraag.offerte_id) {
                                  router.push(`/offertes/${aanvraag.offerte_id}`)
                                } else {
                                  router.push(`/offertes/nieuw?relatie_id=${aanvraag.relatie_id}`)
                                }
                              }}
                              disabled={loadingId === aanvraag.id}
                              className="text-primary hover:text-primary/80 hover:bg-primary/5"
                            >
                              <FileText className="h-4 w-4" />
                              {aanvraag.offerte_id ? 'Offerte bewerken' : 'Offerte aanmaken'}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStatusChange(aanvraag.id, 'in_uitvoering')}
                            disabled={loadingId === aanvraag.id || aanvraag.status === 'in_uitvoering'}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            In behandeling
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStatusChange(aanvraag.id, 'afgerond')}
                            disabled={loadingId === aanvraag.id}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Afgerond
                          </Button>
                        </>
                      )}
                      {aanvraag.status === 'afgerond' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStatusChange(aanvraag.id, 'open')}
                          disabled={loadingId === aanvraag.id}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          Heropenen
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
