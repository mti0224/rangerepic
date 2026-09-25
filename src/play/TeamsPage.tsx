// ====================================================
// TeamsPage — หน้า "จัดทีม" (ปุ่มทีมในหน้าหลัก): จัดเซ็ตทีมไว้หลายๆ ทีม
//
//   แต่ละทีม   ทีม : ชื่อ (แตะเพื่อตั้งชื่อ) · แก้ไข · ลบ
//             แถวหน้า 2 ช่อง · แถวหลัง 3 ช่อง · พิเศษ 2 ช่อง
//   ล่างสุด    + เพิ่มทีม (สูงสุด MAX_TEAMS ทีม)
//   แก้ไข      หน้าต่างเลือกช่อง → แตะฮีโร่ด้านล่างเพื่อใส่ (ใส่แล้วเลื่อนไปช่องว่างถัดไปเอง)
//
// เก็บใน collection.ts (lr:collection → teams) · ตอนเข้าโหมดดวลเลือก "เซ็ตทีม" มาใช้ได้เลย (TeamBuilder)
// ====================================================

import { useMemo, useState, type ReactNode } from 'react'
import { ROLES, type Category, type Element, type Role } from '@/lib/rangerClass'
import {
  MAX_TEAMS, TEAM_KEYS, TEAM_NAME_MAX, addTeam, deleteTeam, heroLevel, isFavorite, renameTeam, setTeamSlot, teamName, useCollection,
  type TeamKey, type TeamPreset,
} from './collection'
import { elementName, roleName } from './i18n'
import { IconBack, IconClose, IconPlus, IconStar, IconTeam } from './icons'
import { CardArt, Stars, nameOf, type RangerData } from './TeamBuilder'
import { UI_SRC } from './uiAssets'
import { categoryName, ui, useLang, type UiKey } from './uiText'
import './teams.css'

const ELEMENTS: Element[] = ['fire', 'water', 'wood', 'light', 'dark']
const CATEGORIES: Category[] = ['str', 'agi', 'int']
const ROLE_KEYS = Object.keys(ROLES) as Role[]

/** กลุ่มช่องตามแบบ: แถวหน้า 2 · แถวหลัง 3 · พิเศษ 2 */
const GROUPS: { label: UiKey; keys: TeamKey[] }[] = [
  { label: 'front', keys: ['front-0', 'front-1'] },
  { label: 'back', keys: ['back-0', 'back-1', 'back-2'] },
  { label: 'rowSpecial', keys: ['sup-0', 'sup-1'] },
]

