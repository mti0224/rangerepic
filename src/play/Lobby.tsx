import { groupPlayerCharacters, type RangerData } from './playerRoster'
import HeroArt from './HeroArt'
import { nameOf } from './ClassSelection'
import './player.css'

export default function Lobby({ data, onBattle, onCharacters }: { data: RangerData[]; onBattle: () => void; onCharacters: () => void }) {
  const groups = groupPlayerCharacters(data)
  const hero = data[0]
  return <main className="ep-home">
    <section className="ep-home-copy"><span className="ep-eyebrow">RANGEREPIC / ADVENTURE BEGINS</span><h1>你的角色。<br /><em>你的戰鬥方式。</em></h1><p>選擇角色與職業，組成隊伍，展開回合制對戰。</p>
      <div className="ep-home-actions"><button className="ep-primary" disabled={!data.length} onClick={onCharacters}>角色與職業 →</button><button className="ep-secondary" disabled={!data.length} onClick={onBattle}>編組隊伍・開始對戰</button></div>
      <div className="ep-roster-count"><span><strong>{groups.length}</strong> 位角色</span><span><strong>{data.length}</strong> 個職業</span></div>
      {!data.length && <p className="ep-empty">目前沒有可使用的角色職業。</p>}
    </section>
    {hero && <section className="ep-home-hero"><div className="ep-orbit" /><HeroArt id={hero.item.id} config={hero.config} /><div className="ep-hero-caption"><span>AVAILABLE CLASS</span><strong>{nameOf(hero)}</strong></div></section>}
  </main>
}
