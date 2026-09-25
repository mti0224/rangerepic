// ====================================================
// Lobby — หน้าหลักของเกม (/lobby)
//
//   แถบบน    โปรไฟล์ผู้เล่น | เงิน · เพชร · เอ็นเนอจี้ | ประกาศ · mail · ตั้งค่า
//   ซ้าย      กิจกรรม · เควส  (ล่างสุด = ซีซั่นพาส)
//   กลาง      เว้นว่างไว้ (เดี๋ยวค่อยใส่ของใหม่)
//   ขวาบน     แถบปุ่มย่อย (กิลด์ · อัพอาวุธ · ช่องเผื่อไว้) — กดลูกศรพับ/กางได้
//   ขวา       รายชื่อเพื่อน + เพิ่มเพื่อน
//   แถบล่าง   Shop · bag · team · hero · summon + ปุ่ม PLAY ใหญ่
//   PLAY      เปิดแผงเลือกโหมด (เนื้อเรื่องหลัก · Arena · บอส · ดันเจี้ยน · หอคอย · ฝึกซ้อม …)
//
// ตอนนี้วาง "โครงหน้า" ก่อน — ระบบจริงของแต่ละแผงค่อยเติมทีหลัง
// กดแล้วเปิดแผงเปล่าที่มีหัวข้อ + คำอธิบายไว้รอ ยกเว้น "team" กับ "ดวลฝึกซ้อม" ที่ต่อเข้าระบบจริงแล้ว
//
// ขนาดจอ: เล็กสุดที่ 16:9 (1280×720) — ทุกระยะคิดจากความสูงจอ (dvh) + clamp
// จอมือถือแนวนอนที่ยาวกว่านั้นจะได้พื้นที่ด้านข้างเพิ่มเอง (เนื้อหาไม่ยืดเกิน --lb-max)
// ธีม: สี/มุม/เงา/ฟอนต์ ทั้งหมดเป็นตัวแปรใน lobby.css → เพิ่มธีมพิกเซลได้โดยไม่ต้องแก้ไฟล์นี้
// ====================================================

import { useEffect, useRef, useState } from 'react'
import {
  IconBack, IconBag, IconBolt, IconCalendar, IconCoin, IconGacha, IconGear, IconGem, IconHeroes,
  IconCheck, IconInfo, IconLock, IconMail, IconMap, IconPlus, IconShop, IconSkull, IconSwap, IconSwords,
  IconTeam, IconTrophy, IconUser,
} from './icons'
import { LANGS, LANG_LABEL, setLang, type Lang } from './i18n'
import { getTheme, onThemeChange, setTheme, type Theme } from './theme'
import { DEFAULT_PROFILE, fmtNum, expToNext, loadProfile, saveProfile, type Profile } from './profile'
import { ui, useLang } from './uiText'
import { canFullscreen, enterGameFullscreen, isTouchDevice, useFullscreen } from './screen'
import HeroPage from './HeroPage'
import SummonPage from './SummonPage'
import { nameOf, type RangerData } from './TeamBuilder'
import { GearBag } from './GearUI'
import TeamsPage from './TeamsPage'
import StoryMap from './StoryMap'
import SeasonPass from './SeasonPass'
import { resetCollection } from './collection'
import './lobby.css'
// ปรับสำหรับมือถือแนวนอน — โหลดท้ายสุดเพื่อทับค่าของทุกหน้า (หน้าหลัก · ฮีโร่ · กระเป๋า · จัดทีม · กาชา)
import './mobile.css'

/** แผงที่ยังไม่มีระบบจริง — เปิดมาเห็นหัวข้อ + คำอธิบายว่าตรงนี้จะมีอะไร */
export type PanelKey = 'profile' | 'events' | 'quests' | 'pass' | 'notice' | 'mail' | 'settings'
  | 'guild' | 'forge' | 'friends' | 'heroes' | 'bag' | 'shop' | 'gacha' | 'team' | 'story'
  | 'rank' | 'codex' | 'achieve'

type Ico = (p: { size?: number }) => JSX.Element

/** การ์ดโหมดในแผง PLAY — big = ใบใหญ่แถวบน · ready = เล่นได้แล้ว */
interface ModeDef {
  key: string
  icon: Ico
  title: string
  sub: string
  tone: 'gold' | 'blue' | 'violet' | 'red' | 'green' | 'cyan'
  big?: boolean
  ready?: boolean
}

