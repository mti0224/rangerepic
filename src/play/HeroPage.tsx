// ====================================================
// HeroPage — หน้าฮีโร่ (กดจากปุ่ม "ฮีโร่" ในหน้าหลัก)
//
//   แถบบน   ปุ่มกลับ · ชื่อหน้า · เงิน/เพชร/พลังงาน
//   ซ้าย     แท็บ: ข้อมูล · สกิล · อัพเกรด · ข้ามขีดจำกัด  →  แผงเนื้อหาของแท็บ
//   กลาง     ตัวละครตัวใหญ่ (เล่นท่ายืนจริงจากไฟล์ตัวละคร)
//   ขวา      ค่าพลังจริง (เลเวล + อุปกรณ์ + เซ็ต · ตัวเลขเขียว = ส่วนที่เพิ่มจากค่าตั้งต้น) + ช่องอุปกรณ์ 4 ช่อง
//   ล่าง     ตัวกรอง/เรียง + แถวการ์ดฮีโร่ทั้งหมด (รูปโปรไฟล์แบบเดียวกับหน้าจัดทีม + ธาตุมุมบนซ้าย)
//
// แท็บอัพเกรด = ปรับเลเวลฮีโร่ · กดช่องอุปกรณ์ = เลือกของจากกระเป๋ามาใส่ (collection.ts)
// ยังไม่มีระบบ: ข้ามขีดจำกัด · คัมภีร์ (ช่องล็อกไว้)
// ขนาด/สี/มุม ใช้ตัวแปรชุดเดียวกับหน้าหลัก (lobby.css) → เปลี่ยนธีมพร้อมกันทั้งเกม
// ====================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { loadRangerAssets, type RangerAssets } from '@/lib/rangerAssets'
import { SamPlayer } from '@/lib/samPlayer'
import { animBBox, renderSAMFrame } from '@/lib/animation/samRenderer'
import { bodyPointsOf } from '@/lib/actionPlan'
import { CAMERA_ZOOM, VIEW_H } from './battleScene'
import { EVOLUTION_LABEL, evolutionOf } from '@/lib/rangerGrade'
import { ROLES, type Category, type Element, type Role } from '@/lib/rangerClass'
import type { RangerConfig, Stats } from '@/lib/rangerConfig'
import { IconBack, IconBag, IconBolt, IconCoin, IconGem, IconHeroes, IconLock, IconSearch, IconStar, IconSwap, IconSwords } from './icons'
import { CardArt, Stars, nameOf, type RangerData } from './TeamBuilder'
import { UI_SRC } from './uiAssets'
import { areaLong, describeEffect, elementName, getLang, localName, roleName, t } from './i18n'
import { properNameZhTw } from './zhNames'
import { categoryName, traitLabel, traitText, ui, useLang } from './uiText'
import { fmtNum, type Profile } from './profile'
import { heroLevel, heroStats, isFavorite, toggleFavorite, useCollection } from './collection'
import { ActiveSets, GearPicker, GearSlotButton, LevelControl } from './GearUI'
import type { GearSlot } from '@/lib/gear'
import './heroPage.css'

type Tab = 'info' | 'skills' | 'upgrade' | 'limit'
type Sort = 'grade' | 'name' | 'level' | 'fav'
const ELEMENTS: Element[] = ['fire', 'water', 'wood', 'light', 'dark']

/**
 * ค่าพลังที่โชว์ — ครบทุกค่าของเรนเจอร์ (กลุ่มหลักก่อน แล้วค่อยค่ารอง)
 * ยาวเกินกรอบก็เลื่อนดูได้ · ไม่มีหลอด แสดงแค่ชื่อกับตัวเลขตามที่ต้องการ
 */
