// ====================================================
// TeamBuilder — หน้าจัดทีมของหน้าทดลองเล่น
//
//   บน : กระดานทีม (ทีมคุณ / ทีมศัตรู) · ช่องแถวหน้า-หลังพร้อมโบนัส · สุ่ม / ล้าง · ปุ่มเริ่มดวล
//          ช่องว่าง → คลิกแล้วขึ้นหน้าต่างเลือกเรนเจอร์ใส่ช่องนั้น
//          ช่องที่มีตัว → คลิกเลือก (ขึ้นปุ่ม [ข้อมูล] [ลบ] [เปลี่ยน] มุมขวาล่าง) · ลากสลับช่องได้
//   ล่าง: คลังเรนเจอร์ — ค้นหา · กรองธาตุ / ตำแหน่ง / ชนิด · เรียงตามระดับ ชื่อ HP ATK Speed
//   ข้อมูลเรนเจอร์: หน้าต่างกลางจอ อ่านอย่างเดียว (คลิกการ์ดในคลัง) · กากบาท / คลิกพื้นหลัง / Esc = ปิด
//   หมายเหตุ: ช่อง/กระดานทีมเป็น "ฟังก์ชันวาด" ไม่ใช่คอมโพเนนต์ซ้อน — ถ้าเป็นคอมโพเนนต์ที่สร้างใหม่ทุกเรนเดอร์
//            React จะถอด-ใส่ใหม่ทุกครั้ง (รูปกระพริบ · ปุ่มหายก่อนคลิกถึง)
//   สุ่มทีม: ชนิดพลัง (STR) ไว้แถวหน้า · ที่เหลือแถวหลัง
// ภาษาไทย/อังกฤษตามปุ่มบนหัว (ใช้ค่าเดียวกับจอดวล) · ไอคอนเป็น SVG (play/icons.tsx) ไม่ใช้อีโมจิ
// ====================================================

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { GameInfo, RangerListItem } from '@/lib/rangerApi'
import type { RangerConfig, Row, Stats } from '@/lib/rangerConfig'
import { ELEMENTS, type Category, type Element, type Role } from '@/lib/rangerClass'
import { fitsSlot } from '@/lib/formation'
import { EVOLUTION_LABEL, evolutionOf, starImageUrl } from '@/lib/rangerGrade'
import { PORTRAIT_SIZE, portraitCenter } from '@/lib/portrait'
import { NORMAL_ATTACK } from './battle'
import { areaLong, describeEffect, elementName, localName, roleName } from './i18n'
import { UI_SRC } from './uiAssets'
import { categoryName, rowBonusShort, traitLabel, traitText, ui, useLang } from './uiText'
import { IconCheck, IconClose, IconDice, IconInfo, IconPlus, IconSearch, IconSwap, IconSwords, IconTrash } from './icons'
import type { Team } from './battle'

/** ช่องในสนาม */
export type FieldKey = 'front-0' | 'front-1' | 'back-0' | 'back-1' | 'back-2'
/** แถวพิเศษ (อัญเชิญ) — ไม่ลงสนาม */
export type ReserveKey = 'sup-0' | 'sup-1'
export type SlotKey = FieldKey | ReserveKey
export const SLOT_KEYS: FieldKey[] = ['front-0', 'front-1', 'back-0', 'back-1', 'back-2']
export const RESERVE_KEYS: ReserveKey[] = ['sup-0', 'sup-1']
export const ALL_KEYS: SlotKey[] = [...SLOT_KEYS, ...RESERVE_KEYS]
export type TeamSlots = Record<SlotKey, string | null>
export type Formation = [TeamSlots, TeamSlots]
export const emptyTeam = (): TeamSlots => ({ 'front-0': null, 'front-1': null, 'back-0': null, 'back-1': null, 'back-2': null, 'sup-0': null, 'sup-1': null })
const isReserve = (k: SlotKey): k is ReserveKey => k.startsWith('sup-')
/** แถวของช่อง (แถวพิเศษ = ไม่มีแถวในสนาม) */
const rowOfKey = (k: SlotKey): Row | null => (isReserve(k) ? null : k.split('-')[0] as Row)

