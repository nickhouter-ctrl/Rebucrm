import {
  LayoutDashboard,
  Users,
  FileText,
  FilePen,
  Receipt,
  Package,
  FolderKanban,
  Clock,
  CheckSquare,
  Calendar,
  Inbox,
  BarChart3,
  Settings,
  Mail,
  UserSearch,
  HardHat,
  AlertTriangle,
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
  { label: 'Leads', href: '/leads', icon: UserSearch },
  { label: 'Offertes & Orders', href: '/offertes', icon: FileText },
  { label: 'Concept offertes', href: '/offertes/concepten', icon: FilePen },
  { label: 'Facturatie', href: '/facturatie', icon: Receipt },
  { label: 'Producten', href: '/producten', icon: Package },
  { label: 'Verkoopkansen', href: '/projecten', icon: FolderKanban },
  { label: 'Urenregistratie', href: '/uren', icon: Clock },
  { label: 'Medewerkers', href: '/medewerkers', icon: HardHat },
  { label: 'Agenda', href: '/agenda', icon: Calendar },
  { label: 'Taken', href: '/taken', icon: CheckSquare },
  { label: 'Aanvragen', href: '/aanvragen', icon: Inbox },
  { label: 'E-mail', href: '/email', icon: Mail },
  { label: 'Documenten inbox', href: '/documenten', icon: Inbox },
  { label: 'Faalkosten', href: '/faalkosten', icon: AlertTriangle },
  { label: 'Rapportages', href: '/rapportages', icon: BarChart3 },
  { label: 'Beheer', href: '/beheer', icon: Settings },
]

export const relatieTypes = ['particulier', 'zakelijk'] as const
export type RelatieType = (typeof relatieTypes)[number]

export const offerteStatussen = ['concept', 'verzonden', 'geaccepteerd', 'afgewezen', 'verlopen'] as const
export type OfferteStatus = (typeof offerteStatussen)[number]

export const orderStatussen = ['nieuw', 'moet_besteld', 'besteld', 'in_behandeling', 'geleverd', 'gefactureerd', 'geannuleerd'] as const
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
  moet_besteld: 'bg-amber-100 text-amber-700',
  besteld: 'bg-cyan-100 text-cyan-700',
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
  offerte_aanvraag: 'bg-green-100 text-green-700',
  offerte_reactie: 'bg-blue-100 text-blue-700',
  onzeker: 'bg-orange-100 text-orange-700',
  irrelevant: 'bg-gray-100 text-gray-400',
  gecontacteerd: 'bg-cyan-100 text-cyan-700',
  offerte_verstuurd: 'bg-indigo-100 text-indigo-700',
  gewonnen: 'bg-emerald-100 text-emerald-700',
  verloren: 'bg-red-100 text-red-700',
  werknemer: 'bg-blue-100 text-blue-700',
  zzp: 'bg-orange-100 text-orange-700',
  medewerker: 'bg-teal-100 text-teal-700',
}

export const leadStatussen = ['nieuw', 'gecontacteerd', 'offerte_verstuurd', 'gewonnen', 'verloren'] as const
export type LeadStatus = (typeof leadStatussen)[number]

export const medewerkerTypes = ['werknemer', 'zzp'] as const
export type MedewerkerType = (typeof medewerkerTypes)[number]

export const faalkostenCategorieen = ['verkeerde_maat', 'verkeerd_kozijn', 'verkeerde_kleur', 'transport_schade', 'montage_fout', 'overig'] as const
export type FaalkostenCategorie = (typeof faalkostenCategorieen)[number]

export const faalkostenCategorieLabels: Record<string, string> = {
  verkeerde_maat: 'Verkeerde maat',
  verkeerd_kozijn: 'Verkeerd kozijn',
  verkeerde_kleur: 'Verkeerde kleur',
  transport_schade: 'Transportschade',
  montage_fout: 'Montagefout',
  overig: 'Overig',
}
