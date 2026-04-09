#!/usr/bin/env node
/**
 * Clear cached email bodies so they get re-fetched with proper MIME parsing.
 * Detects base64-encoded bodies that weren't decoded.
 */
import { createSupabaseAdmin } from './db.mjs'

const supabase = await createSupabaseAdmin()

// Find emails with body_html or body_text that look like base64
let cleared = 0
let from = 0
while (true) {
  const { data } = await supabase
    .from('emails')
    .select('id, body_html, body_text')
    .or('body_html.neq.null,body_text.neq.null')
    .range(from, from + 999)
  if (!data || data.length === 0) break

  for (const email of data) {
    // Check if body looks like raw base64 (long string without HTML tags or normal text)
    const html = email.body_html || ''
    const text = email.body_text || ''
    const isBase64Html = html.length > 50 && !html.includes('<') && /^[A-Za-z0-9+/=\s]+$/.test(html.substring(0, 200))
    const isBase64Text = text.length > 50 && /^[A-Za-z0-9+/=\s]+$/.test(text.substring(0, 200))

    if (isBase64Html || isBase64Text) {
      await supabase
        .from('emails')
        .update({ body_html: null, body_text: null })
        .eq('id', email.id)
      cleared++
    }
  }
  from += 1000
}

console.log(`Cleared ${cleared} emails with broken base64 bodies. They will be re-fetched on next click.`)
