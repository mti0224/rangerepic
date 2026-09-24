// ====================================================
// ai.ts — สมองของออโต้/บอท: ให้คะแนนทุกทางเลือก (ท่า × เป้า) แล้วเลือกทางที่คุ้มที่สุด
//
// หน่วยคะแนน = "HP ที่เปลี่ยนไป" (ดาเมจที่ทำ / เลือดที่รักษา / ดาเมจที่กันได้) เทียบกันได้ทุกอย่าง
//
//   ตี       ดาเมจที่คาดว่าเข้า (หลบ คริ ธาตุ DEF บาเรีย โล่) ไม่นับส่วนที่เกินเลือด
//            + โบนัสฆ่าได้ = ความอันตรายของเป้า × KILL_TURNS (ตัดเทิร์นที่มันจะได้เล่นต่อ)
//   ดีบัฟ    ชะงัก/ห้ามสกิล/ลด ATK ฯลฯ = ความอันตรายของเป้า × เทิร์น × โอกาสติด (หักต้านทาน · สกิลวงกว้างติดยากกว่า)
//            ดาเมจต่อเนื่อง = ดาเมจต่อครั้ง × เทิร์น · ลดความเร็ว = ส่วนของเทิร์นที่เป้าเสีย
//   ดูดเลือด เลือดที่ฟื้นได้จริงของทุกตัวในขอบเขต (ไม่นับส่วนที่เกินเลือดเต็ม)
//   บัฟ      ฮีลนับเฉพาะเลือดที่หายจริง · โล่/บาเรีย/หลบ นับตามดาเมจที่ศัตรูน่าจะทำ
//            เพิ่ม ATK/คริ/ความเร็ว/ดึงเทิร์น นับตามพลังโจมตีของตัวที่ได้ · ได้ซ้ำของที่ยังมีอยู่ = คุ้มน้อยลง
//   พลังงาน  สกิล − Cost × ราคาพลังงาน · ตีปกติ + ราคาพลังงาน 1 หน่วย
//            ราคา = ความคุ้มเฉลี่ยของสกิลทั้งทีมต่อ 1 Cost → สกิลที่คุ้มน้อยกว่าค่าเฉลี่ยจะถูก "ดอง Cost"
//            พลังงานใกล้เต็มราคาถูกลง (รีบใช้ไม่ให้ล้น) · เหลือน้อยราคาแพงขึ้น
//   ตำแหน่ง  แทงค์ดึงความสนใจ (คะแนนการตีแทงค์ × threat) · ความแรงตามตำแหน่งคิดอยู่ใน expectedDamage แล้ว
//   ลำดับเทิร์น (มองล่วงหน้า): ฆ่าตัวที่ใกล้ถึงตาได้ค่ามากขึ้น · รุมตัวเดียวกัน (เพื่อนที่ได้เล่นก่อนเป้าช่วยปิดได้)
//            ตัวที่เพื่อนเก็บเองได้ → ปล่อยให้เพื่อน ไปเก็บตัวที่มีแต่เราถึง (เช่น นักฆ่าเก็บแถวหลัง)
//            เพื่อนที่จะโดนรุมจนล้มก่อนถึงตาตัวเอง → ฮีล/โล่/บาเรียให้ตัวนั้นคุ้มขึ้น · บัฟตัวที่กำลังจะล้ม = เสียเปล่า
//   สุ่มเล็กน้อย ±NOISE เพื่อไม่ให้เล่นซ้ำเป๊ะทุกเกม
// ====================================================

import { elementMultiplier } from '@/lib/rangerClass'
import type { ActionName } from '@/lib/rangerConfig'
import type { SkillDef, SkillEffect } from '@/lib/skills'
import { AREA_CONTROL_CHANCE, CAPS, isDebuff, isDot, type Battle, type StatusType, type Unit } from './battle'

