export interface LericoReport {
  ok: string[]
  missing: string[]
  sources: Record<string, string>
  error: string | null
}
export function fetchLericoData(opts?: { ids?: string[]; refresh?: boolean; log?: (s: string) => void }): Promise<LericoReport>
