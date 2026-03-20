'use client'

import { useState, useRef, useCallback } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Upload, CheckCircle, AlertTriangle, Loader2, ArrowLeft, ArrowRight, FileSpreadsheet } from 'lucide-react'
import { importLeads } from '@/lib/actions'
import { cn } from '@/lib/utils'

const LEAD_FIELDS = [
  { value: '', label: '-- Overslaan --' },
  { value: 'bedrijfsnaam', label: 'Bedrijfsnaam *' },
  { value: 'contactpersoon', label: 'Contactpersoon' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefoon', label: 'Telefoon' },
  { value: 'adres', label: 'Adres' },
  { value: 'postcode', label: 'Postcode' },
  { value: 'plaats', label: 'Plaats' },
  { value: 'notities', label: 'Notities' },
]

const COLUMN_ALIASES: Record<string, string[]> = {
  bedrijfsnaam: ['bedrijfsnaam', 'bedrijf', 'naam', 'company', 'name', 'organisatie', 'organization', 'klantnaam', 'relatienaam', 'lead'],
  contactpersoon: ['contactpersoon', 'contact', 'contactperson', 'aanspreekpunt', 'persoon'],
  email: ['email', 'e-mail', 'emailadres', 'e-mailadres', 'mail'],
  telefoon: ['telefoon', 'telefoonnummer', 'phone', 'tel', 'mobiel', 'mobile'],
  adres: ['adres', 'straat', 'address', 'straatnaam', 'street'],
  postcode: ['postcode', 'zip', 'zipcode', 'postal'],
  plaats: ['plaats', 'stad', 'city', 'woonplaats', 'vestigingsplaats'],
  notities: ['notities', 'opmerkingen', 'notes', 'opmerking', 'memo'],
}

interface ParsedData {
  headers: string[]
  rows: string[][]
}

type Step = 'upload' | 'mapping' | 'preview' | 'results'

interface ImportResult {
  imported: number
  duplicates: number
  duplicateNames: string[]
  invalid: number
  errors: string[]
}

async function parseFile(file: File): Promise<ParsedData> {
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension === 'csv') {
    const Papa = (await import('papaparse')).default
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const data = results.data as string[][]
          if (data.length < 2) {
            reject(new Error('Het bestand bevat geen data'))
            return
          }
          const [headers, ...rows] = data
          resolve({ headers: headers.map(h => String(h || '').trim()), rows })
        },
        error: (err: Error) => reject(err),
      })
    })
  }

  if (extension === 'xlsx' || extension === 'xls') {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })
    if (data.length < 2) throw new Error('Het bestand bevat geen data')
    const [headers, ...rows] = data.map(row => row.map(cell => String(cell ?? '').trim()))
    return { headers, rows }
  }

  throw new Error('Ongeldig bestandsformaat. Gebruik CSV of Excel (.xlsx)')
}

function autoDetectMapping(headers: string[]): Record<number, string> {
  const mapping: Record<number, string> = {}
  const usedFields = new Set<string>()

  headers.forEach((header, index) => {
    const normalized = header.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (usedFields.has(field)) continue
      const match = aliases.some(alias => {
        const normalizedAlias = alias.replace(/[^a-z0-9]/g, '')
        return normalized === normalizedAlias || normalized.includes(normalizedAlias)
      })
      if (match) {
        mapping[index] = field
        usedFields.add(field)
        break
      }
    }
  })

  return mapping
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Bestand' },
  { key: 'mapping', label: 'Kolommen' },
  { key: 'preview', label: 'Voorbeeld' },
  { key: 'results', label: 'Resultaat' },
]

