// ====================================================
// GearUI — ชิ้นส่วนหน้าจอของระบบอุปกรณ์และเลเวลฮีโร่
//
//   GearTile      ช่องไอคอนอุปกรณ์ (กรอบสีตามระดับ · ธาตุมุมซ้ายบน · +ตีบวก · รูปฮีโร่ที่ใส่อยู่)
//   GearDetail    รายละเอียด 1 ชิ้น: ค่าหลัก · ค่าสุ่ม · ค่าธาตุ · เซ็ต 2/3 ชิ้น · ปุ่มตีบวก
//   GearPicker    หน้าต่างเลือกอุปกรณ์ใส่ช่องของฮีโร่ (เปิดจากช่องอุปกรณ์ในหน้าฮีโร่)
//   GearBag       หน้ากระเป๋า: ของทั้งหมด กรองตามช่อง เรียงตามระดับ/ขั้นตีบวก
//   LevelControl  ปรับเลเวลฮีโร่ (ตอนทดสอบ: ปรับได้อิสระ ไม่เสียทรัพยากร)
//
// ข้อมูลทั้งหมดอ่าน/เขียนผ่าน collection.ts — แก้ที่ไหนก็เห็นทุกหน้า
// ====================================================

import { useMemo, useState, type ReactNode } from 'react'
import {
  GEAR_BY_ID, GEAR_MAX_LEVEL, GEAR_SLOTS, HERO_MAX_LEVEL, RARITIES, SETS, heroLevelMul, itemLines, setCounts,
  type GearItem, type GearSlot, type Rarity, type StatKey, type StatLine,
} from '@/lib/gear'
import type { PassiveDef } from '@/lib/passives'
import type { Element } from '@/lib/rangerClass'
import type { Stats } from '@/lib/rangerConfig'
import {
  equipGear, equippedItems, heroLevel, ownerOf, setGearLevel, setHeroLevel, unequipGear, useCollection, type Collection,
} from './collection'
import { elementName, localName } from './i18n'
import { IconBack, IconBag, IconMinus, IconPlus } from './icons'
import { ui, useLang, type UiKey } from './uiText'
import { UI_SRC } from './uiAssets'
import './gear.css'

// ─────────────────────────────── ป้าย ───────────────────────────────

const STAT_KEY: Record<StatKey, UiKey> = {
  hp: 'statHp', atk: 'statAtk', def: 'statDef', spd: 'statSpd',
  crit: 'statCrit', critDmg: 'statCritDmg', evade: 'statEvade', hit: 'statHit',
  skillEvade: 'statSkillEvade', skillHit: 'statSkillHit', skillRes: 'statSkillRes', skillDmgRes: 'statSkillDmgRes',
}
export const statName = (k: StatKey): string => ui(STAT_KEY[k])
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
/** "ATK +24%" — HP/ATK/DEF/Speed เป็น % ของค่าเดิม · อัตราต่างๆ เป็นแต้ม % ตรงๆ */
export const lineText = (l: StatLine): string => `${statName(l.stat)} +${num(l.value)}%`

const RARITY_KEY: Record<Rarity, UiKey> = {
  common: 'rarityCommon', rare: 'rarityRare', epic: 'rarityEpic', legend: 'rarityLegend', mythic: 'rarityMythic',
}
export const rarityName = (r: Rarity): string => ui(RARITY_KEY[r])
const SLOT_KEY: Record<GearSlot, UiKey> = { weapon: 'gearWeapon', armor: 'gearArmor', acc: 'gearAcc' }
export const slotName = (s: GearSlot): string => ui(SLOT_KEY[s])

const PASSIVE_KEY: Record<PassiveDef['type'], UiKey> = {
  execute: 'psExecute', lifesteal: 'psLifesteal', tough: 'psTough', healUp: 'psHealUp',
  atkUp: 'psAtkUp', critUp: 'psCritUp', speedUp: 'psSpeedUp',
}
const passiveText = (p: PassiveDef): string => ui(PASSIVE_KEY[p.type], { n: String(p.pct) })