const ACTIONS: ActionName[] = ['attack', 'skill1', 'skill2']
/** ฆ่าได้ = ตัดเทิร์นในอนาคตของเป้าไปราวกี่เทิร์น */
const KILL_TURNS = 3
/** ราคาพลังงาน = ความคุ้มเฉลี่ยต่อ Cost × ค่านี้ */
const ENERGY_PRICE_RATIO = 0.6
const NOISE = 0.06
/** มองลำดับเทิร์นล่วงหน้ากี่ตา */
const LOOKAHEAD = 12
/** ฆ่าตัวที่จะได้เล่นภายในกี่ตาถัดไป = ตัดดาเมจที่กำลังจะมา → โบนัสเพิ่ม */
const SOON_TURNS = 3
const SOON_KILL_BONUS = 0.6
/** ดาเมจเราไม่พอฆ่า แต่เพื่อนที่ได้เล่นก่อนเป้าปิดได้ → ได้โบนัสฆ่าส่วนนี้ */
const COMBO_KILL_SHARE = 0.5
/** ฆ่าได้ แต่เพื่อนที่ได้เล่นก่อนเป้าก็ฆ่าได้ → โบนัสฆ่าเหลือเท่านี้ */
const REDUNDANT_KILL = 0.5
/** เพื่อนที่จะล้มก่อนถึงตาตัวเอง: ช่วยชีวิตคุ้มขึ้นเท่านี้ */
const SAVE_BONUS = 0.8
/**
 * มองล่วงหน้าด้วยการจำลอง: ท่าที่คะแนนสูงสุด SEARCH_TOP อันดับ → ลองเล่นจริงในสำเนา แล้วเล่นต่ออีก SEARCH_TURNS ตา
 * (ทั้งสองทีมเล่นแบบให้คะแนน) SEARCH_ROLLOUTS รอบ → เลือกท่าที่ผลเฉลี่ยดีสุด
 */
const SEARCH_TOP = 3
const SEARCH_TURNS = 5
const SEARCH_ROLLOUTS = 3
/** โบนัสอันดับจากคะแนนเดิม (หน่วยเดียวกับผลจำลอง) — ผลจำลองสูสีกัน → เชื่อคะแนนเดิม */
const SEARCH_PRIOR = 0.03

/** caster = ตัวแถวพิเศษที่อัญเชิญมาร่าย (ไม่ระบุ = ท่าของตัวเอง) */
export interface Choice { action: ActionName; target: Unit; score: number; value: number; caster?: Unit }

export class BattleAI {
  constructor(private b: Battle, private rand: () => number) {}

  /** ลำดับเทิร์นล่วงหน้าของตานี้ (คิดครั้งเดียวต่อการตัดสินใจ) */
  private order: Unit[] = []
  private orderTurn = -1

  private refreshOrder(): void {
    if (this.orderTurn === this.b.turn) return
    this.order = this.b.previewOrder(LOOKAHEAD)
    this.orderTurn = this.b.turn
  }

  /** อีกกี่ตาตัวนี้จะได้เล่น (0 = ตาถัดไปเลย · ไม่อยู่ในช่วงที่มอง = LOOKAHEAD) */
  private nextTurnOf(u: Unit): number {
    const i = this.order.findIndex(x => x.uid === u.uid)
    return i < 0 ? LOOKAHEAD : i
  }

  /** ดาเมจที่ศัตรูของ u จะทำใส่ u ก่อน u ได้เล่นครั้งถัดไป (ประมาณ: ศัตรูที่ได้เล่นก่อน × ความแรงหารจำนวนเป้า) */
  private incomingBeforeTurn(u: Unit): number {
    const mine = this.nextTurnOf(u)
    const targets = Math.max(1, this.allies(u).length)
    let dmg = 0
    for (const f of this.enemies(u)) {
      if (this.nextTurnOf(f) >= mine) continue
      // ตีแรงใส่ตัวที่เลือดน้อย/โดนเล็งง่ายกว่า — ให้ตัวนี้รับส่วนแบ่งมากกว่าค่าเฉลี่ยเล็กน้อย
      dmg += Math.min(this.b.expectedDamage(f, u, 250), u.maxHp) / targets * 1.5
    }
    return dmg
  }

  /** ดาเมจที่เพื่อน (ไม่รวม actor) จะทำใส่ t ก่อน t ได้เล่น — ใช้ดูว่ารุมปิดได้ไหม */
  private allyDamageBefore(actor: Unit, t: Unit): number {
    const theirs = this.nextTurnOf(t)
    let dmg = 0
    for (const a of this.allies(actor)) {
      if (a === actor || this.nextTurnOf(a) >= theirs) continue
      // ตีถึงเป้าได้จริงเท่านั้น (แถวหลังโดนได้แค่นักฆ่า/ตอนแถวหน้าว่าง)
      if (!this.b.selectableTargets(a, 'attack').includes(t)) continue
      dmg += this.b.expectedDamage(a, t, 100, true) * (1 - this.b.evadeChance(a, t, true) / 100)
    }
    return dmg
  }

  // ── ค่าประเมินพื้นฐาน ──

  private allies(u: Unit): Unit[] { return this.b.units.filter(x => x.alive && x.team === u.team) }
  private enemies(u: Unit): Unit[] { return this.b.units.filter(x => x.alive && x.team !== u.team) }

