'use client'

import { Button } from '@/components/ui/button'
import { ArrowLeft, User, Building2, FolderKanban } from 'lucide-react'

export function StapType({
  relatieName,
  projectName,
  onSelectType,
  onBack,
}: {
  relatieName: string
  projectName: string
  onSelectType: (type: 'particulier' | 'zakelijk') => void
  onBack: () => void
}) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Type offerte</h2>
          <p className="text-sm text-gray-500 mt-1">Kies het type offerte</p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Terug
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 flex items-center gap-2">
        <FolderKanban className="h-4 w-4 text-blue-600" />
        <span className="text-sm text-blue-800">
          Klant: <strong>{relatieName}</strong> &middot; Project: <strong>{projectName}</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => onSelectType('particulier')}
          className="flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-gray-200 hover:border-primary hover:bg-blue-50/50 transition-all group"
        >
          <div className="p-4 rounded-full bg-blue-50 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
            <User className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">Particulier</h3>
            <p className="text-sm text-gray-500 mt-1">Inclusief montage, sloop, afwerking en bouwbak</p>
          </div>
        </button>

        <button
          onClick={() => onSelectType('zakelijk')}
          className="flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-gray-200 hover:border-primary hover:bg-blue-50/50 transition-all group"
        >
          <div className="p-4 rounded-full bg-blue-50 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
            <Building2 className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">Zakelijk</h3>
            <p className="text-sm text-gray-500 mt-1">Alleen levering kunststof kozijnen</p>
          </div>
        </button>
      </div>
    </div>
  )
}
