import { useState } from 'react'
import { getLang } from './i18n'
import { useLang } from './uiText'
import { CONDITION_LABEL_ZH, EFFECT_LABEL_ZH, TRIGGER_LABEL_ZH, type GameplayEffect, type LocalizedNames } from '../lib/gameplaySchema'
import { groupPlayerCharacters, type RangerData } from './playerRoster'
import HeroArt from './HeroArt'

const PREFERENCE_KEY = 'rangerepic:classes:v1'
export const localizedName = (names: LocalizedNames, fallback: string) => names[getLang()] || names.zh || names.en || names.th || names.jp || fallback
export const nameOf = (d: RangerData) => localizedName(d.gameplayClass.names, d.playId)
export const characterNameOf = (d: RangerData) => localizedName(d.gameplayCharacter.names, d.gameplayCharacter.id)

function readChoices(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREFERENCE_KEY) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, string> : {}
  } catch { return {} }
}
export function rememberClass(row: RangerData) {
  try { localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ ...readChoices(), [row.gameplayCharacter.id]: row.playId })) } catch { /* selection still works without storage */ }
}

export function ClassSelection({ data, initialClassId, onConfirm, onBack, confirmLabel = '使用此職業' }: {
  data: RangerData[]; initialClassId?: string | null; onConfirm: (row: RangerData) => void; onBack: () => void; confirmLabel?: string
}) {
  useLang()
  const initial = data.find(d => d.playId === initialClassId)
  const [characterId, setCharacterId] = useState<string | null>(initial?.gameplayCharacter.id ?? null)
  const [classId, setClassId] = useState<string | null>(initial?.playId ?? null)
  const groups = groupPlayerCharacters(data)
  const group = groups.find(g => g.character.id === characterId)
  const selected = group?.classes.find(d => d.playId === classId) ?? group?.classes[0]
  const chooseCharacter = (id: string) => {
    setCharacterId(id)
    setClassId(readChoices()[id] ?? null)
  }
  return <section className="ep-selection">
    <div className="ep-page-heading">
      <button className="ep-back" onClick={() => group ? setCharacterId(null) : onBack()}>← {group ? '返回角色列表' : '返回'}</button>
      <span className="ep-eyebrow">{group ? '02 / CLASS' : '01 / CHARACTER'}</span>
      <h1>{group ? `${localizedName(group.character.names, group.character.id)}・選擇職業` : '選擇角色'}</h1>
      <p>{group ? '選擇職業，查看戰鬥數值與行動效果。' : '選擇一名角色，查看目前可使用的職業。'}</p>
    </div>
    {!groups.length && <p className="ep-empty">目前沒有可使用的角色職業。</p>}
    {!group && <div className="ep-character-grid">{groups.map(g => {
      const row = g.classes.find(d => d.playId === readChoices()[g.character.id]) ?? g.classes[0]
      return <button className="ep-character-card" key={g.character.id} onClick={() => chooseCharacter(g.character.id)}>
        <span className="ep-character-art"><img src={`/rangers/${row.item.id}/thumb.png`} alt="" /></span>
        <strong>{localizedName(g.character.names, g.character.id)}</strong>
        <span>{g.classes.length} 個職業</span><span className="ep-card-link">選擇職業 →</span>
      </button>
    })}</div>}
    {group && selected && <div className="ep-class-layout">
      <aside className="ep-class-list" aria-label="可用職業">{group.classes.map(row => <button key={row.playId} className={'ep-class-option' + (row.playId === selected.playId ? ' selected' : '')} aria-pressed={row.playId === selected.playId} onClick={() => setClassId(row.playId)}>
        <img src={`/rangers/${row.item.id}/thumb.png`} alt="" /><span><strong>{nameOf(row)}</strong><small>{row.gameplayClass.role}</small></span>
      </button>)}</aside>
      <div className="ep-class-preview"><HeroArt id={selected.item.id} config={selected.config} /><h2>{nameOf(selected)}</h2><p>{group.character.description}</p>
        <button className="ep-primary" onClick={() => { rememberClass(selected); onConfirm(selected) }}>{confirmLabel}</button>
      </div>
      <ClassDetails row={selected} />
    </div>}
  </section>
}