  /** ดาเมจเฉลี่ยต่อ 1 เทิร์นที่ตัวนี้น่าจะทำได้ (ใช้วัด "ความอันตราย") */
  threat(u: Unit): number {
    const critExp = 1 + (this.b.effCrit(u) / 100) * (this.b.effCritDmg(u) / 100 - 1)
    const tr = this.b.trait(u)
    const power = Math.max(tr.normalDamage ?? 1, tr.skillDamage ?? 1)
    return this.b.effAtk(u) * 1.4 * critExp * 0.75 * this.b.damageMult * (this.b.effSpd(u) / 100) * power
  }

  /** ดาเมจที่ทีมศัตรูน่าจะทำใส่ "ตัวหนึ่ง" ต่อเทิร์น */
  private incomingPerUnit(u: Unit): number {
    const foes = this.enemies(u)
    const mates = this.allies(u).length || 1
    return foes.reduce((n, f) => n + this.threat(f), 0) / mates
  }

  private hpWithShield(u: Unit): number {
    const shield = u.statuses.find(s => s.type === 'shield')
    return u.hp + (shield?.shieldHp ?? 0)
  }

  private statusLeft(u: Unit, type: StatusType): number {
    return u.statuses.find(s => s.type === type)?.turns ?? 0
  }

  // ── คะแนนของท่าโจมตีต่อเป้าหนึ่งตัว ──

  private attackValueOn(actor: Unit, skill: SkillDef, normal: boolean, t: Unit): number {
    const hit = 1 - this.b.evadeChance(actor, t, normal) / 100
    const breaks = skill.effects.some(e => e.type === 'breakInvincible')
    if (this.b.has(t, 'barrier') && !breaks) return 0

    let value = 0
    const ehp = this.hpWithShield(t)
    const shieldHp = ehp - t.hp
    const truePct = skill.effects.filter(e => e.type === 'trueDamage').reduce((n, e) => n + (e.pct ?? 0), 0)
    // ดาเมจอิง ATK (damage) + อิง HP สูงสุดของผู้ร่าย (damageHp) — ฐานต่างกัน คิดแยกแล้วรวม
    // pierce = ส่วนที่ข้ามโล่ขาวลงเลือดตรงๆ
    let dmg = 0
    let pierced = 0
    for (const e of skill.effects) {
      if (e.type !== 'damage' && e.type !== 'damageHp') continue
      const d = this.b.expectedDamage(actor, t, e.pct ?? 100, normal, e.type === 'damageHp' ? actor.maxHp : undefined)
      dmg += d
      pierced += d * Math.max(0, Math.min(100, e.pierce ?? 0)) / 100
    }
    // ความเสียหายจริงลงเลือดตรง (โล่รับแค่ส่วนดาเมจปกติที่ไม่ข้ามโล่)
    const trueDmg = truePct > 0 ? this.b.trueHit(actor, t, truePct) : 0
    let kills = false
    if (dmg > 0 || trueDmg > 0) {
      const blockable = dmg - pierced
      const hpLoss = Math.min(t.hp, Math.max(0, blockable - shieldHp) + pierced + trueDmg)
      kills = hpLoss >= t.hp
      value += (Math.min(blockable, shieldHp) + hpLoss) * hit
      // ฆ่าได้ (ดาเมจเฉลี่ยพอ) → ได้โบนัสตามความอันตราย · ใกล้ถึงตาเป้า = ตัดดาเมจที่กำลังจะมา → คุ้มขึ้น
      const soon = this.nextTurnOf(t) < SOON_TURNS ? 1 + SOON_KILL_BONUS : 1
      // เพื่อนที่ได้เล่นก่อนเป้าฆ่าเองได้อยู่แล้ว → เก็บตัวนี้ไว้ให้เพื่อน ไปเก็บตัวที่มีแต่เราถึง (คุ้มน้อยลง)
      const redundant = kills && this.allyDamageBefore(actor, t) >= ehp ? REDUNDANT_KILL : 1
      if (kills) value += (this.threat(t) * KILL_TURNS * soon + t.maxHp * 0.05) * hit * redundant
      // ไม่พอฆ่าเอง แต่เพื่อนที่ได้เล่นก่อนเป้าปิดได้ → รุมตัวเดียวกัน
      else if (!this.b.has(t, 'barrier') && (dmg + trueDmg) * hit + this.allyDamageBefore(actor, t) >= ehp) {
        value += this.threat(t) * KILL_TURNS * soon * COMBO_KILL_SHARE * hit
      }
    }
    const survives = !kills
    if (breaks && this.b.has(t, 'barrier')) value += this.incomingPerUnit(t) * 0.5

    const land = hit * (1 - this.b.resistChance(t) / 100) * (survives ? 1 : 0)
    const control = AREA_CONTROL_CHANCE[skill.area] ?? 1
    for (const e of skill.effects) {
      value += this.debuffValue(actor, t, e) * land * (e.type === 'stun' || e.type === 'silence' ? control : 1)
    }
    if (skill.effects.some(e => e.type === 'dispelBuffs') && survives) {
      value += t.statuses.filter(s => !isDebuffType(s.type)).length * this.threat(t) * 0.4 * hit
    }
    // แทงค์ดึงความสนใจ: บอทให้ค่าการตีแทงค์สูงกว่าจริงเล็กน้อย
    return value * (this.b.trait(t).threat ?? 1)
  }