export default function TeamsPage({ data, wallet, onClose }: {
  data: RangerData[]
  wallet?: ReactNode
  onClose: () => void
}) {
  useLang()
  const col = useCollection()
  const byId = useMemo(() => new Map(data.map(d => [d.item.id, d])), [data])
  /** ทีมที่เปิดแก้ไขอยู่ + ช่องที่เลือก */
  const [editing, setEditing] = useState<{ id: string; key: TeamKey | null } | null>(null)
  /** ทีมที่กดลบแล้ว รอยืนยัน */
  const [confirm, setConfirm] = useState<string | null>(null)
  const full = col.teams.length >= MAX_TEAMS
  const editTeam = editing ? col.teams.find(t => t.id === editing.id) ?? null : null

  return (
    <div className="hp tm" onContextMenu={e => e.preventDefault()}>
      <div className="hp-bg" aria-hidden="true"><i className="hp-glow" /><i className="hp-grid" /></div>
      <header className="hp-top">
        <button className="hp-back" onClick={onClose}><IconBack size={18} />{ui('lobby')}</button>
        <h1><IconTeam size={20} />{ui('teamsTitle')}<small>{col.teams.length}/{MAX_TEAMS}</small></h1>
        {wallet}
      </header>

      <main className="tm-list">
        {col.teams.map((t, i) => (
          <section key={t.id} className="tm-team">
            <header className="tm-head">
              <label className="tm-name" title={ui('teamRename')}>
                <span>{ui('teamLabel')} :</span>
                <input
                  value={t.name}
                  placeholder={teamName(t, i)}
                  maxLength={TEAM_NAME_MAX}
                  onChange={e => renameTeam(t.id, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                />
              </label>
              <div className="tm-actions">
                {confirm === t.id ? (
                  <>
                    <span className="tm-confirm">{ui('teamDeleteConfirm')}</span>
                    <button className="danger" onClick={() => { deleteTeam(t.id); setConfirm(null) }}>{ui('teamDelete')}</button>
                    <button onClick={() => setConfirm(null)}>{ui('close')}</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setEditing({ id: t.id, key: firstEmpty(t) })}>{ui('teamEdit')}</button>
                    <button className="danger" onClick={() => setConfirm(t.id)}>{ui('teamDelete')}</button>
                  </>
                )}
              </div>
            </header>
            <TeamBox team={t} byId={byId} col={col} onSlot={k => setEditing({ id: t.id, key: k })} />
          </section>
        ))}
        {!col.teams.length && <p className="tm-empty">{ui('teamsEmpty')}</p>}

        <button className="tm-add" disabled={full} onClick={() => {
          const id = addTeam()
          if (id) setEditing({ id, key: 'front-0' })
        }}>
          <span><IconPlus size={18} />{ui('teamAdd')}</span>
          {full && <small>{ui('teamsMax', { n: String(MAX_TEAMS) })}</small>}
        </button>
      </main>

      {editTeam && editing && (
        <TeamEditor
          team={editTeam}
          index={col.teams.indexOf(editTeam)}
          data={data}
          byId={byId}
          col={col}
          sel={editing.key}
          onSel={k => setEditing({ id: editTeam.id, key: k })}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/** ช่องว่างช่องแรก (แถวหน้า → หลัง → พิเศษ) · เต็มแล้ว = null */
const firstEmpty = (t: TeamPreset): TeamKey | null => TEAM_KEYS.find(k => !t.slots[k]) ?? null

type Col = ReturnType<typeof useCollection>

/** กล่องทีม 3 กลุ่ม (ใช้ทั้งในรายการและในหน้าต่างแก้ไข) */
function TeamBox({ team, byId, col, sel, onSlot, onRemove }: {
  team: TeamPreset
  byId: Map<string, RangerData>
  col: Col
  sel?: TeamKey | null
  onSlot: (k: TeamKey) => void
  /** มี = แสดงปุ่ม × บนช่องที่มีฮีโร่ */
  onRemove?: (k: TeamKey) => void
}) {
  return (
    <div className="tm-box">
      {GROUPS.map(g => (
        <div key={g.label} className={'tm-group g-' + g.keys.length}>
          <h4>{ui(g.label)}</h4>
          <div className="tm-slots">
            {g.keys.map(k => {
              const id = team.slots[k]
              const d = id ? byId.get(id) : undefined
              return (
                <div key={k} className="tm-slot-wrap">
                  <button className={'tm-slot' + (d ? ' filled' : '') + (sel === k ? ' sel' : '')} onClick={() => onSlot(k)}
                    title={d ? nameOf(d) : ui('empty')}>
                    {d ? (
                      <>
                        <CardArt d={d} small />
                        {d.item.element && <img className="tm-slot-el" src={UI_SRC.element[d.item.element]} alt="" />}
                        <i className="tm-slot-lv">Lv.{heroLevel(col, d.item.id)}</i>
                      </>
                    ) : <IconPlus size={20} />}
                  </button>
                  {d && onRemove && (
                    <button className="tm-slot-x" title={ui('remove')} onClick={() => onRemove(k)}><IconClose size={12} /></button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** หน้าต่างแก้ไขทีม: ทีมด้านบน · คลังฮีโร่ด้านล่าง */
function TeamEditor({ team, index, data, byId, col, sel, onSel, onClose }: {
  team: TeamPreset
  index: number
  data: RangerData[]
  byId: Map<string, RangerData>
  col: Col
  sel: TeamKey | null
  onSel: (k: TeamKey | null) => void
  onClose: () => void
}) {
  const [element, setElement] = useState<Element | 'all'>('all')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [role, setRole] = useState<Role | 'all'>('all')
  const [sort, setSort] = useState<'grade' | 'level' | 'fav'>('grade')
  const inTeam = new Set(TEAM_KEYS.map(k => team.slots[k]).filter((x): x is string => !!x))

  const list = useMemo(() => {
    const byGrade = (a: RangerData, b: RangerData) => (b.item.grade ?? 0) - (a.item.grade ?? 0) || nameOf(a).localeCompare(nameOf(b))
    const key = {
      grade: byGrade,
      level: (a: RangerData, b: RangerData) => heroLevel(col, b.item.id) - heroLevel(col, a.item.id) || byGrade(a, b),
      fav: (a: RangerData, b: RangerData) => Number(isFavorite(col, b.item.id)) - Number(isFavorite(col, a.item.id)) || byGrade(a, b),
    }[sort]
    return data.filter(d =>
      (element === 'all' || d.item.element === element)
      && (category === 'all' || d.item.category === category)
      && (role === 'all' || d.item.role === role)).sort(key)
  }, [data, element, category, role, sort, col])

  /** แตะฮีโร่ → ใส่ช่องที่เลือก (ไม่ได้เลือก = ช่องว่างช่องแรก) แล้วเลื่อนไปช่องว่างถัดไป */
  const pick = (id: string) => {
    const key = sel ?? firstEmpty(team)
    if (!key) return
    setTeamSlot(team.id, key, id)
    const after = { ...team.slots, [key]: id }
    for (const k of TEAM_KEYS) if (k !== key && after[k] === id) after[k] = team.slots[key]
    onSel(TEAM_KEYS.find(k => !after[k]) ?? null)
  }

  return (
    <div className="gr-modal tm-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="gr-modal-box" onClick={e => e.stopPropagation()}>
        <header className="gr-modal-head">
          <button className="gr-icobtn" onClick={onClose} title={ui('close')}><IconBack size={18} /></button>
          <h2>{ui('teamEditTitle')} · {teamName(team, index)}</h2>
          <span className="gr-dim">{ui('teamPickHint')}</span>
          <button className="gr-btn tm-done" onClick={onClose}>{ui('teamDone')}</button>
        </header>
        <div className="tm-edit-body">
          <TeamBox team={team} byId={byId} col={col} sel={sel} onSlot={k => onSel(sel === k ? null : k)}
            onRemove={k => { setTeamSlot(team.id, k, null); onSel(k) }} />
          <div className="tm-filters">
            <div className="hp-chips">
              <button className={element === 'all' ? 'on' : ''} onClick={() => setElement('all')}>{ui('all')}</button>
              {ELEMENTS.map(el => (
                <button key={el} className={element === el ? 'on' : ''} onClick={() => setElement(el)} title={elementName(el)}>
                  <img src={UI_SRC.element[el]} alt={elementName(el)} />
                </button>
              ))}
            </div>
            <div className="hp-chips" title={ui('klass')}>
              <button className={category === 'all' ? 'on' : ''} onClick={() => setCategory('all')}>{ui('all')}</button>
              {CATEGORIES.map(c => (
                <button key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(c)} title={categoryName(c)}>
                  <img src={UI_SRC.category[c]} alt={categoryName(c)} />
                </button>
              ))}
            </div>
            <div className="hp-chips wrap" title={ui('role')}>
              <button className={role === 'all' ? 'on' : ''} onClick={() => setRole('all')}>{ui('all')}</button>
              {ROLE_KEYS.map(r => (
                <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>{roleName(r)}</button>
              ))}
            </div>
            <div className="hp-chips right">
              {([['grade', 'sortGrade'], ['level', 'sortLevel'], ['fav', 'sortFav']] as const).map(([k, label]) => (
                <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{ui(label)}</button>
              ))}
            </div>
          </div>
          <div className="tm-roster">
            {!list.length && <p className="gr-dim">{ui('noMatch')}</p>}
            {list.map(d => {
              const on = inTeam.has(d.item.id)
              return (
                <button key={d.item.id} className={'hp-card' + (on ? ' in-team' : '')} onClick={() => pick(d.item.id)} title={nameOf(d)}>
                  <span className="hp-card-pic">
                    <CardArt d={d} />
                    <span className="hp-card-badges">
                      <i className="hp-card-lv">Lv.{heroLevel(col, d.item.id)}</i>
                      {isFavorite(col, d.item.id) && <i className="hp-card-fav"><IconStar size={13} filled /></i>}
                    </span>
                  </span>
                  {d.item.element && <img className="hp-card-el" src={UI_SRC.element[d.item.element]} alt="" />}
                  {d.item.category && <img className="hp-card-cat" src={UI_SRC.category[d.item.category]} alt="" />}
                  <span className="hp-card-stars"><Stars id={d.item.id} grade={d.item.grade} /></span>
                  <b>{nameOf(d)}</b>
                  {on && <em className="tm-in-team">{ui('teamInTeam')}</em>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
