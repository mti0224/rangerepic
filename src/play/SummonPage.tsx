// ====================================================
// SummonPage — หน้ากาชา (กดจากปุ่ม "กาชา" ในหน้าหลัก)
//
//   3 ตู้: เรนเจอร์ถาวร · เรนเจอร์อีเวนต์ (อัตราพิเศษ) · อุปกรณ์ (ยังไม่เปิด)
//   สุ่ม ×1  → การ์ดใบเดียวกลางจอ แตะเพื่อเปิด
//   สุ่ม ×10 → ซองการ์ดโผล่มา → แตะซอง → ซองแตกออก การ์ด 10 ใบกระจายออกมาแบบคว่ำหน้า
//              → แตะทีละใบเพื่อพลิก · กด "ข้ามทั้งหมด" = พลิกรัวให้เองตั้งแต่ใบแรกถึงใบสุดท้าย
//
//   หลังการ์ดมีลายตามระดับของที่ได้ (ยิ่งหายากยิ่งสวย) → เห็นตั้งแต่ยังไม่พลิกว่าลุ้นได้
//   ตอนพลิกใบระดับสูงมีเอฟเฟกต์แสงแตก + จอวาบ (เฉพาะระดับตำนาน)
//
// ตอนนี้เป็นโปรโตไทป์: ยังไม่มีรูปตู้/รูปซองจริง ใช้รูปทรง+ไล่สีไปก่อน · ผลสุ่มเป็นเรนเจอร์จริงในคลัง
// ====================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { IconBack, IconGacha, IconGem, IconLock, IconSwords } from './icons'
import { CardArt, Stars, nameOf, type RangerData } from './TeamBuilder'
import { ui, useLang } from './uiText'
import { fmtNum, saveProfile, type Profile } from './profile'
import './summonPage.css'

/** ระดับของที่สุ่มได้ — ใช้กำหนดลายหลังการ์ด · เอฟเฟกต์ตอนพลิก · กรอบตอนเปิด */
type Rarity = 'common' | 'rare' | 'epic' | 'legend'
const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legend']
const RARITY_LABEL: Record<Rarity, Parameters<typeof ui>[0]> = {
  common: 'rarityCommon', rare: 'rarityRare', epic: 'rarityEpic', legend: 'rarityLegend',
}
/** อัตราออก (%) ของตู้ปกติ — ตู้อีเวนต์ดันระดับสูงขึ้นเล็กน้อย */
const RATES: Record<'std' | 'event', Record<Rarity, number>> = {
  std: { common: 55, rare: 30, epic: 12, legend: 3 },
  event: { common: 45, rare: 33, epic: 16, legend: 6 },
}
const COST = { one: 100, ten: 900 }
/**
 * ตอนนี้ยังไม่หักเพชรตอนสุ่ม (โปรโตไทป์ — เพชรยังโชว์จำนวนจริง แต่สุ่มได้ไม่อั้น)
 * เปลี่ยนเป็น true เมื่อระบบเงินพร้อม → หักตามราคาและบล็อกเมื่อเพชรไม่พอทันที
 */
const CHARGE_GEM = false

type BannerKey = 'std' | 'event' | 'gear'

interface Pulled { key: string; d: RangerData; rarity: Rarity; flipped: boolean }

/** สัดส่วนของคลัง: ตัวแรงสุด 8% = ตำนาน · 17% ถัดมา = พิเศษ · 30% ถัดมา = หายาก · ที่เหลือ = ธรรมดา */
const TIER_CUT: [Rarity, number][] = [['legend', 0.08], ['epic', 0.25], ['rare', 0.55]]
/** พลังรวมคร่าวๆ ใช้จัดอันดับความหายาก (ตัวแรง = หายาก) */
const powerOf = (d: RangerData): number => {
  const s = d.config?.stats
  return s ? s.hp / 10 + s.atk + s.def / 2 + s.spd : 0
}

/**
 * ระดับความหายากของทั้งคลัง — เรียงตามพลังรวมแล้วแบ่งเป็นชั้นตามสัดส่วน
 * (ข้อมูลจริงมีแค่ดาว 8/9 กับขั้นวิวัฒนาการ 2 แบบ แบ่งชั้นจากตรงนั้นอย่างเดียวจะได้กองใหญ่ 2 กองเท่านั้น)
 */
function buildRarity(data: RangerData[]): Map<string, Rarity> {
  const sorted = [...data].sort((a, b) => powerOf(b) - powerOf(a))
  const m = new Map<string, Rarity>()
  sorted.forEach((d, i) => {
    const pos = i / Math.max(1, sorted.length)
    const tier = TIER_CUT.find(([, cut]) => pos < cut)?.[0] ?? 'common'
    m.set(d.item.id, tier)
  })
  return m
}

