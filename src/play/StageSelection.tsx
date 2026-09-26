import { useMemo, useState } from 'react'
import type { GameplayEnemy, GameplayStage } from '@/lib/adventureSchema'
import { useStageStars } from './stageProgress'

const stageName = (s: GameplayStage) => s.names.zh || s.names.en || s.names.th || s.names.jp || s.id
const enemyName = (e: GameplayEnemy) => e.names.zh || e.names.en || e.names.th || e.names.jp || e.id

export default function StageSelection({ stages, enemies, onSelect, onBack }: {
  stages: GameplayStage[]
  enemies: GameplayEnemy[]
  onSelect: (stage: GameplayStage) => void
  onBack: () => void
}) {
  const earnedStars = useStageStars()
  const chapters = useMemo(() => [...new Set(stages.map(s => s.chapter))].sort((a,b)=>a-b), [stages])
  const [chapter, setChapter] = useState(chapters[0] ?? 1)
  const rows = stages.filter(s => s.chapter === chapter).sort((a,b)=>a.order-b.order)
  const enemyMap = useMemo(() => new Map(enemies.map(e => [e.id, e])), [enemies])
  return <main className="ep-stage-page">
    <div className="ep-page-heading"><button className="ep-back" onClick={onBack}>← 返回</button><span className="ep-eyebrow">ADVENTURE / STAGES</span><h1>選擇關卡</h1><p>每一關可能包含多個波次。清空當前波次的所有敵人後，才會進入下一波。</p></div>
    {!stages.length ? <p className="ep-empty">目前尚未建立任何關卡。</p> : <>
      <div className="ep-chapter-tabs">{chapters.map(n => <button key={n} className={n===chapter?'selected':''} onClick={()=>setChapter(n)}>第 {n} 章</button>)}</div>
      <div className="ep-stage-map" style={{ backgroundImage: `linear-gradient(180deg,rgba(8,13,24,.2),rgba(8,13,24,.88)),url("${rows[0]?.mapImage || '/maps/map1_full.jpg'}")` }}>
        <div className="ep-stage-grid">{rows.map(stage => <article className="ep-stage-card" key={stage.id}>
          <div className="ep-stage-number">{stage.order}</div>
          <div className="ep-stage-copy"><small>{stage.id}</small><h2>{stageName(stage)}</h2><div className="ep-stage-rating" aria-label={`最高 ${earnedStars[stage.id] ?? 0} 顆星`}>{[0, 1, 2].map(i => <b key={i} className={i < (earnedStars[stage.id] ?? 0) ? 'earned' : ''}>★</b>)}</div><p>{stage.description || `${stage.waves.length} 個波次`}</p></div>
          <div className="ep-stage-waves">{stage.waves.map((wave,wi)=><div className="ep-stage-wave" key={wave.id}><b>Wave {wi+1}</b><div>{wave.enemies.map(row=>{const enemy=enemyMap.get(row.enemyId);return enemy?<span key={row.slot} title={enemyName(enemy)}><img src={`/rangers/${enemy.assetVariantId}/thumb.png`} alt={enemyName(enemy)} /></span>:null})}</div></div>)}</div>
          <button className="ep-primary" disabled={!stage.waves.length || stage.waves.some(w=>!w.enemies.length)} onClick={()=>onSelect(stage)}>挑戰關卡 →</button>
        </article>)}</div>
      </div>
    </>}
  </main>
}