const POWER_ROWS: { k: keyof Stats; label: Parameters<typeof ui>[0]; pct?: boolean }[] = [
  { k: 'atk', label: 'powAtk' },
  { k: 'hp', label: 'powHp' },
  { k: 'def', label: 'powDef' },
  { k: 'spd', label: 'powSpd' },
  { k: 'crit', label: 'powCrit', pct: true },
  { k: 'critDmg', label: 'statCritDmg', pct: true },
  { k: 'evade', label: 'statEvade', pct: true },
  { k: 'hit', label: 'statHit', pct: true },
  { k: 'skillEvade', label: 'statSkillEvade', pct: true },
  { k: 'skillHit', label: 'statSkillHit', pct: true },
  { k: 'skillRes', label: 'statSkillRes', pct: true },
  { k: 'skillDmgRes', label: 'statSkillDmgRes', pct: true },
]
/** ตัวละครในหน้านี้ใหญ่กว่าที่เห็นในสนามรบกี่เท่า (1 = เท่ากันเป๊ะ) */
const HERO_ZOOM = 1.9
const CATEGORIES: Category[] = ['str', 'agi', 'int']
const ROLE_KEYS = Object.keys(ROLES) as Role[]

/** ช่องอุปกรณ์ · คัมภีร์ยังไม่มีของ (ล็อกไว้) */
const GEAR: { slot: GearSlot; icon: typeof IconSwords }[] = [
  { slot: 'weapon', icon: IconSwords },
  { slot: 'armor', icon: IconBag },
  { slot: 'acc', icon: IconGem },
]

