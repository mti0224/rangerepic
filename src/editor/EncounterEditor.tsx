import { useCallback, useEffect, useMemo, useState } from 'react'
import { listRangers, type RangerListItem } from '@/lib/rangerApi'
import {
  ATTACK_SKILL_EFFECT_TYPES, SUPPORT_SKILL_EFFECT_TYPES, GAMEPLAY_STAGE_SLOTS,
  newGameplayAbility, newGameplayEnemy, newGameplaySkill, newGameplayStage,
  type GameplayEnemy, type GameplayStage, type GameplayStageSlot,
} from '@/lib/gameplaySchema'
import {
  deleteGameplayEnemy, deleteGameplayStage, listGameplayEnemies, listGameplayIcons, listGameplayStages,
  saveGameplayEnemy, saveGameplayStage,
  type GameplayIconAsset, type GameplayIconLibrary,
} from '@/lib/gameplayApi'
import { AbilityEditor, EffectList, IconPicker, TargetEditor } from './GameplayEditor'

type View = 'enemies' | 'stages'
const clone = <T,>(v: T): T => structuredClone(v)
const idOk = (s: string) => /^[a-z0-9][a-z0-9_-]*$/i.test(s)
const labelOf = (names: GameplayEnemy['names'], fallback: string) => names.zh || names.en || names.th || names.jp || fallback