const ROLES_ALL: Role[] = ['tank', 'fighter', 'shooter', 'assassin', 'mage', 'support']
const CATEGORIES: Category[] = ['str', 'agi', 'int']
type SortKey = 'grade' | 'name' | 'hp' | 'atk' | 'spd'
type SlotRef = { team: Team; key: SlotKey }

/** พื้นหลังการ์ดตามธาตุ (public/ui/rg_bg_<ธาตุ>.png) */
const elementBg = (el: Element | null) => (el ? { backgroundImage: `url(/ui/rg_bg_${el}.png)` } : undefined)

export interface RangerData { item: RangerListItem; config: RangerConfig | null; info: GameInfo | null }

export const nameOf = (d: RangerData) => localName(d.info?.name) ?? d.item.name

export default function TeamBuilder({ data, formation, setFormation, onStart, busy, message }: {
  data: RangerData[]
  formation: Formation
  setFormation: (f: Formation | ((f: Formation) => Formation)) => void
  onStart: () => void
  busy: boolean
  message: string
}) {
  const lang = useLang()   // รีเรนเดอร์เมื่อเปลี่ยนภาษา
  const byId = useMemo(() => new Map(data.map(d => [d.item.id, d])), [data])
  /** เรนเจอร์ที่เปิดแผงข้อมูลอยู่ */
  const [selected, setSelected] = useState<string | null>(null)
  /** ช่องที่เลือกอยู่ (ขึ้นปุ่มลบ/เปลี่ยน) */
  const [slotSel, setSlotSel] = useState<SlotRef | null>(null)
  /** หน้าต่างเลือกเรนเจอร์ใส่ช่องนี้ */
  const [picker, setPicker] = useState<SlotRef | null>(null)
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 1800); return () => window.clearTimeout(t) }, [toast])

  // คลิกที่อื่นที่ไม่เกี่ยว (ไม่ใช่ช่องในทีม หรือหน้าต่าง) → เลิกเลือกช่อง
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.tb-slot, .tb-modal-back, .pa-head')) return
      setSlotSel(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  const teamOf = (id: string): Team[] => ([0, 1] as Team[]).filter(t => ALL_KEYS.some(k => formation[t][k] === id))
  const count = (t: Team) => SLOT_KEYS.filter(k => formation[t][k]).length
  const canStart = count(0) > 0 && count(1) > 0

  // ── วาง/ย้าย ──
  const place = (team: Team, key: SlotKey, id: string | null) => setFormation(f => {
    const next: Formation = [{ ...f[0] }, { ...f[1] }]
    // ทีมเดียวกันห้ามซ้ำ: ตัวนี้อยู่ช่องอื่นในทีมนี้ → ย้ายมา (ช่องเดิมได้ตัวที่อยู่ช่องนี้แทน = สลับ)
    if (id) for (const k of ALL_KEYS) if (k !== key && next[team][k] === id) next[team][k] = next[team][key]
    next[team][key] = id
    return next
  })
  /** สุ่มทีม: ชนิดพลัง (STR) ไว้แถวหน้า · ที่เหลือแถวหลัง (ไม่พอค่อยเติมจากอีกกลุ่ม) */
  const randomTeam = (team: Team) => {
    const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5)
    const str = shuffle(data.filter(d => d.item.category === 'str'))
    const rest = shuffle(data.filter(d => d.item.category !== 'str'))
    const front = str.splice(0, 2)
    const back = rest.splice(0, 3)
    const spare = shuffle([...str, ...rest])
    while (front.length < 2 && spare.length) front.push(spare.shift()!)
    while (back.length < 3 && spare.length) back.push(spare.shift()!)
    const sup = spare.splice(0, RESERVE_KEYS.length)
    setFormation(f => {
      const next: Formation = [{ ...f[0] }, { ...f[1] }]
      next[team] = emptyTeam()
      front.forEach((d, i) => { next[team][`front-${i}` as SlotKey] = d.item.id })
      back.forEach((d, i) => { next[team][`back-${i}` as SlotKey] = d.item.id })
      sup.forEach((d, i) => { next[team][RESERVE_KEYS[i]] = d.item.id })
      return next
    })
    setSlotSel(null)
  }
  const clearTeam = (team: Team) => {
    setFormation(f => { const n: Formation = [{ ...f[0] }, { ...f[1] }]; n[team] = emptyTeam(); return n })
    setSlotSel(null)
  }

  const sel = selected ? byId.get(selected) ?? null : null
  const closeDetail = useCallback(() => setSelected(null), [])

  // ── ช่องในทีม ──
  const slotBox = (team: Team, k: SlotKey) => {
    const id = formation[team][k]
    const d = id ? byId.get(id) : null
    const row = rowOfKey(k)
    const fits = !!row && !!d?.item.role && fitsSlot(d.item.role, row)
    const isSel = !!d && slotSel?.team === team && slotSel.key === k
    return (
      <div
        key={k}
        className={'tb-slot' + (d ? ' filled' : '') + (isSel ? ' sel' : '')}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          const dropped = e.dataTransfer.getData('text/ranger')
          const from = e.dataTransfer.getData('text/from')
          if (!dropped) return
          if (from) {
            const [ft, fk] = from.split('|')
            if (Number(ft) === team) { place(team, k, dropped); return }
            place(Number(ft) as Team, fk as SlotKey, null)
          }
          place(team, k, dropped)
        }}
        onClick={() => {
          if (!d) { setPicker({ team, key: k }); return }
          setSlotSel(isSel ? null : { team, key: k })
        }}
        draggable={!!d}
        onDragStart={e => {
          if (!id) return
          e.dataTransfer.setData('text/ranger', id)
          e.dataTransfer.setData('text/from', `${team}|${k}`)
          setCardDragImage(e, e.currentTarget)
          e.currentTarget.classList.add('dragging')
        }}
        onDragEnd={e => e.currentTarget.classList.remove('dragging')}
      >
        {d ? (
          <>
            <CardArt d={d} flip={team === 1} small />
            <div className="tb-slot-info">
              <MetaLine d={d} />
              <b title={nameOf(d)}>{nameOf(d)}</b>
              <span className={'tb-fit' + (fits ? ' good' : '')}>
                {d.item.role ? roleName(d.item.role) : '—'}{fits && <IconCheck size={12} />}
              </span>
            </div>
            {isSel && (
              <div className="tb-slot-actions">
                <button className="info" title={ui('info')} onClick={e => { e.stopPropagation(); setSelected(d.item.id) }}>
                  <IconInfo size={13} />{ui('info')}
                </button>
                <button className="danger" title={ui('remove')} onClick={e => { e.stopPropagation(); place(team, k, null); setSlotSel(null) }}>
                  <IconTrash size={13} />{ui('remove')}
                </button>
                <button title={ui('change')} onClick={e => { e.stopPropagation(); setPicker({ team, key: k }) }}>
                  <IconSwap size={13} />{ui('change')}
                </button>
              </div>
            )}
          </>
        ) : <span className="tb-empty"><IconPlus size={18} /><em>{ui('empty')}</em></span>}
      </div>
    )
  }

  const teamBoard = (team: Team) => {
    const col = (row: Row) => (
      <div className={'tb-col ' + row}>
        <div className="tb-row-head" title={rowBonusShort(row)}><b>{ui(row)}</b><span>{rowBonusShort(row)}</span></div>
        {SLOT_KEYS.filter(k => k.startsWith(row)).map(k => slotBox(team, k))}
      </div>
    )
    return (
      <section className={'tb-team t' + team}>
        <header>
          <h2>{team === 0 ? ui('myTeam') : ui('enemyTeam')} <small>{count(team)}/5</small></h2>
          <div className="tb-btns">
            <button onClick={() => randomTeam(team)}><IconDice size={14} />{ui('random')}</button>
            <button className="ghost" onClick={() => clearTeam(team)}><IconTrash size={14} />{ui('clear')}</button>
          </div>
        </header>
        <div className="tb-grid">{team === 0 ? <>{col('back')}{col('front')}</> : <>{col('front')}{col('back')}</>}</div>
        <div className="tb-reserve">
          <div className="tb-row-head" title={ui('reserveHint')}><b>{ui('reserve')}</b><span>{ui('reserveHint')}</span></div>
          <div className="tb-reserve-slots">{RESERVE_KEYS.map(k => slotBox(team, k))}</div>
        </div>
      </section>
    )
  }

  return (
    <div className="tb">
      <div className="tb-lineup">
        {teamBoard(0)}
        <div className="tb-vs"><img src="/ui/VS.png" alt="VS" /></div>
        {teamBoard(1)}
      </div>
      <div className="tb-startbar">
        <span className="tb-hint">{busy ? message : message || ui('pickHint')}</span>
        <button className="tb-start" disabled={!canStart || busy} onClick={onStart} title={canStart ? '' : ui('needBoth')}>
          <IconSwords size={20} />{busy ? ui('loading') : ui('start')}
        </button>
      </div>

      <section className="tb-pool">
        <RangerBrowser
          data={data}
          lang={lang}
          selected={selected}
          badge={d => { const t = teamOf(d.item.id); return t.length ? (t.includes(0) ? ui('inMine') : ui('inEnemy')) : null }}
          onPick={d => { setSelected(d.item.id); setSlotSel(null) }}
        />
      </section>

      {sel && (
        <Modal title={nameOf(sel)} onClose={closeDetail} detail>
          <Detail d={sel} all={data} />
        </Modal>
      )}

      {picker && (
        <Modal title={ui('pickTitle', { team: picker.team === 0 ? ui('myTeam') : ui('enemyTeam'), row: rowOfKey(picker.key) ? ui(rowOfKey(picker.key)!) : ui('reserve') })} onClose={() => setPicker(null)} wide>
          <RangerBrowser
            data={data}
            lang={lang}
            selected={null}
            preferRow={rowOfKey(picker.key) ?? undefined}
            badge={d => (formation[picker.team][picker.key] === d.item.id ? ui('current') : teamOf(d.item.id).includes(picker.team) ? (picker.team === 0 ? ui('inMine') : ui('inEnemy')) : null)}
            onPick={d => { place(picker.team, picker.key, d.item.id); setPicker(null); setSlotSel({ team: picker.team, key: picker.key }) }}
            autoFocus
          />
        </Modal>
      )}
      {toast && <div className="tb-toast">{toast}</div>}
    </div>
  )
}

