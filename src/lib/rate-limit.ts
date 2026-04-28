// Simpele in-memory rate-limiter voor AI-endpoints.
// Werkt per Vercel-instance — voor productie is Upstash beter, maar dit is
// voldoende om oneigenlijk gebruik en spam te voorkomen.

const buckets = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; resetIn: number } {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, resetIn: windowMs }
  }
  if (bucket.count >= max) {
    return { ok: false, resetIn: bucket.resetAt - now }
  }
  bucket.count++
  return { ok: true, resetIn: bucket.resetAt - now }
}

// Cleanup oude buckets om memory leaks te voorkomen
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [k, b] of buckets.entries()) {
      if (b.resetAt < now) buckets.delete(k)
    }
  }, 5 * 60 * 1000).unref?.()
}

// Helper voor server-side route handlers: identificeer aanroeper via IP of user-id
export function getRateLimitKey(req: Request, suffix = ''): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
  return `${ip}:${suffix}`
}
