// ====================================================
// SkillEditor — ตั้งค่าความสามารถของสกิลในการรบ (類型 / Cost / 作用範圍 / รายการความสามารถ)
// แยกจากส่วนอนิเมชั่นของท่า — แก้ตรงนี้ไม่กระทบคลิปหรือตำแหน่งกระสุน
// ====================================================

import {
  AREA_LABEL, AREAS_OF, EFFECTS, effectsOf, HEAL_SCALE_LABEL, LIFESTEAL_SCOPE_LABEL, newEffect,
  type EffectType, type HealScale, type LifestealScope, type ParamDef, type ParamKey, type SkillDef, type SkillKind,
} from '@/lib/skills'
import { ELEMENT_LABEL, type Element } from '@/lib/rangerClass'
import type { GameSkillInfo } from '@/lib/rangerApi'
import { properNameZhTw } from '@/play/zhNames'

const BASIS_LABEL: Record<string, string> = { self: '自身', front: '前排敵人', rear: '後排敵人' }

export default function SkillEditor({ skill, rangerId, info, onChange }: {
  skill: SkillDef
  rangerId: string
  info: GameSkillInfo | null
  onChange: (next: SkillDef) => void
}) {
  const set = (patch: Partial<SkillDef>) => onChange({ ...skill, ...patch })
  const used = new Set(skill.effects.map(e => e.type))
  const addable = effectsOf(skill.kind).filter(t => !used.has(t))

  const changeKind = (kind: SkillKind) => {
    if (kind === skill.kind) return
    // เปลี่ยน類型 → 作用範圍เริ่มใหม่ · เก็บเฉพาะความสามารถที่ใช้กับ類型ใหม่ได้
    const kept = skill.effects.filter(e => EFFECTS[e.type].kind === kind)
    set({
      kind,
      area: AREAS_OF[kind][0],
      effects: kept.length ? kept : [newEffect(kind === 'attack' ? 'damage' : 'atkUp')],
    })
  }

  const setParam = (i: number, key: ParamKey, def: ParamDef, raw: string) => {
    const n = Math.round(Number(raw))
    const value = Number.isFinite(n) ? Math.max(def.min, Math.min(def.max, n)) : def.default
    set({ effects: skill.effects.map((e, j) => (j === i ? { ...e, [key]: value } : e)) })
  }

  return (
    <div className="skill-editor">
      {info && (
        <div className="skill-info">
          {info.icon
            ? <img src={`/rangers/${encodeURIComponent(rangerId)}/${info.icon}`} alt="" />
            : <div className="skill-icon-empty">?</div>}
          <div>
            <b>{properNameZhTw(info.code) ?? info.name.en ?? info.name.th ?? info.code}</b>
            {info.basis && <span className="note" style={{ margin: 0 }}>遊戲目標：{BASIS_LABEL[info.basis.type] ?? info.basis.type}</span>}
          </div>
        </div>
      )}

      <div className="skill-row">
        <label>
          <span>類型</span>
          <select value={skill.kind} onChange={e => changeKind(e.target.value as SkillKind)}>
            <option value="attack">攻擊技能</option>
            <option value="buff">輔助技能</option>
          </select>
        </label>
        <label>
          <span>Cost</span>
          <input type="number" min={0} max={10} value={skill.cost}
            onChange={e => set({ cost: Math.max(0, Math.min(10, Math.round(Number(e.target.value) || 0))) })} />
        </label>
      </div>
      <label className="skill-field">
        <span>作用範圍</span>
        <select value={skill.area} onChange={e => set({ area: e.target.value as SkillDef['area'] })}>
          {AREAS_OF[skill.kind].map(a => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
        </select>
      </label>
      {skill.area === 'row' && (
        <p className="note">敵方前排有 2 名時只能選擇前排（整排命中）；剩 1 名或 0 名時可選後排</p>
      )}
      {(skill.area === 'row' || skill.area === 'all') && skill.effects.some(e => e.type === 'stun' || e.type === 'silence') && (
        <p className="note">範圍技能的昏迷／沉默較難命中：整排 ×0.7、全體 ×0.5（相對於原始機率）</p>
      )}

      <div className="effect-list">
        {skill.effects.length === 0 && <p className="note">尚無技能效果 — 可從下方清單新增</p>}
        {skill.effects.map((e, i) => {
          const def = EFFECTS[e.type]
          const params = Object.entries(def.params) as [ParamKey, ParamDef][]
          return (
            <div key={e.type} className="effect-row">
              <span className="effect-name">
                {def.label}
                {def.note && <small className="effect-note">{def.note}</small>}
              </span>
              {params.map(([key, p]) => (
                <label key={key} className="effect-param">
                  <input type="number" min={p.min} max={p.max} step={p.step} value={e[key] ?? p.default}
                    onChange={ev => setParam(i, key, p, ev.target.value)} />
                  <span>{p.label}</span>
                </label>
              ))}
              {def.choice && (() => {
                const c = def.choice
                // ป้ายในลิสต์: ขอบเขตดูดเลือด · สเกลฮีล/โล่ · ธาตุที่เปลี่ยนเป็น
                const label = (o: string) =>
                  c.key === 'scope' ? LIFESTEAL_SCOPE_LABEL[o as LifestealScope]
                    : c.key === 'scale' ? HEAL_SCALE_LABEL[o as HealScale]
                      : ELEMENT_LABEL[o as Element]
                const cur = c.key === 'scope' ? e.scope : c.key === 'scale' ? e.scale : e.element
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
              <button className="effect-x" title="刪除" onClick={() => set({ effects: skill.effects.filter((_, j) => j !== i) })}>×</button>
            </div>
          )
        })}
      </div>
      {addable.length > 0 && (
        <select className="effect-add" value="" onChange={e => {
          if (!e.target.value) return
          set({ effects: [...skill.effects, newEffect(e.target.value as EffectType)] })
        }}>
          <option value="">+ 新增技能效果…</option>
          {addable.map(t => <option key={t} value={t}>{EFFECTS[t].label}</option>)}
        </select>
      )}
    </div>
  )
}