// ────────────────────────────── คลัง / ตัวเลือกเรนเจอร์ ──────────────────────────────

/** รายการเรนเจอร์พร้อมค้นหา + ตัวกรอง (ใช้ทั้งคลังในหน้า และหน้าต่างเลือกใส่ช่อง) */
function RangerBrowser({ data, lang, selected, badge, onPick, preferRow, autoFocus }: {
  data: RangerData[]
  lang: string
  selected: string | null
  badge: (d: RangerData) => string | null
  onPick: (d: RangerData) => void
  /** หน้าต่างเลือกใส่ช่อง: ตัวที่เหมาะกับแถวนี้ขึ้นก่อน */
  preferRow?: Row
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const [elFilter, setElFilter] = useState<Element | null>(null)
  const [roleFilter, setRoleFilter] = useState<Role | null>(null)
  const [catFilter, setCatFilter] = useState<Category | null>(null)
  const [sort, setSort] = useState<SortKey>('grade')
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) searchRef.current?.focus() }, [autoFocus])

  const statOf = (d: RangerData, k: keyof Stats) => d.config?.stats[k] ?? 0
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = data.filter(d =>
      (!q || nameOf(d).toLowerCase().includes(q) || d.item.name.toLowerCase().includes(q) || (d.info?.name.en ?? '').toLowerCase().includes(q) || d.item.id.includes(q))
      && (!elFilter || d.item.element === elFilter)
      && (!roleFilter || d.item.role === roleFilter)
      && (!catFilter || d.item.category === catFilter))
    const by: Record<SortKey, (a: RangerData, b: RangerData) => number> = {
      grade: (a, b) => (b.item.grade ?? 0) - (a.item.grade ?? 0) || nameOf(a).localeCompare(nameOf(b)),
      name: (a, b) => nameOf(a).localeCompare(nameOf(b)),
      hp: (a, b) => statOf(b, 'hp') - statOf(a, 'hp'),
      atk: (a, b) => statOf(b, 'atk') - statOf(a, 'atk'),
      spd: (a, b) => statOf(b, 'spd') - statOf(a, 'spd'),
    }
    const fit = (d: RangerData) => (preferRow && d.item.role && fitsSlot(d.item.role, preferRow) ? 1 : 0)
    return out.sort((a, b) => fit(b) - fit(a) || by[sort](a, b))
  }, [data, query, elFilter, roleFilter, catFilter, sort, lang, preferRow])

  return (
    <>
      <div className="tb-filters">
        <div className="tb-filters-top">
          <h2>{ui('rangers')} <small>{list.length}/{data.length}</small></h2>
          <label className="tb-search">
            <IconSearch size={15} />
            <input ref={searchRef} type="search" placeholder={ui('search')} value={query} onChange={e => setQuery(e.target.value)} />
          </label>
          <label className="tb-sort">
            {ui('sort')}
            <select value={sort} onChange={e => setSort(e.target.value as SortKey)}>
              <option value="grade">{ui('sortGrade')}</option>
              <option value="name">{ui('sortName')}</option>
              <option value="hp">{ui('sortHp')}</option>
              <option value="atk">{ui('sortAtk')}</option>
              <option value="spd">{ui('sortSpd')}</option>
            </select>
          </label>
        </div>
        <div className="tb-chips" role="group" aria-label={ui('element')}>
          <button className={!elFilter ? 'on' : ''} onClick={() => setElFilter(null)}>{ui('all')}</button>
          {ELEMENTS.map(el => (
            <button key={el} className={'chip-el el-' + el + (elFilter === el ? ' on' : '')} onClick={() => setElFilter(f => (f === el ? null : el))}>
              <img src={UI_SRC.element[el]} alt="" />{elementName(el)}
            </button>
          ))}
        </div>
        <div className="tb-chips" role="group" aria-label={ui('role')}>
          <button className={!roleFilter ? 'on' : ''} onClick={() => setRoleFilter(null)}>{ui('all')}</button>
          {ROLES_ALL.map(r => (
            <button key={r} className={roleFilter === r ? 'on' : ''} onClick={() => setRoleFilter(f => (f === r ? null : r))}>{roleName(r)}</button>
          ))}
          <span className="tb-chip-sep" />
          <button className={!catFilter ? 'on' : ''} onClick={() => setCatFilter(null)}>{ui('all')}</button>
          {CATEGORIES.map(c => (
            <button key={c} className={catFilter === c ? 'on' : ''} onClick={() => setCatFilter(f => (f === c ? null : c))}>
              <img src={UI_SRC.category[c]} alt="" />{categoryName(c)}
            </button>
          ))}
        </div>
      </div>
      <div className="tb-cards">
        {list.map(d => (
          <button
            key={d.item.id}
            className={'tb-card' + (selected === d.item.id ? ' sel' : '')}
            draggable
            onDragStart={e => e.dataTransfer.setData('text/ranger', d.item.id)}
            onClick={() => onPick(d)}
          >
            <CardArt d={d} badge={badge(d)} />
            <MetaLine d={d} />
            <b title={nameOf(d)}>{nameOf(d)}</b>
            <small>{d.item.role ? roleName(d.item.role) : '—'}</small>
          </button>
        ))}
        {!list.length && <p className="tb-none">{data.length ? ui('noMatch') : ui('noRangers')}</p>}
      </div>
    </>
  )
}

