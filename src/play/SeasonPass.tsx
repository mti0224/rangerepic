// ====================================================
// SeasonPass — หน้าซีซั่นพาส (ปุ่มซีซั่นพาสในหน้าหลัก)
//
//   บน     ตราซีซั่น · เลเวลพาส (ปรับได้อิสระตอนทดสอบ) · ปลดล็อคพรีเมียม (ฟรี) · รับทั้งหมด
//   กลาง   รางรางวัล 60 เลเวล เลื่อนแนวนอน: แถวบน = พรีเมียม · กลาง = เลเวล · แถวล่าง = ฟรี
//          ของดีทุก 10 เลเวล (ช่องใหญ่เรืองแสง)
//
// รับของ: เงิน/เพชรเข้าโปรไฟล์ (ผ่าน onProfile ของหน้าหลัก) · อุปกรณ์เข้ากระเป๋า
//         เรนเจอร์ = แสดงไว้ก่อน (ยังไม่มีระบบครอบครองฮีโร่)
// ====================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { GEAR_BY_ID } from '@/lib/gear'
import { PASS_LEVELS, PASS_MAX, SEASON, canClaim, passKey, type PassReward, type PassTrack } from '@/lib/seasonPass'
import { addGear, markPassClaimed, resetPass, setPassLevel, setPassPremium, useCollection } from './collection'
import { localName } from './i18n'
import { IconBack, IconCheck, IconCoin, IconGem, IconLock, IconMinus, IconPlus, IconTrophy } from './icons'
import type { Profile } from './profile'
import { CardArt, nameOf, type RangerData } from './TeamBuilder'
import { rarityName } from './GearUI'
import { ui, useLang } from './uiText'
import './seasonPass.css'

