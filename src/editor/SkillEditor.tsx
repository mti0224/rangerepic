// ====================================================
// SkillEditor — ตั้งค่าความสามารถของสกิลในการรบ (ประเภท / Cost / ความกว้าง / รายการความสามารถ)
// แยกจากส่วนอนิเมชั่นของท่า — แก้ตรงนี้ไม่กระทบคลิปหรือตำแหน่งกระสุน
// ====================================================

import {
  AREAS_OF, EFFECTS, effectsOf, newEffect,
  type EffectType, type HealScale, type LifestealScope, type ParamDef, type ParamKey, type SkillDef, type SkillKind,
} from '@/lib/skills'
import type { Element } from '@/lib/rangerClass'
import type { GameSkillInfo } from '@/lib/rangerApi'
import {
  areaLabel, e, effectLabel, effectNote, elementLabel, gameName, healScaleLabel, lifestealScopeLabel, paramLabel, useELang,
} from './i18n'

const BASIS_KEY = { self: 'basisSelf', front: 'basisFront', rear: 'basisRear' } as const

export default function SkillEditor({ skill, rangerId, info, onChange }: {
  skill: SkillDef
  rangerId: string
  info: GameSkillInfo | null
  onChange: (next: SkillDef) => void
}) {
  useELang()
  const set = (patch: Partial<SkillDef>) => onChange({ ...skill, ...patch })
  const used = new Set(skill.effects.map(e => e.type))
  const addable = effectsOf(skill.kind).filter(t => !used.has(t))

  const changeKind = (kind: SkillKind) => {
    if (kind === skill.kind) return
    // เปลี่ยนประเภท → ความกว้างเริ่มใหม่ · เก็บเฉพาะความสามารถที่ใช้กับประเภทใหม่ได้
    const kept = skill.effects.filter(x => EFFECTS[x.type].kind === kind)
    set({
      kind,
      area: AREAS_OF[kind][0],
      effects: kept.length ? kept : [newEffect(kind === 'attack' ? 'damage' : 'atkUp')],
    })
  }

  const setParam = (i: number, key: ParamKey, def: ParamDef, raw: string) => {
    const n = Math.round(Number(raw))
    const value = Number.isFinite(n) ? Math.max(def.min, Math.min(def.max, n)) : def.default
    set({ effects: skill.effects.map((x, j) => (j === i ? { ...x, [key]: value } : x)) })
  }

  const skillName = gameName(info?.name)
  const basisKey = info?.basis ? BASIS_KEY[info.basis.type as keyof typeof BASIS_KEY] : undefined

  return (
    <div className="skill-editor">
      {info && (
        <div className="skill-info">
          {info.icon
            ? <img src={`/rangers/${encodeURIComponent(rangerId)}/${info.icon}`} alt="" />
            : <div className="skill-icon-empty">?</div>}
          <div>
            <b>{skillName ?? info.code}</b>
            {info.name.en && skillName !== info.name.en && <i>{info.name.en}</i>}
            {info.basis && (
              <span className="note" style={{ margin: 0 }}>
                {e('inGameAim', { b: basisKey ? e(basisKey) : info.basis.type })}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="skill-row">
        <label>
          <span>{e('fKind')}</span>
          <select value={skill.kind} onChange={ev => changeKind(ev.target.value as SkillKind)}>
            <option value="attack">{e('kindAttack')}</option>
            <option value="buff">{e('kindBuff')}</option>
          </select>
        </label>
        <label>
          <span>Cost</span>
          <input type="number" min={0} max={10} value={skill.cost}
            onChange={ev => set({ cost: Math.max(0, Math.min(10, Math.round(Number(ev.target.value) || 0))) })} />
        </label>
      </div>
      <label className="skill-field">
        <span>{e('fArea')}</span>
        <select value={skill.area} onChange={ev => set({ area: ev.target.value as SkillDef['area'] })}>
          {AREAS_OF[skill.kind].map(a => <option key={a} value={a}>{areaLabel(a)}</option>)}
        </select>
      </label>
      {skill.area === 'row' && <p className="note">{e('rowNote')}</p>}
      {(skill.area === 'row' || skill.area === 'all') && skill.effects.some(x => x.type === 'stun' || x.type === 'silence') && (
        <p className="note">{e('wideNote')}</p>
      )}

      <div className="effect-list">
        {skill.effects.length === 0 && <p className="note">{e('noEffects')}</p>}
        {skill.effects.map((ef, i) => {
          const def = EFFECTS[ef.type]
          const params = Object.entries(def.params) as [ParamKey, ParamDef][]
          const note = effectNote(ef.type)
          return (
            <div key={ef.type} className="effect-row">
              <span className="effect-name">
                {effectLabel(ef.type)}
                {note && <small className="effect-note">{note}</small>}
              </span>
              {params.map(([key, p]) => (
                <label key={key} className="effect-param">
                  <input type="number" min={p.min} max={p.max} step={p.step} value={ef[key] ?? p.default}
                    onChange={ev => setParam(i, key, p, ev.target.value)} />
                  <span>{paramLabel(p.label)}</span>
                </label>
              ))}
              {def.choice && (() => {
                const c = def.choice
                // ป้ายในลิสต์: ขอบเขตดูดเลือด · สเกลฮีล/โล่ · ธาตุที่เปลี่ยนเป็น
                const label = (o: string) =>
                  c.key === 'scope' ? lifestealScopeLabel(o as LifestealScope)
                    : c.key === 'scale' ? healScaleLabel(o as HealScale)
                      : elementLabel(o as Element)
                const cur = c.key === 'scope' ? ef.scope : c.key === 'scale' ? ef.scale : ef.element
                return (
                  <select className="effect-choice" value={cur ?? c.default}
                    onChange={ev => set({
                      effects: skill.effects.map((x, j) => (j === i
                        ? { ...x, [c.key]: ev.target.value as LifestealScope & HealScale & Element }
                        : x)),
                    })}>
                    {(c.options as string[]).map(o => <option key={o} value={o}>{label(o)}</option>)}
                  </select>
                )
              })()}
              <button className="effect-x" title={e('remove')} onClick={() => set({ effects: skill.effects.filter((_, j) => j !== i) })}>×</button>
            </div>
          )
        })}
      </div>
      {addable.length > 0 && (
        <select className="effect-add" value="" onChange={ev => {
          if (!ev.target.value) return
          set({ effects: [...skill.effects, newEffect(ev.target.value as EffectType)] })
        }}>
          <option value="">{e('addEffect')}</option>
          {addable.map(t => <option key={t} value={t}>{effectLabel(t)}</option>)}
        </select>
      )}
    </div>
  )
}