export function ImportLeadsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('upload')
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [mapping, setMapping] = useState<Record<number, string>>({})
  const [fileName, setFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState('')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep('upload')
    setParsedData(null)
    setMapping({})
    setFileName('')
    setParseError('')
    setLoading(false)
    setImporting(false)
    setImportResult(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  const handleFile = useCallback(async (file: File) => {
    setLoading(true)
    setParseError('')
    setFileName(file.name)
    try {
      const data = await parseFile(file)
      setParsedData(data)
      const autoMapping = autoDetectMapping(data.headers)
      setMapping(autoMapping)
      setStep('mapping')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Fout bij het lezen van het bestand')
    } finally {
      setLoading(false)
    }
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function updateMapping(columnIndex: number, field: string) {
    setMapping(prev => {
      const updated = { ...prev }
      if (field === '') {
        delete updated[columnIndex]
      } else {
        for (const key of Object.keys(updated)) {
          if (updated[Number(key)] === field) {
            delete updated[Number(key)]
          }
        }
        updated[columnIndex] = field
      }
      return updated
    })
  }

  const hasBedrijfsnaam = Object.values(mapping).includes('bedrijfsnaam')

  function getMappedRows(): Record<string, string>[] {
    if (!parsedData) return []
    return parsedData.rows.map(row => {
      const mapped: Record<string, string> = {}
      for (const [colIndex, field] of Object.entries(mapping)) {
        const value = row[Number(colIndex)]
        if (value) mapped[field] = value
      }
      return mapped
    }).filter(row => row.bedrijfsnaam?.trim())
  }

  const mappedRows = step === 'preview' || step === 'results' ? getMappedRows() : []
  const totalRows = parsedData?.rows.length || 0
  const validRows = step === 'preview' || step === 'results' ? mappedRows.length : 0
  const skippedRows = totalRows - validRows

  async function handleImport() {
    setImporting(true)
    const rows = getMappedRows().map(row => ({
      bedrijfsnaam: row.bedrijfsnaam,
      contactpersoon: row.contactpersoon,
      email: row.email,
      telefoon: row.telefoon,
      adres: row.adres,
      postcode: row.postcode,
      plaats: row.plaats,
      notities: row.notities,
    }))

    const result = await importLeads(rows)
    if ('error' in result) {
      setParseError(result.error as string)
    } else {
      setImportResult(result as ImportResult)
      setStep('results')
    }
    setImporting(false)
  }

  const stepIndex = STEPS.findIndex(s => s.key === step)

  return (
    <Dialog open={open} onClose={handleClose} title="Leads importeren" className="max-w-3xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={cn(
              'flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors',
              i < stepIndex ? 'bg-green-100 text-green-700' :
              i === stepIndex ? 'bg-primary text-white' :
              'bg-gray-100 text-gray-400'
            )}>
              {i < stepIndex ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn(
              'text-xs font-medium',
              i === stepIndex ? 'text-gray-900' : 'text-gray-400'
            )}>{s.label}</span>
            {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors',
              dragOver ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'
            )}
          >
            {loading ? (
              <Loader2 className="h-8 w-8 mx-auto mb-3 text-primary animate-spin" />
            ) : (
              <Upload className="h-8 w-8 mx-auto mb-3 text-gray-400" />
            )}
            <p className="text-sm font-medium text-gray-700">
              {loading ? 'Bestand verwerken...' : 'Sleep een bestand hierheen of klik om te selecteren'}
            </p>
            <p className="text-xs text-gray-400 mt-1">CSV of Excel (.xlsx) bestanden</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
          {parseError && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{parseError}</p>
            </div>
          )}
        </div>
      )}

      {/* Step: Mapping */}
      {step === 'mapping' && parsedData && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FileSpreadsheet className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-600">{fileName} — {parsedData.rows.length} rijen, {parsedData.headers.length} kolommen</span>
          </div>

          {!hasBedrijfsnaam && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
              <p className="text-sm text-yellow-800">Koppel minimaal de kolom &ldquo;Bedrijfsnaam&rdquo; om door te gaan</p>
            </div>
          )}

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Kolom in bestand</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Voorbeeld</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Koppelen aan</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.headers.map((header, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{header}</td>
                    <td className="px-4 py-2 text-sm text-gray-500 truncate max-w-[200px]">
                      {parsedData.rows[0]?.[i] || '-'}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={mapping[i] || ''}
                        onChange={(e) => updateMapping(i, e.target.value)}
                        className={cn(
                          'w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                          mapping[i] ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-gray-300 text-gray-700'
                        )}
                      >
                        {LEAD_FIELDS.map(f => (
                          <option key={f.value} value={f.value} disabled={f.value !== '' && f.value !== mapping[i] && Object.values(mapping).includes(f.value)}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between mt-6">
            <Button variant="ghost" onClick={() => { setStep('upload'); setParsedData(null); setFileName('') }}>
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
            <Button onClick={() => setStep('preview')} disabled={!hasBedrijfsnaam}>
              Volgende
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
            <p className="text-sm text-blue-800">
              <strong>{validRows}</strong> leads gevonden
              {skippedRows > 0 && <>, <strong>{skippedRows}</strong> rijen zonder bedrijfsnaam worden overgeslagen</>}
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {Object.values(mapping).map(field => (
                    <th key={field} className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2 whitespace-nowrap">
                      {LEAD_FIELDS.find(f => f.value === field)?.label || field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappedRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Object.values(mapping).map(field => (
                      <td key={field} className="px-4 py-2 text-sm text-gray-700 truncate max-w-[200px]">
                        {row[field] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {validRows > 5 && (
            <p className="text-xs text-gray-400 mt-2 text-center">En nog {validRows - 5} meer...</p>
          )}

          <div className="flex justify-between mt-6">
            <Button variant="ghost" onClick={() => setStep('mapping')}>
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importeren...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {validRows} leads importeren
                </>
              )}
            </Button>
          </div>

          {parseError && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-700">{parseError}</p>
            </div>
          )}
        </div>
      )}

      {/* Step: Results */}
      {step === 'results' && importResult && (
        <div className="space-y-4">
          {importResult.imported > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-800">{importResult.imported} leads succesvol geimporteerd</p>
              </div>
            </div>
          )}

          {importResult.duplicates > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800">{importResult.duplicates} duplicaten overgeslagen</p>
                {importResult.duplicateNames.length > 0 && (
                  <p className="text-sm text-yellow-700 mt-1">
                    {importResult.duplicateNames.join(', ')}
                    {importResult.duplicates > importResult.duplicateNames.length && ` en nog ${importResult.duplicates - importResult.duplicateNames.length} meer`}
                  </p>
                )}
              </div>
            </div>
          )}

          {importResult.invalid > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-700">{importResult.invalid} rijen overgeslagen (geen bedrijfsnaam)</p>
            </div>
          )}

          {importResult.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="font-medium text-red-800">Fouten bij importeren:</p>
              {importResult.errors.map((err, i) => (
                <p key={i} className="text-sm text-red-700 mt-1">{err}</p>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={handleClose}>
              Sluiten
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