/** รูปหน้าโปรไฟล์บนพื้นหลังธาตุ (+ ป้ายว่าอยู่ทีมไหน) */
export function CardArt({ d, badge, flip, small }: { d: RangerData; badge?: string | null; flip?: boolean; small?: boolean }) {
  const { element, id } = d.item
  return (
    <div className={'tb-card-art' + (small ? ' small' : '')} style={elementBg(element)}>
      <FaceImg id={id} face={d.config?.face} flip={flip} />
      {badge && <span className="tb-card-in">{badge}</span>}
    </div>
  )
}

/**
 * ลากจากช่องในทีม → ภาพที่ลากเป็นการ์ดลอยแบบเดียวกับการ์ดในคลัง (ไม่ใช่เงาของช่องทั้งแถว)
 * สร้างการ์ดชั่วคราวนอกจอจากชิ้นส่วนของช่องนั้น แล้วใช้เป็นภาพลาก · ลบทิ้งทันทีหลังเบราว์เซอร์ถ่ายภาพไป
 */
function setCardDragImage(e: React.DragEvent, slot: HTMLElement) {
  const host = slot.closest('.play-app') ?? document.body
  const art = slot.querySelector('.tb-card-art')
  if (!art) return
  const ghost = document.createElement('div')
  ghost.className = 'tb-card tb-drag-ghost'
  const artCopy = art.cloneNode(true) as HTMLElement
  artCopy.classList.remove('small')
  ghost.appendChild(artCopy)
  const meta = slot.querySelector('.tb-meta')
  if (meta) ghost.appendChild(meta.cloneNode(true))
  const name = document.createElement('b')
  name.textContent = slot.querySelector('.tb-slot-info b')?.textContent ?? ''
  const role = document.createElement('small')
  role.textContent = slot.querySelector('.tb-fit')?.textContent ?? ''
  ghost.append(name, role)
  host.appendChild(ghost)
  const r = ghost.getBoundingClientRect()
  e.dataTransfer.setDragImage(ghost, r.width / 2, r.height * 0.4)
  requestAnimationFrame(() => ghost.remove())
}