export default function HeroPage({ data, profile, onClose }: {
  data: RangerData[]
  profile: Profile
  onClose: () => void
}) {
  useLang()
  const col = useCollection()
  const [picker, setPicker] = useState<GearSlot | null>(null)
  const [tab, setTab] = useState<Tab>('info')
  const [element, setElement] = useState<Element | 'all'>('all')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [role, setRole] = useState<Role | 'all'>('all')
  const [sort, setSort] = useState<Sort>('grade')
  const [pickedId, setPickedId] = useState<string | null>(null)

  const list = useMemo(() => {
    const rows = data.filter(d =>
      (element === 'all' || d.item.element === element)
      && (category === 'all' || d.item.category === category)
      && (role === 'all' || d.item.role === role))
    // ทุกแบบเรียงต่อด้วยระดับดาว → ชื่อ เสมอ (ลำดับไม่กระโดดตอนค่าเท่ากัน)
    const byGrade = (a: RangerData, b: RangerData) => (b.item.grade ?? 0) - (a.item.grade ?? 0) || nameOf(a).localeCompare(nameOf(b))
    const key: Record<Sort, (a: RangerData, b: RangerData) => number> = {
      grade: byGrade,
      name: (a, b) => nameOf(a).localeCompare(nameOf(b)),
      level: (a, b) => heroLevel(col, b.item.id) - heroLevel(col, a.item.id) || byGrade(a, b),
      fav: (a, b) => Number(isFavorite(col, b.item.id)) - Number(isFavorite(col, a.item.id)) || byGrade(a, b),
    }
    return [...rows].sort(key[sort])
  }, [data, element, category, role, sort, col])

  const hero = data.find(d => d.item.id === pickedId) ?? list[0] ?? data[0] ?? null
  const heroName = (id: string) => { const d = data.find(x => x.item.id === id); return d ? nameOf(d) : id }
  const elementOf = (id: string) => data.find(x => x.item.id === id)?.config?.element ?? null
  // ค่าพลังจริง (เลเวล + อุปกรณ์) เทียบกับค่าตั้งต้น
  const eff = hero?.config ? heroStats(col, hero.item.id, hero.config) : null

  // ล้อเมาส์ = เลื่อนแถวการ์ดแนวนอน (ไม่ต้องลากแถบเลื่อน) · มือถือปัดนิ้วได้ตามปกติ
  const scrollRef = useRef<HTMLDivElement>(null)
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (!el) return
    const step = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    if (!step) return
    el.scrollLeft += step
  }

  return (
    <div className="hp" onContextMenu={e => e.preventDefault()}>
      <div className="hp-bg" aria-hidden="true"><i className="hp-glow" /><i className="hp-grid" /></div>

      {/* ── แถบบน ── */}
      <header className="hp-top">
        <button className="hp-back" onClick={onClose}><IconBack size={18} />{ui('lobby')}</button>
        <h1><IconHeroes size={20} />{ui('ownedHeroes')}<small>{data.length}</small></h1>
        <div className="hp-wallet">
          <span className="hp-cur gold"><IconCoin size={15} />{fmtNum(profile.gold)}</span>
          <span className="hp-cur gem"><IconGem size={15} />{fmtNum(profile.gem)}</span>
          <span className="hp-cur energy"><IconBolt size={15} />{profile.energy}/{profile.energyMax}</span>
        </div>
      </header>

      {/* ── กลางจอ ── */}
      <main className="hp-main">
        <nav className="hp-tabs">
          {([['info', 'tabInfo'], ['skills', 'tabSkills'], ['upgrade', 'tabUpgrade'], ['limit', 'tabLimit']] as const).map(([k, label]) => (
            <button key={k} className={'hp-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{ui(label)}</button>
          ))}
        </nav>

        <section className="hp-panel">
          {hero
            ? <TabBody tab={tab} d={hero} level={heroLevel(col, hero.item.id)} fav={isFavorite(col, hero.item.id)} />
            : <p className="hp-dim">{ui('noRangers')}</p>}
        </section>

        <section className="hp-art">
          {hero && <HeroArt id={hero.item.id} config={hero.config} />}
          {hero && (
            <div className="hp-art-name">
              <Stars id={hero.item.id} grade={hero.item.grade} />
              <b>{nameOf(hero)}</b>
            </div>
          )}
        </section>

        <aside className="hp-right">
          <div className="hp-stats">
            {POWER_ROWS.map(r => {
              const base = hero?.config?.stats[r.k] ?? 0
              const v = eff?.[r.k] ?? base
              const gain = Math.round(v - base)
              return (
                <div key={r.k} className="hp-stat">
                  <span>{ui(r.label)}</span>
                  <em>{v.toLocaleString()}{r.pct ? '%' : ''}{gain > 0 && <small>+{gain.toLocaleString()}</small>}</em>
                </div>
              )
            })}
          </div>

          {hero && <ActiveSets col={col} heroId={hero.item.id} />}
          <div className="hp-gear">
            {hero && GEAR.map(g => (
              <GearSlotButton key={g.slot} col={col} heroId={hero.item.id} slot={g.slot}
                icon={<g.icon size={20} />} onOpen={() => setPicker(g.slot)} />
            ))}
            <button className="hp-slot locked" title={ui('gearTomeSoon')}>
              <span className="hp-slot-ico"><IconSwap size={20} /></span>
              <small>{ui('gearTome')}</small>
              <i className="hp-slot-lock"><IconLock size={11} /></i>
            </button>
          </div>
        </aside>
      </main>

      {/* ── ล่าง: ตัวกรอง + คลังฮีโร่ ── */}
      <footer className="hp-list">
        <div className="hp-filters">
          <span className="hp-filter-tag"><IconSearch size={14} />{ui('filter')}</span>

          <div className="hp-chips" title={ui('element')}>
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
            {([['grade', 'sortGrade'], ['name', 'sortName'], ['level', 'sortLevel'], ['fav', 'sortFav']] as const).map(([k, label]) => (
              <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{ui(label)}</button>
            ))}
          </div>
        </div>

        {/* กล่องนี้พลิกหัวกลับ (scaleY(-1)) เพื่อให้แถบเลื่อนไปอยู่ "ด้านบน" · การ์ดข้างในพลิกกลับอีกที
            และเปิด overflow ค้างไว้เสมอ พื้นที่แถบเลื่อนจึงถูกจองไว้ตลอด ฟิลเตอร์แล้วภาพไม่ขยับขึ้นลง */}
        <div className="hp-scroll" ref={scrollRef} onWheel={onWheel}>
          <div className="hp-cards">
            {list.map(d => (
              <button
                key={d.item.id}
                className={'hp-card' + (hero?.item.id === d.item.id ? ' on' : '')}
                onClick={() => setPickedId(d.item.id)}
                title={nameOf(d)}
              >
                {/* รูป + แถบล่างของรูป: Lv. ซ้าย · ดาวที่ชอบ ขวา */}
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
              </button>
            ))}
            {!list.length && <p className="hp-dim">{ui('noMatch')}</p>}
          </div>
        </div>
      </footer>

      {hero && picker && (
        <GearPicker heroId={hero.item.id} slot={picker} heroName={heroName} elementOf={elementOf} onClose={() => setPicker(null)} />
      )}
    </div>
  )
}

