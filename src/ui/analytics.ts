// No-op analytics helper. Cloudflare Web Analytics (script tag) is the only analytics.
export function track(_event: string, _data?: Record<string, string | number>): void {
  // intentionally empty — never put personal data in URLs
}
