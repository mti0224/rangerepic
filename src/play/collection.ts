// ====================================================
// collection.ts — ของที่ผู้เล่นมี: เลเวลฮีโร่ · ฮีโร่ที่ชอบ (กดดาว) · เซ็ตทีม · ด่านเนื้อเรื่อง · ซีซั่นพาส · กระเป๋าอุปกรณ์ · อุปกรณ์ที่ฮีโร่ใส่อยู่
//
// เก็บในเครื่อง (localStorage 'lr:collection') เหมือน profile.ts — ยังไม่มีเซิร์ฟเวอร์
// ตอนทดสอบ: ปรับเลเวลฮีโร่ / ตีบวกอุปกรณ์ได้ฟรี ไม่เสียทรัพยากร
// ของเริ่มต้น: อุปกรณ์ทุกแบบ แบบละ 5 ชิ้น (ค่าสุ่มของแต่ละชิ้นต่างกัน)
// ทุกหน้าที่ใช้ข้อมูลนี้ (หน้าฮีโร่ · กระเป๋า · จอดวล) อ่านจาก store เดียวกัน แก้ที่ไหนเห็นทุกที่
// ====================================================

import { useEffect, useState } from 'react'
import {
  GEAR, GEAR_BY_ID, clampGearLevel, clampHeroLevel, effectiveStats, gearPassives, rollLines,
  type GearItem, type GearSlot,
} from '@/lib/gear'
import type { RangerConfig, Stats } from '@/lib/rangerConfig'
import type { PassiveDef } from '@/lib/passives'
import { ui } from './uiText'
import { clampPassLevel } from '@/lib/seasonPass'

export const COPIES_PER_GEAR = 5
/** จัดเซ็ตทีมได้สูงสุดกี่ทีม */
export const MAX_TEAMS = 10
export const TEAM_NAME_MAX = 20

/** ช่องในทีม (ตรงกับ TeamBuilder: แถวหน้า 2 · แถวหลัง 3 · แถวพิเศษ 2) — ว่าง = null */
export const TEAM_KEYS = ['front-0', 'front-1', 'back-0', 'back-1', 'back-2', 'sup-0', 'sup-1'] as const
export type TeamKey = typeof TEAM_KEYS[number]
export type TeamSlotMap = Record<TeamKey, string | null>
export const emptySlots = (): TeamSlotMap => Object.fromEntries(TEAM_KEYS.map(k => [k, null])) as TeamSlotMap

/** ความคืบหน้าโหมดเนื้อเรื่อง */
export interface StoryProgress {
  /** ดาวที่ดีที่สุดของแต่ละด่าน (ผ่านแล้ว = 1–3) */
  stars: Record<string, number>
  /** ด่านที่เล่นอนิเมชั่นปลดล็อคไปแล้ว (เข้าแผนที่ครั้งต่อไปจะวนลูปเลย ไม่เล่นซ้ำ) */
  opened: string[]
  /** ด่านที่ตัวละครยืนอยู่บนแผนที่ */
  at: string | null
  /** เซ็ตทีมที่เลือกไว้ล่าสุดในหน้าด่าน */
  team: string | null
}
const emptyStory = (): StoryProgress => ({ stars: {}, opened: [], at: null, team: null })

/** ซีซั่นพาส: เลเวล 1–60 · ปลดล็อคพรีเมียมแล้วไหม · ช่องที่รับไปแล้ว ("f12" / "p30") */
export interface PassProgress { level: number; premium: boolean; claimed: string[] }
const emptyPass = (): PassProgress => ({ level: 1, premium: false, claimed: [] })

/** เซ็ตทีมที่จัดไว้ — เลือกใช้ได้ตอนเข้าโหมดต่างๆ */
export interface TeamPreset {
  id: string
  /** ว่าง = ใช้ชื่ออัตโนมัติ "ทีม n" ตามภาษา */
  name: string
  slots: TeamSlotMap
}

