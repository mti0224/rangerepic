import { useCallback, useEffect, useMemo, useState } from 'react'
import { listRangers, type RangerListItem } from '@/lib/rangerApi'
import {
  ABILITY_EFFECT_TARGETS, AUTHORING_ABILITY_TRIGGERS, AUTHORING_CONDITION_TYPES, ATTACK_SKILL_EFFECT_TYPES,
  CONDITION_LABEL_ZH, CONDITION_OPERATORS, EFFECT_LABEL_ZH, EFFECT_TYPES, GAMEPLAY_ANIMATION_SLOTS,
  SUPPORT_SKILL_EFFECT_TYPES, TRIGGER_LABEL_ZH, newGameplayAbility, newGameplayEffect,
  type AbilityCondition, type GameplayAbility, type GameplayEffect, type GameplayEffectType, type SkillTargetRule,
} from '@/lib/gameplaySchema'
import {
  ENEMY_SLOTS, newEnemySkill, newGameplayEnemy, newGameplayStage, nextWaveId,
  type EnemySlot, type GameplayEnemy, type GameplayStage,
} from '@/lib/adventureSchema'
import {
  deleteGameplayEnemy, deleteGameplayStage, listGameplayEnemies, listGameplayStages,
  saveGameplayEnemy, saveGameplayStage,
} from '@/lib/adventureApi'

export type AdventureEditorMode = 'enemies' | 'stages'
const clone = <T,>(v: T): T => structuredClone(v)
const idOk = (s: string) => /^[a-z0-9][a-z0-9_-]*$/i.test(s)
const enemyName = (e: GameplayEnemy) => e.names.zh || e.names.en || e.names.th || e.names.jp || e.id