/** เพื่อนตัวอย่าง — ต่อระบบจริงทีหลัง (ยังไม่มีเซิร์ฟเวอร์) */
const DEMO_FRIENDS = [
  { name: 'Ranger A', online: true },
  { name: 'Ranger B', online: true },
  { name: 'Ranger C', online: false },
  { name: 'Ranger D', online: false },
]

export default function Lobby({ data, onBattle, onPlayStage, initialPanel }: {
  /** คลังเรนเจอร์ทั้งหมด (ใช้ในหน้าฮีโร่) */
  data: RangerData[]
  /** ไปหน้าจัดทีม */
  /** เริ่มโหมดที่เล่นได้ (ตอนนี้ = ดวลฝึกซ้อม → หน้าจัดทีม) */
  onBattle: () => void
  /** เริ่มดวลด่านเนื้อเรื่องด้วยเซ็ตทีมที่เลือก */
  onPlayStage: (stageId: string, teamId: string) => void
  /** เปิดหน้าไหนเลยตอนเข้าหน้าหลัก (กลับจากด่าน = แผนที่ด่าน) */
  initialPanel?: PanelKey | null
}) {
  useLang()
  const theme = useTheme()
  const [profile, setProfile] = useState<Profile>(loadProfile)
  const [panel, setPanel] = useState<PanelKey | null>(initialPanel ?? null)
  const [playOpen, setPlayOpen] = useState(false)
  const [stripOpen, setStripOpen] = useState(false)
  useEffect(() => { saveProfile(profile) }, [profile])

  // ความสูงจริงของแถบล่าง → ให้แผงเลือกโหมดลอยเหนือแถบพอดี ไม่จมทับกัน
  const dockRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = dockRef.current
    if (!el) return
    const set = () => el.closest('.lb')?.setAttribute('style', `--lb-dock-h:${el.offsetHeight}px`)
    set()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])

  const exp = expToNext(profile.level)
  /** เงิน/เพชร/พลังงานบนแถบบนของหน้าเต็มจอ (กระเป๋า · จัดทีม) */
  const wallet = (
    <div className="hp-wallet">
      <span className="hp-cur gold"><IconCoin size={15} />{fmtNum(profile.gold)}</span>
      <span className="hp-cur gem"><IconGem size={15} />{fmtNum(profile.gem)}</span>
      <span className="hp-cur energy"><IconBolt size={15} />{profile.energy}/{profile.energyMax}</span>
    </div>
  )

  const modes: ModeDef[] = [
    { key: 'story', icon: IconMap, title: ui('modeStory'), sub: ui('modeStorySub'), tone: 'blue', big: true, ready: true },
    { key: 'arena', icon: IconTrophy, title: ui('modeArena'), sub: ui('modeArenaSub'), tone: 'violet', big: true },
    { key: 'side', icon: IconCalendar, title: ui('modeSide'), sub: ui('modeSideSub'), tone: 'green' },
    { key: 'boss', icon: IconSkull, title: ui('modeBoss'), sub: ui('modeBossSub'), tone: 'red' },
    { key: 'dungeon', icon: IconGem, title: ui('modeDungeon'), sub: ui('modeDungeonSub'), tone: 'cyan' },
    { key: 'tower', icon: IconTeam, title: ui('modeTower'), sub: ui('modeTowerSub'), tone: 'violet' },
    { key: 'practice', icon: IconSwords, title: ui('modePractice'), sub: ui('modePracticeSub'), tone: 'gold', ready: true },
    { key: 'daily', icon: IconCalendar, title: ui('modeDaily'), sub: ui('modeDailySub'), tone: 'green' },
  ]

  const dock: { key: PanelKey; icon: Ico; label: string }[] = [
    { key: 'shop', icon: IconShop, label: ui('navShop') },
    { key: 'bag', icon: IconBag, label: ui('navBag') },
    { key: 'team', icon: IconTeam, label: ui('navTeam') },
    { key: 'heroes', icon: IconHeroes, label: ui('navHeroes') },
    { key: 'gacha', icon: IconGacha, label: ui('navGacha') },
  ]
  // แถบปุ่มย่อยขวาบน: ช่องแรกๆ เผื่อระบบที่ยังไม่มี (กดลูกศรเพื่อกาง)
  const strip: { key: PanelKey; icon: Ico; label: string; extra?: boolean }[] = [
    { key: 'achieve', icon: IconCheck, label: ui('navAchieve'), extra: true },
    { key: 'codex', icon: IconInfo, label: ui('navCodex'), extra: true },
    { key: 'rank', icon: IconTrophy, label: ui('navRank'), extra: true },
    { key: 'forge', icon: IconSwap, label: ui('navForge') },
    { key: 'guild', icon: IconHeroes, label: ui('navGuild') },
  ]

  // มือถือ: บังคับเต็มจอ (เข้าเองไม่ได้ ต้องให้ผู้เล่นแตะ 1 ที) — แนวนอนบังคับด้วย .rotate-hint อยู่แล้ว
  const fullscreen = useFullscreen()
  const needFs = isTouchDevice() && canFullscreen() && !fullscreen

  return (
    <div className="lb" onContextMenu={e => e.preventDefault()}>
      <div className="lb-bg" aria-hidden="true"><i className="lb-glow a" /><i className="lb-glow b" /><i className="lb-grid" /></div>

      {/* ── แถบบน ── */}
      <header className="lb-top">
        <button className="lb-profile" onClick={() => setPanel('profile')}>
          <span className="lb-avatar"><IconUser size={22} /><b>{profile.level}</b></span>
          <span className="lb-pinfo">
            <b>{profile.name}</b>
            <span className="lb-exp"><i style={{ width: `${Math.min(100, (profile.exp / exp) * 100)}%` }} /></span>
          </span>
        </button>

        <div className="lb-wallet">
          <Currency icon={<IconCoin size={15} />} kind="gold" value={profile.gold} />
          <Currency icon={<IconGem size={15} />} kind="gem" value={profile.gem} />
          <Currency icon={<IconBolt size={15} />} kind="energy" value={profile.energy} max={profile.energyMax} />
        </div>

        <div className="lb-topbtns">
          <button className="lb-icobtn" title={ui('navNotice')} onClick={() => setPanel('notice')}><IconInfo size={18} /></button>
          <button className="lb-icobtn" title={ui('navMail')} onClick={() => setPanel('mail')}><IconMail size={18} /><i className="lb-dot" /></button>
          <button className="lb-icobtn" title={ui('navSettings')} onClick={() => setPanel('settings')}><IconGear size={18} /></button>
        </div>
      </header>

      {/* ── กลางจอ: ซ้าย (กิจกรรม/เควส/พาส) · กลาง (ฮีโร่) · ขวา (แถบย่อย + เพื่อน) ── */}
      <main className="lb-mid">
        <aside className="lb-left">
          <div className="lb-side-group">
            <SideBtn icon={IconGacha} label={ui('navEvents')} onClick={() => setPanel('events')} />
            <SideBtn icon={IconCalendar} label={ui('navQuests')} onClick={() => setPanel('quests')} />
          </div>
          <SideBtn icon={IconTrophy} label={ui('navPass')} wide onClick={() => setPanel('pass')} />
        </aside>

        {/* กลางจอเว้นว่างไว้ก่อน — เดี๋ยวค่อยใส่ของใหม่ทีหลัง */}
        <section className="lb-stage" />

        <aside className="lb-right">
          <div className="lb-striprow"><div className={'lb-strip' + (stripOpen ? ' open' : '')}>
            <button className="lb-strip-arrow" onClick={() => setStripOpen(o => !o)} title={ui('more')} aria-expanded={stripOpen}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={stripOpen ? 'm15 5 7 7-7 7' : 'M9 5 2 12l7 7'} />
              </svg>
            </button>
            {strip.map(b => (
              <button key={b.key} className={'lb-stripbtn' + (b.extra ? ' extra' : '')} onClick={() => setPanel(b.key)} title={b.label}>
                <b.icon size={18} />
                <small>{b.label}</small>
              </button>
            ))}
          </div></div>

          <div className="lb-friends">
            <div className="lb-friends-head">
              <h2>{ui('navFriends')}</h2>
              <span>{DEMO_FRIENDS.filter(f => f.online).length}/{DEMO_FRIENDS.length}</span>
            </div>
            <ul>
              {DEMO_FRIENDS.map(f => (
                <li key={f.name}>
                  <button className="lb-friend" onClick={() => setPanel('friends')}>
                    <span className="lb-friend-face"><IconUser size={15} /></span>
                    <b>{f.name}</b>
                    <small className={f.online ? 'on' : ''}>{f.online ? ui('online') : '—'}</small>
                  </button>
                </li>
              ))}
            </ul>
            <button className="lb-addfriend" onClick={() => setPanel('friends')}><IconPlus size={13} />{ui('addFriend')}</button>
          </div>
        </aside>
      </main>

      {/* ── แถบล่าง ── */}
      <nav className="lb-dock" ref={dockRef}>
        <div className="lb-dock-nav">
          {dock.map(n => (
            <button key={n.key} className="lb-navbtn" onClick={() => setPanel(n.key)}>
              <span className="lb-navico"><n.icon size={22} /></span>
              <small>{n.label}</small>
            </button>
          ))}
        </div>
        <button className={'lb-play' + (playOpen ? ' on' : '')} onClick={() => setPlayOpen(o => !o)}>
          <IconSwords size={24} />
          <span>{ui('play')}</span>
        </button>
      </nav>

      {/* ── แผงเลือกโหมด (กางจากปุ่ม PLAY) ── */}
      {playOpen && (
        <div className="lb-playmenu" onClick={() => setPlayOpen(false)}>
          <div className="lb-modes" onClick={e => e.stopPropagation()}>
            {modes.map(m => (
              <button key={m.key}
                className={`lb-mode ${m.tone}` + (m.big ? ' big' : '') + (m.ready ? ' ready' : ' locked')}
                disabled={!m.ready}
                onClick={() => {
                  if (!m.ready) return
                  setPlayOpen(false)
                  if (m.key === 'story') setPanel('story')
                  else onBattle()
                }}>
                <span className="lb-mode-ico"><m.icon size={m.big ? 30 : 22} /></span>
                <span className="lb-mode-txt"><b>{m.title}</b><small>{m.sub}</small></span>
                <span className={'lb-tag' + (m.ready ? ' on' : '')}>
                  {m.ready ? ui('ready') : <><IconLock size={11} />{ui('soon')}</>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {needFs && (
        <button className="fs-gate" onClick={() => enterGameFullscreen()}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" />
          </svg>
          <span>{ui('tapFullscreen')}</span>
        </button>
      )}

      {panel === 'heroes'
        ? <HeroPage data={data} profile={profile} onClose={() => setPanel(null)} />
        : panel === 'gacha'
          ? <SummonPage data={data} profile={profile} onProfile={setProfile} onClose={() => setPanel(null)} />
          // ซีซั่นพาส
          : panel === 'pass'
            ? <SeasonPass data={data} profile={profile} onProfile={setProfile} wallet={wallet} onClose={() => setPanel(null)} />
          // เนื้อเรื่อง = แผนที่ด่าน
          : panel === 'story'
            ? (
              <StoryMap
                data={data}
                wallet={wallet}
                onClose={() => setPanel(null)}
                onPlay={onPlayStage}
                onTeams={() => setPanel('team')}
              />
            )
          // ทีม = จัดเซ็ตทีมไว้หลายทีม (เลือกใช้ตอนเข้าโหมด)
          : panel === 'team'
            ? <TeamsPage data={data} wallet={wallet} onClose={() => setPanel(null)} />
          // กระเป๋า / อัพอาวุธ = หน้าเดียวกัน (ของทั้งหมด + ตีบวก)
          : panel === 'bag' || panel === 'forge'
            ? (
              <GearBag
                heroName={id => { const d = data.find(x => x.item.id === id); return d ? nameOf(d) : id }}
                elementOf={id => data.find(x => x.item.id === id)?.config?.element ?? null}
                onClose={() => setPanel(null)}
                wallet={wallet}
              />
            )
            : panel && (
              <LobbyPanel panel={panel} theme={theme} profile={profile} onProfile={setProfile} onClose={() => setPanel(null)} />
            )}
    </div>
  )
}

/**
 * ฮีโร่กลางจอ — เล่นท่ายืน (idle) จริงจากไฟล์ตัวละคร วนไปเรื่อยๆ
 * โหลดไฟล์ตัวละครเฉพาะตัวนี้ตัวเดียว (ไม่โหลดกระสุน) · เปลี่ยนหัวหน้าทีมเมื่อไหร่ก็โหลดใหม่และคืนหน่วยความจำตัวเก่า
 */
/** ปุ่มเมนูฝั่งซ้าย */
function SideBtn({ icon: Icon, label, wide, onClick }: { icon: Ico; label: string; wide?: boolean; onClick: () => void }) {
  return (
    <button className={'lb-sidebtn' + (wide ? ' wide' : '')} onClick={onClick}>
      <span className="lb-sideico"><Icon size={18} /></span>
      <b>{label}</b>
    </button>
  )
}

/** ช่องสกุลเงินบนแถบบน (ปุ่ม + ไว้เผื่อเติมเงินทีหลัง) */
function Currency({ icon, kind, value, max }: { icon: JSX.Element; kind: string; value: number; max?: number }) {
  return (
    <div className={'lb-cur ' + kind}>
      <span className="lb-cur-ico">{icon}</span>
      <b>{fmtNum(value)}{max !== undefined && <small>/{max}</small>}</b>
      <span className="lb-cur-plus">+</span>
    </div>
  )
}

/** แผงเต็มจอของเมนูที่ยังไม่มีระบบจริง (ตั้งค่าใช้งานได้แล้ว) */
function LobbyPanel({ panel, theme, profile, onProfile, onClose }: {
  panel: PanelKey
  theme: Theme
  profile: Profile
  onProfile: (p: Profile) => void
  onClose: () => void
}) {
  const lang = useLang()
  const TITLE: Record<PanelKey, string> = {
    profile: ui('navProfile'), events: ui('navEvents'), quests: ui('navQuests'), pass: ui('navPass'),
    notice: ui('navNotice'), mail: ui('navMail'), settings: ui('navSettings'), guild: ui('navGuild'),
    forge: ui('navForge'), friends: ui('navFriends'), heroes: ui('navHeroes'), bag: ui('navBag'), team: ui('teamsTitle'), story: ui('modeStory'),
    shop: ui('navShop'), gacha: ui('navGacha'),
    rank: ui('navRank'), codex: ui('navCodex'), achieve: ui('navAchieve'),
  }
  const SUB: Record<PanelKey, string> = {
    profile: '', events: ui('panelEventsSub'), quests: ui('panelQuestsSub'), pass: ui('panelPassSub'),
    notice: ui('panelNoticeSub'), mail: ui('panelMailSub'), settings: '', guild: ui('panelGuildSub'),
    forge: ui('panelForgeSub'), friends: ui('panelFriendsSub'), heroes: ui('panelHeroesSub'), team: '', story: '',
    bag: ui('panelBagSub'), shop: ui('panelShopSub'), gacha: ui('panelGachaSub'),
    rank: ui('panelRankSub'), codex: ui('panelCodexSub'), achieve: ui('panelAchieveSub'),
  }
  const langBtn = (l: Lang, label: string) => (
    <button key={l} className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>{label}</button>
  )
  const themeBtn = (t: Theme, label: string) => (
    <button className={theme === t ? 'on' : ''} aria-pressed={theme === t} onClick={() => setTheme(t)}>{label}</button>
  )

  return (
    <div className="lb-sheet" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="lb-sheet-box" onClick={e => e.stopPropagation()}>
        <header className="lb-sheet-head">
          <button className="lb-icobtn" onClick={onClose} title={ui('close')}><IconBack size={18} /></button>
          <h2>{TITLE[panel]}</h2>
        </header>

        {panel === 'settings' ? (
          <div className="lb-settings">
            <div className="lb-set-row">
              <span>{ui('language')}</span>
              <div className="lb-seg lb-seg-lang">{LANGS.map(l => langBtn(l, LANG_LABEL[l]))}</div>
            </div>
            <div className="lb-set-row">
              <span>{ui('theme')}</span>
              <div className="lb-seg">{themeBtn('neon', ui('themeNeon'))}{themeBtn('pixel', ui('themePixel'))}</div>
            </div>
            <div className="lb-set-row">
              <span>{ui('resetProfile')}</span>
              <button className="lb-ghost" onClick={() => { onProfile({ ...DEFAULT_PROFILE, name: profile.name }); resetCollection() }}>{ui('resetProfile')}</button>
            </div>
          </div>
        ) : (
          <div className="lb-wip">
            <p className="lb-wip-sub">{SUB[panel]}</p>
            <div className="lb-wip-badge">{ui('wip')}</div>
            <p className="lb-hint">{ui('wipNote')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** ธีมปัจจุบัน — คอมโพเนนต์ที่เรียกจะรีเรนเดอร์เมื่อเปลี่ยนธีม */
function useTheme(): Theme {
  const [t, setT] = useState<Theme>(getTheme())
  useEffect(() => onThemeChange(setT), [])
  return t
}