  private debuffValue(actor: Unit, t: Unit, e: SkillEffect): number {
    const turns = e.turns ?? 1
    const already = (type: StatusType) => Math.max(0, turns - this.statusLeft(t, type))
    const th = this.threat(t)
    const teamDmg = this.allies(actor).reduce((n, a) => n + this.threat(a), 0) / Math.max(1, this.enemies(actor).length)
    switch (e.type) {
      case 'stun': return t.stunGuard > 0 ? 0 : th * already('stun')
      case 'silence': return this.b.energy[t.team] >= 2 ? th * 0.6 * already('silence') : th * 0.1
      case 'atkDown': return th * ((e.pct ?? 0) / 100) * already('atkDown')
      case 'evadeDown': return teamDmg * Math.min(this.b.effEvade(t), e.pct ?? 0) / 100 * already('evadeDown')
      case 'skillEvadeDown': return teamDmg * 0.4 * Math.min(this.b.effSkillEvade(t), e.pct ?? 0) / 100 * already('skillEvadeDown')
      case 'skillResDown': return th * 0.15 * ((e.pct ?? 0) / 100) * already('skillResDown')
      case 'healBlock': {
        // ลดการฟื้นฟู: ฟื้นฟูต่อเนื่องที่มีอยู่ + ทีมมีฮีล/ดูดเลือด (คิดตาม % ที่ลด)
        const regen = t.statuses.find(s => s.type === 'regen')
        const healers = this.allies(t).some(a => this.healsOthers(a))
        const cut = Math.min(100, e.pct || 100) / 100
        return ((regen ? t.maxHp * regen.pct / 100 : 0) + (healers ? (t.maxHp - t.hp) * 0.15 + th * 0.1 : th * 0.05)) * cut * already('healBlock')
      }
      // เปราะบาง: ดาเมจที่ทีมเราจะทำใส่ตัวนี้แรงขึ้นตาม %
      case 'vulnerable': return Math.min(teamDmg * ((e.pct ?? 0) / 100) * already('vulnerable'), this.hpWithShield(t))
      // ขัดขวางการล้าง: มีค่าเมื่อเป้าติดดีบัฟอยู่ และฝั่งมันมีตัวล้าง
      case 'sealCleanse': {
        const debuffs = t.statuses.filter(s => isDebuffType(s.type)).reduce((n, st) => n + (isDot(st.type) ? this.b.dotTick(t, st) : th * 0.5) * st.turns, 0)
        return debuffs * 0.5 * already('sealCleanse')
      }
      // เร่งเทิร์น: เผาบัฟที่เหลือของเป้า + ดาเมจต่อเนื่องที่ทำงานทันที
      case 'turnBurn': {
        const n = e.turns ?? 1
        let v = 0
        for (const st of t.statuses) {
          const hit = Math.min(n, st.turns)
          if (isDot(st.type)) v += this.b.dotTick(t, st) * hit
          else if (!isDebuffType(st.type)) v += (st.type === 'barrier' ? this.incomingPerUnit(t) : th * 0.35) * hit
        }
        return v
      }
      // เปลี่ยนธาตุ: คุ้มเท่าที่ทีมเราตีแรงขึ้นจากตัวคูณธาตุใหม่
      case 'elementShift': {
        const now = this.b.effElement(t)
        const next = e.element
        if (!next) return 0
        const gain = this.allies(actor).reduce((n, a) => n + this.threat(a)
          * (elementMultiplier(this.b.effElement(a), next) - elementMultiplier(this.b.effElement(a), now)), 0)
          / Math.max(1, this.enemies(actor).length)
        return Math.max(0, gain) * already('elementShift')
      }
      case 'speedDown': return th * ((e.pct ?? 0) / 100) * 0.8 * already('speedDown')
      case 'hitDown': case 'skillHitDown': {
        // ตีปกติ ~60% ของดาเมจ · สกิล ~40% — โอกาสพลาดที่เพิ่มขึ้นเฉลี่ยทั้งทีมเรา (ติดเพดานหลบ)
        const normal = e.type === 'hitDown'
        const foes = this.enemies(t)
        if (!foes.length) return 0
        const extra = foes.reduce((n, f) => {
          const before = this.b.evadeChance(t, f, normal)
          const evade = normal ? this.b.effEvade(f) : this.b.effSkillEvade(f)
          const hit = (normal ? this.b.effHit(t) : this.b.effSkillHit(t)) - (e.pct ?? 0)
          const after = Math.max(0, Math.min(normal ? CAPS.evade : CAPS.skillEvade, evade - hit))
          return n + (after - before) / 100
        }, 0) / foes.length
        return th * (normal ? 0.6 : 0.4) * extra * already(e.type)
      }
      case 'critDown': return th * Math.min(this.b.effCrit(t), e.pct ?? 0) / 100 * Math.max(0, this.b.effCritDmg(t) / 100 - 1) * already('critDown')
      case 'critDmgDown': return th * (this.b.effCrit(t) / 100) * Math.min(Math.max(0, this.b.effCritDmg(t) - 100), e.pct ?? 0) / 100 * already('critDmgDown')
      case 'poison': case 'burn': case 'bleed': {
        const tick = this.b.dotTick(t, { type: e.type, pct: e.pct ?? 0, turns, appliedTurn: 0, srcAtk: this.b.effAtk(actor), srcElement: actor.element })
        return Math.min(tick * already(e.type), this.hpWithShield(t))
      }
      default: return 0
    }
  }