/** เนื้อหาของแต่ละแท็บ */
function TabBody({ tab, d, level, fav }: { tab: Tab; d: RangerData; level: number; fav: boolean }) {
  const { element, category, role, grade, id } = d.item
  if (tab === 'info') {
    return (
      <div className="hp-info">
        {/* ดาวมุมขวาบน = เพิ่ม/เอาออกจากฮีโร่ที่ชอบ */}
        <button className={'hp-fav' + (fav ? ' on' : '')} onClick={() => toggleFavorite(id)}
          title={ui(fav ? 'favRemove' : 'favAdd')} aria-pressed={fav}>
          <IconStar size={22} filled={fav} />
        </button>
        <div className="hp-tags">
          {element && <span className="hp-tag"><img src={UI_SRC.element[element]} alt="" />{elementName(element)}</span>}
          {category && <span className="hp-tag"><img src={UI_SRC.category[category]} alt="" />{categoryName(category)}</span>}
          {role && <span className="hp-tag role">{roleName(role)}</span>}
        </div>
        <div className="hp-rows">
          <div><span>{ui('levelLabel')}</span><b>Lv. {level}</b></div>
          <div><span>{ui('sortGrade')}</span><b>{grade ? `★ ${grade}` : '—'} · {EVOLUTION_LABEL[evolutionOf(id)]}</b></div>
        </div>
        {role && (
          <div className="hp-box">
            <h4>{ui('ability')} · {traitLabel(role)}</h4>
            <p>{traitText(role)}</p>
          </div>
        )}
        <div className="hp-atk">
          <img className="hp-atk-ico" src={UI_SRC.atk} alt="" />
          <div className="hp-atk-txt">
            {/* ชื่อกับ Cost อยู่บรรทัดเดียวกัน · ความกว้างอยู่บรรทัดถัดไป */}
            <span className="hp-atk-head">
              <b>{ui('normalAttack')}</b>
              <i className="hp-pill cost"><img className="hp-cost" src={UI_SRC.mineral} alt="" />+1</i>
            </span>
            <span className="hp-skill-meta">
              <i className="hp-pill">{areaLong(role === 'assassin' ? 'single_any' : 'single_front')}</i>
            </span>
            <small>{ui('normalAttackText')}</small>
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'skills') {
    const cfg = d.config
    const info = (slot: 'skill1' | 'skill2') => (slot === 'skill1' ? d.info?.skills.skill1 : d.info?.skills.skill2 ?? d.info?.skills.skill3) ?? null
    if (!cfg) return <p className="hp-dim">—</p>
    return (
      <div className="hp-skills">
        {(['skill1', 'skill2'] as const).map((slot, i) => {
          const sk = cfg.skills[slot]
          const gi = info(slot)
          return (
            <div key={slot} className="hp-skill">
              <div className="hp-skill-ico">
                {gi?.icon ? <img src={`/rangers/${id}/${gi.icon}`} alt="" /> : <span>S{i + 1}</span>}
              </div>
              <div className="hp-skill-txt">
                <b>{(getLang() === 'zh' ? properNameZhTw(gi?.code ?? '') : null) ?? localName(gi?.name) ?? t(i ? 'skill2' : 'skill1')}</b>
                <span className="hp-skill-meta">
                  <i className="hp-pill cost"><img className="hp-cost" src={UI_SRC.mineral} alt="" />{ui('cost')} {sk.cost}</i>
                  <i className="hp-pill">{sk.kind === 'buff' ? ui('skillBuff') : ui('skillAttack')}</i>
                  <i className="hp-pill">{areaLong(sk.area)}</i>
                </span>
                <ul>{sk.effects.map((e, j) => <li key={j}>{describeEffect(e)}</li>)}</ul>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (tab === 'upgrade') return <LevelControl heroId={id} base={d.config?.stats ?? null} />

  return (
    <div className="hp-wip">
      <div className="hp-wip-badge">{ui('wip')}</div>
      <p>{ui('panelLimitSub')}</p>
      <p className="hp-dim">{ui('wipNote')}</p>
    </div>
  )
}

/**
 * ตัวละครตัวใหญ่กลางหน้า — เล่นท่ายืน (idle) จริงจากไฟล์ตัวละคร วนไปเรื่อยๆ
 * โหลดเฉพาะตัวที่เลือกอยู่ (ไม่โหลดกระสุน) · เปลี่ยนตัวเมื่อไหร่ก็คืนหน่วยความจำตัวเก่า
 */
function HeroArt({ id, config }: { id: string; config: RangerConfig | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let alive = true
    let raf = 0
    let assets: RangerAssets | null = null
    void (async () => {
      let a: RangerAssets
      try { a = await loadRangerAssets(id, []) } catch { return }
      if (!alive) { a.dispose(); return }
      assets = a
      const clip = config?.clips.idle && a.sam.animations[config.clips.idle]?.length ? config.clips.idle : Object.keys(a.sam.animations)[0]
      const box = animBBox(a.sam, a.sprites, clip)
      // จุดยืนที่ตั้งไว้ใน editor (เท้าเหยียบพื้น) — ใช้เป็นหลักแทนขอบล่างของกรอบภาพ
      const stand = config ? bodyPointsOf(a, config).stand : null
      const player = new SamPlayer(a.sam)
      player.playClip(clip, { loop: true })
      let last = performance.now()
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame)
        const cv = ref.current
        if (!cv || !assets || assets.disposed || !box) return
        player.update(Math.min(now - last, 100))
        last = now
        const w = cv.clientWidth, h = cv.clientHeight
        if (w < 2 || h < 2) return
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const pw = Math.round(w * dpr), ph = Math.round(h * dpr)
        if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph }
        const ctx = cv.getContext('2d')
        if (!ctx) return
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, w, h)
        const f = player.smoothFrame ?? player.frame
        if (!f) return
        // ขนาดเท่าที่เห็นในสนามรบจริง (กล้องชุดเดียวกัน) แล้วขยายอีก HERO_ZOOM เท่าให้เต็มกรอบพอดี
        // ถ้าตัวยังล้นกรอบ ค่อยย่อลงตามกรอบภาพ
        const bw = Math.max(1, box.x1 - box.x0), bh = Math.max(1, box.y1 - box.y0)
        // อ้างอิงความสูงหน้าต่าง (ไม่ใช่ความสูงกรอบ) → ขนาดตัวเท่าที่เห็นในสนามรบจริงบนจอเดียวกัน
        const natural = CAMERA_ZOOM * HERO_ZOOM * (window.innerHeight / VIEW_H)
        const zoom = Math.min(natural, (w * 0.92) / bw, (h * 0.92) / bh)
        const ax = stand ? stand.x : (box.x0 + box.x1) / 2
        const ay = stand ? stand.y : box.y1
        renderSAMFrame(
          ctx, f, a.sam.images, a.sprites,
          w / 2 - ax * zoom,
          h * 0.92 - ay * zoom,     // จุดยืนอยู่บนเส้นพื้นของกรอบ
          zoom,
        )
      }
      raf = requestAnimationFrame(frame)
    })()
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      assets?.dispose()
    }
  }, [id, config])
  return <canvas ref={ref} className="hp-art-canvas" />
}