export interface Collection {
  v: 1
  /** เลเวลฮีโร่ (ไม่มี = Lv.1) */
  levels: Record<string, number>
  /** ฮีโร่ที่กดดาวไว้ (เรียงตามลำดับที่กด) */
  favorites: string[]
  /** เซ็ตทีม (เรียงตามลำดับที่สร้าง) */
  teams: TeamPreset[]
  story: StoryProgress
  pass: PassProgress
  gear: GearItem[]
  /** ฮีโร่ → ช่อง → uid ของอุปกรณ์ */
  equip: Record<string, Partial<Record<GearSlot, string>>>
}

const KEY = 'lr:collection'

/** ของเริ่มต้น: ทุกแบบ แบบละ 5 ชิ้น · ค่าสุ่มผูกกับ uid จึงได้ผลเดิมทุกครั้ง */
export function starterCollection(): Collection {
  const gear: GearItem[] = []
  GEAR.forEach((tpl, t) => {
    for (let i = 0; i < COPIES_PER_GEAR; i++) {
      const { subs, elem } = rollLines(tpl, (t + 1) * 1000 + i + 1)
      gear.push({ uid: `${tpl.id}#${i + 1}`, tpl: tpl.id, level: 0, subs, elem })
    }
  })
  return { v: 1, levels: {}, favorites: [], teams: [], story: emptyStory(), pass: emptyPass(), gear, equip: {} }
}

function load(): Collection {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Collection | null
    if (raw && raw.v === 1 && Array.isArray(raw.gear)) {
      // ของที่แบบถูกลบไปแล้ว → ทิ้ง · ช่องที่ชี้ไปของที่ไม่มีแล้ว → ล้าง
      const gear = raw.gear.filter(g => GEAR_BY_ID[g.tpl])
      const have = new Set(gear.map(g => g.uid))
      const equip: Collection['equip'] = {}
      for (const [id, slots] of Object.entries(raw.equip ?? {})) {
        const kept = Object.fromEntries(Object.entries(slots).filter(([, uid]) => uid && have.has(uid)))
        if (Object.keys(kept).length) equip[id] = kept
      }
      // ไฟล์ก่อนมีระบบดาว → ยังไม่มี favorites
      const favorites = Array.isArray(raw.favorites) ? raw.favorites.filter(x => typeof x === 'string') : []
      // ไฟล์ก่อนมีเซ็ตทีม → ยังไม่มี teams · ช่องที่ไม่รู้จักถูกตัดทิ้ง
      const teams = Array.isArray(raw.teams)
        ? raw.teams.filter(t => t && typeof t.id === 'string').map(t => ({
          id: t.id,
          name: typeof t.name === 'string' ? t.name.slice(0, TEAM_NAME_MAX) : '',
          slots: Object.fromEntries(TEAM_KEYS.map(k => [k, typeof t.slots?.[k] === 'string' ? t.slots[k] : null])) as TeamSlotMap,
        }))
        : []
      // ไฟล์ก่อนมีโหมดเนื้อเรื่อง → เริ่มใหม่
      const st = raw.story
      const story: StoryProgress = st && typeof st === 'object'
        ? {
          stars: st.stars && typeof st.stars === 'object' ? st.stars : {},
          opened: Array.isArray(st.opened) ? st.opened.filter(x => typeof x === 'string') : [],
          at: typeof st.at === 'string' ? st.at : null,
          team: typeof st.team === 'string' ? st.team : null,
        }
        : emptyStory()
      const ps = raw.pass
      const pass: PassProgress = ps && typeof ps === 'object'
        ? { level: clampPassLevel(ps.level), premium: ps.premium === true, claimed: Array.isArray(ps.claimed) ? ps.claimed.filter(x => typeof x === 'string') : [] }
        : emptyPass()
      return { v: 1, levels: raw.levels ?? {}, favorites, teams, story, pass, gear, equip }
    }
  } catch { /* ไม่มีค่าที่จำไว้ → ของเริ่มต้น */ }
  return starterCollection()
}

// ── store เดียวทั้งเกม ──
let state: Collection = load()
const listeners = new Set<(c: Collection) => void>()

export const getCollection = (): Collection => state

