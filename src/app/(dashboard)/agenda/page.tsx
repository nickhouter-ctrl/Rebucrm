import { getAgendaItems, getAfspraken, getRelaties, getLeads, getProjecten } from '@/lib/actions'
import { AgendaView } from './agenda-view'

export const revalidate = 20

export default async function AgendaPage() {
  const [agendaItems, afspraken, relaties, leads, projecten] = await Promise.all([
    getAgendaItems(),
    getAfspraken(),
    getRelaties(),
    getLeads(),
    getProjecten(),
  ])

  return (
    <AgendaView
      agendaItems={agendaItems}
      afspraken={afspraken}
      relaties={relaties}
      leads={leads}
      projecten={projecten}
    />
  )
}
