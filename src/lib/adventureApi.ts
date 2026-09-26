import type { GameplayEnemy, GameplayStage } from './adventureSchema'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = Array.isArray(data?.errors) ? ': ' + data.errors.join(' · ') : data?.error ? ': ' + data.error : ''
    throw new Error('HTTP ' + res.status + detail)
  }
  return data as T
}

export const listGameplayEnemies = async (): Promise<GameplayEnemy[]> =>
  (await request<{ enemies: GameplayEnemy[] }>('/api/gameplay/enemies')).enemies

export const listGameplayStages = async (): Promise<GameplayStage[]> =>
  (await request<{ stages: GameplayStage[] }>('/api/gameplay/stages')).stages

export const saveGameplayEnemy = async (data: GameplayEnemy): Promise<void> => {
  await request('/api/gameplay/enemy/' + encodeURIComponent(data.id), { method: 'POST', body: JSON.stringify(data) })
}

export const deleteGameplayEnemy = async (id: string): Promise<void> => {
  await request('/api/gameplay/enemy/' + encodeURIComponent(id), { method: 'DELETE' })
}

export const saveGameplayStage = async (data: GameplayStage): Promise<void> => {
  await request('/api/gameplay/stage/' + encodeURIComponent(data.id), { method: 'POST', body: JSON.stringify(data) })
}

export const deleteGameplayStage = async (id: string): Promise<void> => {
  await request('/api/gameplay/stage/' + encodeURIComponent(id), { method: 'DELETE' })
}

export async function loadAdventureCatalog(): Promise<{ enemies: GameplayEnemy[]; stages: GameplayStage[] }> {
  try {
    const [enemies, stages] = await Promise.all([listGameplayEnemies(), listGameplayStages()])
    return { enemies, stages }
  } catch {
    const candidates = ['/gameplay/adventure.json', 'gameplay/adventure.json']
    let lastError: unknown = null
    for (const url of [...new Set(candidates)]) {
      try {
        const res = await fetch(url, { cache: 'no-cache' })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const data = await res.json() as { enemies?: GameplayEnemy[]; stages?: GameplayStage[] }
        if (!Array.isArray(data.enemies) || !Array.isArray(data.stages)) throw new Error('關卡資料格式錯誤')
        return { enemies: data.enemies, stages: data.stages }
      } catch (error) { lastError = error }
    }
    throw lastError instanceof Error ? lastError : new Error('無法載入關卡資料')
  }
}
