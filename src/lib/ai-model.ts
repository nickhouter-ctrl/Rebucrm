import { gateway } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

// Helper die het juiste model retourneert:
// - Als AI_GATEWAY_API_KEY aanwezig is: via Vercel AI Gateway (failover, observability, billing via Vercel)
// - Anders: direct via @ai-sdk/anthropic (vereist ANTHROPIC_API_KEY)
//
// Geeft één en hetzelfde LanguageModel object terug zodat call-sites niets
// hoeven te weten over de bron. Switchen tussen Gateway en direct kost dan
// alleen een env-var.
//
// Slug-formaat: 'anthropic/claude-sonnet-4-5' → wordt direct doorgegeven aan
// gateway(). Voor de fallback splitsen we op '/' en strippen we de provider.
export function aiModel(slug: string) {
  if (process.env.AI_GATEWAY_API_KEY) {
    return gateway(slug)
  }
  // Fallback: direct provider. Strip 'anthropic/' prefix.
  const modelId = slug.replace(/^anthropic\//, '')
  return anthropic(modelId)
}

// Centrale, configureerbare modelkeuze per taak. Defaults = de huidige modellen
// (gedrag blijft identiek). Via env kun je veilig een nieuwer model proberen —
// bv. AI_MODEL_VISION='anthropic/claude-sonnet-4-6' — en bij problemen direct
// terugzetten zonder code te wijzigen.
export const AI_MODELS = {
  detect: process.env.AI_MODEL_DETECT || 'anthropic/claude-haiku-4-5',
  extract: process.env.AI_MODEL_EXTRACT || 'anthropic/claude-sonnet-4-5',
  vision: process.env.AI_MODEL_VISION || 'anthropic/claude-sonnet-4-5',
}
