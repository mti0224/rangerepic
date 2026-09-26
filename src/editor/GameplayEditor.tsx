import { useCallback, useEffect, useMemo, useState } from 'react'
import { listRangers, type RangerListItem } from '@/lib/rangerApi'
import {
  ABILITY_TRIGGERS, ATTACK_SKILL_EFFECT_TYPES, CONDITION_LABEL_ZH, CONDITION_OPERATORS, CONDITION_TYPES,
  EFFECT_LABEL_ZH, EFFECT_TYPES, SUPPORT_SKILL_EFFECT_TYPES, TRIGGER_LABEL_ZH,
  newGameplayAbility, newGameplayCharacter, newGameplayClass, newGameplayEffect,
  type AbilityCondition, type BattleRulesV1, type GameplayAbility, type GameplayCharacter, type GameplayClass,
  type GameplayEffect, type GameplayEffectType, type SkillTargetRule,
} from '@/lib/gameplaySchema'
import {
  deleteGameplayCharacter, deleteGameplayClass, listGameplayCharacters, listGameplayClasses, listGameplayIcons,
  loadGameplayRules, saveGameplayCharacter, saveGameplayClass, saveGameplayRules, uploadGameplayIcon,
  type GameplayIconAsset, type GameplayIconKind, type GameplayIconLibrary,
} from '@/lib/gameplayApi'

type View = 'characters' | 'classes' | 'rules'

const clone = <T,>(v: T): T => structuredClone(v)
const idOk = (s: string) => /^[a-z0-9][a-z0-9_-]*$/i.test(s)

