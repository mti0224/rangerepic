// ====================================================
// PlayMode — หน้าทดลองเล่น 5v5 (play.html · แยกจาก editor คนละ bundle)
//   หัวหน้า: ชื่อเกม + ปุ่มเลือกภาษา ไทย / อังกฤษ (ใช้ค่าเดียวกับจอดวล)
//   0. หน้าหลัก (Lobby · /lobby) — โปรไฟล์ · เงิน/เพชร · โหมดเล่น · เมนูฮีโร่/กระเป๋า/ร้าน/กาชา
//   1. จัดทีม (TeamBuilder · /team) — คลังเรนเจอร์ที่อนุมัติแล้ว · กรอง/เรียง · ดูค่าพลังและสกิล · ใส่ทีมสองฝั่ง
//   2. โหลดไฟล์ของทุกตัวที่ลงสนาม (หน้าจอโหลดพร้อมแถบความคืบหน้า)
//   3. จอรบ 16:9 — UI ทั้งหมดวาดในแคนวาส (play/battleHud.ts) — หน้านี้แค่รับคลิก/คีย์จาก HUD แล้วสั่งต่อ
// ====================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listRangers, loadGameInfo, loadRangerConfig } from '@/lib/rangerApi'
import { loadRangerAssets } from '@/lib/rangerAssets'
import { defaultRangerConfig, migrateRangerConfig, withDefaultGround, type ActionName, type Row } from '@/lib/rangerConfig'
import { Battle, type Team, type UnitSetup } from './battle'
import { BattleScene, VIEW_H, VIEW_W, type RangerKit } from './battleScene'
import { toggleUnitCard, type HudHit } from './battleHud'
import { LANGS, LANG_LABEL, cycleLang, setLang, type Lang } from './i18n'
import { toggleCutins } from '@/lib/cutin'
import TeamBuilder, { ALL_KEYS, HowToContent, Modal, RESERVE_KEYS, SLOT_KEYS, emptyTeam, type Formation, type RangerData, type TeamSlots } from './TeamBuilder'
import { IconBack, IconClose, IconHelp, IconSwords } from './icons'
import Lobby, { type PanelKey } from './Lobby'
import { TEAM_KEYS, addGear, getCollection, heroLevel, heroPassives, heroStats, recordStage, setStory } from './collection'
import { BOSS_HP_MUL, rewardFor, stageById, starsFor, type StageDef } from '@/lib/stages'
import { effectiveStats } from '@/lib/gear'
import { loadProfile, saveProfile } from './profile'
import type { StoryResult } from './StoryMap'
import StoryEnd from './StoryEnd'
import { STAGES } from '@/lib/stages'
import { canFullscreen, enterGameFullscreen, inAppBrowser, isIOS, isTouchDevice, openInExternalBrowser, useFullscreen } from './screen'
import { ui, useLang } from './uiText'
import { playableIdentityOfRanger } from '@/lib/characterModel'
import { loadGameplayCatalog } from '@/lib/gameplayApi'
import { adaptRangerConfigForGameplay } from '@/lib/gameplayAdapter'
import { DEFAULT_BATTLE_RULES, type BattleRulesV1 } from '@/lib/gameplaySchema'

const FORMATION_KEY = 'lr:formation'
/** หน้าไหนอยู่ที่ URL ไหน (Netlify ส่งทุกเส้นทางมาที่หน้าเดียว → อ่านจาก pathname เอง) */
const PATH: Record<'lobby' | 'setup', string> = { lobby: '/lobby', setup: '/team' }
const stageFromPath = (): 'lobby' | 'setup' =>
  (location.pathname.replace(/\/+$/, '').toLowerCase().endsWith('/team') ? 'setup' : 'lobby')
/** ความกว้างแคนวาสจริงสูงสุด (px) — จอ 4K ไม่ต้องวาดเกินนี้ (ประหยัดเครื่อง) */
const MAX_CANVAS_W = 2560
/** ปุ่มความเร็วในจอรบ: กดวน x1 → x2 → x4 */
const SPEED_STEPS = [1, 2, 4]
/** วงคลื่นตอนคลิก: อยู่กี่ ms (ต้องไม่สั้นกว่าแอนิเมชัน .click-ripple ใน styles.css) · ค้างพร้อมกันได้กี่วง */
const RIPPLE_MS = 600
const MAX_RIPPLES = 6
function loadFormation(): Formation {
  try {
    const raw = JSON.parse(localStorage.getItem(FORMATION_KEY) ?? 'null')
    if (Array.isArray(raw) && raw.length === 2) return [{ ...emptyTeam(), ...raw[0] }, { ...emptyTeam(), ...raw[1] }]
  } catch { /* ไม่มีค่าที่จำไว้ */ }
  return [emptyTeam(), emptyTeam()]
}

