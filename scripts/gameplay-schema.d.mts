export const GAMEPLAY_SCHEMA_VERSION: number
export const GAMEPLAY_ID_RE: RegExp
export const EFFECT_TYPES: string[]
export const ABILITY_TRIGGERS: string[]
export const CONDITION_TYPES: string[]
export const CONDITION_OPERATORS: string[]
export const DEFAULT_BATTLE_RULES: Record<string, unknown>
export function validateCharacter(data: unknown, expectedId?: string): string[]
export function validateClass(data: unknown, expectedId?: string): string[]
export function validateBattleRules(data: unknown): string[]