export const gearName = (item: GearItem): string => localName(GEAR_BY_ID[item.tpl]?.name) ?? item.tpl

/** เรียง: ระดับสูงก่อน → ตีบวกสูงก่อน → ชื่อแบบ → ลำดับชิ้น */
const byRarity = (a: GearItem, b: GearItem) =>
  RARITIES.indexOf(GEAR_BY_ID[b.tpl].rarity) - RARITIES.indexOf(GEAR_BY_ID[a.tpl].rarity)
  || b.level - a.level || a.tpl.localeCompare(b.tpl) || a.uid.localeCompare(b.uid, undefined, { numeric: true })
const byLevel = (a: GearItem, b: GearItem) => b.level - a.level || byRarity(a, b)

// ─────────────────────────────── ช่องไอคอน ───────────────────────────────

export function GearTile({ item, on, owner, onClick, title }: {
  item: GearItem
  on?: boolean
  /** ฮีโร่ที่ใส่ชิ้นนี้อยู่ (แสดงรูปเล็กมุมขวาบน) */
  owner?: string | null
  onClick?: () => void
  title?: string
}) {
  const tpl = GEAR_BY_ID[item.tpl]
  return (
    <button className={`gr-tile r-${tpl.rarity}` + (on ? ' on' : '')} onClick={onClick} title={title ?? gearName(item)}>
      <img className="gr-tile-ico" src={tpl.icon} alt="" draggable={false} />
      <img className="gr-tile-el" src={UI_SRC.element[tpl.element]} alt="" draggable={false} />
      {item.level > 0 && <b className="gr-tile-lv">+{item.level}</b>}
      {owner && <img className="gr-tile-owner" src={`/rangers/${owner}/thumb.png`} alt="" draggable={false} />}
    </button>
  )
}

// ─────────────────────────────── ตีบวก ───────────────────────────────

function Stepper({ value, min, max, onChange, prefix = '' }: {
  value: number; min: number; max: number; onChange: (n: number) => void; prefix?: string
}) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)))
  return (
    <div className="gr-step">
      <button className="gr-step-btn" onClick={() => set(min)} disabled={value <= min}>{prefix}{min}</button>
      <button className="gr-step-btn" onClick={() => set(value - 1)} disabled={value <= min} aria-label="-1"><IconMinus size={14} /></button>
      <input type="range" min={min} max={max} step={1} value={value} onChange={e => set(Number(e.target.value))} />
      <button className="gr-step-btn" onClick={() => set(value + 1)} disabled={value >= max} aria-label="+1"><IconPlus size={14} /></button>
      <button className="gr-step-btn" onClick={() => set(max)} disabled={value >= max}>{prefix}{max}</button>
    </div>
  )
}

// ─────────────────────────────── รายละเอียด 1 ชิ้น ───────────────────────────────