export default function SeasonPass({ data, profile, onProfile, wallet, onClose }: {
  data: RangerData[]
  profile: Profile
  onProfile: (p: Profile) => void
  wallet?: React.ReactNode
  onClose: () => void
}) {
  useLang()
  const col = useCollection()
  const pass = col.pass
  const byId = useMemo(() => new Map(data.map(d => [d.item.id, d])), [data])
  const [got, setGot] = useState<Got | null>(null)

  // ช่องที่รับได้ตอนนี้ทั้งหมด
  const ready = useMemo(() => PASS_LEVELS.flatMap(L => (['free', 'premium'] as PassTrack[])
    .filter(t => canClaim(t, L.level, pass)).map(t => ({ track: t, level: L.level, reward: L[t] }))), [pass])

  /** แจกของ (รวมหลายช่องทีเดียว — อัปเดตโปรไฟล์ครั้งเดียว) */
  const give = (items: { track: PassTrack; level: number; reward: PassReward }[]) => {
    if (!items.length) return
    let gold = 0, gem = 0
    const gear: string[] = []
    const rangers: string[] = []
    for (const { reward: r } of items) {
      if (r.kind === 'gold') gold += r.amount
      else if (r.kind === 'gem') gem += r.amount
      else if (r.kind === 'gear') { addGear(r.tpl); gear.push(r.tpl) }
      else rangers.push(r.id)
    }
    if (gold || gem) onProfile({ ...profile, gold: profile.gold + gold, gem: profile.gem + gem })
    markPassClaimed(items.map(i => passKey(i.track, i.level)))
    setGot({ key: Date.now(), gold, gem, gear, rangers })
  }

  // เปิดมาเลื่อนไปที่เลเวลปัจจุบัน · ล้อเมาส์ = เลื่อนแนวนอน
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    const node = el?.querySelector<HTMLElement>('.sp-col.current')
    if (el && node) el.scrollLeft = node.offsetLeft - el.clientWidth / 2 + node.clientWidth / 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (!el) return
    const step = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    el.scrollLeft += step
  }

  const pct = ((pass.level - 1) / (PASS_MAX - 1)) * 100

  return (
    <div className="hp sp" onContextMenu={e => e.preventDefault()}>
      <div className="hp-bg" aria-hidden="true"><i className="hp-glow" /><i className="hp-grid" /></div>
      <header className="hp-top">
        <button className="hp-back" onClick={onClose}><IconBack size={18} />{ui('lobby')}</button>
        <h1><IconTrophy size={20} />{ui('navPass')}</h1>
        {wallet}
      </header>

      <section className="sp-hero">
        <div className="sp-season">
          <span className="sp-emblem">S{SEASON.no}</span>
          <div>
            <b>{localName(SEASON.name)}</b>
            <small>{ui('passDaysLeft', { n: String(SEASON.days) })}</small>
          </div>
        </div>

        <div className="sp-lvbox">
          <div className="sp-lvtop">
            <span>{ui('passLevel')}</span>
            <b>Lv.{pass.level}<small>/{PASS_MAX}</small></b>
          </div>
          <div className="sp-bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="sp-lvctl">
            <button onClick={() => setPassLevel(pass.level - 1)} disabled={pass.level <= 1} aria-label="-1"><IconMinus size={14} /></button>
            <button onClick={() => setPassLevel(pass.level + 1)} disabled={pass.level >= PASS_MAX} aria-label="+1"><IconPlus size={14} /></button>
            <button onClick={() => setPassLevel(pass.level + 10)} disabled={pass.level >= PASS_MAX}>+10</button>
            <button onClick={() => setPassLevel(PASS_MAX)} disabled={pass.level >= PASS_MAX}>MAX</button>
            <small>{ui('passLevelHint')}</small>
          </div>
        </div>

        <div className="sp-actions">
          {pass.premium
            ? <span className="sp-premium-on"><IconCheck size={15} />{ui('passOwned')}</span>
            : (
              <button className="sp-btn premium" onClick={() => setPassPremium(true)}>
                {ui('passUnlock')}<small>{ui('passTestFree')}</small>
              </button>
            )}
          <button className="sp-btn claim" disabled={!ready.length} onClick={() => give(ready)}>
            {ready.length ? ui('passClaimAll', { n: String(ready.length) }) : ui('passNothing')}
          </button>
          <button className="sp-link" onClick={() => resetPass()}>{ui('passReset')}</button>
        </div>
      </section>

      <section className="sp-trackbox">
        <div className="sp-labels">
          <span className="premium">{ui('passPremium')}{!pass.premium && <IconLock size={12} />}</span>
          <span className="lv">Lv</span>
          <span className="free">{ui('passFree')}</span>
        </div>
        <div className="sp-scroll" ref={scrollRef} onWheel={onWheel}>
          <div className="sp-track">
            {PASS_LEVELS.map(L => {
              const reached = L.level <= pass.level
              return (
                <div key={L.level} className={'sp-col' + (L.big ? ' big' : '') + (reached ? ' reached' : '') + (L.level === pass.level ? ' current' : '')}>
                  <Tile track="premium" level={L.level} reward={L.premium} big={L.big} byId={byId} onClaim={give} />
                  <div className="sp-node"><span>{L.level}</span></div>
                  <Tile track="free" level={L.level} reward={L.free} big={L.big} byId={byId} onClaim={give} />
                </div>
              )
            })}
          </div>
        </div>
        <p className="sp-note">{ui('passRangerNote')}</p>
      </section>

      {got && <GotPopup key={got.key} got={got} byId={byId} onClose={() => setGot(null)} />}
    </div>
  )
}

/** ของที่เพิ่งได้ (รวมจากหลายช่อง) */
interface Got { key: number; gold: number; gem: number; gear: string[]; rangers: string[] }

/** ป๊อปอัพได้รับของ — แสงหมุนด้านหลัง · ป้ายทอง · ของทุกชิ้นแถวละ 5 (น้อยกว่า 5 = อยู่กลาง · แถวถัดไปชิดซ้าย)
 *  เยอะเกิน = เลื่อนลงดูได้ · ไม่ปิดเอง ต้องแตะเพื่อปิดเท่านั้น (ใช้ click — ปัด/เลื่อนดูของไม่นับเป็นแตะ)
 *  ของเด้งเข้ามาทีละชิ้น → เลื่อนลงตามอัตโนมัติ (ของดีอยู่ท้ายสุด) · ผู้เล่นเลื่อนเองเมื่อไหร่ = หยุดตาม */
