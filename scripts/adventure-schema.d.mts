export const ADVENTURE_SCHEMA_VERSION: number
export const ADVENTURE_ID_RE: RegExp
export const ENEMY_SLOTS: string[]
export function validateEnemy(data: unknown, expectedId?: string): string[]
export function validateStage(data: unknown, expectedId?: string): string[]