export default function EncounterEditor() {
  const [view, setView] = useState<View>('enemies')
  const [enemies, setEnemies] = useState<GameplayEnemy[]>([])
  const [stages, setStages] = useState<GameplayStage[]>([])
  const [assets, setAssets] = useState<RangerListItem[]>([])
  const [icons, setIcons] = useState<GameplayIconLibrary>({ skill: [], ability: [] })
  const [enemyId, setEnemyId] = useState<string | null>(null)
  const [stageId, setStageId] = useState<string | null>(null)
  const [enemyDraft, setEnemyDraft] = useState<GameplayEnemy | null>(null)
  const [stageDraft, setStageDraft] = useState<GameplayStage | null>(null)
  const [newId, setNewId] = useState('')
  const [status, setStatus] = useState('')

  const refresh = useCallback(async () => {
    setStatus('載入中…')
    try {
      const [es, ss, rs, lib] = await Promise.all([listGameplayEnemies(), listGameplayStages(), listRangers(), listGameplayIcons()])
      setEnemies(es); setStages(ss); setAssets(rs); setIcons(lib); setStatus('')
    } catch (e) { setStatus('載入失敗：' + String(e)) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => setEnemyDraft(enemies.find(row => row.id === enemyId) ? clone(enemies.find(row => row.id === enemyId)!) : null), [enemyId, enemies])
  useEffect(() => setStageDraft(stages.find(row => row.id === stageId) ? clone(stages.find(row => row.id === stageId)!) : null), [stageId, stages])

  const registerIcon = useCallback((asset: GameplayIconAsset) => {
    setIcons(prev => ({ ...prev, [asset.kind]: [...prev[asset.kind].filter(row => row.url !== asset.url), asset].sort((a, b) => a.name.localeCompare(b.name)) }))
  }, [])

  const addEnemy = () => {
    const id = newId.trim().toLowerCase()
    if (!idOk(id)) return setStatus('ID 只能使用英數、底線與連字號。')
    if (enemies.some(row => row.id === id)) return setStatus('Enemy ID 已存在。')
    const asset = assets.find(row => row.approved)?.id ?? assets[0]?.id
    if (!asset) return setStatus('目前沒有可用圖資。')
    const row = newGameplayEnemy(id, asset)
    setEnemies(rows => [...rows, row]); setEnemyId(id); setNewId(''); setView('enemies'); setStatus('新敵人尚未儲存。')
  }

  const addStage = () => {
    const id = newId.trim().toLowerCase()
    if (!idOk(id)) return setStatus('ID 只能使用英數、底線與連字號。')
    if (stages.some(row => row.id === id)) return setStatus('Stage ID 已存在。')
    const row = newGameplayStage(id)
    setStages(rows => [...rows, row]); setStageId(id); setNewId(''); setView('stages'); setStatus('新關卡尚未儲存。')
  }

  const saveEnemy = async () => {
    if (!enemyDraft) return
    setStatus('儲存敵人中…')
    try { await saveGameplayEnemy(enemyDraft); setEnemies(rows => upsert(rows, enemyDraft)); setStatus('敵人已儲存。') }
    catch (e) { setStatus('儲存失敗：' + String(e)) }
  }
  const removeEnemy = async () => {
    if (!enemyDraft || !confirm(`確定刪除敵人 ${enemyDraft.id}？已被關卡使用的敵人無法刪除。`)) return
    try { await deleteGameplayEnemy(enemyDraft.id); setEnemies(rows => rows.filter(row => row.id !== enemyDraft.id)); setEnemyId(null); setStatus('敵人已刪除。') }
    catch (e) { setStatus('刪除失敗：' + String(e)) }
  }
  const saveStage = async () => {
    if (!stageDraft) return
    setStatus('儲存關卡中…')
    try { await saveGameplayStage(stageDraft); setStages(rows => upsert(rows, stageDraft)); setStatus('關卡已儲存。') }
    catch (e) { setStatus('儲存失敗：' + String(e)) }
  }
  const removeStage = async () => {
    if (!stageDraft || !confirm(`確定刪除關卡 ${stageDraft.id}？`)) return
    try { await deleteGameplayStage(stageDraft.id); setStages(rows => rows.filter(row => row.id !== stageDraft.id)); setStageId(null); setStatus('關卡已刪除。') }
    catch (e) { setStatus('刪除失敗：' + String(e)) }
  }

  return <div className="gp-editor encounter-editor">
    <aside className="gp-sidebar">
      <div className="gp-tabs">
        <button className={view === 'enemies' ? 'active' : ''} onClick={() => setView('enemies')}>敵人</button>
        <button className={view === 'stages' ? 'active' : ''} onClick={() => setView('stages')}>關卡</button>
      </div>
      <div className="gp-create">
        <input value={newId} onChange={e => setNewId(e.target.value)} placeholder={view === 'enemies' ? 'enemy_id' : 'stage_id'} onKeyDown={e => { if (e.key === 'Enter') (view === 'enemies' ? addEnemy : addStage)() }} />
        <button onClick={view === 'enemies' ? addEnemy : addStage}>＋</button>
      </div>
      <div className="gp-list">
        {view === 'enemies'
          ? enemies.map(row => <button key={row.id} className={enemyId === row.id ? 'active' : ''} onClick={() => setEnemyId(row.id)}><b>{labelOf(row.names, row.id)}</b><small>{row.id} · {row.skill ? '有技能' : '普通攻擊'}</small></button>)
          : [...stages].sort((a,b) => a.chapter - b.chapter || a.order - b.order).map(row => <button key={row.id} className={stageId === row.id ? 'active' : ''} onClick={() => setStageId(row.id)}><b>{labelOf(row.names, row.id)}</b><small>第 {row.chapter} 章 · {row.waves.length} 波</small></button>)}
      </div>
      {status && <p className="gp-status">{status}</p>}
    </aside>

    <main className="gp-main">
      {view === 'enemies' && enemyDraft ? <EnemyForm value={enemyDraft} assets={assets} icons={icons} onIconUploaded={registerIcon} onChange={setEnemyDraft} onSave={() => void saveEnemy()} onDelete={() => void removeEnemy()} />
        : view === 'stages' && stageDraft ? <StageForm value={stageDraft} enemies={enemies} onChange={setStageDraft} onSave={() => void saveStage()} onDelete={() => void removeStage()} />
        : <div className="gp-empty-main"><h2>{view === 'enemies' ? '可視化敵人設計' : '可視化關卡設計'}</h2><p>{view === 'enemies' ? '建立敵人的基礎數值、普通攻擊附加效果、選用技能與能力。' : '以波次排列敵人；一波全滅後才會進入下一波，所有波次通過才算完成關卡。'}</p></div>}
    </main>
  </div>
}

function EnemyForm({ value, assets, icons, onIconUploaded, onChange, onSave, onDelete }: {
  value: GameplayEnemy; assets: RangerListItem[]; icons: GameplayIconLibrary; onIconUploaded: (asset: GameplayIconAsset) => void
  onChange: (value: GameplayEnemy) => void; onSave: () => void; onDelete: () => void
}) {
  const names = (key: keyof GameplayEnemy['names'], text: string) => onChange({ ...value, names: { ...value.names, [key]: text } })
  const stat = (key: keyof GameplayEnemy['stats'], n: number) => onChange({ ...value, stats: { ...value.stats, [key]: n } })
  return <div className="gp-form">
    <Header title={labelOf(value.names, value.id)} sub={'Enemy · ' + value.id} onSave={onSave} onDelete={onDelete} />
    <Section title="身分與圖資" note="敵人沿用角色的五項核心數值與共用效果引擎；技能與能力可以完全省略。">
      <div className="gp-grid two">
        <Field label="Asset Variant"><select value={value.assetVariantId} onChange={e => onChange({ ...value, assetVariantId: e.target.value })}>{assets.map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}</select></Field>
        <Field label="定位標籤"><input value={value.role} onChange={e => onChange({ ...value, role: e.target.value })} /></Field>
        <Field label="繁體中文名稱"><input value={value.names.zh} onChange={e => names('zh', e.target.value)} /></Field>
        <Field label="English"><input value={value.names.en} onChange={e => names('en', e.target.value)} /></Field>
        <Field label="ไทย"><input value={value.names.th} onChange={e => names('th', e.target.value)} /></Field>
        <Field label="日本語"><input value={value.names.jp} onChange={e => names('jp', e.target.value)} /></Field>
      </div>
      <Field label="敵人說明"><textarea value={value.description} onChange={e => onChange({ ...value, description: e.target.value })} /></Field>
    </Section>
    <Section title="基礎數值">
      <div className="gp-grid five">
        <Num label="體力 HP" value={value.stats.hp} min={1} onChange={v => stat('hp', v)} />
        <Num label="攻擊力" value={value.stats.attack} min={0} onChange={v => stat('attack', v)} />
        <Num label="爆擊機率 %" value={value.stats.critRate} min={0} max={100} onChange={v => stat('critRate', v)} />
        <Num label="爆擊倍率 ×" value={value.stats.critDamage} min={0} step={0.1} onChange={v => stat('critDamage', v)} />
        <Num label="命中率 %" value={value.stats.hitRate} min={0} max={100} onChange={v => stat('hitRate', v)} />
      </div>
    </Section>
    <Section title="普通攻擊" note="敵人一定具有普通攻擊；可額外附加攻擊技能會使用的效果。附加效果只設定一次，不會因 Hit 數重複新增。">
      <div className="gp-grid four">
        <Field label="目標"><select value={value.normalAttack.target} onChange={e => onChange({ ...value, normalAttack: { ...value.normalAttack, target: e.target.value as GameplayEnemy['normalAttack']['target'] } })}><option value="single">一名敵人</option><option value="all">全體敵人</option><option value="primaryPlusRandom">一名敵人 + N</option></select></Field>
        <Num label="Hit 數" value={value.normalAttack.hits} min={1} step={1} onChange={v => onChange({ ...value, normalAttack: { ...value.normalAttack, hits: Math.max(1, Math.round(v)) } })} />
        <Num label="技能條增加 %" value={value.normalAttack.skillGaugeGain} min={0} max={100} onChange={v => onChange({ ...value, normalAttack: { ...value.normalAttack, skillGaugeGain: v } })} />
        {value.normalAttack.target === 'primaryPlusRandom' && <Num label="額外目標 N" value={value.normalAttack.extraTargets ?? 1} min={1} step={1} onChange={v => onChange({ ...value, normalAttack: { ...value.normalAttack, extraTargets: Math.max(1, Math.round(v)) } })} />}
      </div>
      <h4>附加效果</h4>
      <EffectList value={value.normalAttack.effects} allowedTypes={ATTACK_SKILL_EFFECT_TYPES} onChange={effects => onChange({ ...value, normalAttack: { ...value.normalAttack, effects } })} />
    </Section>
    <Section title="技能（選用）" note="沒有技能的敵人只會使用普通攻擊；有技能時與我方相同，技能條滿 100% 才能使用。">
      {!value.skill ? <button onClick={() => onChange({ ...value, skill: newGameplaySkill() })}>＋ 新增技能</button> : <>
        <div className="gp-inline-actions"><button className="danger" onClick={() => onChange({ ...value, skill: undefined })}>移除技能</button></div>
        <div className="gp-grid two">
          <Field label="技能名稱"><input value={value.skill.name ?? ''} onChange={e => onChange({ ...value, skill: { ...value.skill!, name: e.target.value } })} /></Field>
          <Field label="白話敘述"><textarea value={value.skill.description ?? ''} onChange={e => onChange({ ...value, skill: { ...value.skill!, description: e.target.value } })} placeholder="留白時前端才顯示機械效果" /></Field>
        </div>
        <IconPicker kind="skill" value={value.skill.icon ?? ''} options={icons.skill} onChange={icon => onChange({ ...value, skill: { ...value.skill!, icon } })} onUploaded={onIconUploaded} />
        <TargetEditor value={value.skill.target} onChange={target => onChange({ ...value, skill: { ...value.skill!, target } })} />
        <EffectList value={value.skill.effects} allowedTypes={value.skill.target.side === 'enemy' ? ATTACK_SKILL_EFFECT_TYPES : SUPPORT_SKILL_EFFECT_TYPES} onChange={effects => onChange({ ...value, skill: { ...value.skill!, effects } })} />
      </>}
    </Section>
    <Section title="能力（選用）" note="能力與我方共用相同 Trigger／Condition／Effect；名稱與敘述可自行撰寫。">
      <div className="gp-ability-list">{value.abilities.map((ability, index) => <AbilityEditor key={index} value={ability} index={index} iconLibrary={icons} onIconUploaded={onIconUploaded} onChange={next => {
        const rows = [...value.abilities]; rows[index] = next; onChange({ ...value, abilities: rows })
      }} onDelete={() => onChange({ ...value, abilities: value.abilities.filter((_, i) => i !== index) })} />)}</div>
      <button onClick={() => onChange({ ...value, abilities: [...value.abilities, newGameplayAbility(value.abilities.length + 1)] })}>＋ 新增能力</button>
    </Section>
  </div>
}

function StageForm({ value, enemies, onChange, onSave, onDelete }: { value: GameplayStage; enemies: GameplayEnemy[]; onChange: (value: GameplayStage) => void; onSave: () => void; onDelete: () => void }) {
  const names = (key: keyof GameplayStage['names'], text: string) => onChange({ ...value, names: { ...value.names, [key]: text } })
  const enemyMap = useMemo(() => new Map(enemies.map(enemy => [enemy.id, enemy])), [enemies])
  const updateWave = (index: number, wave: GameplayStage['waves'][number]) => {
    const waves = [...value.waves]; waves[index] = wave; onChange({ ...value, waves })
  }
  const moveWave = (index: number, delta: number) => {
    const to = index + delta
    if (to < 0 || to >= value.waves.length) return
    const waves = [...value.waves]; [waves[index], waves[to]] = [waves[to], waves[index]]; onChange({ ...value, waves })
  }
  return <div className="gp-form">
    <Header title={labelOf(value.names, value.id)} sub={'Stage · ' + value.id} onSave={onSave} onDelete={onDelete} />
    <Section title="關卡資訊">
      <div className="gp-grid four">
        <Num label="章節" value={value.chapter} min={1} step={1} onChange={chapter => onChange({ ...value, chapter: Math.max(1, Math.round(chapter)) })} />
        <Num label="章內順序" value={value.order} min={1} step={1} onChange={order => onChange({ ...value, order: Math.max(1, Math.round(order)) })} />
        <Field label="繁體中文名稱"><input value={value.names.zh} onChange={e => names('zh', e.target.value)} /></Field>
        <Field label="English"><input value={value.names.en} onChange={e => names('en', e.target.value)} /></Field>
        <Field label="ไทย"><input value={value.names.th} onChange={e => names('th', e.target.value)} /></Field>
        <Field label="日本語"><input value={value.names.jp} onChange={e => names('jp', e.target.value)} /></Field>
      </div>
      <Field label="關卡說明"><textarea value={value.description} onChange={e => onChange({ ...value, description: e.target.value })} /></Field>
      <Field label="戰鬥背景 URL"><input value={value.background} onChange={e => onChange({ ...value, background: e.target.value })} placeholder="/maps/map1.jpg" /></Field>
      {value.background && <div className="enc-stage-bg" style={{ backgroundImage: `url("${value.background}")` }} />}
    </Section>
    <Section title="波次" note="同一波的所有敵人死亡後才進入下一波；所有波次通過後，關卡才完成。每波最多使用 5 個固定站位。">
      <div className="enc-waves">
        {value.waves.map((wave, index) => <div className="enc-wave" key={wave.id}>
          <header><div><b>Wave {index + 1}</b><input value={wave.name ?? ''} onChange={e => updateWave(index, { ...wave, name: e.target.value })} placeholder="波次名稱（選填）" /></div><div>
            <button disabled={index === 0} onClick={() => moveWave(index, -1)}>↑</button>
            <button disabled={index === value.waves.length - 1} onClick={() => moveWave(index, 1)}>↓</button>
            <button className="danger" disabled={value.waves.length <= 1} onClick={() => onChange({ ...value, waves: value.waves.filter((_, i) => i !== index) })}>刪除</button>
          </div></header>
          <FormationEditor wave={wave} enemies={enemies} enemyMap={enemyMap} onChange={next => updateWave(index, next)} />
        </div>)}
      </div>
      <button onClick={() => onChange({ ...value, waves: [...value.waves, { id: 'wave_' + (value.waves.length + 1), name: '', enemies: [] }] })}>＋ 新增波次</button>
    </Section>
  </div>
}

function FormationEditor({ wave, enemies, enemyMap, onChange }: { wave: GameplayStage['waves'][number]; enemies: GameplayEnemy[]; enemyMap: Map<string, GameplayEnemy>; onChange: (wave: GameplayStage['waves'][number]) => void }) {
  const setSlot = (slot: GameplayStageSlot, enemyId: string) => {
    const rows = wave.enemies.filter(row => row.slot !== slot)
    if (enemyId) rows.push({ slot, enemyId })
    onChange({ ...wave, enemies: rows })
  }
  const slots = (row: 'front' | 'back') => GAMEPLAY_STAGE_SLOTS.filter(slot => slot.startsWith(row))
  return <div className="enc-formation">
    {(['back','front'] as const).map(row => <div className={'enc-row ' + row} key={row}>
      <span className="enc-row-label">{row === 'front' ? '前排' : '後排'}</span>
      {slots(row).map(slot => {
        const placement = wave.enemies.find(item => item.slot === slot)
        const enemy = placement ? enemyMap.get(placement.enemyId) : null
        return <div className={'enc-slot' + (enemy ? ' filled' : '')} key={slot}>
          {enemy ? <img src={`/rangers/${enemy.assetVariantId}/thumb.png`} alt="" /> : <div className="enc-slot-empty">＋</div>}
          <select value={placement?.enemyId ?? ''} onChange={e => setSlot(slot, e.target.value)}>
            <option value="">空位</option>
            {enemies.map(item => <option key={item.id} value={item.id}>{labelOf(item.names, item.id)}</option>)}
          </select>
          <small>{slot}</small>
        </div>
      })}
    </div>)}
  </div>
}

function Header({ title, sub, onSave, onDelete }: { title: string; sub: string; onSave: () => void; onDelete: () => void }) {
  return <header className="gp-form-head"><div><h1>{title}</h1><p>{sub}</p></div><div><button className="danger" onClick={onDelete}>刪除</button><button className="primary" onClick={onSave}>儲存</button></div></header>
}
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <section className="gp-section"><h2>{title}</h2>{note && <p className="gp-note">{note}</p>}{children}</section>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="gp-field"><span>{label}</span>{children}</label>
}
function Num({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <label className="gp-num"><span>{label}</span><input type="number" value={value} min={min} max={max} step={step ?? 'any'} onChange={e => onChange(Number(e.target.value))} /></label>
}
function upsert<T extends { id: string }>(rows: T[], row: T): T[] {
  return rows.some(item => item.id === row.id) ? rows.map(item => item.id === row.id ? clone(row) : item) : [...rows, clone(row)]
}