function commit(next: Collection): void {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* จำไม่ได้ก็เล่นได้ */ }
  for (const fn of listeners) fn(next)
}

/** คอมโพเนนต์ที่เรียกจะรีเรนเดอร์เมื่อของเปลี่ยน */
export function useCollection(): Collection {
  const [c, setC] = useState<Collection>(state)
  useEffect(() => {
    listeners.add(setC)
    setC(state)
    return () => { listeners.delete(setC) }
  }, [])
  return c
}

// ── อ่าน ──

export const heroLevel = (c: Collection, id: string): number => clampHeroLevel(c.levels[id] ?? 1)
export const isFavorite = (c: Collection, id: string): boolean => c.favorites.includes(id)
export const itemByUid = (c: Collection, uid: string | undefined): GearItem | undefined =>
  uid ? c.gear.find(g => g.uid === uid) : undefined

/** อุปกรณ์ที่ฮีโร่ตัวนี้ใส่อยู่ */
export function equippedItems(c: Collection, id: string): GearItem[] {
  const slots = c.equip[id] ?? {}
  return Object.values(slots).map(uid => itemByUid(c, uid)).filter((g): g is GearItem => !!g)
}

/** ชิ้นนี้ใส่อยู่กับใคร (ไม่มี = null) */
export function ownerOf(c: Collection, uid: string): string | null {
  for (const [id, slots] of Object.entries(c.equip)) if (Object.values(slots).includes(uid)) return id
  return null
}

/** ค่าพลังจริงของฮีโร่ในคลังของผู้เล่น (เลเวล + อุปกรณ์ + เซ็ต) */
export function heroStats(c: Collection, id: string, config: Pick<RangerConfig, 'stats' | 'element'>): Stats {
  return effectiveStats(config.stats, heroLevel(c, id), equippedItems(c, id), config.element)
}

/** พาสซีฟทั้งหมด = ของประจำตัว + โบนัสเซ็ต */
export function heroPassives(c: Collection, id: string, own: PassiveDef[] | undefined): PassiveDef[] {
  return [...(own ?? []), ...gearPassives(equippedItems(c, id))]
}

// ── เขียน ──

export function setHeroLevel(id: string, lv: number): void {
  commit({ ...state, levels: { ...state.levels, [id]: clampHeroLevel(lv) } })
}

/** กดดาว = เพิ่มเป็นฮีโร่ที่ชอบ · กดอีกที = เอาออก */
export function toggleFavorite(id: string): void {
  const favorites = state.favorites.includes(id) ? state.favorites.filter(x => x !== id) : [...state.favorites, id]
  commit({ ...state, favorites })
}

export function setGearLevel(uid: string, lv: number): void {
  commit({ ...state, gear: state.gear.map(g => (g.uid === uid ? { ...g, level: clampGearLevel(lv) } : g)) })
}

/** ใส่อุปกรณ์ — ถ้าชิ้นนี้อยู่กับฮีโร่ตัวอื่น ถอดออกจากตัวนั้นก่อน · ของเดิมในช่องกลับเข้ากระเป๋า */
export function equipGear(id: string, uid: string): void {
  const item = itemByUid(state, uid)
  if (!item) return
  const slot = GEAR_BY_ID[item.tpl].slot
  const equip: Collection['equip'] = {}
  for (const [h, slots] of Object.entries(state.equip)) {
    const kept = Object.fromEntries(Object.entries(slots).filter(([, u]) => u !== uid))
    if (Object.keys(kept).length) equip[h] = kept
  }
  equip[id] = { ...(equip[id] ?? {}), [slot]: uid }
  commit({ ...state, equip })
}

export function unequipGear(id: string, slot: GearSlot): void {
  const slots = { ...(state.equip[id] ?? {}) }
  delete slots[slot]
  const equip = { ...state.equip }
  if (Object.keys(slots).length) equip[id] = slots
  else delete equip[id]
  commit({ ...state, equip })
}

// ── เซ็ตทีม ──