/** แถวดาว + ไอคอนธาตุ + ไอคอนชนิด (ใต้รูปการ์ด / ในช่องทีม) */
function MetaLine({ d }: { d: RangerData }) {
  const { element, category, id, grade } = d.item
  return (
    <span className="tb-meta">
      <Stars id={id} grade={grade} />
      {element && <img className="tb-meta-ico" src={UI_SRC.element[element]} alt={elementName(element)} title={elementName(element)} />}
      {category && <img className="tb-meta-ico" src={UI_SRC.category[category]} alt={categoryName(category)} title={categoryName(category)} />}
    </span>
  )
}

/** กรอบหน้าในรูปการ์ดกว้างเท่านี้ของกรอบรูป (หน้าอยู่กลาง เห็นไหล่/ตัวรอบๆ) */
const CARD_FACE_ZOOM = 0.62

/**
 * รูปหน้าโปรไฟล์: thumb.png ทั้งรูป โดยให้ กรอบหน้า ที่ตั้งใน editor (config.face · ไม่ตั้ง = เดาจากหัว) อยู่กลางกรอบ
 * วางด้วย % ของกรอบรูป → การ์ดเล็ก/ใหญ่ก็ได้สัดส่วนเดียวกัน · flip = กลับด้าน (ทีมศัตรู) รอบจุดหน้า
 */