export function GearDetail({ item, heroId, heroName, elementOf, actions }: {
  item: GearItem
  /** ฮีโร่ที่กำลังดูอยู่ (ใช้เช็กธาตุตรง + นับชิ้นเซ็ต) — ไม่ระบุ = ใช้ตัวที่ใส่ชิ้นนี้อยู่ */
  heroId?: string | null
  heroName: (id: string) => string
  elementOf: (id: string) => Element | null
  actions?: ReactNode
}) {
  const col = useCollection()
  const tpl = GEAR_BY_ID[item.tpl]
  const owner = ownerOf(col, item.uid)
  const ctx = heroId ?? owner
  const lines = itemLines(item, (ctx && elementOf(ctx)) || undefined)
  const set = SETS[tpl.set]
  // นับชิ้นเซ็ตของฮีโร่ที่ดูอยู่ — ถ้ายังไม่ได้ใส่ชิ้นนี้ ให้นับเหมือนใส่แล้ว (ดูล่วงหน้าว่าใส่แล้วได้อะไร)
  const worn = ctx ? equippedItems(col, ctx).filter(g => GEAR_BY_ID[g.tpl].slot !== tpl.slot) : []
  const count = ctx ? setCounts([...worn, item])[tpl.set] ?? 0 : 0
  const bonus = (need: 2 | 3) => {
    const b = need === 2 ? set.two : set.three
    return [...(b.stats ?? []).map(lineText), ...(b.passives ?? []).map(passiveText)].join(' · ')
  }

  return (
    <div className={`gr-detail r-${tpl.rarity}`}>
      <header className="gr-detail-head">
        <GearTile item={item} />
        <div>
          <b className="gr-name">{gearName(item)}{item.level > 0 && <em> +{item.level}</em>}</b>
          <span className="gr-meta">
            <i className={`gr-rarity r-${tpl.rarity}`}>{rarityName(tpl.rarity)}</i>
            <i>{slotName(tpl.slot)}</i>
            <i><img src={UI_SRC.element[tpl.element]} alt="" />{elementName(tpl.element)}</i>
          </span>
          <span className="gr-owner">
            {owner
              ? <><img src={`/rangers/${owner}/thumb.png`} alt="" />{ui('gearEquippedOn', { name: heroName(owner) })}</>
              : ui('gearInBag')}
          </span>
        </div>
      </header>

      <section className="gr-lines">
        <h5>{ui('gearMain')}</h5>
        <p className="gr-line main">{lineText(lines.main)}</p>
        <h5>{ui('gearSubs')}</h5>
        {lines.subs.map((l, i) => <p key={i} className="gr-line">{lineText(l)}</p>)}
        <h5>
          {ui('gearElemBonus')} <img src={UI_SRC.element[tpl.element]} alt="" />
        </h5>
        <p className={'gr-line elem' + (lines.elemOn ? ' on' : ' off')}>
          {lineText(lines.elem)}
          {!lines.elemOn && <small>{ui('gearElemNeed', { el: elementName(tpl.element) })}</small>}
        </p>
      </section>

      <section className="gr-set">
        <h5>{ui('gearSet')} · {localName(set.name)} <small>{ctx ? `${count}/3` : ''}</small></h5>
        <p className={'gr-line' + (count >= 2 ? ' on' : ' off')}><b>{ui('gearSetPieces', { n: '2' })}</b> {bonus(2)}</p>
        <p className={'gr-line' + (count >= 3 ? ' on' : ' off')}><b>{ui('gearSetPieces', { n: '3' })}</b> {bonus(3)}</p>
      </section>

      <section className="gr-enh">
        <h5>{ui('gearEnhance')} <b>+{item.level}</b><small>/ +{GEAR_MAX_LEVEL}</small></h5>
        <Stepper value={item.level} min={0} max={GEAR_MAX_LEVEL} prefix="+" onChange={n => setGearLevel(item.uid, n)} />
        <p className="gr-note">{ui('gearFree')}</p>
      </section>

      {actions && <div className="gr-actions">{actions}</div>}
    </div>
  )
}

// ─────────────────────────────── เลือกอุปกรณ์ใส่ฮีโร่ ───────────────────────────────