function GotPopup({ got, byId, onClose }: { got: Got; byId: Map<string, RangerData>; onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const stopFollow = () => { follow.current = false }
  const onSlotIn = (e: React.AnimationEvent<HTMLSpanElement>) => {
    const box = scrollRef.current
    if (!follow.current || !box) return
    const el = e.currentTarget
    const bottom = el.offsetTop + el.offsetHeight + 8
    if (bottom > box.scrollTop + box.clientHeight) box.scrollTo({ top: bottom - box.clientHeight, behavior: 'smooth' })
  }
  const items: React.ReactNode[] = []
  if (got.gold) items.push(<span className="sp-got-item gold"><IconCoin size={30} /><b>+{got.gold.toLocaleString()}</b><small>{ui('passGold')}</small></span>)
  if (got.gem) items.push(<span className="sp-got-item gem"><IconGem size={30} /><b>+{got.gem.toLocaleString()}</b><small>{ui('passGem')}</small></span>)
  for (const tpl of got.gear) {
    const g = GEAR_BY_ID[tpl]
    if (g) items.push(<span className={`sp-got-item gear r-${g.rarity}`}><img src={g.icon} alt="" /><b>{localName(g.name)}</b><small>{rarityName(g.rarity)}</small></span>)
  }
  for (const id of got.rangers) {
    const d = byId.get(id)
    items.push(<span className="sp-got-item ranger"><span className="sp-got-art">{d ? <CardArt d={d} small /> : null}</span><b>{d ? nameOf(d) : ui('passRanger')}</b><small>{ui('passRanger')}</small></span>)
  }
  // ทีละชิ้น — ของเยอะก็ไม่เกิน ~3 วิ
  const step = Math.min(0.09, 3 / Math.max(1, items.length))
  return (
    <div className="sp-got" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sp-got-card">
        <i className="sp-got-rays" aria-hidden="true" />
        <div className="sp-got-ribbon"><span>{ui('passGot')}</span></div>
        <div className="sp-got-scroll" ref={scrollRef} onWheel={stopFollow} onTouchStart={stopFollow} onPointerDown={stopFollow}>
          <div className={'sp-got-list' + (items.length < 5 ? ' few' : '')}>
            {items.map((n, i) => (
              <span key={i} className="sp-got-slot" onAnimationStart={onSlotIn} style={{ animationDelay: `${0.15 + i * step}s` }}>{n}</span>
            ))}
          </div>
        </div>
        <small className="sp-got-hint">{ui('passTapClose')}</small>
      </div>
    </div>
  )
}

/** ช่องรางวัล 1 ช่อง */
function Tile({ track, level, reward, big, byId, onClaim }: {
  track: PassTrack
  level: number
  reward: PassReward
  big: boolean
  byId: Map<string, RangerData>
  onClaim: (items: { track: PassTrack; level: number; reward: PassReward }[]) => void
}) {
  const col = useCollection()
  const pass = col.pass
  const claimed = pass.claimed.includes(passKey(track, level))
  const ok = canClaim(track, level, pass)
  const lockedPremium = track === 'premium' && !pass.premium
  const reached = level <= pass.level
  const gear = reward.kind === 'gear' ? GEAR_BY_ID[reward.tpl] : undefined
  const ranger = reward.kind === 'ranger' ? byId.get(reward.id) : undefined
  const cls = ['sp-tile', track, big ? 'big' : '', ok ? 'ready' : '', claimed ? 'claimed' : '', !reached ? 'future' : '',
    gear ? `r-${gear.rarity}` : '', reward.kind].filter(Boolean).join(' ')

  return (
    <button className={cls} disabled={!ok} onClick={() => onClaim([{ track, level, reward }])}
      title={gear ? `${localName(gear.name)} · ${rarityName(gear.rarity)}` : ranger ? nameOf(ranger) : undefined}>
      <span className="sp-tile-body">
        {reward.kind === 'gold' && <><IconCoin size={big ? 30 : 22} /><b>{reward.amount.toLocaleString()}</b></>}
        {reward.kind === 'gem' && <><IconGem size={big ? 30 : 22} /><b>{reward.amount.toLocaleString()}</b></>}
        {gear && <><img className="sp-gear" src={gear.icon} alt="" /><b className="sp-rar">{rarityName(gear.rarity)}</b></>}
        {reward.kind === 'ranger' && (
          <>
            <span className="sp-ranger">{ranger ? <CardArt d={ranger} small /> : null}</span>
            <b className="sp-rname">{ranger ? nameOf(ranger) : ui('passRanger')}</b>
          </>
        )}
      </span>
      {ok && <i className="sp-claim">{ui('passClaim')}</i>}
      {claimed && <i className="sp-done"><IconCheck size={big ? 26 : 20} /></i>}
      {lockedPremium && !claimed && <i className="sp-lock"><IconLock size={big ? 18 : 14} /></i>}
    </button>
  )
}
