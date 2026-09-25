// ====================================================
// StoryEnd — หน้าจบด่านเนื้อเรื่อง (ลอยทับจอดวล แทนแถบแพ้/ชนะเดิมในแคนวาส)
//
//   ชนะ   ป้ายชนะ + แสงหมุน · ดาวที่ได้ · ทีมเรา (รูป · Lv. · หลอด EXP) · รางวัล · ออก / เล่นต่อ / ไปด่านต่อไป
//   แพ้   ป้ายแพ้ · ทีมเรา · คำแนะนำ · ออก / เล่นต่อ
//
// หลอด EXP ยังว่างไว้ก่อน (ยังไม่มีระบบเลเวลจากการฟาร์มด่าน) — วางช่องไว้ให้เติมทีหลัง
// ไม่ได้อยู่ใต้ .lb (จอดวลเป็นหน้าแยก) → สีทั้งหมดอยู่ใน storyEnd.css เอง
// ====================================================

import type { StageDef } from '@/lib/stages'
import { GEAR_BY_ID } from '@/lib/gear'
import { getCollection, itemByUid } from './collection'
import { gearName } from './GearUI'
import { IconCoin, IconGem, IconStar } from './icons'
import { CardArt, nameOf, type RangerData } from './TeamBuilder'
import { UI_SRC } from './uiAssets'
import { ui, useLang } from './uiText'
import type { StoryResult } from './StoryMap'
import './storyEnd.css'

/** reserve = อยู่แถวพิเศษ (ไม่ได้ลงสนาม) → ได้ EXP ครึ่งเดียว */
export interface EndHero { id: string; level: number; ko: boolean; reserve?: boolean }

export default function StoryEnd({ stage, result, turns, heroes, byId, onExit, onReplay, onNext }: {
  stage: StageDef
  result: StoryResult
  turns: number
  heroes: EndHero[]
  byId: Map<string, RangerData>
  onExit: () => void
  onReplay: () => void
  /** มี = ชนะและมีด่านถัดไป */
  onNext: (() => void) | null
}) {
  useLang()
  const win = result.win
  const gear = result.reward?.gear ? itemByUid(getCollection(), result.reward.gear) : undefined
  const label = stage.label

  return (
    <div className={'se' + (win ? ' win' : ' lose')} role="dialog" aria-modal="true" onContextMenu={e => e.preventDefault()}>
      {win && <div className="se-rays" aria-hidden="true" />}
      <div className="se-box">
        <header className="se-head">
          <div className="se-banner">
            <h1>{win ? ui('resultWin') : ui('resultLose')}</h1>
          </div>
          <p className="se-sub">
            <b>{label}</b>{stage.boss && <i className="se-boss">{ui('stageBoss')}</i>}
            <span>{ui('seTurns', { n: String(turns) })}</span>
          </p>
        </header>

        <div className="se-stars">
          {[0, 1, 2].map(k => (
            <span key={k} className={'se-star' + (k < result.stars ? ' on' : '')} style={{ animationDelay: `${0.35 + k * 0.25}s` }}>
              <IconStar size={52} filled={k < result.stars} />
            </span>
          ))}
        </div>

        <div className="se-team">
          {heroes.map((h, i) => {
            const d = byId.get(h.id)
            return (
              <div key={h.id} className={'se-hero' + (h.ko ? ' ko' : '') + (h.reserve ? ' sup' : '')} style={{ animationDelay: `${0.5 + i * 0.08}s` }}>
                {h.reserve && <i className="se-sup-tag">{ui('seReserveHalf')}</i>}
                <div className="se-hero-pic">
                  {d && <CardArt d={d} small />}
                  {d?.item.element && <img className="se-hero-el" src={UI_SRC.element[d.item.element]} alt="" />}
                  {h.ko && <i className="se-ko">{ui('seKo')}</i>}
                </div>
                <b className="se-hero-name">{d ? nameOf(d) : h.id}</b>
                <div className="se-lv">
                  <span>Lv.{h.level}</span>
                  <small>{ui('seExp')}</small>
                </div>
                {/* หลอด EXP — ยังไม่มีระบบเลเวลจากด่าน จึงว่างไว้ */}
                <div className="se-exp"><i style={{ width: '0%' }} /></div>
              </div>
            )
          })}
        </div>

        {win && result.reward ? (
          <div className="se-rewards">
            <span className="se-rw gold"><IconCoin size={17} />+{result.reward.gold.toLocaleString()}</span>
            {result.reward.gem > 0 && <span className="se-rw gem"><IconGem size={17} />+{result.reward.gem}</span>}
            {gear && (
              <span className={`se-rw gear r-${GEAR_BY_ID[gear.tpl].rarity}`}>
                <img src={GEAR_BY_ID[gear.tpl].icon} alt="" />{gearName(gear)}
              </span>
            )}
          </div>
        ) : !win ? <p className="se-hint">{ui('seTryAgain')}</p> : null}

        <footer className="se-actions">
          <button className="se-btn ghost" onClick={onExit}>{ui('seExit')}</button>
          <button className={'se-btn' + (onNext ? ' blue' : ' gold')} onClick={onReplay}>{ui('seReplay')}</button>
          {onNext && <button className="se-btn gold" onClick={onNext}>{ui('seNext')} ›</button>}
        </footer>
      </div>
    </div>
  )
}
