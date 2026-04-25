# AI Gateway setup

De leveranciers-PDF flow gebruikt 4 AI-endpoints die via **Vercel AI Gateway**
draaien voor failover, observability en prompt-caching:

| Endpoint                              | Model                          | Doel |
|---------------------------------------|--------------------------------|------|
| `/api/ai/detect-leverancier`          | `anthropic/claude-haiku-4-5`   | Snel + goedkoop classificatie |
| `/api/ai/extract-offerte`             | `anthropic/claude-sonnet-4-5`  | Element-extractie + confidence |
| `/api/ai/detect-remove-regions`       | `anthropic/claude-sonnet-4-5`  | Vision: prijzen wegwissen |
| `/api/ai/apply-corrections`           | `anthropic/claude-sonnet-4-5`  | Correctie-loop met thinking |

## Environment variabelen

Stel in **Vercel** (Project → Settings → Environment Variables):

| Variabele             | Verplicht | Bron |
|-----------------------|-----------|------|
| `AI_GATEWAY_API_KEY`  | Ja        | Vercel dashboard → AI Gateway → Create Key |
| `ANTHROPIC_API_KEY`   | Optioneel | Fallback voor lokale `next dev` als je geen Gateway-key gebruikt |
| `CRON_SECRET`         | Ja        | Random string. Beschermt `/api/cron/*` endpoints |

Voor lokale development: zet ze in `.env.local`. Als beide ontbreken weigeren
de endpoints met een 500.

## Prompt caching

Alle 4 endpoints sturen `providerOptions.anthropic.cacheControl = { type: 'ephemeral' }`.
Anthropic cachet dan de system-prompt (en in vision: ook de geuploade afbeelding-tekst)
voor 5 minuten. Vanaf de 2e call met dezelfde system-prompt: ~90% korting op input-tokens.

## Failover

AI Gateway probeert automatisch een tweede provider als Anthropic rate-limited
of een 5xx geeft. Dit wordt geconfigureerd in het Vercel AI Gateway dashboard
(per project). Aanbevolen fallback voor onze use case:

- Primair: `anthropic/claude-haiku-4-5` (detect-leverancier)
- Fallback: `anthropic/claude-sonnet-4-5`

## Observability

Per call zie je in Vercel dashboard:
- Latency
- Input + output tokens
- Cache hit ratio
- Kosten per request
- Error rates

Filter op `route` in het dashboard om per-endpoint cijfers te zien.

## Lokaal testen zonder Gateway

Als `AI_GATEWAY_API_KEY` ontbreekt valt de code automatisch terug op
`ANTHROPIC_API_KEY` (provider-direct). Geen code-wijziging nodig.