  /** ตัวนี้มีสกิลฮีล/ฟื้นฟู/ดูดเลือด (ใช้ประเมินค่าของห้ามฟื้นฟู) */
  private healsOthers(u: Unit): boolean {
    return (['skill1', 'skill2'] as const).some(k => u.skills[k].effects.some(e => e.type === 'heal' || e.type === 'regen' || e.type === 'lifesteal'))
      || (this.b.trait(u).lifesteal ?? 0) > 0
  }

  /** ดูดเลือดของท่านี้: เลือดที่ฟื้นได้จริง (ดาเมจคาดการณ์รวม × %) */
  private lifestealValue(actor: Unit, skill: SkillDef, normal: boolean, targets: Unit[]): number {
    let value = 0
    for (const e of skill.effects) {
      if (e.type !== 'lifesteal') continue
      const dmgEffects = skill.effects.filter(x => x.type === 'damage' || x.type === 'damageHp')
      const truePct = skill.effects.filter(x => x.type === 'trueDamage').reduce((n, x) => n + (x.pct ?? 0), 0)
      const dmgOn = (t: Unit) => dmgEffects.reduce((n, x) => n
        + this.b.expectedDamage(actor, t, x.pct ?? 100, normal, x.type === 'damageHp' ? actor.maxHp : undefined), 0)
      const dealt = targets.reduce((n, t) => n + (this.b.has(t, 'barrier') ? 0 : Math.min(dmgOn(t) + (truePct > 0 ? this.b.trueHit(actor, t, truePct) : 0), this.hpWithShield(t)) * (1 - this.b.evadeChance(actor, t, normal) / 100)), 0)
      const list = this.b.lifestealTargets(actor, e.scope ?? 'self')
      const each = dealt * (e.pct ?? 0) / 100 / Math.max(1, list.length)
      for (const u of list) {
        if (!this.b.canHeal(u)) continue
        value += Math.min(u.maxHp - u.hp, each) * (1 + (1 - u.hp / u.maxHp))
      }
    }
    return value
  }

  // ── คะแนนของบัฟต่อเพื่อนหนึ่งตัว ──