function FaceImg({ id, face, flip }: { id: string; face?: { x: number; y: number }; flip?: boolean }) {
  const [style, setStyle] = useState<CSSProperties | null>(null)
  const fit = (img: HTMLImageElement) => {
    const c = portraitCenter(img, face)
    const z = (CARD_FACE_ZOOM / PORTRAIT_SIZE) * 100
    const cx = flip ? img.naturalWidth - c.x : c.x
    setStyle({ width: `${img.naturalWidth * z}%`, left: `${50 - cx * z}%`, top: `${50 - c.y * z}%`, transform: flip ? 'scaleX(-1)' : undefined })
  }
  const ref = useRef<HTMLImageElement>(null)
  // รูปที่อยู่ในแคชอาจโหลดเสร็จก่อน React ผูก onLoad → วางเองเลย
  useEffect(() => { const img = ref.current; if (img?.complete && img.naturalWidth) fit(img) }, [id, face?.x, face?.y, flip])
  return (
    <img
      ref={ref}
      className="tb-card-face"
      src={`/rangers/${id}/thumb.png`}
      alt=""
      loading="lazy"
      style={style ?? { visibility: 'hidden' }}
      onLoad={e => fit(e.currentTarget)}
    />
  )
}

// ────────────────────────────── ข้อมูลเรนเจอร์ ──────────────────────────────