export default function GameplayEditor() {
  const [view, setView] = useState<View>('classes')
  const [characters, setCharacters] = useState<GameplayCharacter[]>([])
  const [classes, setClasses] = useState<GameplayClass[]>([])
  const [assets, setAssets] = useState<RangerListItem[]>([])
  const [iconLibrary, setIconLibrary] = useState<GameplayIconLibrary>({ skill: [], ability: [] })
  const [rules, setRules] = useState<BattleRulesV1 | null>(null)
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [characterDraft, setCharacterDraft] = useState<GameplayCharacter | null>(null)
  const [classDraft, setClassDraft] = useState<GameplayClass | null>(null)
  const [rulesDraft, setRulesDraft] = useState<BattleRulesV1 | null>(null)
  const [newId, setNewId] = useState('')
  const [status, setStatus] = useState('')

  const refresh = useCallback(async () => {
    setStatus('載入中…')
    try {
      const [cs, ks, rs, as, icons] = await Promise.all([
        listGameplayCharacters(), listGameplayClasses(), loadGameplayRules(), listRangers(), listGameplayIcons(),
      ])
      setCharacters(cs)
      setClasses(ks)
      setRules(rs)
      setRulesDraft(clone(rs))
      setStatus('')
      setAssets(as)
      setIconLibrary(icons)
      return { cs, ks }
    } catch (e) {
      setStatus('載入失敗：' + String(e))
      return null
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const registerIcon = useCallback((asset: GameplayIconAsset) => {
    setIconLibrary(prev => {
      const rows = prev[asset.kind].filter(row => row.url !== asset.url)
      return { ...prev, [asset.kind]: [...rows, asset].sort((a, b) => a.name.localeCompare(b.name)) }
    })
  }, [])

  useEffect(() => {
    const row = characters.find(x => x.id === selectedCharacter) ?? null
    setCharacterDraft(row ? clone(row) : null)
  }, [selectedCharacter, characters])

  useEffect(() => {
    const row = classes.find(x => x.id === selectedClass) ?? null
    setClassDraft(row ? clone(row) : null)
  }, [selectedClass, classes])

  const classCount = useMemo(() => {
    const out = new Map<string, number>()
    for (const c of classes) out.set(c.characterId, (out.get(c.characterId) ?? 0) + 1)
    return out
  }, [classes])

  const addCharacter = () => {
    const id = newId.trim().toLowerCase()
    if (!idOk(id)) return setStatus('ID 只能使用英數、底線與連字號。')
    if (characters.some(x => x.id === id)) return setStatus('Character ID 已存在。')
    setCharacters(v => [...v, newGameplayCharacter(id)])
    setSelectedCharacter(id)
    setNewId('')
    setView('characters')
    setStatus('新角色尚未儲存。')
  }

  const addClass = () => {
    const id = newId.trim().toLowerCase()
    if (!idOk(id)) return setStatus('ID 只能使用英數、底線與連字號。')
    if (classes.some(x => x.id === id)) return setStatus('Class ID 已存在。')
    const characterId = characters[0]?.id
    const assetVariantId = assets[0]?.id
    if (!characterId) return setStatus('請先建立至少一個 Character。')
    if (!assetVariantId) return setStatus('目前沒有可用的 Ranger 圖資。')
    setClasses(v => [...v, newGameplayClass(id, characterId, assetVariantId)])
    setSelectedClass(id)
    setNewId('')
    setView('classes')
    setStatus('新職業尚未儲存。')
  }

  const saveCharacter = async () => {
    if (!characterDraft) return
    setStatus('儲存角色中…')
    try {
      await saveGameplayCharacter(characterDraft)
      setCharacters(v => upsert(v, characterDraft))
      setStatus('角色已儲存。')
    } catch (e) { setStatus('儲存失敗：' + String(e)) }
  }

  const saveClass = async () => {
    if (!classDraft) return
    setStatus('儲存職業中…')
    try {
      await saveGameplayClass(classDraft)
      setClasses(v => upsert(v, classDraft))
      setStatus('職業已儲存。')
    } catch (e) { setStatus('儲存失敗：' + String(e)) }
  }

  const removeCharacter = async () => {
    if (!characterDraft || !confirm('刪除 Character「' + (characterDraft.names.zh || characterDraft.id) + '」？')) return
    try {
      await deleteGameplayCharacter(characterDraft.id)
      setCharacters(v => v.filter(x => x.id !== characterDraft.id))
      setSelectedCharacter(null)
      setStatus('角色已刪除。')
    } catch (e) { setStatus('刪除失敗：' + String(e)) }
  }

  const removeClass = async () => {
    if (!classDraft || !confirm('刪除 Class「' + (classDraft.names.zh || classDraft.id) + '」？')) return
    try {
      await deleteGameplayClass(classDraft.id)
      setClasses(v => v.filter(x => x.id !== classDraft.id))
      setSelectedClass(null)
      setStatus('職業已刪除。')
    } catch (e) { setStatus('刪除失敗：' + String(e)) }
  }

  const saveRules = async () => {
    if (!rulesDraft) return
    setStatus('儲存戰鬥規則中…')
    try {
      await saveGameplayRules(rulesDraft)
      setRules(clone(rulesDraft))
      setStatus('戰鬥規則已儲存。')
    } catch (e) { setStatus('儲存失敗：' + String(e)) }
  }

  return (
    <div className="gp-editor">
      <aside className="gp-side">
        <div className="gp-view-tabs">
          <button className={view === 'characters' ? 'sel' : ''} onClick={() => setView('characters')}>角色</button>
          <button className={view === 'classes' ? 'sel' : ''} onClick={() => setView('classes')}>職業</button>
          <button className={view === 'rules' ? 'sel' : ''} onClick={() => setView('rules')}>戰鬥規則</button>
        </div>

        {view !== 'rules' && (
          <div className="gp-add">
            <input value={newId} onChange={e => setNewId(e.target.value)} placeholder={view === 'characters' ? 'character_id' : 'class_id'} />
            <button onClick={view === 'characters' ? addCharacter : addClass}>＋</button>
          </div>
        )}

        {view === 'characters' && (
          <div className="gp-list">
            {characters.map(c => (
              <button key={c.id} className={selectedCharacter === c.id ? 'sel' : ''} onClick={() => setSelectedCharacter(c.id)}>
                <b>{c.names.zh || c.names.en || c.id}</b>
                <small>{c.id} · {classCount.get(c.id) ?? 0} 個職業</small>
              </button>
            ))}
          </div>
        )}

        {view === 'classes' && (
          <div className="gp-list">
            {classes.map(c => (
              <button key={c.id} className={selectedClass === c.id ? 'sel' : ''} onClick={() => setSelectedClass(c.id)}>
                <b>{c.names.zh || c.names.en || c.id}</b>
                <small>{c.characterId} · {c.assetVariantId}</small>
              </button>
            ))}
            {!classes.length && <p className="gp-empty">尚未建立正式職業。這裡不會自動匯入 LINE Rangers 原始數值。</p>}
          </div>
        )}

        {view === 'rules' && rules && <p className="gp-empty">Battle Rules v{rules.schemaVersion}<br />此頁只管理 RangerEpic 新規則，不會改動舊 Battle Engine。</p>}
        <div className="gp-status">{status}</div>
      </aside>

      <main className="gp-main">
        {view === 'characters' && characterDraft && (
          <CharacterForm value={characterDraft} onChange={setCharacterDraft} onSave={saveCharacter} onDelete={removeCharacter} />
        )}
        {view === 'characters' && !characterDraft && <Empty title="選擇或新增角色" text="Character 代表熊大、兔兔、饅頭人等角色本體；戰鬥數值放在 Class。" />}

        {view === 'classes' && classDraft && (
          <ClassForm value={classDraft} characters={characters} assets={assets} iconLibrary={iconLibrary} onIconUploaded={registerIcon} onChange={setClassDraft} onSave={saveClass} onDelete={removeClass} />
        )}
        {view === 'classes' && !classDraft && <Empty title="選擇或新增職業" text="Class 決定 Stats、普通攻擊、普通輔助、技能與能力；assetVariantId 只負責圖像／動畫。" />}

        {view === 'rules' && rulesDraft && <RulesForm value={rulesDraft} onChange={setRulesDraft} onSave={saveRules} changed={JSON.stringify(rulesDraft) !== JSON.stringify(rules)} />}
      </main>
    </div>
  )
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="gp-empty-main"><h2>{title}</h2><p>{text}</p></div>
}

function CharacterForm({ value, onChange, onSave, onDelete }: {
  value: GameplayCharacter
  onChange: (v: GameplayCharacter) => void
  onSave: () => void
  onDelete: () => void
}) {
  const name = (k: keyof GameplayCharacter['names'], v: string) => onChange({ ...value, names: { ...value.names, [k]: v } })
  return (
    <div className="gp-form">
      <Header title={value.names.zh || value.id} sub={'Character · ' + value.id} onSave={onSave} onDelete={onDelete} />
      <Section title="角色基本資料" note="Character 本身不持有戰鬥數值；同一角色可以擁有多個 Class。">
        <div className="gp-grid two">
          <Field label="繁體中文"><input value={value.names.zh} onChange={e => name('zh', e.target.value)} /></Field>
          <Field label="English"><input value={value.names.en} onChange={e => name('en', e.target.value)} /></Field>
          <Field label="ไทย"><input value={value.names.th} onChange={e => name('th', e.target.value)} /></Field>
          <Field label="日本語"><input value={value.names.jp} onChange={e => name('jp', e.target.value)} /></Field>
        </div>
        <Field label="說明"><textarea value={value.description} onChange={e => onChange({ ...value, description: e.target.value })} /></Field>
      </Section>
    </div>
  )
}

function ClassForm({ value, characters, assets, iconLibrary, onIconUploaded, onChange, onSave, onDelete }: {
  value: GameplayClass
  characters: GameplayCharacter[]
  assets: RangerListItem[]
  iconLibrary: GameplayIconLibrary
  onIconUploaded: (asset: GameplayIconAsset) => void
  onChange: (v: GameplayClass) => void
  onSave: () => void
  onDelete: () => void
}) {
  const names = (k: keyof GameplayClass['names'], v: string) => onChange({ ...value, names: { ...value.names, [k]: v } })
  const stat = (k: keyof GameplayClass['stats'], v: number) => onChange({ ...value, stats: { ...value.stats, [k]: v } })
  return (
    <div className="gp-form">
      <Header title={value.names.zh || value.id} sub={'Class · ' + value.id} onSave={onSave} onDelete={onDelete} />

      <Section title="身分與圖資" note="定位只是分類標籤，不會像舊 Role 一樣自動附帶吸血、減傷等隱藏效果。">
        <div className="gp-grid two">
          <Field label="角色">
            <select value={value.characterId} onChange={e => onChange({ ...value, characterId: e.target.value })}>
              {characters.map(c => <option key={c.id} value={c.id}>{c.names.zh || c.names.en || c.id} ({c.id})</option>)}
            </select>
          </Field>
          <Field label="Asset Variant（只負責動畫／圖片）">
            <select value={value.assetVariantId} onChange={e => onChange({ ...value, assetVariantId: e.target.value })}>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
            </select>
          </Field>
          <Field label="定位標籤"><input value={value.role} onChange={e => onChange({ ...value, role: e.target.value })} placeholder="例如：坦克、輸出、輔助" /></Field>
          <Field label="繁體中文職業名"><input value={value.names.zh} onChange={e => names('zh', e.target.value)} /></Field>
          <Field label="English"><input value={value.names.en} onChange={e => names('en', e.target.value)} /></Field>
          <Field label="ไทย"><input value={value.names.th} onChange={e => names('th', e.target.value)} /></Field>
          <Field label="日本語"><input value={value.names.jp} onChange={e => names('jp', e.target.value)} /></Field>
        </div>
      </Section>

      <Section title="基礎數值" note="新系統只有 Attack、HP、爆擊率、爆擊倍率、命中率；爆擊僅普通攻擊可觸發。">
        <div className="gp-grid five">
          <Num label="體力 HP" value={value.stats.hp} min={1} onChange={v => stat('hp', v)} />
          <Num label="攻擊力" value={value.stats.attack} min={0} onChange={v => stat('attack', v)} />
          <Num label="爆擊機率 %" value={value.stats.critRate} min={0} max={100} onChange={v => stat('critRate', v)} />
          <Num label="爆擊倍率 ×" value={value.stats.critDamage} min={0} step={0.1} onChange={v => stat('critDamage', v)} />
          <Num label="命中率 %" value={value.stats.hitRate} min={0} max={100} onChange={v => stat('hitRate', v)} />
        </div>
      </Section>

      <Section title="普通攻擊" note="每一 Hit 都使用完整 Attack；每 Hit 個別判定命中與爆擊。技能條增加量以整次普通攻擊計算一次。">
        <div className="gp-grid four">
          <Field label="目標">
            <select value={value.normalAttack.target} onChange={e => onChange({ ...value, normalAttack: { ...value.normalAttack, target: e.target.value as GameplayClass['normalAttack']['target'] } })}>
              <option value="single">一名敵人</option>
              <option value="all">全體敵人</option>
              <option value="primaryPlusRandom">一名敵人 + N</option>
            </select>
          </Field>
          <Num label="Hit 數" value={value.normalAttack.hits} min={1} step={1} onChange={v => onChange({ ...value, normalAttack: { ...value.normalAttack, hits: Math.max(1, Math.round(v)) } })} />
          <Num label="技能條增加 %" value={value.normalAttack.skillGaugeGain} min={0} max={100} onChange={v => onChange({ ...value, normalAttack: { ...value.normalAttack, skillGaugeGain: v } })} />
          {value.normalAttack.target === 'primaryPlusRandom' && <Num label="額外隨機目標 N" value={value.normalAttack.extraTargets ?? 1} min={1} step={1} onChange={v => onChange({ ...value, normalAttack: { ...value.normalAttack, extraTargets: Math.max(1, Math.round(v)) } })} />}
        </div>
      </Section>

      <Section title="普通輔助" note="普通輔助不增加技能條，也不受命中率影響。">
        <Field label="目標">
          <select value={value.normalSupport.target} onChange={e => onChange({ ...value, normalSupport: { ...value.normalSupport, target: e.target.value as GameplayClass['normalSupport']['target'] } })}>
            <option value="singleAlly">一名友軍（可自己）</option>
            <option value="allAllies">全體友軍</option>
          </select>
        </Field>
        <EffectList
          value={value.normalSupport.effects}
          allowedTypes={SUPPORT_SKILL_EFFECT_TYPES}
          onChange={effects => onChange({ ...value, normalSupport: { ...value.normalSupport, effects } })}
        />
      </Section>

      <Section
        title={value.skill.target.side === 'enemy' ? '技能（攻擊）' : '技能（輔助）'}
        note={value.skill.target.side === 'enemy'
          ? '敵方目標只顯示攻擊技能效果；倍率傷害使用 Attack × N%，不會爆擊。'
          : '我方目標只顯示輔助技能效果。切換作用對象後，下拉選單會跟著切換效果分類。'}
      >
        <IconPicker
          kind="skill"
          value={value.skill.icon ?? ''}
          options={iconLibrary.skill}
          onChange={icon => onChange({ ...value, skill: { ...value.skill, icon } })}
          onUploaded={onIconUploaded}
        />
        <TargetEditor value={value.skill.target} onChange={target => onChange({ ...value, skill: { ...value.skill, target } })} />
        <EffectList
          value={value.skill.effects}
          allowedTypes={value.skill.target.side === 'enemy' ? ATTACK_SKILL_EFFECT_TYPES : SUPPORT_SKILL_EFFECT_TYPES}
          onChange={effects => onChange({ ...value, skill: { ...value.skill, effects } })}
        />
      </Section>

      <Section title="能力" note="能力由 Trigger + Conditions + Effects 組成，不需要玩家主動施放。">
        <div className="gp-ability-list">
          {value.abilities.map((a, i) => (
            <AbilityEditor key={i} value={a} index={i} iconLibrary={iconLibrary} onIconUploaded={onIconUploaded} onChange={ability => {
              const abilities = [...value.abilities]; abilities[i] = ability; onChange({ ...value, abilities })
            }} onDelete={() => onChange({ ...value, abilities: value.abilities.filter((_, j) => j !== i) })} />
          ))}
        </div>
        <button onClick={() => onChange({ ...value, abilities: [...value.abilities, newGameplayAbility(value.abilities.length + 1)] })}>＋ 新增能力</button>
      </Section>
    </div>
  )
}

function TargetEditor({ value, onChange }: { value: SkillTargetRule; onChange: (v: SkillTargetRule) => void }) {
  const selectors = value.side === 'enemy'
    ? [['random', '隨機'], ['lowestHp', '體力低至高'], ['highestHp', '體力高至低']] as const
    : [['random', '隨機'], ['lowestHp', '體力低至高'], ['highestHp', '體力高至低'], ['lowestAttack', '攻擊力低至高'], ['highestAttack', '攻擊力高至低']] as const
  return (
    <div className="gp-grid four">
      <Field label="作用對象">
        <select value={value.side} onChange={e => {
          const side = e.target.value as SkillTargetRule['side']
          const selector = side === 'enemy' && ['lowestAttack', 'highestAttack'].includes(value.selector) ? 'random' : value.selector
          onChange({ ...value, side, selector })
        }}>
          <option value="enemy">敵方</option><option value="ally">我方</option>
        </select>
      </Field>
      <Field label="數量">
        <select value={String(value.count)} onChange={e => onChange({ ...value, count: e.target.value === 'all' ? 'all' : Number(e.target.value) })}>
          <option value="all">全體</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      <Field label="挑選依據">
        <select value={value.selector} onChange={e => onChange({ ...value, selector: e.target.value as SkillTargetRule['selector'] })}>
          {selectors.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </Field>
    </div>
  )
}

function EffectList({ value, onChange, allowedTypes = EFFECT_TYPES }: {
  value: GameplayEffect[]
  onChange: (v: GameplayEffect[]) => void
  allowedTypes?: readonly GameplayEffectType[]
}) {
  const invalidCount = value.filter(effect => !allowedTypes.includes(effect.type)).length
  const defaultType = allowedTypes[0] ?? 'damage'
  return (
    <div className="gp-effects">
      {invalidCount > 0 && (
        <p className="gp-effect-warning">目前有 {invalidCount} 個效果不屬於此技能分類，請從下拉選單改成目前允許的效果。</p>
      )}
      {value.map((effect, i) => (
        <EffectEditor key={i} value={effect} allowedTypes={allowedTypes} onChange={next => {
          const rows = [...value]; rows[i] = next; onChange(rows)
        }} onDelete={() => onChange(value.filter((_, j) => j !== i))} />
      ))}
      <button className="gp-add-effect" onClick={() => onChange([...value, newGameplayEffect(defaultType)])}>＋ 新增效果</button>
    </div>
  )
}

const NO_VALUE = new Set<GameplayEffectType>(['stun','silence','removeShield','dispelBuffs','taunt','cleanseDebuffs','cleanseDamageOverTime','cleansePoison','removeTaunt','removeStun','removeSilence'])
const NO_DURATION = new Set<GameplayEffectType>(['damage','removeShield','dispelBuffs','cleanseDebuffs','cleanseDamageOverTime','cleansePoison','fixedDamage','removeTaunt','removeStun','removeSilence'])

function EffectEditor({ value, allowedTypes, onChange, onDelete }: {
  value: GameplayEffect
  allowedTypes: readonly GameplayEffectType[]
  onChange: (v: GameplayEffect) => void
  onDelete: () => void
}) {
  const changeType = (type: GameplayEffectType) => onChange(newGameplayEffect(type))
  const currentIsAllowed = allowedTypes.includes(value.type)
  return (
    <div className="gp-effect">
      <select value={value.type} onChange={e => changeType(e.target.value as GameplayEffectType)}>
        {!currentIsAllowed && <option value={value.type}>⚠ {EFFECT_LABEL_ZH[value.type]}（不屬於目前分類）</option>}
        {allowedTypes.map(t => <option key={t} value={t}>{EFFECT_LABEL_ZH[t]}</option>)}
      </select>
      {!NO_VALUE.has(value.type) && <Num label={effectValueLabel(value.type)} value={value.value ?? 0} onChange={v => onChange({ ...value, value: v })} compact />}
      {!NO_DURATION.has(value.type) && <Num label="持續 Round" value={value.duration ?? 1} min={1} step={1} onChange={v => onChange({ ...value, duration: Math.max(1, Math.round(v)) })} compact />}
      {(value.type === 'damage' || value.type === 'fixedDamage') && <Num label="Hits" value={value.hits ?? 1} min={1} step={1} onChange={v => onChange({ ...value, hits: Math.max(1, Math.round(v)) })} compact />}
      <button className="danger gp-x" onClick={onDelete}>×</button>
    </div>
  )
}

function effectValueLabel(type: GameplayEffectType): string {
  if (type === 'fixedDamage') return '固定傷害'
  if (type === 'damage' || type === 'damageOverTime') return 'Attack %'
  if (type === 'poison') return '當前 HP %'
  if (type === 'deadlyPoison' || type === 'shield' || type === 'heal') return 'Max HP %'
  return '數值 %'
}

function AbilityEditor({ value, index, iconLibrary, onIconUploaded, onChange, onDelete }: {
  value: GameplayAbility
  index: number
  iconLibrary: GameplayIconLibrary
  onIconUploaded: (asset: GameplayIconAsset) => void
  onChange: (v: GameplayAbility) => void
  onDelete: () => void
}) {
  return (
    <div className="gp-ability">
      <div className="gp-ability-head"><b>能力 {index + 1}</b><button className="danger" onClick={onDelete}>刪除</button></div>
      <IconPicker
        kind="ability"
        value={value.icon ?? ''}
        options={iconLibrary.ability}
        onChange={icon => onChange({ ...value, icon })}
        onUploaded={onIconUploaded}
      />
      <div className="gp-grid three">
        <Field label="Ability ID"><input value={value.id} onChange={e => onChange({ ...value, id: e.target.value })} /></Field>
        <Field label="Trigger">
          <select value={value.trigger} onChange={e => onChange({ ...value, trigger: e.target.value as GameplayAbility['trigger'] })}>
            {ABILITY_TRIGGERS.map(t => <option key={t} value={t}>{TRIGGER_LABEL_ZH[t]}</option>)}
          </select>
        </Field>
        {value.trigger === 'everyNRounds' && <Num label="每 N Round" value={value.triggerValue ?? 1} min={1} step={1} onChange={v => onChange({ ...value, triggerValue: Math.max(1, Math.round(v)) })} />}
      </div>
      <h4>Conditions</h4>
      {value.conditions.map((c, i) => <ConditionEditor key={i} value={c} onChange={next => {
        const conditions = [...value.conditions]; conditions[i] = next; onChange({ ...value, conditions })
      }} onDelete={() => onChange({ ...value, conditions: value.conditions.filter((_, j) => j !== i) })} />)}
      <button onClick={() => onChange({ ...value, conditions: [...value.conditions, { type: 'selfHpPercent', operator: '<=', value: 50 }] })}>＋ Condition</button>
      <h4>Effects</h4>
      <EffectList value={value.effects} onChange={effects => onChange({ ...value, effects })} />
    </div>
  )
}

function IconPicker({ kind, value, options, onChange, onUploaded }: {
  kind: GameplayIconKind
  value: string
  options: GameplayIconAsset[]
  onChange: (url: string) => void
  onUploaded: (asset: GameplayIconAsset) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const builtins = options.filter(icon => icon.source === 'builtin')
  const customs = options.filter(icon => icon.source === 'custom')

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const icon = await uploadGameplayIcon(kind, file)
      onUploaded(icon)
      onChange(icon.url)
    } catch (e) {
      setError('圖示上傳失敗：' + String(e))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="gp-icon-picker">
      <div className="gp-icon-row">
        <div className="gp-icon-preview">
          {value ? <img src={value} alt="" /> : <span>無圖示</span>}
        </div>
        <Field label={kind === 'skill' ? '技能圖示' : '能力圖示'}>
          <select value={value} onChange={e => onChange(e.target.value)}>
            <option value="">未設定</option>
            {builtins.length > 0 && (
              <optgroup label="內建能力圖示">
                {builtins.map(icon => <option key={icon.url} value={icon.url}>{icon.name}</option>)}
              </optgroup>
            )}
            {customs.length > 0 && (
              <optgroup label="管理員上傳">
                {customs.map(icon => <option key={icon.url} value={icon.url}>{icon.name}</option>)}
              </optgroup>
            )}
          </select>
        </Field>
        <label className="gp-icon-upload">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            onChange={e => {
              const file = e.currentTarget.files?.[0]
              void upload(file)
              e.currentTarget.value = ''
            }}
          />
          <span>{uploading ? '上傳中…' : '上傳圖示'}</span>
        </label>
        {value && <button onClick={() => onChange('')}>清除</button>}
      </div>
      {error && <p className="gp-icon-error">{error}</p>}
      {kind === 'ability' && builtins.length > 0 && (
        <details className="gp-icon-library">
          <summary>從附件能力圖示庫選擇（{builtins.length}）</summary>
          <div className="gp-icon-grid">
            {builtins.map(icon => (
              <button
                key={icon.url}
                className={value === icon.url ? 'sel' : ''}
                title={icon.name}
                onClick={() => onChange(icon.url)}
              >
                <img src={icon.url} alt={icon.name} />
                <span>{icon.name.replace(/_icon\.png$/i, '').replace(/^ab\d+_?/i, '')}</span>
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function ConditionEditor({ value, onChange, onDelete }: { value: AbilityCondition; onChange: (v: AbilityCondition) => void; onDelete: () => void }) {
  return (
    <div className="gp-condition">
      <select value={value.type} onChange={e => onChange({ ...value, type: e.target.value as AbilityCondition['type'] })}>
        {CONDITION_TYPES.map(t => <option key={t} value={t}>{CONDITION_LABEL_ZH[t]}</option>)}
      </select>
      <select value={value.operator ?? '='} onChange={e => onChange({ ...value, operator: e.target.value as AbilityCondition['operator'] })}>
        {CONDITION_OPERATORS.map(o => <option key={o}>{o}</option>)}
      </select>
      <input value={String(value.value)} onChange={e => {
        const n = Number(e.target.value)
        onChange({ ...value, value: e.target.value !== '' && Number.isFinite(n) ? n : e.target.value })
      }} />
      <button className="danger gp-x" onClick={onDelete}>×</button>
    </div>
  )
}

function RulesForm({ value, onChange, onSave, changed }: { value: BattleRulesV1; onChange: (v: BattleRulesV1) => void; onSave: () => void; changed: boolean }) {
  const n = (k: keyof BattleRulesV1, v: number) => onChange({ ...value, [k]: v })
  const b = (k: keyof BattleRulesV1, v: boolean) => onChange({ ...value, [k]: v })
  return (
    <div className="gp-form">
      <Header title="Battle Rules v1" sub="RangerEpic 全域戰鬥規則" onSave={onSave} saveLabel={changed ? '儲存變更' : '已同步'} />
      <Section title="技能條與爆擊">
        <div className="gp-grid four">
          <Num label="技能條上限" value={value.skillGaugeMax} min={1} onChange={v => n('skillGaugeMax', v)} />
          <Num label="普通攻擊預設增加 %" value={value.defaultNormalAttackGaugeGain} min={0} max={100} onChange={v => n('defaultNormalAttackGaugeGain', v)} />
          <Num label="預設爆擊倍率 ×" value={value.defaultCritDamageMultiplier} min={0} step={0.1} onChange={v => n('defaultCritDamageMultiplier', v)} />
          <Num label="數值下限" value={value.statFloor} min={0} onChange={v => n('statFloor', v)} />
        </div>
      </Section>
      <Section title="固定流程">
        <div className="gp-rule-flags">
          <Check label="我方先行" checked={value.playerActsFirst} onChange={v => b('playerActsFirst', v)} />
          <Check label="同一方可自由決定角色行動順序" checked={value.freeOrderWithinPhase} onChange={v => b('freeOrderWithinPhase', v)} />
          <Check label="中毒可致死" checked={value.poisonCanKill} onChange={v => b('poisonCanKill', v)} />
          <Check label="護盾吸收中毒" checked={value.shieldAbsorbsPoison} onChange={v => b('shieldAbsorbsPoison', v)} />
          <Check label="護盾吸收劇毒" checked={value.shieldAbsorbsDeadlyPoison} onChange={v => b('shieldAbsorbsDeadlyPoison', v)} />
          <Check label="反射可爆擊（規格目前應關閉）" checked={value.reflectCanCrit} onChange={v => b('reflectCanCrit', v)} />
          <Check label="反射再次觸發反射（規格目前應關閉）" checked={value.reflectTriggersReflect} onChange={v => b('reflectTriggersReflect', v)} />
        </div>
        <p className="gp-spec-line">Duration：Round End 扣除 · DOT/中毒/劇毒：Round End · 持續回復：所屬方 Phase End</p>
      </Section>
    </div>
  )
}

function Header({ title, sub, onSave, onDelete, saveLabel = '儲存' }: { title: string; sub: string; onSave: () => void; onDelete?: () => void; saveLabel?: string }) {
  return (
    <header className="gp-form-head">
      <div><h1>{title}</h1><p>{sub}</p></div>
      <div>{onDelete && <button className="danger" onClick={onDelete}>刪除</button>}<button className="primary" onClick={onSave}>{saveLabel}</button></div>
    </header>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <section className="gp-section"><h2>{title}</h2>{note && <p className="gp-note">{note}</p>}{children}</section>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="gp-field"><span>{label}</span>{children}</label>
}

function Num({ label, value, onChange, min, max, step, compact }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; compact?: boolean }) {
  return <label className={compact ? 'gp-num compact' : 'gp-num'}><span>{label}</span><input type="number" value={value} min={min} max={max} step={step ?? 'any'} onChange={e => onChange(Number(e.target.value))} /></label>
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="gp-check"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span>{label}</span></label>
}

function upsert<T extends { id: string }>(rows: T[], row: T): T[] {
  return rows.some(x => x.id === row.id) ? rows.map(x => x.id === row.id ? clone(row) : x) : [...rows, clone(row)]
}