export default function AdventureEditor({ mode }: { mode: AdventureEditorMode }) {
  const view = mode
  const [enemies, setEnemies] = useState<GameplayEnemy[]>([])
  const [stages, setStages] = useState<GameplayStage[]>([])
  const [assets, setAssets] = useState<RangerListItem[]>([])
  const [enemyId, setEnemyId] = useState<string | null>(null)
  const [stageId, setStageId] = useState<string | null>(null)
  const [enemyDraft, setEnemyDraft] = useState<GameplayEnemy | null>(null)
  const [stageDraft, setStageDraft] = useState<GameplayStage | null>(null)
  const [newId, setNewId] = useState('')
  const [status, setStatus] = useState('')

  const refresh = useCallback(async () => {
    setStatus('載入中…')
    try {
      const [es, ss, as] = await Promise.all([listGameplayEnemies(), listGameplayStages(), listRangers()])
      setEnemies(es); setStages(ss); setAssets(as); setStatus('')
    } catch (e) { setStatus('載入失敗：' + String(e)) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => setEnemyDraft(enemyId ? clone(enemies.find(e => e.id === enemyId) ?? null) : null), [enemyId, enemies])
  useEffect(() => setStageDraft(stageId ? clone(stages.find(s => s.id === stageId) ?? null) : null), [stageId, stages])

  const add = () => {
    const id = newId.trim().toLowerCase()
    if (!idOk(id)) return setStatus('ID 只能使用英數、底線與連字號。')
    if (view === 'enemies') {
      if (enemies.some(e => e.id === id)) return setStatus('Enemy ID 已存在。')
      const asset = assets.find(a => a.approved)?.id ?? assets[0]?.id
      if (!asset) return setStatus('目前沒有 Ranger 圖資可用。')
      const row = newGameplayEnemy(id, asset)
      setEnemies(v => [...v, row]); setEnemyId(id); setStatus('新敵人尚未儲存。')
    } else {
      if (stages.some(s => s.id === id)) return setStatus('Stage ID 已存在。')
      const row = newGameplayStage(id)
      setStages(v => [...v, row]); setStageId(id); setStatus('新關卡尚未儲存。')
    }
    setNewId('')
  }

  const saveEnemy = async () => {
    if (!enemyDraft) return
    setStatus('儲存敵人中…')
    try { await saveGameplayEnemy(enemyDraft); setEnemies(v => upsert(v, enemyDraft)); setStatus('敵人已儲存。') }
    catch (e) { setStatus('儲存失敗：' + String(e)) }
  }
  const saveStage = async () => {
    if (!stageDraft) return
    setStatus('儲存關卡中…')
    try { await saveGameplayStage(stageDraft); setStages(v => upsert(v, stageDraft)); setStatus('關卡已儲存。') }
    catch (e) { setStatus('儲存失敗：' + String(e)) }
  }

  return <div className="gp-editor adv-editor">
    <aside className="gp-side">
      <div className="gp-add"><input value={newId} onChange={e => setNewId(e.target.value)} placeholder={view === 'enemies' ? 'enemy_id' : 'stage_id'} /><button onClick={add}>＋</button></div>
      <div className="gp-list">
        {view === 'enemies' ? enemies.map(e => <button key={e.id} className={enemyId === e.id ? 'sel' : ''} onClick={() => setEnemyId(e.id)}>
          <b>{enemyName(e)}</b><small>{e.id} · {e.assetVariantId}</small>
        </button>) : chapterGroups(stages).map(([chapter, rows]) => <div className="adv-chapter-group" key={chapter}>
          <div className="adv-chapter-title">第 {chapter} 章 <small>{rows.length} 關</small></div>
          {rows.map(s => <button key={s.id} className={stageId === s.id ? 'sel' : ''} onClick={() => setStageId(s.id)}>
            <b>{s.order}. {s.names.zh || s.names.en || s.id}</b><small>{s.waves.length} 波 · {s.id}</small>
          </button>)}
        </div>)}
      </div>
      <div className="gp-status">{status}</div>
    </aside>
    <main className="gp-main">
      {view === 'enemies' && enemyDraft && <EnemyForm value={enemyDraft} assets={assets} onChange={setEnemyDraft} onSave={saveEnemy} onDelete={async () => {
        if (!confirm('刪除敵人「' + enemyName(enemyDraft) + '」？')) return
        try { await deleteGameplayEnemy(enemyDraft.id); setEnemies(v => v.filter(x => x.id !== enemyDraft.id)); setEnemyId(null); setStatus('敵人已刪除。') }
        catch (e) { setStatus('刪除失敗：' + String(e)) }
      }} />}
      {view === 'stages' && stageDraft && <StageForm value={stageDraft} enemies={enemies} onChange={setStageDraft} onSave={saveStage} onDelete={async () => {
        if (!confirm('刪除關卡？')) return
        try { await deleteGameplayStage(stageDraft.id); setStages(v => v.filter(x => x.id !== stageDraft.id)); setStageId(null); setStatus('關卡已刪除。') }
        catch (e) { setStatus('刪除失敗：' + String(e)) }
      }} />}
      {view === 'enemies' && !enemyDraft && <Empty title="選擇或新增敵人" text="敵人一定有普通攻擊；技能與能力可留空。普通攻擊可額外附加攻擊類效果。" />}
      {view === 'stages' && !stageDraft && <Empty title="選擇或新增關卡" text="每關由一個以上的 Wave 組成；清空目前 Wave 才會進入下一波。" />}
    </main>
  </div>
}

function EnemyForm({ value, assets, onChange, onSave, onDelete }: { value: GameplayEnemy; assets: RangerListItem[]; onChange:(v:GameplayEnemy)=>void; onSave:()=>void; onDelete:()=>void }) {
  const stat=(k:keyof GameplayEnemy['stats'],v:number)=>onChange({...value,stats:{...value.stats,[k]:v}})
  const names=(k:keyof GameplayEnemy['names'],v:string)=>onChange({...value,names:{...value.names,[k]:v}})
  return <div className="gp-form">
    <Header title={enemyName(value)} sub={'Enemy · '+value.id} onSave={onSave} onDelete={onDelete} />
    <Section title="敵人身分與圖資" note="圖資只控制外觀與動畫；戰鬥數值由 Enemy 資料決定。">
      <div className="gp-grid two">
        <Field label="繁體中文名稱"><input value={value.names.zh} onChange={e=>names('zh',e.target.value)} /></Field>
        <Field label="Asset Variant"><select value={value.assetVariantId} onChange={e=>onChange({...value,assetVariantId:e.target.value})}>{assets.map(a=><option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}</select></Field>
      </div>
      <Field label="介紹"><textarea value={value.description} onChange={e=>onChange({...value,description:e.target.value})} /></Field>
    </Section>
    <Section title="基礎數值">
      <div className="gp-grid five">
        <Num label="體力 HP" value={value.stats.hp} min={1} onChange={v=>stat('hp',v)} />
        <Num label="攻擊力" value={value.stats.attack} min={0} onChange={v=>stat('attack',v)} />
        <Num label="爆擊機率 %" value={value.stats.critRate} min={0} max={100} onChange={v=>stat('critRate',v)} />
        <Num label="爆擊倍率 ×" value={value.stats.critDamage} min={0} step={0.1} onChange={v=>stat('critDamage',v)} />
        <Num label="命中率 %" value={value.stats.hitRate} min={0} max={100} onChange={v=>stat('hitRate',v)} />
      </div>
    </Section>
    <Section title="普通攻擊" note="敵人的普通攻擊除了基礎攻擊傷害，還可以附帶攻擊技能類效果。敵人不使用技能條。">
      <div className="gp-grid four">
        <Field label="選擇動畫"><AnimationSelect value={value.normalAttack.animation ?? 'attack'} onChange={animation=>onChange({...value,normalAttack:{...value.normalAttack,animation}})} /></Field>
        <Field label="目標"><select value={value.normalAttack.target} onChange={e=>onChange({...value,normalAttack:{...value.normalAttack,target:e.target.value as GameplayEnemy['normalAttack']['target']}})}>
          <option value="single">一名敵人</option><option value="all">全體敵人</option><option value="primaryPlusRandom">一名敵人 + N</option>
        </select></Field>
        <Num label="Hit 數" value={value.normalAttack.hits} min={1} step={1} onChange={v=>onChange({...value,normalAttack:{...value.normalAttack,hits:Math.max(1,Math.round(v))}})} />
        {value.normalAttack.target==='primaryPlusRandom' && <Num label="額外目標 N" value={value.normalAttack.extraTargets??1} min={1} step={1} onChange={v=>onChange({...value,normalAttack:{...value.normalAttack,extraTargets:Math.max(1,Math.round(v))}})} />}
      </div>
      <h4>普通攻擊附加效果</h4>
      <EffectList value={value.normalAttack.effects??[]} allowed={ATTACK_SKILL_EFFECT_TYPES.filter(t=>t!=='damage')} onChange={effects=>onChange({...value,normalAttack:{...value.normalAttack,effects}})} />
    </Section>
    <Section title="普通輔助" note="敵人可選擇使用普通輔助；沒有設定效果時 AI 不會選擇此動作。">
      <div className="gp-grid two">
        <Field label="選擇動畫"><AnimationSelect value={value.normalSupport?.animation ?? 'skill2'} onChange={animation=>onChange({...value,normalSupport:{...(value.normalSupport??{target:'singleAlly',effects:[]}),animation}})} /></Field>
        <Field label="目標"><select value={value.normalSupport?.target ?? 'singleAlly'} onChange={e=>onChange({...value,normalSupport:{...(value.normalSupport??{animation:'skill2',effects:[]}),target:e.target.value as GameplayEnemy['normalSupport']['target']}})}>
          <option value="singleAlly">一名友軍（可自己）</option><option value="allAllies">全體友軍</option>
        </select></Field>
      </div>
      <EffectList value={value.normalSupport?.effects??[]} allowed={SUPPORT_SKILL_EFFECT_TYPES} onChange={effects=>onChange({...value,normalSupport:{...(value.normalSupport??{target:'singleAlly',animation:'skill2'}),effects}})} />
    </Section>
    <Section title="技能（可選）" note="敵人沒有技能條。每次行動時依技能發動率判定是否使用技能；未發動時仍可普通攻擊或普通輔助。">
      <label className="adv-toggle"><input type="checkbox" checked={!!value.skill} onChange={e=>onChange({...value,skill:e.target.checked?(value.skill??newEnemySkill()):null})} /> 此敵人有技能</label>
      {value.skill && <>
        <Num label="技能發動率 %" value={value.skillActivationRate ?? 20} min={0} max={100} onChange={v=>onChange({...value,skillActivationRate:Math.max(0,Math.min(100,v))})} />
        <SkillEditor value={value.skill} onChange={skill=>onChange({...value,skill})} />
      </>}
    </Section>
    <Section title="能力（可選）" note="名稱與敘述是玩家看到的白話文字；效果仍作為實際戰鬥規則。">
      {value.abilities.map((a,i)=><AbilityEditor key={i} value={a} index={i} onChange={ability=>{const rows=[...value.abilities];rows[i]=ability;onChange({...value,abilities:rows})}} onDelete={()=>onChange({...value,abilities:value.abilities.filter((_,j)=>j!==i)})} />)}
      <button onClick={()=>onChange({...value,abilities:[...value.abilities,newGameplayAbility(value.abilities.length+1)]})}>＋ 新增能力</button>
    </Section>
  </div>
}

function StageForm({ value, enemies, onChange, onSave, onDelete }: { value:GameplayStage; enemies:GameplayEnemy[]; onChange:(v:GameplayStage)=>void; onSave:()=>void; onDelete:()=>void }) {
  const names=(k:keyof GameplayStage['names'],v:string)=>onChange({...value,names:{...value.names,[k]:v}})
  const enemyMap=useMemo(()=>new Map(enemies.map(e=>[e.id,e])),[enemies])
  return <div className="gp-form">
    <Header title={value.names.zh||value.id} sub={'Stage · '+value.id} onSave={onSave} onDelete={onDelete} />
    <Section title="關卡資訊">
      <div className="gp-grid four">
        <Field label="繁體中文名稱"><input value={value.names.zh} onChange={e=>names('zh',e.target.value)} /></Field>
        <Num label="章節" value={value.chapter} min={1} step={1} onChange={v=>onChange({...value,chapter:Math.max(1,Math.round(v))})} />
        <Num label="章內順序" value={value.order} min={1} step={1} onChange={v=>onChange({...value,order:Math.max(1,Math.round(v))})} />
        <Field label="地圖背景 URL"><input value={value.mapImage} onChange={e=>onChange({...value,mapImage:e.target.value})} /></Field>
      </div>
      <Field label="關卡說明"><textarea value={value.description} onChange={e=>onChange({...value,description:e.target.value})} /></Field>
    </Section>
    <Section title={'波次設計 · 共 '+value.waves.length+' 波'} note="每一波必須至少有一名敵人；五個槽位對應戰鬥站位。清空一波後才會進入下一波。">
      <div className="adv-wave-list">{value.waves.map((wave,wi)=><div className="adv-wave" key={wave.id}>
        <div className="adv-wave-head"><div><b>Wave {wi+1}</b><input value={wave.name??''} placeholder="波次名稱（可選）" onChange={e=>{const waves=clone(value.waves);waves[wi].name=e.target.value;onChange({...value,waves})}} /></div>
          <div><button disabled={wi===0} onClick={()=>moveWave(value,wi,-1,onChange)}>↑</button><button disabled={wi===value.waves.length-1} onClick={()=>moveWave(value,wi,1,onChange)}>↓</button><button className="danger" disabled={value.waves.length===1} onClick={()=>onChange({...value,waves:value.waves.filter((_,i)=>i!==wi)})}>刪除</button></div>
        </div>
        <div className="adv-slots">{ENEMY_SLOTS.map(slot=>{
          const assigned=wave.enemies.find(r=>r.slot===slot)
          const e=assigned?enemyMap.get(assigned.enemyId):undefined
          return <div className={'adv-slot '+(assigned?'filled':'')} key={slot}>
            <span>{slotLabel(slot)}</span>
            {e && <img src={'/rangers/'+e.assetVariantId+'/thumb.png'} alt="" />}
            <select value={assigned?.enemyId??''} onChange={ev=>{
              const waves=clone(value.waves); const w=waves[wi]; w.enemies=w.enemies.filter(r=>r.slot!==slot)
              if(ev.target.value) w.enemies.push({enemyId:ev.target.value,slot})
              onChange({...value,waves})
            }}>
              <option value="">空位</option>{enemies.map(row=><option key={row.id} value={row.id}>{enemyName(row)}</option>)}
            </select>
          </div>
        })}</div>
      </div>)}</div>
      <button onClick={()=>onChange({...value,waves:[...value.waves,{id:nextWaveId(value.waves),name:'Wave '+(value.waves.length+1),enemies:[]}]})}>＋ 新增 Wave</button>
    </Section>
  </div>
}

function AnimationSelect({value,onChange}:{value:'attack'|'skill1'|'skill2';onChange:(v:'attack'|'skill1'|'skill2')=>void}){
  const labels={attack:'普通攻擊動畫（attack）',skill1:'技能 1 動畫（skill1）',skill2:'技能 2 動畫（skill2）'} as const
  return <select value={value} onChange={e=>onChange(e.target.value as 'attack'|'skill1'|'skill2')}>{GAMEPLAY_ANIMATION_SLOTS.map(slot=><option key={slot} value={slot}>{labels[slot]}</option>)}</select>
}
function chapterGroups(stages:GameplayStage[]):[number,GameplayStage[]][]{
  const map=new Map<number,GameplayStage[]>()
  for(const stage of [...stages].sort((a,b)=>a.chapter-b.chapter||a.order-b.order)){const rows=map.get(stage.chapter)??[];rows.push(stage);map.set(stage.chapter,rows)}
  return [...map.entries()]
}
function moveWave(value:GameplayStage,index:number,delta:number,onChange:(v:GameplayStage)=>void){const waves=clone(value.waves);const [row]=waves.splice(index,1);waves.splice(index+delta,0,row);onChange({...value,waves})}
function slotLabel(slot:EnemySlot){return slot.startsWith('front')?'前排 '+(Number(slot.split('-')[1])+1):'後排 '+(Number(slot.split('-')[1])+1)}

function SkillEditor({value,onChange}:{value:NonNullable<GameplayEnemy['skill']>;onChange:(v:NonNullable<GameplayEnemy['skill']>)=>void}){
  return <div className="adv-subform">
    <div className="gp-grid three"><Field label="技能名稱"><input value={value.name??''} onChange={e=>onChange({...value,name:e.target.value})} /></Field><Field label="選擇動畫"><AnimationSelect value={value.animation ?? 'skill1'} onChange={animation=>onChange({...value,animation})} /></Field><Field label="技能圖示 URL"><input value={value.icon??''} onChange={e=>onChange({...value,icon:e.target.value})} /></Field></div>
    <Field label="白話敘述（留白時才顯示系統效果）"><textarea value={value.description??''} onChange={e=>onChange({...value,description:e.target.value})} /></Field>
    <TargetEditor value={value.target} onChange={target=>onChange({...value,target})} />
    <EffectList value={value.effects} allowed={value.target.side==='enemy'?ATTACK_SKILL_EFFECT_TYPES:EFFECT_TYPES} onChange={effects=>onChange({...value,effects})} />
  </div>
}

function AbilityEditor({value,index,onChange,onDelete}:{value:GameplayAbility;index:number;onChange:(v:GameplayAbility)=>void;onDelete:()=>void}){
  return <div className="gp-ability">
    <div className="gp-ability-head"><b>{value.name||('能力 '+(index+1))}</b><button className="danger" onClick={onDelete}>刪除</button></div>
    <div className="gp-grid three"><Field label="Ability ID"><input value={value.id} onChange={e=>onChange({...value,id:e.target.value})} /></Field><Field label="能力名稱"><input value={value.name??''} onChange={e=>onChange({...value,name:e.target.value})} /></Field>
      <Field label="Trigger"><select value={value.trigger} onChange={e=>onChange({...value,trigger:e.target.value as GameplayAbility['trigger']})}>{AUTHORING_ABILITY_TRIGGERS.map(t=><option key={t} value={t}>{TRIGGER_LABEL_ZH[t]}</option>)}</select></Field></div>
    <Field label="白話敘述（留白時才顯示系統效果）"><textarea value={value.description??''} onChange={e=>onChange({...value,description:e.target.value})} /></Field>
    {value.trigger==='everyNRounds'&&<Num label="每 N 回合" value={value.triggerValue??1} min={1} step={1} onChange={v=>onChange({...value,triggerValue:Math.max(1,Math.round(v))})} />}
    <h4>Conditions</h4>{value.conditions.map((c,i)=><ConditionEditor key={i} value={c} onChange={next=>{const rows=[...value.conditions];rows[i]=next;onChange({...value,conditions:rows})}} onDelete={()=>onChange({...value,conditions:value.conditions.filter((_,j)=>j!==i)})} />)}
    <button onClick={()=>onChange({...value,conditions:[...value.conditions,{type:'selfHpPercent',operator:'<=',value:50}]})}>＋ Condition</button>
    <h4>Effects</h4><EffectList value={value.effects} ability onChange={effects=>onChange({...value,effects})} />
  </div>
}

function TargetEditor({value,onChange}:{value:SkillTargetRule;onChange:(v:SkillTargetRule)=>void}){
  const selectors=value.side==='enemy'?[['random','隨機'],['lowestHp','體力低至高'],['highestHp','體力高至低']]:[['random','隨機'],['lowestHp','體力低至高'],['highestHp','體力高至低'],['lowestAttack','攻擊力低至高'],['highestAttack','攻擊力高至低']]
  return <div className="gp-grid three"><Field label="作用對象"><select value={value.side} onChange={e=>onChange({...value,side:e.target.value as SkillTargetRule['side'],selector:'random'})}><option value="enemy">敵方</option><option value="ally">我方</option></select></Field>
    <Field label="數量"><select value={String(value.count)} onChange={e=>onChange({...value,count:e.target.value==='all'?'all':Number(e.target.value)})}><option value="all">全體</option>{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></Field>
    <Field label="挑選依據"><select value={value.selector} onChange={e=>onChange({...value,selector:e.target.value as SkillTargetRule['selector']})}>{selectors.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></Field></div>
}

function EffectList({value,onChange,allowed=EFFECT_TYPES,ability=false}:{value:GameplayEffect[];onChange:(v:GameplayEffect[])=>void;allowed?:readonly GameplayEffectType[];ability?:boolean}){
  return <div className="gp-effects">{value.map((effect,i)=><div className="gp-effect" key={i}>
    <label className="gp-field compact"><span>效果</span><select value={effect.type} onChange={e=>{const rows=[...value];rows[i]={...newGameplayEffect(e.target.value as GameplayEffectType),...(ability?{abilityTarget:effect.abilityTarget??'self'}:{})};onChange(rows)}}>{allowed.map(t=><option key={t} value={t}>{EFFECT_LABEL_ZH[t]}</option>)}</select></label>
    {ability&&<label className="gp-field compact"><span>對象</span><select value={effect.abilityTarget??'self'} onChange={e=>{const rows=[...value];rows[i]={...effect,abilityTarget:e.target.value as GameplayEffect['abilityTarget']};onChange(rows)}}>{ABILITY_EFFECT_TARGETS.map(t=><option key={t} value={t}>{t==='self'?'自身':t==='allAllies'?'我方全體':t==='allEnemies'?'敵方全體':'攻擊者'}</option>)}</select></label>}
    {!noValue.has(effect.type)&&<Num label="數值" value={effect.value??0} compact onChange={v=>{const rows=[...value];rows[i]={...effect,value:v};onChange(rows)}} />}
    {!noDuration.has(effect.type)&&<Num label="持續回合數" value={effect.duration??1} min={1} step={1} compact onChange={v=>{const rows=[...value];rows[i]={...effect,duration:Math.max(1,Math.round(v))};onChange(rows)}} />}
    {(effect.type==='damage'||effect.type==='fixedDamage')&&<Num label="Hits" value={effect.hits??1} min={1} step={1} compact onChange={v=>{const rows=[...value];rows[i]={...effect,hits:Math.max(1,Math.round(v))};onChange(rows)}} />}
    <button className="danger gp-x" onClick={()=>onChange(value.filter((_,j)=>j!==i))}>×</button>
  </div>)}<button className="gp-add-effect" onClick={()=>onChange([...value,newGameplayEffect(allowed[0]??'damage')])}>＋ 新增效果</button></div>
}
const noValue=new Set<GameplayEffectType>(['stun','silence','removeShield','dispelBuffs','taunt','cleanseDebuffs','cleanseDamageOverTime','cleansePoison','removeTaunt','removeStun','removeSilence'])
const noDuration=new Set<GameplayEffectType>(['damage','removeShield','dispelBuffs','cleanseDebuffs','cleanseDamageOverTime','cleansePoison','fixedDamage','removeTaunt','removeStun','removeSilence'])

function ConditionEditor({value,onChange,onDelete}:{value:AbilityCondition;onChange:(v:AbilityCondition)=>void;onDelete:()=>void}){
  return <div className="gp-condition"><select value={value.type} onChange={e=>{const type=e.target.value as AbilityCondition['type'];onChange(type==='hasEffect'?{type,value:'stun'}:type==='hasShield'?{type,value:1}:{type,operator:'<=',value:type==='round'?1:50})}}>{AUTHORING_CONDITION_TYPES.map(t=><option key={t} value={t}>{CONDITION_LABEL_ZH[t]}</option>)}</select>
    {!['hasEffect','hasShield'].includes(value.type)&&<select value={value.operator??'='} onChange={e=>onChange({...value,operator:e.target.value as AbilityCondition['operator']})}>{CONDITION_OPERATORS.map(o=><option key={o}>{o}</option>)}</select>}
    {value.type==='hasEffect'?<select value={String(value.value)} onChange={e=>onChange({...value,value:e.target.value})}>{EFFECT_TYPES.map(t=><option key={t} value={t}>{EFFECT_LABEL_ZH[t]}</option>)}</select>:value.type!=='hasShield'?<input type="number" value={String(value.value)} onChange={e=>onChange({...value,value:Number(e.target.value)})} />:<span className="gp-condition-note">偵測目前是否持有護盾</span>}
    <button className="danger gp-x" onClick={onDelete}>×</button></div>
}

function Header({title,sub,onSave,onDelete}:{title:string;sub:string;onSave:()=>void;onDelete:()=>void}){return <div className="gp-form-head"><div><h2>{title}</h2><p>{sub}</p></div><div><button className="primary" onClick={onSave}>儲存</button><button className="danger" onClick={onDelete}>刪除</button></div></div>}
function Section({title,note,children}:{title:string;note?:string;children:React.ReactNode}){return <section className="gp-section"><h3>{title}</h3>{note&&<p className="gp-note">{note}</p>}{children}</section>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="gp-field"><span>{label}</span>{children}</label>}
function Num({label,value,onChange,min,max,step,compact}:{label:string;value:number;onChange:(v:number)=>void;min?:number;max?:number;step?:number;compact?:boolean}){return <label className={'gp-field'+(compact?' compact':'')}><span>{label}</span><input type="number" value={value} min={min} max={max} step={step??1} onChange={e=>onChange(Number(e.target.value))} /></label>}
function Empty({title,text}:{title:string;text:string}){return <div className="gp-empty-main"><h2>{title}</h2><p>{text}</p></div>}
function upsert<T extends {id:string}>(rows:T[],row:T):T[]{const i=rows.findIndex(x=>x.id===row.id);if(i<0)return[...rows,row];const out=[...rows];out[i]=row;return out}