export default function SummonPage({ data, profile, onProfile, onClose }: {
  data: RangerData[]
  profile: Profile
  onProfile: (p: Profile) => void
  onClose: () => void
}) {
  useLang()
  const [pull, setPull] = useState<Pulled[] | null>(null)
  const [banner, setBanner] = useState<BannerKey>('std')
  const [warn, setWarn] = useState('')

  // แบ่งคลังตามระดับไว้ล่วงหน้า — สุ่มระดับก่อน แล้วค่อยสุ่มตัวในระดับนั้น
  const rarity = useMemo(() => buildRarity(data), [data])
  const rarityOf = (d: RangerData): Rarity => rarity.get(d.item.id) ?? 'common'
  const pools = useMemo(() => {
    const m: Record<Rarity, RangerData[]> = { common: [], rare: [], epic: [], legend: [] }
    for (const d of data) m[rarity.get(d.item.id) ?? 'common'].push(d)
    return m
  }, [data, rarity])
  // ตู้อีเวนต์: เน้นตัวเด่น 6 ตัวแรกของระดับสูง (โปรโตไทป์ — ทีหลังค่อยกำหนดเอง)
  const featured = useMemo(() => [...pools.legend, ...pools.epic].slice(0, 6), [pools])

  const pick = (kind: 'std' | 'event', used?: Set<string>): Pulled | null => {
    const roll = Math.random() * 100
    let acc = 0
    let r: Rarity = 'common'
    for (const k of RARITY_ORDER) {
      acc += RATES[kind][k]
      if (roll < acc) { r = k; break }
    }
    // ตู้อีเวนต์: ระดับสูงมีโอกาสได้ตัวเด่นครึ่งหนึ่ง
    const base = (kind === 'event' && (r === 'legend' || r === 'epic') && featured.length && Math.random() < 0.5)
      ? featured
      : (pools[r].length ? pools[r] : data)
    if (!base.length) return null
    // ในการสุ่มรอบเดียวกันพยายามไม่ให้ได้ตัวซ้ำ (ถ้ากองนั้นมีตัวเหลือพอ)
    const fresh = used ? base.filter(d => !used.has(d.item.id)) : base
    const pool = fresh.length ? fresh : base
    const d = pool[Math.floor(Math.random() * pool.length)]
    used?.add(d.item.id)
    return { key: `${Date.now()}-${Math.random()}`, d, rarity: rarityOf(d), flipped: false }
  }

  const doPull = (kind: 'std' | 'event', times: 1 | 10) => {
    const cost = times === 1 ? COST.one : COST.ten
    if (CHARGE_GEM && profile.gem < cost) { setWarn(ui('notEnoughGem')); return }
    const out: Pulled[] = []
    const used = new Set<string>()
    for (let i = 0; i < times; i++) {
      const p = pick(kind, used)
      if (p) out.push(p)
    }
    if (!out.length) return
    // การันตีของ 10 ใบ: อย่างน้อย 1 ใบต้องระดับหายากขึ้นไป
    if (times === 10 && !out.some(x => x.rarity !== 'common')) {
      const better = pools.rare.length ? pools.rare : pools.epic
      if (better.length) {
        const d = better[Math.floor(Math.random() * better.length)]
        out[out.length - 1] = { key: `${Date.now()}-g`, d, rarity: rarityOf(d), flipped: false }
      }
    }
    setWarn('')
    if (CHARGE_GEM) {
      const next = { ...profile, gem: profile.gem - cost }
      onProfile(next)
      saveProfile(next)
    }
    setPull(out)
  }

  return (
    <div className="sm" onContextMenu={e => e.preventDefault()}>
      <div className="sm-bg" aria-hidden="true"><i className="sm-glow a" /><i className="sm-glow b" /></div>

      <header className="sm-top">
        <button className="sm-back" onClick={onClose}><IconBack size={18} />{ui('lobby')}</button>
        <h1><IconGacha size={20} />{ui('navGacha')}</h1>
        <span className="sm-gem"><IconGem size={16} />{fmtNum(profile.gem)}</span>
      </header>

      <main className="sm-banners">
        <Banner
          tone="std" active={banner === 'std'} onFocus={() => setBanner('std')}
          title={ui('bannerStd')} sub={ui('bannerStdSub')} rates={RATES.std}
          onPull={t => doPull('std', t)}
        />
        <Banner
          tone="event" active={banner === 'event'} onFocus={() => setBanner('event')}
          title={ui('bannerEvent')} sub={ui('bannerEventSub')} rates={RATES.event} pickUp
          onPull={t => doPull('event', t)}
        />
        <Banner tone="gear" active={false} onFocus={() => setBanner('gear')}
          title={ui('bannerGear')} sub={ui('bannerGearSub')} locked />
      </main>

      <footer className="sm-foot">
        <span>{ui('guarantee10')}</span>
        {!CHARGE_GEM && <span className="sm-free">{ui('freeGem')}</span>}
        {warn && <b className="sm-warn">{warn}</b>}
      </footer>

      {pull && <PullOverlay cards={pull} onDone={() => setPull(null)} />}
    </div>
  )
}