export default function PlayMode() {
  const lang = useLang()
  const [data, setData] = useState<RangerData[]>([])
  const [gameplayRules, setGameplayRules] = useState<BattleRulesV1>(DEFAULT_BATTLE_RULES)
  const [ready, setReady] = useState(false)
  const [formation, setFormation] = useState<Formation>(loadFormation)
  const [stage, setStage] = useState<'lobby' | 'setup' | 'loading' | 'battle'>(stageFromPath)
  const [progress, setProgress] = useState<{ done: number; total: number; id: string | null }>({ done: 0, total: 0, id: null })
  const [message, setMessage] = useState('')
  const [kits, setKits] = useState<Map<string, RangerKit> | null>(null)
  const [seed, setSeed] = useState(1)
  const [showHelp, setShowHelp] = useState(false)
  /** ด่านเนื้อเรื่องที่กำลังเล่น (null = ดวลฝึกซ้อม) · ทีมสองฝั่งของด่านแยกจากทีมที่จำไว้ในหน้าจัดทีม */
  const [storyRun, setStoryRun] = useState<{ stage: StageDef; teamId: string; formation: Formation } | null>(null)
  /** ผลด่านล่าสุด → หน้าจบด่าน (ลอยทับจอดวล) */
  const [storyResult, setStoryResult] = useState<StoryResult | null>(null)
  /** หน้าที่เปิดค้างไว้ตอนกลับมาหน้าหลัก (กลับจากด่าน = แผนที่) */
  const [lobbyPanel, setLobbyPanel] = useState<PanelKey | null>(null)
  /** กดเมาส์ค้าง → เคอร์เซอร์ถุงมือแบบกด (เหมือนจอดวล) */
  const [pressing, setPressing] = useState(false)
  useEffect(() => {
    const up = () => setPressing(false)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', up) }
  }, [])

  useEffect(() => { document.documentElement.lang = lang }, [lang])

  // URL ↔ หน้า: เปลี่ยนหน้าแล้วเปลี่ยน URL ให้ตรง · กดย้อนกลับของเบราว์เซอร์ก็กลับหน้าได้
  useEffect(() => {
    if (stage !== 'lobby' && stage !== 'setup') return
    const want = PATH[stage]
    if (location.pathname !== want) history.pushState(null, '', want)
  }, [stage])
  useEffect(() => {
    const back = () => setStage(st => (st === 'battle' || st === 'loading' ? st : stageFromPath()))
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [])

  // เฉพาะตัวที่อนุมัติแล้ว · โหลดค่าพลัง/สกิล/ชื่อของทุกตัวไว้เลย (กรอง เรียง ดูข้อมูลได้ทันที)
  // ทีมที่จำไว้มีตัวที่ยังไม่อนุมัติ/ถูกลบ → เอาออกจากช่อง
  useEffect(() => {
    void (async () => {
      try {
        const [list, catalog] = await Promise.all([
          listRangers().then(rows => rows.filter(r => r.approved)),
          loadGameplayCatalog().catch(() => ({ characters: [], classes: [], rules: DEFAULT_BATTLE_RULES })),
        ])
        setGameplayRules(catalog.rules)

        const baseRows = await Promise.all(list.map(async item => ({
          item,
          config: await loadRangerConfig(item.id).then(c => (c ? migrateRangerConfig(c) : null)).catch(() => null),
          info: await loadGameInfo(item.id),
        })))
        const characterById = new Map(catalog.characters.map(ch => [ch.id, ch]))
        const classesByAsset = new Map<string, typeof catalog.classes>()
        for (const cls of catalog.classes) {
          const rows = classesByAsset.get(cls.assetVariantId) ?? []
          rows.push(cls)
          classesByAsset.set(cls.assetVariantId, rows)
        }

        const rows: RangerData[] = baseRows.flatMap(row => {
          const classes = classesByAsset.get(row.item.id) ?? []
          if (!classes.length) return [{ ...row, playId: row.item.id }]
          return classes.map(cls => ({
            ...row,
            playId: cls.id,
            gameplayClass: cls,
            gameplayCharacter: characterById.get(cls.characterId) ?? null,
            config: row.config ? adaptRangerConfigForGameplay(row.config, cls) : null,
          }))
        })

        const ok = new Set(rows.map(r => r.playId))
        const assetToPlay = new Map<string, string>()
        for (const row of rows) if (!assetToPlay.has(row.item.id)) assetToPlay.set(row.item.id, row.playId)
        setData(rows)
        setFormation(f => {
          const clean = (t: TeamSlots) => Object.fromEntries(ALL_KEYS.map(k => {
            const old = t[k]
            const migrated = old && (ok.has(old) ? old : assetToPlay.get(old))
            return [k, migrated ?? null]
          })) as TeamSlots
          return [clean(f[0]), clean(f[1])]
        })
      } catch (e) {
        setMessage(ui('loadFail') + ': ' + String(e))
      } finally {
        setReady(true)
      }
    })()
  }, [])
  useEffect(() => {
    try { localStorage.setItem(FORMATION_KEY, JSON.stringify(formation)) } catch { /* ไม่จำก็ได้ */ }
  }, [formation])

  // ── โหลดทุกตัวที่ลงสนาม ──
  const start = () => loadAndFight(formation, () => setStage('setup'))

  const resolvePlayId = (id: string | null | undefined): string | null => {
    if (!id) return null
    return data.find(d => d.playId === id)?.playId ?? data.find(d => d.item.id === id)?.playId ?? null
  }

  /** ด่านเนื้อเรื่อง: ทีมเรา = เซ็ตทีมที่เลือก · ศัตรู = ตามข้อมูลด่าน */
  const playStage = (stageId: string, teamId: string) => {
    const stage = stageById(stageId)
    const team = getCollection().teams.find(t => t.id === teamId)
    if (!stage || !team) return
    const mine = emptyTeam()
    for (const k of TEAM_KEYS) mine[k] = resolvePlayId(team.slots[k])
    const foe = emptyTeam()
    for (const en of stage.enemies) {
      const playId = resolvePlayId(en.id)
      if (playId) foe[en.slot] = playId
    }
    const f: Formation = [mine, foe]
    setStoryRun({ stage, teamId, formation: f })
    // ตัวละครบนแผนที่ยืนที่ด่านที่กำลังเล่น (มาจากปุ่ม "ไปด่านต่อไป" ก็ตาม)
    setStory({ at: stage.id })
    setStoryResult(null)
    void loadAndFight(f, () => { setStoryRun(null); setLobbyPanel('story'); setStage('lobby') })
  }

  /** จบด่าน (ครั้งแรกที่ขึ้นหน้าจอจบ) → ดาว · บันทึก · แจกรางวัล */
  const finishStage = (stage: StageDef, r: { win: boolean; alliesLost: number; turns: number }) => {
    const stars = starsFor(r, stage)
    let reward: StoryResult['reward'] = null
    let firstClear = false
    if (stars > 0) {
      firstClear = recordStage(stage.id, stars).firstClear
      const rw = rewardFor(stage, firstClear, Math.random)
      const profile = loadProfile()
      saveProfile({ ...profile, gold: profile.gold + rw.gold, gem: profile.gem + rw.gem })
      reward = { gold: rw.gold, gem: rw.gem, gear: rw.gear ? addGear(rw.gear) : null }
    }
    setStoryResult({ stageId: stage.id, win: r.win, stars, firstClear, reward })
  }

  const loadAndFight = async (f: Formation, onFail: () => void) => {
    // มือถือ: เข้าเต็มจอ + ล็อกแนวนอน (ต้องเรียกทันทีในจังหวะกดปุ่ม ก่อน await ใดๆ)
    if (isTouchDevice()) enterGameFullscreen()
    const ids = [...new Set([...Object.values(f[0]), ...Object.values(f[1])].filter((x): x is string => !!x))]
    setStage('loading')
    setMessage('')
    const map = new Map<string, RangerKit>()
    try {
      for (const [i, playId] of ids.entries()) {
        const d = data.find(r => r.playId === playId)
        const assetId = d?.item.id ?? playId
        setProgress({ done: i, total: ids.length, id: assetId })
        if (map.has(assetId)) continue
        const bullets = d?.item.bullets ?? []
        const assets = await loadRangerAssets(assetId, bullets)
        const saved = await loadRangerConfig(assetId).then(c => (c ? migrateRangerConfig(c) : null))
        const config = withDefaultGround(saved ?? defaultRangerConfig(assetId, assets.sam, bullets), assets.geometry.autoStand)
        const info = d?.info ?? await loadGameInfo(assetId)
        map.set(assetId, { assets, config, info })
      }
      setProgress({ done: ids.length, total: ids.length, id: null })
      setKits(map)
      setSeed(Date.now() % 100000)
      setStage('battle')
    } catch (e) {
      for (const k of map.values()) k.assets.dispose()
      setMessage(ui('loadFail') + ': ' + String(e))
      onFail()
    }
  }

  const backToSetup = () => {
    if (kits) for (const k of kits.values()) k.assets.dispose()
    setKits(null)
    // ด่านเนื้อเรื่อง → กลับไปที่แผนที่ (ด่านถัดไปเล่นอนิเมชั่นปลดล็อคเอง)
    if (storyRun) { setStoryRun(null); setStoryResult(null); setLobbyPanel('story'); setStage('lobby'); return }
    setStage('setup')
  }

  /** หน้าจบด่าน → ไปด่านต่อไปด้วยทีมเดิม */
  const nextStage = () => {
    if (!storyRun) return
    const next = STAGES[STAGES.indexOf(storyRun.stage) + 1]
    if (!next) return
    if (kits) for (const k of kits.values()) k.assets.dispose()
    setKits(null)
    playStage(next.id, storyRun.teamId)
  }

  if (stage === 'battle' && kits) {
    return (
      <BattleView
        formation={storyRun?.formation ?? formation}
        kits={kits}
        seed={seed}
        story={storyRun?.stage ?? null}
        storyResult={storyResult}
        data={data}
        rules={gameplayRules}
        onStoryEnd={r => { if (storyRun) finishStage(storyRun.stage, r) }}
        onNextStage={storyResult?.win && storyRun && STAGES[STAGES.indexOf(storyRun.stage) + 1] ? nextStage : null}
        onBack={backToSetup}
        onRestart={() => { setStoryResult(null); setSeed(s => s + 1) }}
      />
    )
  }

  // ด่านเนื้อเรื่อง: หน้าจอโหลดของตัวเอง (ไม่ผ่านหน้าจัดทีม)
  if (stage === 'loading' && storyRun) {
    return (
      <div className="play-app">
        <div className="pa-overlay">
          <div className="pa-load-card">
            {progress.id && <img src={`/rangers/${progress.id}/thumb.png`} alt="" />}
            <p>{ui('loading')} {progress.done + 1 > progress.total ? progress.total : progress.done + 1}/{progress.total}</p>
            <div className="pa-bar"><i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'lobby') {
    return (
      <div className={'play-app' + (pressing ? ' pressing' : '')} onPointerDownCapture={e => { if (e.button === 0) setPressing(true) }}>
        <RotateHint />
        <InAppNotice />
        <Lobby
          data={data}
          onBattle={() => setStage('setup')}
          onPlayStage={playStage}
          initialPanel={lobbyPanel}
        />
      </div>
    )
  }

  return (
    <div className={'play-app' + (pressing ? ' pressing' : '')} onPointerDownCapture={e => { if (e.button === 0) setPressing(true) }}>
      <header className="pa-head">
        <button className="pa-back" onClick={() => setStage('lobby')} title={ui('lobby')}><IconBack size={16} />{ui('lobby')}</button>
        <div className="pa-brand">
          <span className="pa-logo"><IconSwords size={22} /></span>
          <div><b>{ui('appTitle')}</b><small>{ui('appSub')}</small></div>
        </div>
        <div className="pa-head-tools">
          <button className="pa-help" onClick={() => setShowHelp(true)}><IconHelp size={16} />{ui('help')}</button>
          <LangSwitch />
        </div>
      </header>
      {showHelp && <Modal title={ui('howTo')} onClose={() => setShowHelp(false)}><HowToContent /></Modal>}
      <RotateHint />
      <InAppNotice />
      {!ready
        ? <div className="pa-loading"><div className="pa-spinner" /><p>{ui('loading')}</p></div>
        : <TeamBuilder data={data} formation={formation} setFormation={setFormation} onStart={() => void start()} busy={stage === 'loading'} message={message} />}
      {stage === 'loading' && (
        <div className="pa-overlay">
          <div className="pa-load-card">
            {progress.id && <img src={`/rangers/${progress.id}/thumb.png`} alt="" />}
            <p>{ui('loading')} {progress.done + 1 > progress.total ? progress.total : progress.done + 1}/{progress.total}</p>
            <div className="pa-bar"><i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * เปิดจากเบราว์เซอร์ในแอป (Facebook / Messenger / LINE ...) → เต็มจอไม่ได้
 * แถบแจ้งบนหน้าจัดทีม + ปุ่มเปิดในเบราว์เซอร์จริง (iOS กดเองไม่ได้ → บอกวิธี) · ปิดแถบได้
 */
function InAppNotice() {
  useLang()
  const [kind] = useState(inAppBrowser)
  const [hidden, setHidden] = useState(false)
  const [manual, setManual] = useState(false)
  if (!kind || hidden) return null
  return (
    <div className="inapp-notice" role="status">
      <span>{manual || isIOS() ? ui('inAppHowTo') : ui('inAppWarn')}</span>
      {!isIOS() && !manual && (
        <button className="primary" onClick={() => { if (!openInExternalBrowser()) setManual(true) }}>{ui('openBrowser')}</button>
      )}
      <button className="ghost" title={ui('close')} onClick={() => setHidden(true)}><IconClose size={16} /></button>
    </div>
  )
}

/** มือถือถือแนวตั้ง → ป้ายเต็มจอให้หมุนเป็นแนวนอน (แสดงด้วย CSS @media เท่านั้น) */
function RotateHint() {
  useLang()
  return (
    <div className="rotate-hint" aria-live="polite">
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect className="rh-phone" x="7" y="3" width="10" height="18" rx="2" />
        <path d="M11 18h2" className="rh-phone" />
      </svg>
      <p>{ui('rotate')}</p>
    </div>
  )
}

/** ปุ่มเลือกภาษา ไทย / อังกฤษ (ค่าเดียวกับเมนูในจอดวล) */
function LangSwitch() {
  const lang = useLang()
  const opt = (l: Lang, label: string) => (
    <button key={l} className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>{label}</button>
  )
  return <div className="pa-lang" role="group" aria-label="Language">{LANGS.map(l => opt(l, LANG_LABEL[l]))}</div>
}


// ────────────────────────────────────────────────────────────

function BattleView({ formation, kits, seed, story, storyResult, data, rules, onStoryEnd, onNextStage, onBack, onRestart }: {
  formation: Formation
  kits: Map<string, RangerKit>
  seed: number
  /** ด่านเนื้อเรื่อง (null = ดวลฝึกซ้อม) — ศัตรูใช้เลเวลของด่าน · ตัวบอสเลือดคูณ */
  story: StageDef | null
  /** ผลของด่านรอบนี้ (มาหลังขึ้นหน้าจอจบ) → หน้าจบด่าน */
  storyResult: StoryResult | null
  data: RangerData[]
  rules: BattleRulesV1
  /** มี = ชนะและมีด่านถัดไป */
  onNextStage: (() => void) | null
  /** จบด่าน (เรียกครั้งเดียวต่อการดวลแต่ละรอบ รวมรอบที่กดเล่นใหม่) */
  onStoryEnd: (r: { win: boolean; alliesLost: number; turns: number }) => void
  onBack: () => void
  onRestart: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [, force] = useState(0)
  const rerender = useCallback(() => force(n => n + 1), [])
  // เริ่มเกม: AUTO ปิด · ความเร็ว x1 (ผู้เล่นเลือกเปิดเอง)
  const [speed, setSpeed] = useState(1)
  const [auto, setAuto] = useState(false)
  const [paused, setPaused] = useState(false)

  const thumbs = useMemo(() => {
    const m = new Map<string, HTMLImageElement>()
    for (const id of kits.keys()) { const img = new Image(); img.src = `/rangers/${id}/thumb.png`; m.set(id, img) }
    return m
  }, [kits])

  const scene = useMemo(() => {
    // ทีมเรา (ฝั่งซ้าย) = ฮีโร่ในคลังของผู้เล่น → คิดเลเวล + อุปกรณ์ + โบนัสเซ็ต
    // ทีมศัตรู = ดวลฝึกซ้อม: ค่าตั้งต้น (Lv.1) · ด่านเนื้อเรื่อง: เลเวลตามด่าน (ตัวบอสเลือด × BOSS_HP_MUL)
    const col = getCollection()
    const byPlayId = new Map(data.map(d => [d.playId, d]))
    const power = (team: Team, assetId: string, kit: RangerKit, key: string, d?: RangerData) => {
      const combatConfig = d?.config ?? kit.config
      // New Gameplay classes must not inherit legacy level/gear/passive stat bonuses.
      if (d?.gameplayClass) return { stats: combatConfig.stats, passives: [], level: 1 }
      if (team === 0) return { stats: heroStats(col, assetId, combatConfig), passives: heroPassives(col, assetId, combatConfig.passives), level: heroLevel(col, assetId) }
      const en = story?.enemies.find(e => e.slot === key && e.id === assetId)
      if (!en) return { stats: combatConfig.stats, passives: combatConfig.passives, level: 1 }
      const stats = effectiveStats(combatConfig.stats, en.level, [], combatConfig.element, true)
      if (en.boss) stats.hp = Math.round(stats.hp * BOSS_HP_MUL)
      return { stats, passives: combatConfig.passives, level: en.level }
    }
    const setupOf = (team: Team, playId: string, key: string, row: Row, lane: number): UnitSetup[] => {
      const d = byPlayId.get(playId)
      const assetId = d?.item.id ?? playId
      const kit = kits.get(assetId)
      if (!kit) return []
      const legacy = playableIdentityOfRanger(assetId)
      const cls = d?.gameplayClass ?? null
      const ident = cls
        ? { characterId: cls.characterId, classId: cls.id, assetVariantId: cls.assetVariantId }
        : legacy
      const combatConfig = d?.config ?? kit.config
      return [{
        rangerId: assetId,
        characterId: ident.characterId,
        classId: ident.classId,
        assetVariantId: ident.assetVariantId,
        gameplayClass: cls ?? undefined,
        gameplayRules: cls ? rules : undefined,
        row,
        lane,
        element: kit.config.element,
        category: kit.config.category,
        role: kit.config.role,
        skills: combatConfig.skills,
        ...power(team, assetId, kit, key, d),
      }]
    }
    const setups = (team: Team): UnitSetup[] => SLOT_KEYS.flatMap(k => {
      const playId = formation[team][k]
      if (!playId) return []
      const [row, lane] = k.split('-') as [Row, string]
      return setupOf(team, playId, k, row, Number(lane))
    })
    // แถวพิเศษ (อัญเชิญ): ไม่ลงสนาม · ไม่มีโบนัสแถว (เลเวล/อุปกรณ์เป็นพลังของตัวเอง ยังนับ)
    const reserves = (team: Team): UnitSetup[] => RESERVE_KEYS.flatMap((k, i) => {
      const playId = formation[team][k]
      return playId ? setupOf(team, playId, k, 'back', i) : []
    })
    const sc = new BattleScene(new Battle([setups(0), setups(1)], seed, [reserves(0), reserves(1)]), kits, thumbs, rerender)
    if (story) { sc.hud.backLabel = ui('backToMap'); sc.hud.customResult = true }
    return sc
  }, [formation, kits, thumbs, seed, rerender, story, data, rules])

  // ด่านเนื้อเรื่อง: ขึ้นหน้าจอจบ → ส่งผล (ครั้งเดียวต่อฉาก · กดเล่นใหม่ = ฉากใหม่ ส่งผลใหม่)
  const reported = useRef<BattleScene | null>(null)
  useEffect(() => {
    if (!story || scene.phase !== 'ended' || reported.current === scene) return
    reported.current = scene
    const b = scene.battle
    onStoryEnd({
      win: b.winner === 0,
      alliesLost: b.units.filter(u => u.team === 0 && !u.alive).length,
      turns: b.turn,
    })
  })

  // เปิดให้เครื่องมือตรวจภาพเรียก scene ได้ (เช่นสั่งเดินเฟรมแล้วดัมพ์ภาพ) — ใช้ตอนพัฒนา
  useEffect(() => {
    (window as unknown as { __scene?: BattleScene }).__scene = scene
  }, [scene])

  useEffect(() => { scene.speed = speed }, [scene, speed])
  useEffect(() => { scene.auto = auto }, [scene, auto])
  // มือถือหลุดจากเต็มจอ (ปัดออก/กดย้อนกลับ) → หยุดเกมไว้ + ปุ่มแตะกลับเข้าเต็มจอ
  const fullscreen = useFullscreen()
  const needFs = isTouchDevice() && canFullscreen() && !fullscreen
  useEffect(() => { scene.paused = paused || needFs }, [scene, paused, needFs])

  // ความละเอียดแคนวาส = ขนาดที่แสดงจริง × DPR (เต็มจอ/F11 ก็คมชัด) · ภาพยังเป็นพิกัด VIEW_W×VIEW_H เหมือนเดิม
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    // ขนาดที่แสดง: คำนวณเองจากพื้นที่จริง (16:9 ใหญ่สุดที่ใส่ได้) — ไม่พึ่ง CSS min()/dvh
    // (บางเบราว์เซอร์/แคชเก่าไม่รองรับ → แคนวาสค้างที่ขนาดเดิม ไม่เต็มจอ)
    const stage = cv.parentElement ?? document.body
    const fit = () => {
      const aw = stage.clientWidth || window.innerWidth
      const ah = stage.clientHeight || window.innerHeight
      const s = Math.min(aw / VIEW_W, ah / VIEW_H)
      const cssW = Math.floor(VIEW_W * s), cssH = Math.floor(VIEW_H * s)
      if (cssW <= 0 || cssH <= 0) return
      if (cv.style.width !== cssW + 'px') cv.style.width = cssW + 'px'
      if (cv.style.height !== cssH + 'px') cv.style.height = cssH + 'px'
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(Math.min(cssW * dpr, MAX_CANVAS_W))
      if (cv.width !== w) { cv.width = w; cv.height = Math.round(w * VIEW_H / VIEW_W) }
    }
    fit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    ro?.observe(stage)
    window.addEventListener('resize', fit)
    window.addEventListener('orientationchange', fit)
    document.addEventListener('fullscreenchange', fit)
    // กันพลาด: บางเบราว์เซอร์/แอปไม่ส่งอีเวนต์ตอนเปลี่ยนขนาด (หมุนจอ · แถบเบราว์เซอร์หด) → เช็คซ้ำเรื่อยๆ (ถูกมาก ไม่เปลี่ยนก็ไม่ทำอะไร)
    const poll = window.setInterval(fit, 500)
    return () => {
      window.clearInterval(poll)
      ro?.disconnect()
      window.removeEventListener('resize', fit)
      window.removeEventListener('orientationchange', fit)
      document.removeEventListener('fullscreenchange', fit)
    }
  }, [])

  useEffect(() => {
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(now - last, 100)
      last = now
      try {
        scene.update(dt)
        scene.render(ctx)
      } catch (err) {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        console.error('[BattleView]', err)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [scene])

  /** พิกัดเมาส์ → พิกัดจอตรรกะ 1280×720 */
  const toView = (e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * (VIEW_W / rect.width), y: (e.clientY - rect.top) * (VIEW_H / rect.height) }
  }

  // คีย์ลัดเลือกท่า: Z = ตีธรรมดา · X = สกิล 1 · C = สกิล 2 (ใช้ตำแหน่งปุ่ม — แป้นไทยก็กดได้) · กดซ้ำ = เล็งเองถ้ามีเป้าเดียว
  // แถวพิเศษ: A / S = ตัวที่ 1 สกิล 1 / 2 · D / F = ตัวที่ 2
  useEffect(() => {
    const KEYS: Record<string, ActionName> = { KeyZ: 'attack', KeyX: 'skill1', KeyC: 'skill2' }
    const SUMMON: Record<string, [number, ActionName]> = { KeyA: [0, 'skill1'], KeyS: [0, 'skill2'], KeyD: [1, 'skill1'], KeyF: [1, 'skill2'] }
    const onKey = (e: KeyboardEvent) => {
      const action = KEYS[e.code]
      const summon = SUMMON[e.code]
      if ((!action && !summon) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (scene.hud.menuOpen || scene.phase !== 'input') return
      e.preventDefault()
      onHudRef.current(action ? { kind: 'action', action } : { kind: 'summon', index: summon[0], action: summon[1] })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scene])

  const onHud = (hit: HudHit) => {
    // กดซ้ำเร็วๆ (ดับเบิลคลิก) ที่ปุ่มสลับ → นับครั้งเดียว ไม่งั้นเปิดแล้วปิดทันที / เปิดแล้วปิด AUTO ดูเหมือนกดไม่ติด
    if (!scene.hud.press(hit)) return
    switch (hit.kind) {
      case 'action': scene.chooseAction(hit.action); break
      case 'summon': scene.chooseSummon(hit.index, hit.action); break
      case 'auto': setAuto(a => !a); break
      case 'speed': setSpeed(s => SPEED_STEPS[(SPEED_STEPS.indexOf(s) + 1) % SPEED_STEPS.length]); break
      case 'settings': scene.hud.menuOpen = true; break
      case 'closeMenu': scene.hud.menuOpen = false; break
      case 'pause': setPaused(p => !p); scene.hud.menuOpen = false; break
      case 'restart': scene.hud.menuOpen = false; onRestart(); break
      case 'lang': cycleLang(); break
      case 'cutin': toggleCutins(); break
      case 'unitCard': toggleUnitCard(); break
      case 'back': onBack(); break
      case 'block': break
    }
    rerender()
  }
  const onHudRef = useRef(onHud)
  onHudRef.current = onHud


  // รับคลิกตอนกดลง (pointerdown) — ตอบสนองทันที ไม่ต้องรอปล่อยนิ้วในจุดเดิม
  // และกันพฤติกรรมเดิมของเบราว์เซอร์ (ลากเลือกข้อความ / โฟกัสหลุด) ระหว่างกดรัวๆ
  const onCanvasDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const { x, y } = toView(e)
    // คัตซีนร่ายสกิล: คลิกที่ไหนก็ได้ = ข้าม
    if (scene.cutinActive) { scene.skipCutin(); return }
    const hit = scene.hud.hitAt(x, y)
    if (hit) { onHud(hit); return }
    // ระหว่างเปิดฉาก: คลิกเพื่อข้ามไปเริ่มเลย
    if (scene.phase === 'intro') { scene.skipIntro(); return }
    const uid = scene.unitAt(x, y)
    if (uid) scene.chooseTarget(uid)
  }

  // ── กดเมาส์: เคอร์เซอร์ถุงมือแบบกด (คลาส .pressing — lib/gameCursor.ts) + วงคลื่นจุดที่คลิก ──
  const [pressing, setPressing] = useState(false)
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])
  const rippleId = useRef(0)
  const onRootDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    setPressing(true)
    const r = e.currentTarget.getBoundingClientRect()
    const id = ++rippleId.current
    setRipples(list => [...list.slice(-MAX_RIPPLES + 1), { id, x: e.clientX - r.left, y: e.clientY - r.top }])
    window.setTimeout(() => setRipples(list => list.filter(q => q.id !== id)), RIPPLE_MS)
  }
  useEffect(() => {
    // ปล่อยเมาส์ที่ไหนก็ได้ (แม้ลากออกนอกจอดวล) → กลับเป็นถุงมือปกติ
    const up = () => setPressing(false)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
    }
  }, [])

  // เคอร์เซอร์เป็นถุงมือเกมตลอด (lib/gameCursor.ts) — ที่นี่แค่ส่งตำแหน่งเมาส์ให้ HUD (ไฮไลต์ปุ่ม/ไกด์ผลลัพธ์)
  const onCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    scene.hud.hover = toView(e)
  }

  return (
    <div className={'battle' + (pressing ? ' pressing' : '')} onPointerDownCapture={onRootDown}>
      {/* วงคลื่นตอนคลิก — ลอยทับทุกอย่าง ไม่รับเมาส์ */}
      {ripples.map(q => (
        <span key={q.id} className="click-ripple" style={{ left: q.x, top: q.y }}>
          <i className="cr-ring" />
          <i className="cr-ring cr-ring2" />
        </span>
      ))}
      <RotateHint />
      {needFs && (
        <button className="fs-gate" onClick={() => enterGameFullscreen()}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" />
          </svg>
          <span>{ui('tapFullscreen')}</span>
        </button>
      )}
      {story && storyResult && scene.phase === 'ended' && (
        <StoryEnd
          stage={story}
          result={storyResult}
          turns={scene.battle.turn}
          heroes={[
            ...scene.battle.units.filter(u => u.team === 0).map(u => ({ id: u.rangerId, level: u.level, ko: !u.alive })),
            // แถวพิเศษ (อัญเชิญ) — ได้ EXP ครึ่งเดียว
            ...scene.battle.reserves[0].map(u => ({ id: u.rangerId, level: u.level, ko: false, reserve: true })),
          ]}
          byId={new Map(data.map(d => [d.item.id, d]))}
          onExit={onBack}
          onReplay={onRestart}
          onNext={onNextStage}
        />
      )}
      <div className="battle-stage">
        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          onPointerDown={onCanvasDown}
          onDoubleClick={e => e.preventDefault()}
          onContextMenu={e => e.preventDefault()}
          onMouseMove={onCanvasMove}
          onMouseLeave={() => { scene.hud.hover = null }}
        />
      </div>
    </div>
  )
}