const targets = { single: '一名敵人', all: '全體敵人', primaryPlusRandom: '主要敵人與隨機額外目標', singleAlly: '一名友軍（可選自己）', allAllies: '全體友軍' }
const selectors = { manual: '手動選擇', random: '隨機', lowestHp: '體力由低至高', highestHp: '體力由高至低', lowestAttack: '攻擊力由低至高', highestAttack: '攻擊力由高至低' }
const scopes = { self: '自身', allAllies: '我方全體', allEnemies: '敵方全體', attacker: '攻擊者' }
function Effects({ effects, ability = false }: { effects: GameplayEffect[]; ability?: boolean }) {
  return effects.length ? <ul className="ep-effects">{effects.map((e, i) => <li key={i}>
    {ability ? `${scopes[e.abilityTarget ?? 'self']}：` : ''}{EFFECT_LABEL_ZH[e.type].replace('N%', `${e.value ?? 0}%`)}
    {e.value !== undefined && !EFFECT_LABEL_ZH[e.type].includes('N%') ? ` ${e.value}${e.type === 'fixedDamage' ? '' : '%'}` : ''}
    {e.hits !== undefined ? `・${e.hits} Hit` : ''}
    {e.duration !== undefined ? (e.type === 'heal' && e.duration === 1 ? '・立即回復' : `・${e.duration} Round`) : ''}
  </li>)}</ul> : <p className="ep-muted">無額外效果</p>
}
export function ClassDetails({ row }: { row: RangerData }) {
  const c = row.gameplayClass
  const stats = [['體力', c.stats.hp.toLocaleString()], ['攻擊力', c.stats.attack.toLocaleString()], ['爆擊機率', `${c.stats.critRate}%`], ['爆擊傷害', `${c.stats.critDamage} 倍`], ['命中率', `${c.stats.hitRate}%`]]
  return <div className="ep-details">
    <section><h3>基礎數值</h3><dl className="ep-stats">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
    <section><h3>普通攻擊</h3><p>{targets[c.normalAttack.target]}{c.normalAttack.target === 'primaryPlusRandom' ? `（額外 ${c.normalAttack.extraTargets ?? 0} 名）` : ''}・{c.normalAttack.hits} Hit</p><p>每 Hit 造成 {c.stats.attack.toLocaleString()} 基礎傷害，每次行動技能條 +{c.normalAttack.skillGaugeGain}%。</p></section>
    <section><h3>普通輔助</h3><p>{targets[c.normalSupport.target]}</p><Effects effects={c.normalSupport.effects} /></section>
    <section><h3>{c.skill.icon && <img className="ep-effect-icon" src={c.skill.icon} alt="" />}技能</h3><p>{c.skill.target.side === 'enemy' ? '敵方' : '我方'} {c.skill.target.count === 'all' ? '全體' : `${c.skill.target.count} 名`}・{selectors[c.skill.target.selector]}</p><Effects effects={c.skill.effects} /></section>
    <section><h3>能力</h3>{c.abilities.length ? c.abilities.map((a, i) => <div className="ep-ability" key={a.id}>
      <h4>{a.icon && <img className="ep-effect-icon" src={a.icon} alt="" />}能力 {i + 1}・{TRIGGER_LABEL_ZH[a.trigger].replace('N', String(a.triggerValue ?? 1))}</h4>
      {a.conditions.map((condition, j) => <p key={j}>{CONDITION_LABEL_ZH[condition.type]} {condition.operator ?? ''} {typeof condition.value === 'string' && condition.value in EFFECT_LABEL_ZH ? EFFECT_LABEL_ZH[condition.value as keyof typeof EFFECT_LABEL_ZH] : String(condition.value)}</p>)}
      <Effects effects={a.effects} ability />
    </div>) : <p>無</p>}</section>
  </div>
}