export function GearPicker({ heroId, slot, heroName, elementOf, onClose }: {
  heroId: string
  slot: GearSlot
  heroName: (id: string) => string
  elementOf: (id: string) => Element | null
  onClose: () => void
}) {
  useLang()
  const col = useCollection()
  const current = col.equip[heroId]?.[slot]
  const list = useMemo(() => col.gear.filter(g => GEAR_BY_ID[g.tpl].slot === slot).sort(byRarity), [col.gear, slot])
  const [pick, setPick] = useState<string | null>(current ?? list[0]?.uid ?? null)
  const item = list.find(g => g.uid === pick) ?? null
  const owner = item ? ownerOf(col, item.uid) : null

  const action = !item ? null
    : owner === heroId
      ? <button className="gr-btn ghost" onClick={() => unequipGear(heroId, slot)}>{ui('gearUnequip')}</button>
      : (
        <button className="gr-btn" onClick={() => { equipGear(heroId, item.uid); onClose() }}>
          {owner ? ui('gearSwapFrom', { name: heroName(owner) }) : ui('gearEquip')}
        </button>
      )

  return (
    <div className="gr-modal" role="dialog" aria-modal="true" onClick={onClose} onContextMenu={e => e.preventDefault()}>
      <div className="gr-modal-box" onClick={e => e.stopPropagation()}>
        <header className="gr-modal-head">
          <button className="gr-icobtn" onClick={onClose} title={ui('close')}><IconBack size={18} /></button>
          <h2>{ui('gearPick', { slot: slotName(slot) })}</h2>
          <span className="gr-dim">{heroName(heroId)}</span>
        </header>
        <div className="gr-modal-body">
          <div className="gr-grid">
            {list.map(g => (
              <GearTile key={g.uid} item={g} on={g.uid === pick} owner={ownerOf(col, g.uid)} onClick={() => setPick(g.uid)} />
            ))}
            {!list.length && <p className="gr-dim">{ui('gearNoneForSlot')}</p>}
          </div>
          {item
            ? <GearDetail item={item} heroId={heroId} heroName={heroName} elementOf={elementOf} actions={action} />
            : <p className="gr-dim gr-empty">{ui('gearSelectHint')}</p>}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────── ช่องอุปกรณ์ในหน้าฮีโร่ ───────────────────────────────

/** ช่องอุปกรณ์ 1 ช่องของฮีโร่ (ว่าง = ไอคอนช่อง) */
export function GearSlotButton({ col, heroId, slot, icon, onOpen }: {
  col: Collection
  heroId: string
  slot: GearSlot
  icon: ReactNode
  onOpen: () => void
}) {
  const item = col.gear.find(g => g.uid === col.equip[heroId]?.[slot])
  if (!item) {
    return (
      <button className="hp-slot" title={slotName(slot)} onClick={onOpen}>
        <span className="hp-slot-ico">{icon}</span>
        <small>{slotName(slot)}</small>
      </button>
    )
  }
  const tpl = GEAR_BY_ID[item.tpl]
  return (
    <button className={`hp-slot filled r-${tpl.rarity}`} title={`${gearName(item)}${item.level ? ` +${item.level}` : ''}`} onClick={onOpen}>
      <img className="hp-slot-gear" src={tpl.icon} alt="" draggable={false} />
      {item.level > 0 && <b className="gr-tile-lv">+{item.level}</b>}
    </button>
  )
}

/** เซ็ตที่ใส่อยู่ (ครบ 2 ชิ้นขึ้นไปจึงนับว่าทำงาน) */
export function ActiveSets({ col, heroId }: { col: Collection; heroId: string }) {
  const counts = setCounts(equippedItems(col, heroId))
  const rows = (Object.entries(counts) as [keyof typeof SETS, number][]).filter(([, n]) => n >= 2)
  if (!rows.length) return <p className="gr-sets-none">{ui('gearNoSet')}</p>
  return (
    <div className="gr-sets">
      {rows.map(([id, n]) => (
        <span key={id} className="gr-set-chip" title={localName(SETS[id].name) ?? id}>
          <img src={UI_SRC.element[SETS[id].element]} alt="" />{localName(SETS[id].name)} <b>{n}/3</b>
        </span>
      ))}
    </div>
  )
}

// ─────────────────────────────── เลเวลฮีโร่ ───────────────────────────────

export function LevelControl({ heroId, base }: { heroId: string; base: Stats | null }) {
  useLang()
  const col = useCollection()
  const lv = heroLevel(col, heroId)
  const mul = heroLevelMul(lv)
  const rows: StatKey[] = ['hp', 'atk', 'def']
  return (
    <div className="gr-level">
      <div className="gr-level-big">
        <span>{ui('heroLevelTitle')}</span>
        <b>Lv.{lv}<small>/{HERO_MAX_LEVEL}</small></b>
      </div>
      <Stepper value={lv} min={1} max={HERO_MAX_LEVEL} prefix="Lv." onChange={n => setHeroLevel(heroId, n)} />
      <div className="gr-level-jumps">
        {[-10, -5, +5, +10].map(d => (
          <button key={d} className="gr-step-btn" onClick={() => setHeroLevel(heroId, lv + d)}
            disabled={d < 0 ? lv <= 1 : lv >= HERO_MAX_LEVEL}>{d > 0 ? `+${d}` : d}</button>
        ))}
      </div>
      {base && (
        <div className="gr-level-table">
          {rows.map(k => (
            <div key={k}>
              <span>{statName(k)}</span>
              <em>{Math.round(base[k] ?? 0).toLocaleString()}</em>
              <i>→</i>
              <b>{Math.round((base[k] ?? 0) * mul).toLocaleString()}</b>
              <small>+{Math.round((mul - 1) * 100)}%</small>
            </div>
          ))}
          <p className="gr-note">{ui('heroLevelGain')} · {ui('heroLevelNote')}</p>
        </div>
      )}
      <p className="gr-note">{ui('heroLevelFree')} · {ui('heroLevelBattle')}</p>
    </div>
  )
}

// ─────────────────────────────── หน้ากระเป๋า ───────────────────────────────

export function GearBag({ heroName, elementOf, onClose, wallet }: {
  heroName: (id: string) => string
  elementOf: (id: string) => Element | null
  onClose: () => void
  /** เงิน/เพชรด้านขวาของแถบบน (ใช้ชุดเดียวกับหน้าฮีโร่) */
  wallet?: ReactNode
}) {
  useLang()
  const col = useCollection()
  const [slot, setSlot] = useState<GearSlot | 'all'>('all')
  const [sort, setSort] = useState<'rarity' | 'level'>('rarity')
  const list = useMemo(
    () => col.gear.filter(g => slot === 'all' || GEAR_BY_ID[g.tpl].slot === slot).sort(sort === 'rarity' ? byRarity : byLevel),
    [col.gear, slot, sort],
  )
  const [pick, setPick] = useState<string | null>(null)
  const item = list.find(g => g.uid === pick) ?? list[0] ?? null
  const owner = item ? ownerOf(col, item.uid) : null

  return (
    <div className="hp gb" onContextMenu={e => e.preventDefault()}>
      <div className="hp-bg" aria-hidden="true"><i className="hp-glow" /><i className="hp-grid" /></div>
      <header className="hp-top">
        <button className="hp-back" onClick={onClose}><IconBack size={18} />{ui('lobby')}</button>
        <h1><IconBag size={20} />{ui('navBag')}<small>{ui('gearCount', { n: String(col.gear.length) })}</small></h1>
        {wallet}
      </header>

      <main className="gb-main">
        <section className="gb-list">
          <div className="gb-filters">
            <div className="hp-chips">
              <button className={slot === 'all' ? 'on' : ''} onClick={() => setSlot('all')}>{ui('all')}</button>
              {GEAR_SLOTS.map(s => (
                <button key={s} className={slot === s ? 'on' : ''} onClick={() => setSlot(s)}>{slotName(s)}</button>
              ))}
            </div>
            <div className="hp-chips right">
              <button className={sort === 'rarity' ? 'on' : ''} onClick={() => setSort('rarity')}>{ui('gearSortRarity')}</button>
              <button className={sort === 'level' ? 'on' : ''} onClick={() => setSort('level')}>{ui('gearSortLevel')}</button>
            </div>
          </div>
          <div className="gr-grid big">
            {list.map(g => (
              <GearTile key={g.uid} item={g} on={g.uid === item?.uid} owner={ownerOf(col, g.uid)} onClick={() => setPick(g.uid)} />
            ))}
          </div>
        </section>
        <aside className="gb-detail">
          {item
            ? (
              <GearDetail
                item={item}
                heroName={heroName}
                elementOf={elementOf}
                actions={owner
                  ? <button className="gr-btn ghost" onClick={() => unequipGear(owner, GEAR_BY_ID[item.tpl].slot)}>{ui('gearUnequip')}</button>
                  : null}
              />
            )
            : <p className="gr-dim gr-empty">{ui('gearSelectHint')}</p>}
        </aside>
      </main>
    </div>
  )
}