  private buffValueOn(t: Unit, e: SkillEffect, caster?: Unit): number {
    const turns = e.turns ?? 1
    const pct = (e.pct ?? 0) / 100
    // จำนวนฮีล/โล่จริงตามสเกลที่เลือก (เลือดเป้า · เลือดผู้ร่าย · ATK ผู้ร่าย) + พลังสายซัพ
    const amount = caster ? this.b.healBase(caster, t, e) : t.maxHp * pct
    const incoming = this.incomingPerUnit(t)
    const th = this.threat(t)
    const fresh = (type: StatusType) => Math.max(0, turns - this.statusLeft(t, type))
    const missing = t.maxHp - t.hp
    // เลือดยิ่งน้อย การช่วยตัวนั้นยิ่งเร่งด่วน · จะล้มก่อนถึงตาตัวเอง = ช่วยชีวิต คุ้มขึ้นอีก
    const soonDmg = this.incomingBeforeTurn(t)
    const dying = soonDmg >= this.hpWithShield(t)
    const urgency = (1 + (1 - t.hp / t.maxHp)) * (dying ? 1 + SAVE_BONUS : 1)
    // บัฟโจมตีใส่ตัวที่กำลังจะล้ม = ได้ใช้ไม่ทัน
    const lives = dying ? 0.3 : 1
    const healable = this.b.canHeal(t) ? 1 : 0
    switch (e.type) {
      case 'heal': return Math.min(missing, amount) * urgency * healable
      case 'regen': return Math.min(missing + incoming, amount * fresh('regen')) * 0.8 * healable
      // ดึงเทิร์น: ได้เล่นเร็วขึ้นราว pct ของเทิร์น (ตัวเองไม่ได้ — คิดใน valueOf)
      case 'actionAdvance': return th * pct * lives
      case 'shield': return Math.min(amount, incoming * turns) * 0.8 * urgency
      case 'barrier': return incoming * fresh('barrier') * urgency
      case 'evadeUp': return incoming * 0.6 * pct * fresh('evadeUp')
      case 'skillEvadeUp': return incoming * 0.4 * pct * fresh('skillEvadeUp')
      case 'skillResUp': return incoming * 0.15 * pct * fresh('skillResUp')
      case 'atkUp': return th * pct * fresh('atkUp') * lives
      case 'speedUp': return th * pct * fresh('speedUp') * lives
      case 'critUp': return th * pct * Math.max(0, this.b.effCritDmg(t) / 100 - 1) * fresh('critUp') * lives
      case 'critDmgUp': return th * (this.b.effCrit(t) / 100) * pct * fresh('critDmgUp') * lives
      case 'hitUp': {
        const foeEvade = this.enemies(t).reduce((n, f) => n + this.b.effEvade(f), 0) / Math.max(1, this.enemies(t).length)
        return th * Math.min(pct * 100, Math.max(0, foeEvade - this.b.effHit(t))) / 100 * fresh('hitUp')
      }
      case 'skillHitUp': {
        const foeEvade = this.enemies(t).reduce((n, f) => n + this.b.effSkillEvade(f), 0) / Math.max(1, this.enemies(t).length)
        return th * 0.4 * Math.min(pct * 100, Math.max(0, foeEvade - this.b.effSkillHit(t))) / 100 * fresh('skillHitUp')
      }
      case 'cleanse': return t.statuses.filter(s => isDebuffType(s.type)).reduce((n, s) => n + (isDot(s.type) ? this.b.dotTick(t, s) : th * 0.8) * s.turns, 0)
      case 'toughUp': return incoming * pct * fresh('toughUp') * urgency
      case 'skillDmgResUp': return incoming * 0.5 * pct * fresh('skillDmgResUp') * urgency
      // ยั่วยุ: ดึงการตีปกติของศัตรูมาที่ตัวนี้ — คุ้มเมื่อตัวนี้ถึกกว่าเพื่อนที่เหลือ
      case 'taunt': {
        const mates = this.allies(t).filter(a => a !== t)
        if (!mates.length) return 0
        const weakest = Math.min(...mates.map(a => this.hpWithShield(a)))
        const mine = this.hpWithShield(t)
        const tanky = this.b.trait(t).damageTaken ?? 1
        return Math.max(0, (mine - weakest) * 0.25 + incoming * (1 - tanky)) * fresh('taunt')
      }
      default: return 0
    }
  }

  // ── คะแนนรวมของ (ท่า, เป้า) ──

  /** ความคุ้มของท่า ไม่รวมเรื่องพลังงาน */
  valueOf(actor: Unit, action: ActionName, chosen: Unit): number {
    const skill = this.b.skillOf(actor, action)
    const targets = this.b.affectedUnits(actor, action, chosen)
    // แลกของผู้ร่าย: เสียเลือด / ทำตัวเองเปราะบาง — หักออกจากคะแนน
    const selfCost = skill.effects.reduce((n, e) => {
      if (e.type === 'selfHpCost') {
        const cost = Math.min(actor.hp - 1, actor.maxHp * (e.pct ?? 0) / 100)
        return n + Math.max(0, cost) * (1 + (1 - actor.hp / actor.maxHp))
      }
      if (e.type === 'selfVulnerable') return n + this.incomingPerUnit(actor) * ((e.pct ?? 0) / 100) * (e.turns ?? 1)
      return n
    }, 0)
    if (skill.kind === 'attack') {
      return targets.reduce((n, t) => n + this.attackValueOn(actor, skill, action === 'attack', t), 0)
        + this.lifestealValue(actor, skill, action === 'attack', targets) - selfCost
    }
    let value = -selfCost
    for (const t of targets) for (const e of skill.effects) if (!(e.type === 'actionAdvance' && t === actor)) value += this.buffValueOn(t, e, actor)
    for (const e of skill.effects) {
      if (e.type === 'energyGain') value += (e.amount ?? 1) * this.energyPrice(actor, true)
    }
    return value
  }

