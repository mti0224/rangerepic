export function buildGameData(id: string): Promise<unknown | null>
export function writeGameData(id: string, rangersDir: string): Promise<{ ok: boolean; id: string; error?: string }>
