import type { BattleRulesV1, GameplayCharacter, GameplayClass } from './gameplaySchema'

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

export const listGameplayCharacters = async (): Promise<GameplayCharacter[]> =>
  (await request<{ characters: GameplayCharacter[] }>('/api/gameplay/characters')).characters

export const listGameplayClasses = async (): Promise<GameplayClass[]> =>
  (await request<{ classes: GameplayClass[] }>('/api/gameplay/classes')).classes

export const loadGameplayRules = async (): Promise<BattleRulesV1> =>
  (await request<{ rules: BattleRulesV1 }>('/api/gameplay/rules')).rules

export const saveGameplayCharacter = async (data: GameplayCharacter): Promise<void> => {
  await request('/api/gameplay/character/' + encodeURIComponent(data.id), { method: 'POST', body: JSON.stringify(data) })
}

export const deleteGameplayCharacter = async (id: string): Promise<void> => {
  await request('/api/gameplay/character/' + encodeURIComponent(id), { method: 'DELETE' })
}

export const saveGameplayClass = async (data: GameplayClass): Promise<void> => {
  await request('/api/gameplay/class/' + encodeURIComponent(data.id), { method: 'POST', body: JSON.stringify(data) })
}

export const deleteGameplayClass = async (id: string): Promise<void> => {
  await request('/api/gameplay/class/' + encodeURIComponent(id), { method: 'DELETE' })
}

export const saveGameplayRules = async (data: BattleRulesV1): Promise<void> => {
  await request('/api/gameplay/rules', { method: 'POST', body: JSON.stringify(data) })
}