  /** เป้าที่ดีที่สุดของท่านี้ (ตีทั้งแถว: เทียบทีละแถว · ตีทั้งหมด/บัฟทั้งทีม: ผลเท่ากันทุกตัวที่เลือก) */
  bestTarget(actor: Unit, action: ActionName): { target: Unit; value: number } | null {
    this.refreshOrder()
    const list = this.b.selectableTargets(actor, action)
    if (!list.length) return null
    const area = this.b.skillOf(actor, action).area
    const candidates = area === 'all' || area === 'ally_all' || area === 'self' || area === 'own_row'
      ? [list[0]]
      : area === 'row'
        ? [...new Map(list.map(u => [u.row, u])).values()]
        : list
    let best: { target: Unit; value: number } | null = null
    for (const t of candidates) {
      const value = this.valueOf(actor, action, t)
      if (!best || value > best.value) best = { target: t, value }
    }
    return best
  }

  /**
   * ราคาของพลังงาน 1 หน่วย ณ ตอนนี้ (หน่วยเดียวกับคะแนน)
   * = ความคุ้มเฉลี่ยของสกิลในทีมต่อ 1 Cost × ENERGY_PRICE_RATIO · ปรับตามพลังงานที่มี
   */
  energyPrice(actor: Unit, forGain = false): number {
    let sum = 0, n = 0
    for (const a of this.allies(actor)) {
      for (const action of ['skill1', 'skill2'] as ActionName[]) {
        const cost = this.b.costOf(a, action)
        if (cost <= 0) continue
        const best = this.bestTargetNoEnergy(a, action)
        if (best) { sum += best / cost; n++ }
      }
    }
    const base = n ? (sum / n) * ENERGY_PRICE_RATIO : 0
    const energy = this.b.energy[actor.team]
    if (forGain && energy >= this.b.energyMax) return 0
    // ใกล้เต็ม → รีบใช้ · เหลือน้อย → เก็บไว้
    const scarcity = energy >= this.b.energyMax - 1 ? 0.1 : energy >= 7 ? 0.5 : energy <= 1 ? 1.3 : 1
    return base * scarcity
  }

  /** ความคุ้มของเป้าที่ดีที่สุด โดยไม่คิดพลังงาน (กันวนซ้ำตอนคำนวณราคาพลังงาน) */
  private bestTargetNoEnergy(actor: Unit, action: ActionName): number | null {
    const skill = this.b.skillOf(actor, action)
    if (skill.effects.every(e => e.type === 'energyGain')) return null
    const list = this.b.selectableTargets(actor, action)
    if (!list.length) return null
    const candidates = skill.area === 'all' || skill.area === 'ally_all' || skill.area === 'self' || skill.area === 'own_row'
      ? [list[0]]
      : skill.area === 'row' || skill.area === 'row_any' ? [...new Map(list.map(u => [u.row, u])).values()] : list
    let best = 0
    for (const t of candidates) {
      const targets = this.b.affectedUnits(actor, action, t)
      let v = 0
      if (skill.kind === 'attack') v = targets.reduce((n, x) => n + this.attackValueOn(actor, skill, action === 'attack', x), 0) + this.lifestealValue(actor, skill, action === 'attack', targets)
      else for (const x of targets) for (const e of skill.effects) if (!(e.type === 'actionAdvance' && x === actor)) v += this.buffValueOn(x, e, actor)
      best = Math.max(best, v)
    }
    return best
  }

