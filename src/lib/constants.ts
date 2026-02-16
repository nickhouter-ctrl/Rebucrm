import {
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  Package,
  FolderKanban,
  Clock,
  CheckSquare,
  Inbox,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

export const navigationItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Relatiebeheer', href: '/relatiebeheer', icon: Users },
  { label: 'Offertes & Orders', href: '/offertes', icon: FileText },
  { label: 'Facturatie', href: '/facturatie', icon: Receipt },
  { label: 'Producten', href: '/producten', icon: Package },
  { label: 'Projecten', href: '/projecten', icon: FolderKanban },
  { label: 'Urenregistratie', href: '/uren', icon: Clock },
  { label: 'Taken & Agenda', href: '/taken', icon: CheckSquare },
  { label: 'Documenten inbox', href: '/documenten', icon: Inbox },
  { label: 'Rapportages', href: '/rapportages', icon: BarChart3 },
  { label: 'Beheer', href: '/beheer', icon: Settings },
]

export const relatieTypes = ['particulier', 'zakelijk'] as const
export type RelatieType = (typeof relatieTypes)[number]

export const offerteStatussen = ['concept', 'verzonden', 'geaccepteerd', 'afgewezen', 'verlopen'] as const
export type OfferteStatus = (typeof offerteStatussen)[number]

export const orderStatussen = ['nieuw', 'in_behandeling', 'geleverd', 'gefactureerd', 'geannuleerd'] as const
export type OrderStatus = (typeof orderStatussen)[number]

export const factuurStatussen = ['concept', 'verzonden', 'betaald', 'deels_betaald', 'vervallen', 'gecrediteerd'] as const
export type FactuurStatus = (typeof factuurStatussen)[number]

export const btwPercentages = [0, 9, 21] as const

export const taakPrioriteiten = ['laag', 'normaal', 'hoog', 'urgent'] as const
export type TaakPrioriteit = (typeof taakPrioriteiten)[number]

export const taakStatussen = ['open', 'in_uitvoering', 'afgerond'] as const
export type TaakStatus = (typeof taakStatussen)[number]

export const statusKleuren: Record<string, string> = {
  concept: 'bg-gray-100 text-gray-700',
  verzonden: 'bg-blue-100 text-blue-700',
  geaccepteerd: 'bg-green-100 text-green-700',
  afgewezen: 'bg-red-100 text-red-700',
  verlopen: 'bg-yellow-100 text-yellow-700',
  nieuw: 'bg-blue-100 text-blue-700',
  in_behandeling: 'bg-yellow-100 text-yellow-700',
  geleverd: 'bg-green-100 text-green-700',
  gefactureerd: 'bg-purple-100 text-purple-700',
  geannuleerd: 'bg-red-100 text-red-700',
  betaald: 'bg-green-100 text-green-700',
  deels_betaald: 'bg-yellow-100 text-yellow-700',
  vervallen: 'bg-red-100 text-red-700',
  gecrediteerd: 'bg-gray-100 text-gray-700',
  open: 'bg-blue-100 text-blue-700',
  in_uitvoering: 'bg-yellow-100 text-yellow-700',
  afgerond: 'bg-green-100 text-green-700',
  laag: 'bg-gray-100 text-gray-700',
  normaal: 'bg-blue-100 text-blue-700',
  hoog: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
  admin: 'bg-purple-100 text-purple-700',
  gebruiker: 'bg-blue-100 text-blue-700',
  readonly: 'bg-gray-100 text-gray-700',
  particulier: 'bg-blue-100 text-blue-700',
  zakelijk: 'bg-purple-100 text-purple-700',
}