/** ชื่อทีม — ยังไม่ตั้ง = "ทีม n" ตามภาษา */
export const teamName = (t: TeamPreset, index: number): string =>
  t.name.trim() || ui('teamDefaultName', { n: String(index + 1) })

/** เพิ่มทีมว่างต่อท้าย · เกินเพดานแล้ว = ไม่เพิ่ม (คืน null) */
export function addTeam(): string | null {
  if (state.teams.length >= MAX_TEAMS) return null
  const id = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
  commit({ ...state, teams: [...state.teams, { id, name: '', slots: emptySlots() }] })
  return id
}

export function renameTeam(id: string, name: string): void {
  commit({ ...state, teams: state.teams.map(t => (t.id === id ? { ...t, name: name.slice(0, TEAM_NAME_MAX) } : t)) })
}

/**
 * ใส่ฮีโร่ลงช่อง (null = ถอดออก) · ทีมเดียวกันห้ามซ้ำ:
 * ตัวนี้อยู่ช่องอื่นในทีมนี้แล้ว → ย้ายมา แล้วช่องเดิมได้ตัวที่อยู่ช่องนี้แทน (= สลับกัน)
 */
export function setTeamSlot(id: string, key: TeamKey, hero: string | null): void {
  commit({
    ...state,
    teams: state.teams.map(t => {
      if (t.id !== id) return t
      const slots = { ...t.slots }
      if (hero) for (const k of TEAM_KEYS) if (k !== key && slots[k] === hero) slots[k] = slots[key]
      slots[key] = hero
      return { ...t, slots }
    }),
  })
}

export function deleteTeam(id: string): void {
  commit({ ...state, teams: state.teams.filter(t => t.id !== id) })
}

// ── ซีซั่นพาส ──

export const setPassLevel = (lv: number): void => commit({ ...state, pass: { ...state.pass, level: clampPassLevel(lv) } })
export const setPassPremium = (on: boolean): void => commit({ ...state, pass: { ...state.pass, premium: on } })
/** จำว่ารับช่องเหล่านี้แล้ว (ของที่ได้ให้หน้าจอเป็นคนแจก — เงิน/เพชรอยู่ในโปรไฟล์) */
export function markPassClaimed(keys: string[]): void {
  const claimed = [...new Set([...state.pass.claimed, ...keys])]
  commit({ ...state, pass: { ...state.pass, claimed } })
}
/** ล้างซีซั่นพาส (ทดสอบ): เลเวล 1 · ยังไม่ปลดพรีเมียม · ยังไม่รับอะไร */
export const resetPass = (): void => commit({ ...state, pass: emptyPass() })

// ── โหมดเนื้อเรื่อง ──

export function setStory(patch: Partial<StoryProgress>): void {
  commit({ ...state, story: { ...state.story, ...patch } })
}

/** บันทึกผลด่าน — เก็บดาวที่ดีที่สุด · คืนค่าว่าเป็นการผ่านครั้งแรกไหม */
export function recordStage(stageId: string, stars: number): { firstClear: boolean } {
  const prev = state.story.stars[stageId] ?? 0
  if (stars > prev) commit({ ...state, story: { ...state.story, stars: { ...state.story.stars, [stageId]: stars } } })
  return { firstClear: prev === 0 && stars > 0 }
}

/** เพิ่มอุปกรณ์ชิ้นใหม่เข้ากระเป๋า (ของดรอป) — ค่าสุ่มผูกกับ uid · คืน uid */
export function addGear(tplId: string): string | null {
  const tpl = GEAR_BY_ID[tplId]
  if (!tpl) return null
  const n = state.gear.filter(g => g.tpl === tplId).reduce((m, g) => Math.max(m, Number(g.uid.split('#')[1]) || 0), 0) + 1
  const uid = `${tplId}#${n}`
  const seed = [...uid].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7)
  const { subs, elem } = rollLines(tpl, seed)
  commit({ ...state, gear: [...state.gear, { uid, tpl: tplId, level: 0, subs, elem }] })
  return uid
}

/** ล้างทั้งหมดกลับเป็นของเริ่มต้น */
export const resetCollection = (): void => commit(starterCollection())