/** ตู้ 1 ตู้ */
function Banner({ tone, title, sub, rates, pickUp, locked, active, onFocus, onPull }: {
  tone: BannerKey
  title: string
  sub: string
  rates?: Record<Rarity, number>
  pickUp?: boolean
  locked?: boolean
  active: boolean
  onFocus: () => void
  onPull?: (times: 1 | 10) => void
}) {
  return (
    <section className={`sm-banner ${tone}` + (active ? ' on' : '') + (locked ? ' locked' : '')} onMouseEnter={onFocus}>
      <div className="sm-art" aria-hidden="true">
        <i className="sm-art-ring" />
        <i className="sm-art-sheen" />
        {locked ? <IconLock size={34} /> : <IconGacha size={40} />}
      </div>

      <div className="sm-head">
        {pickUp && <span className="sm-pick">{ui('pickUp')}</span>}
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>

      {rates && (
        <div className="sm-rates">
          <span className="sm-rates-tag">{ui('rates')}</span>
          {RARITY_ORDER.slice().reverse().map(r => (
            <span key={r} className={'sm-rate ' + r}><i />{ui(RARITY_LABEL[r])}<b>{rates[r]}%</b></span>
          ))}
        </div>
      )}

      {locked ? (
        <div className="sm-locked"><IconLock size={13} />{ui('gearSoon')}</div>
      ) : (
        <div className="sm-buttons">
          <button className="sm-pull one" onClick={() => onPull?.(1)}>
            <b>{ui('pull1')}</b><span><IconGem size={13} />{COST.one}</span>
          </button>
          <button className="sm-pull ten" onClick={() => onPull?.(10)}>
            <b>{ui('pull10')}</b><span><IconGem size={13} />{COST.ten}</span>
          </button>
        </div>
      )}
    </section>
  )
}

/**
 * ฉากเปิดการ์ด: ซอง → การ์ดคว่ำ → พลิกทีละใบ
 * phase: pack = รอแตะซอง · cards = การ์ดออกมาแล้ว
 */
function PullOverlay({ cards, onDone }: { cards: Pulled[]; onDone: () => void }) {
  const single = cards.length === 1
  const [phase, setPhase] = useState<'pack' | 'burst' | 'cards'>(single ? 'cards' : 'pack')
  const [flipped, setFlipped] = useState<boolean[]>(() => cards.map(() => false))
  const [flash, setFlash] = useState(false)
  const timers = useRef<number[]>([])
  useEffect(() => () => { for (const t of timers.current) window.clearTimeout(t) }, [])

  const allOpen = flipped.every(Boolean)

  const flip = (i: number) => {
    setFlipped(f => {
      if (f[i]) return f
      const next = [...f]
      next[i] = true
      return next
    })
    if (cards[i].rarity === 'legend') {
      setFlash(true)
      timers.current.push(window.setTimeout(() => setFlash(false), 420))
    }
  }

  /** ข้าม: พลิกรัวตั้งแต่ใบแรกถึงใบสุดท้าย (เร็วกว่าเปิดเอง) */
  const skip = () => {
    cards.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => flip(i), i * 90))
    })
  }

  const openPack = () => {
    setPhase('burst')
    timers.current.push(window.setTimeout(() => setPhase('cards'), 520))
  }

  return (
    <div className="sm-overlay">
      {flash && <i className="sm-flash" aria-hidden="true" />}

      {phase !== 'cards' && (
        <button className={'sm-pack' + (phase === 'burst' ? ' open' : '')} onClick={phase === 'pack' ? openPack : undefined}>
          <span className="sm-pack-face"><IconSwords size={44} /></span>
          <i className="sm-pack-shine" />
          <i className="sm-pack-rays" />
          {phase === 'pack' && <small>{ui('tapPack')}</small>}
        </button>
      )}

      {phase === 'cards' && (
        <>
          <div className={'sm-cards' + (single ? ' single' : '')}>
            {cards.map((c, i) => (
              <button
                key={c.key}
                className={`sm-card ${c.rarity}` + (flipped[i] ? ' open' : '')}
                style={{ animationDelay: `${i * 55}ms` }}
                onClick={() => flip(i)}
              >
                <span className="sm-card-inner">
                  <span className="sm-face back">
                    <i className="sm-back-art" />
                    <i className="sm-back-glow" />
                  </span>
                  <span className="sm-face front">
                    <i className="sm-front-burst" />
                    <CardArt d={c.d} />
                    <span className="sm-card-info">
                      <Stars id={c.d.item.id} grade={c.d.item.grade} />
                      <b>{nameOf(c.d)}</b>
                      <small className={'sm-rar ' + c.rarity}>{ui(RARITY_LABEL[c.rarity])}</small>
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="sm-actions">
            {!allOpen && <span className="sm-hint">{ui('tapCard')}</span>}
            {allOpen
              ? <button className="sm-done" onClick={onDone}>{ui('done')}</button>
              : <button className="sm-skip" onClick={skip}>{ui('skipAll')}</button>}
          </div>
        </>
      )}
    </div>
  )
}
