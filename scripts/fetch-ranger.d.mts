export interface FetchResult {
  ok: boolean
  id: string
  form: string
  dir?: string
  written?: { file: string; bytes: number }[]
  bullets?: string[]
  gamedata?: boolean
  error?: string
}
export function fetchRanger(id: string, rangersDir: string, form?: 'body' | 'e-body'): Promise<FetchResult>
export function listRemote(id: string): Promise<string[]>
