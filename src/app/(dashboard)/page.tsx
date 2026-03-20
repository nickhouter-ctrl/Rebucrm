import { getDashboardData, getMedewerkerDashboardData } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import { DashboardView } from './dashboard-view'
import { MedewerkerDashboard } from './medewerker-dashboard'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let rol = 'gebruiker'
  if (user) {
    const { data: profiel } = await supabase.from('profielen').select('rol').eq('id', user.id).single()
    if (profiel?.rol) rol = profiel.rol
  }

  if (rol === 'medewerker') {
    const medewerkerData = await getMedewerkerDashboardData()
    return <MedewerkerDashboard data={medewerkerData} />
  }

  const data = await getDashboardData()
  return <DashboardView data={data} />
}