  /** เลือกท่า + เป้าของเทิร์นนี้ */
  choose(actor: Unit): Choice | null {
    this.refreshOrder()
    const price = this.energyPrice(actor)
    const energyFull = this.b.energy[actor.team] >= this.b.energyMax
    const options: Choice[] = []
    for (const action of ACTIONS) {
      if (!this.b.canUse(actor, action)) continue
      const energy = action === 'attack'
        ? (energyFull ? 0 : price)
        : -this.b.costOf(actor, action) * price
      for (const c of this.candidates(actor, action)) {
        const score = (c.value + energy) * (1 + (this.rand() - 0.5) * NOISE)
        options.push({ action, target: c.target, score, value: c.value })
      }
    }
    // อัญเชิญแถวพิเศษ: สกิลของตัวนั้น (ค่าพลังของตัวนั้น) · Cost เท่าสกิล · ไม่ได้ +1 แบบตีปกติ
    for (const r of this.b.reserves[actor.team]) {
      this.b.prepareSummon(actor, r)
      for (const action of ['skill1', 'skill2'] as ActionName[]) {
        if (!this.b.canSummon(actor, r, action)) continue
        const energy = -this.b.costOf(r, action) * price
        for (const c of this.candidates(r, action)) {
          const score = (c.value + energy) * (1 + (this.rand() - 0.5) * NOISE)
          options.push({ action, target: c.target, score, value: c.value, caster: r })
        }
      }
    }
    if (!options.length) return null
    options.sort((a, b) => b.score - a.score)
    if (!this.b.aiSearch || options.length === 1) return options[0]
    return this.search(actor, options.slice(0, SEARCH_TOP))
  }

  /** ทุกเป้าที่ต่างกันจริงของท่านี้ พร้อมคะแนน (ตีทั้งแถว = แถวละตัว · ทั้งหมด/บัฟทั้งทีม = ตัวเดียว) */
  private candidates(actor: Unit, action: ActionName): { target: Unit; value: number }[] {
    const list = this.b.selectableTargets(actor, action)
    const area = this.b.skillOf(actor, action).area
    const picks = area === 'all' || area === 'ally_all' || area === 'self' || area === 'own_row'
      ? list.slice(0, 1)
      : area === 'row' || area === 'row_any' ? [...new Map(list.map(u => [u.row, u])).values()] : list
    return picks.map(t => ({ target: t, value: this.valueOf(actor, action, t) }))
  }

  /** ลองเล่นแต่ละตัวเลือกในสำเนา แล้วดูผลหลังผ่านไปอีกไม่กี่ตา — เลือกตัวที่ผลเฉลี่ยดีสุด */
  private search(actor: Unit, options: Choice[]): Choice {
    // ทุกตัวเลือกใช้ลูกเต๋าชุดเดียวกัน (seed เดียวกัน) → ต่างกันเพราะท่า ไม่ใช่เพราะดวง
    const seeds = Array.from({ length: SEARCH_ROLLOUTS }, () => Math.floor(this.b.nextRandom() * 2 ** 31))
    const top = options[0].score
    let best = options[0], bestScore = -Infinity
    for (const opt of options) {
      let total = 0
      for (let i = 0; i < SEARCH_ROLLOUTS; i++) {
        const sim = this.b.clone(seeds[i])
        sim.aiLevel = ['smart', 'smart']
        const me = sim.unit(actor.uid)!, target = sim.unit(opt.target.uid)!
        const caster = opt.caster ? sim.reserveOf(opt.caster.uid) : undefined
        sim.perform(me, { action: opt.action, target, caster })
        sim.endTurn(me)
        for (let k = 0; k < SEARCH_TURNS && !sim.over; k++) {
          const a = sim.nextActor()
          if (!a) break
          const st = sim.beginTurn(a)
          if (st.stunned || !a.alive) { sim.endTurn(a); continue }
          const p = sim.planAuto(a)
          if (!p) break
          sim.perform(a, p)
          sim.endTurn(a)
        }
        total += evaluate(sim, actor.team)
      }
      const prior = top > 0 ? Math.max(0, opt.score) / top : 0
      const score = total / SEARCH_ROLLOUTS + prior * SEARCH_PRIOR
      if (score > bestScore) { bestScore = score; best = opt }
    }
    return best
  }
}

const isDebuffType = (t: StatusType) => isDebuff(t)

/**
 * สถานการณ์ของทีม team (ยิ่งมากยิ่งดี): ชนะ/แพ้ = ค่ามาก ·
 * ไม่งั้น = (เลือด+โล่ % ของทีมเรา − ของศัตรู) + ตัวที่ยังยืน (ตัวละ 0.35 ของทีม) + พลังงานนิดหน่อย
 */
function evaluate(b: Battle, team: 0 | 1): number {
  if (b.over) return b.winner === team ? 100 : b.winner === null ? 0 : -100
  const side = (t: 0 | 1) => {
    let hp = 0, max = 0, alive = 0
    for (const u of b.units) {
      if (u.team !== t) continue
      max += u.maxHp
      if (!u.alive) continue
      alive++
      hp += u.hp + Math.min(u.maxHp * 0.5, u.statuses.find(s => s.type === 'shield')?.shieldHp ?? 0)
    }
    return (max ? hp / max : 0) + alive * 0.35 / 5 + b.energy[t] * 0.02
  }
  return side(team) - side(team === 0 ? 1 : 0)
}