const STAT_ROWS: { k: keyof Stats; label: Parameters<typeof ui>[0]; pct?: boolean }[] = [
  { k: 'hp', label: 'statHp' }, { k: 'atk', label: 'statAtk' }, { k: 'def', label: 'statDef' }, { k: 'spd', label: 'statSpd' },
  { k: 'crit', label: 'statCrit', pct: true }, { k: 'critDmg', label: 'statCritDmg', pct: true },
  { k: 'evade', label: 'statEvade', pct: true }, { k: 'hit', label: 'statHit', pct: true },
  { k: 'skillEvade', label: 'statSkillEvade', pct: true }, { k: 'skillHit', label: 'statSkillHit', pct: true }, { k: 'skillRes', label: 'statSkillRes', pct: true },
  { k: 'skillDmgRes', label: 'statSkillDmgRes', pct: true },
]

function Detail({ d, all }: { d: RangerData; all: RangerData[] }) {
  const cfg = d.config
  const { element, role, category, grade, id } = d.item
  // แถบค่าพลัง: เทียบกับค่าสูงสุดในคลัง
  const max = useMemo(() => {
    const m: Partial<Record<keyof Stats, number>> = {}
    for (const x of all) for (const r of STAT_ROWS) m[r.k] = Math.max(m[r.k] ?? 1, x.config?.stats[r.k] ?? 0)
    return m
  }, [all])
  const skillInfo = (slot: 'skill1' | 'skill2') => (slot === 'skill1' ? d.info?.skills.skill1 : d.info?.skills.skill2 ?? d.info?.skills.skill3) ?? null
  return (
    <div className="tb-detail">
      <div className="tb-detail-col">
      <div className={'tb-detail-head el-' + (element ?? 'none')}>
        <img className="tb-detail-art" src={`/rangers/${id}/thumb.png`} alt="" />
        <div className="tb-detail-title">
          <Stars id={id} grade={grade} />
          <h3>{nameOf(d)}</h3>
          <div className="tb-tags">
            {element && <span className="tb-tag"><img src={UI_SRC.element[element]} alt="" />{elementName(element)}</span>}
            {category && <span className="tb-tag"><img src={UI_SRC.category[category]} alt="" />{categoryName(category)}</span>}
            {role && <span className="tb-tag role">{roleName(role)}</span>}
          </div>
        </div>
      </div>

      {role && (
        <div className="tb-box">
          <h4>{ui('ability')} · {traitLabel(role)}</h4>
          <p>{traitText(role)}</p>
        </div>
      )}

      <p className="tb-evo">{EVOLUTION_LABEL[evolutionOf(id)]}{grade ? ` · ★${grade}` : ''}</p>
      </div>

      {cfg && (
        <div className="tb-box stats">
          <h4>{ui('stats')}</h4>
          <div className="tb-stats">
            {STAT_ROWS.map(r => (
              <div key={r.k} className="tb-stat">
                <span>{ui(r.label)}</span>
                <i><b style={{ width: `${Math.min(100, ((cfg.stats[r.k] ?? 0) / (max[r.k] || 1)) * 100)}%` }} /></i>
                <em>{(cfg.stats[r.k] ?? 0).toLocaleString()}{r.pct ? '%' : ''}</em>
              </div>
            ))}
          </div>
        </div>
      )}

      {cfg && (
        <div className="tb-box skills">
          <h4>{ui('skills')}</h4>
          <div className="tb-skill">
            <div className="tb-skill-icon atk"><img src={UI_SRC.atk} alt="" /></div>
            <div>
              <b>{ui('normalAttack')} <kbd>Z</kbd></b>
              <small>{areaLong(role === 'assassin' ? 'single_any' : NORMAL_ATTACK.area)} · {ui('normalAttackText')}</small>
            </div>
          </div>
          {(['skill1', 'skill2'] as const).map((slot, i) => {
            const sk = cfg.skills[slot]
            const info = skillInfo(slot)
            return (
              <div key={slot} className="tb-skill">
                <div className="tb-skill-icon">
                  {info?.icon ? <img src={`/rangers/${id}/${info.icon}`} alt="" /> : <span>S{i + 1}</span>}
                </div>
                <div>
                  <b>{localName(info?.name) ?? (i ? 'Skill 2' : 'Skill 1')} <kbd>{i ? 'C' : 'X'}</kbd></b>
                  <small>{areaLong(sk.area)} · <img className="tb-cost" src={UI_SRC.mineral} alt="" /> {ui('cost')} {sk.cost}</small>
                  <ul>{sk.effects.map((e, j) => <li key={j}>{describeEffect(e)}</li>)}</ul>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────── หน้าต่างลอย / วิธีเล่น ──────────────────────────────

/** หน้าต่างลอยกลางจอ · ปิดด้วยกากบาท / คลิกพื้นหลัง / Esc */
export function Modal({ title, onClose, wide, detail, children }: { title: string; onClose: () => void; wide?: boolean; detail?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="tb-modal-back" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={'tb-modal' + (wide ? ' wide' : '') + (detail ? ' detail' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h3>{title}</h3>
          <button className="tb-modal-x" title={ui('close')} onClick={onClose}><IconClose size={18} /></button>
        </header>
        <div className="tb-modal-body">{children}</div>
      </div>
    </div>
  )
}

/** เนื้อหาวิธีเล่น (เปิดจากปุ่มบนหัวหน้า) */
export function HowToContent() {
  useLang()
  return (
    <div className="tb-howto">
      <h5>{ui('howControls')}</h5>
      <p>{ui('controlsText')}</p>
      <p>{ui('energyText')}</p>
      <h5>{ui('howReserve')}</h5>
      <p>{ui('reserveText')}</p>
      <h5>{ui('howRows')}</h5>
      <p><b>{ui('front')}</b> — {rowBonusShort('front')}<br /><b>{ui('back')}</b> — {rowBonusShort('back')}</p>
      <h5>{ui('howRoles')}</h5>
      <ul>{ROLES_ALL.map(r => <li key={r}><b>{roleName(r)} · {traitLabel(r)}</b> — {traitText(r)}</li>)}</ul>
    </div>
  )
}

/** รูปดาวตามระดับ + Evolution */
export function Stars({ id, grade }: { id: string; grade: number | null }) {
  const src = starImageUrl(grade, evolutionOf(id))
  if (!src) return null
  return <img className="stars" src={src} alt={`★${grade}`} title={`★${grade} · ${EVOLUTION_LABEL[evolutionOf(id)]}`} />
}
