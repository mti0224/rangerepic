// Player frontend: only authored Gameplay classes enter the roster or battle.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listRangers, loadRangerConfig } from '@/lib/rangerApi'
import { loadRangerAssets } from '@/lib/rangerAssets'
import { migrateRangerConfig, withDefaultGround, type ActionName, type Row } from '@/lib/rangerConfig'
import { Battle, type Team, type Unit, type UnitSetup } from './battle'
import { BattleScene, VIEW_H, VIEW_W, type RangerKit } from './battleScene'
import { toggleUnitCard, type HudHit } from './battleHud'
import { LANGS, LANG_LABEL, cycleLang, setLang, statusLabel, type Lang } from './i18n'
import { toggleCutins } from '@/lib/cutin'
import TeamBuilder from './TeamBuilder'
import { SLOT_KEYS, emptyTeam, cleanFormation, buildPlayerRoster, type Formation, type RangerData } from './playerRoster'
import Lobby from './Lobby'
import { IconClose } from './icons'
import { ClassSelection, nameOf } from './ClassSelection'
import { canFullscreen, enterGameFullscreen, inAppBrowser, isIOS, isTouchDevice, openInExternalBrowser, useFullscreen } from './screen'
import { ui, useLang } from './uiText'
import { loadGameplayCatalog } from '@/lib/gameplayApi'
import { DEFAULT_BATTLE_RULES, EFFECT_LABEL_ZH, TRIGGER_LABEL_ZH, type BattleRulesV1, type GameplayEffect } from '@/lib/gameplaySchema'
import { loadAdventureCatalog } from '@/lib/adventureApi'
import { enemyAsCombatClass, type GameplayEnemy, type GameplayStage } from '@/lib/adventureSchema'
import { adaptRangerConfigForGameplay } from '@/lib/gameplayAdapter'
import StageSelection from './StageSelection'
import './player.css'

type Page = 'lobby' | 'stages' | 'setup' | 'characters'
const PATH: Record<Page, string> = { lobby: '/lobby', stages: '/stages', setup: '/team', characters: '/characters' }
const pageFromPath = (): Page => {
  const path = location.pathname.replace(/\/+$/, '').toLowerCase()
  return path.endsWith('/stages') ? 'stages' : path.endsWith('/team') ? 'setup' : path.endsWith('/characters') ? 'characters' : 'lobby'
}
const FORMATION_KEY = 'lr:formation'
const MAX_CANVAS_W = 2560
const SPEED_STEPS = [1, 2, 4]
const RIPPLE_MS = 600
const MAX_RIPPLES = 6
const LONG_PRESS_MS = 2000
const DRAG_THRESHOLD = 14

type BattleGesture = {
  pointerId: number
  mode: 'unit' | 'skill'
  sourceUid: string | null
  startView: { x: number; y: number }
  moved: boolean
  longPressed: boolean
}
type DragLine = { x1: number; y1: number; x2: number; y2: number; mode: 'unit' | 'skill' }
function savedFormation(): unknown {
  try { return JSON.parse(localStorage.getItem(FORMATION_KEY) ?? 'null') } catch { return null }
}

export default function PlayMode() {
  const lang = useLang()
  const [data, setData] = useState<RangerData[]>([])
  const [rules, setRules] = useState<BattleRulesV1>(DEFAULT_BATTLE_RULES)
  const [enemies, setEnemies] = useState<GameplayEnemy[]>([])
  const [stages, setStages] = useState<GameplayStage[]>([])
  const [assetItems, setAssetItems] = useState<Awaited<ReturnType<typeof listRangers>>>([])
  const [selectedStage, setSelectedStage] = useState<GameplayStage | null>(null)
  const [formation, setFormation] = useState<Formation>([emptyTeam(), emptyTeam()])
  const [stage, setStage] = useState<Page | 'loading' | 'battle'>(pageFromPath)
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [kits, setKits] = useState<Map<string, RangerKit> | null>(null)
  const [seed, setSeed] = useState(1)

  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : lang === 'jp' ? 'ja' : lang }, [lang])
  useEffect(() => {
    if (stage === 'loading' || stage === 'battle') return
    if (location.pathname !== PATH[stage]) history.pushState(null, '', PATH[stage])
  }, [stage])
  useEffect(() => {
    const back = () => setStage(current => current === 'battle' || current === 'loading' ? current : pageFromPath())
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [])
  useEffect(() => {
    let cancelled = false
    setReady(false)
    setLoadError('')
    void (async () => {
      try {
        const [assets, catalog, adventure] = await Promise.all([listRangers(), loadGameplayCatalog(), loadAdventureCatalog()])
        const approved = new Set(assets.filter(a => a.approved).map(a => a.id))
        const ids = [...new Set(catalog.classes.map(c => c.assetVariantId))].filter(id => approved.has(id))
        const configs = new Map(await Promise.all(ids.map(async id => {
          const config = await loadRangerConfig(id)
          if (!config) throw new Error(`無法載入職業圖資：${id}`)
          return [id, migrateRangerConfig(config)] as const
        })))
        const rows = buildPlayerRoster(catalog, assets, configs)
        if (cancelled) return
        setData(rows)
        setRules(catalog.rules)
        setEnemies(adventure.enemies)
        setStages(adventure.stages)
        setAssetItems(assets)
        setFormation(cleanFormation(savedFormation(), rows))
        setReady(true)
      } catch (error) {
        if (!cancelled) setLoadError(`角色職業資料載入失敗：${String(error)}`)
      }
    })()
    return () => { cancelled = true }
  }, [attempt])
  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(FORMATION_KEY, JSON.stringify(formation)) } catch { /* optional persistence */ }
  }, [formation, ready])

  const start = async () => {
    const cleaned = cleanFormation(formation, data)
    const playerReady = SLOT_KEYS.some(key => cleaned[0][key])
    const practiceReady = cleaned.every(team => SLOT_KEYS.some(key => team[key]))
    if (selectedStage ? !playerReady : !practiceReady) return
    setFormation(cleaned)
    setMessage('')
    setStage('loading')
    if (isTouchDevice()) enterGameFullscreen()

    const playerPlayIds = (selectedStage ? Object.values(cleaned[0]) : cleaned.flatMap(t => Object.values(t))).filter((x): x is string => !!x)
    const playerAssetIds = playerPlayIds.map(id => data.find(d => d.playId === id)?.item.id).filter((x): x is string => !!x)
    const stageAssetIds = selectedStage
      ? selectedStage.waves.flatMap(w => w.enemies.map(row => enemies.find(e => e.id === row.enemyId)?.assetVariantId).filter((x): x is string => !!x))
      : []
    const ids = [...new Set([...playerAssetIds, ...stageAssetIds])]
    const map = new Map<string, RangerKit>()
    setProgress({ done: 0, total: ids.length })
    try {
      for (const [i, id] of ids.entries()) {
        const assetItem = assetItems.find(a => a.id === id)
        if (!assetItem) throw new Error(`找不到圖資：${id}`)
        const existing = data.find(d => d.item.id === id)?.config
        const raw = existing ?? migrateRangerConfig(await loadRangerConfig(id) ?? (() => { throw new Error(`無法載入圖資設定：${id}`) })())
        const assets = await loadRangerAssets(id, assetItem.bullets)
        const config = withDefaultGround(raw, assets.geometry.autoStand)
        map.set(id, { assets, config, info: null })
        setProgress({ done: i + 1, total: ids.length })
      }
      setKits(map)
      setSeed(Date.now() % 100000)
      setStage('battle')
    } catch (error) {
      for (const kit of map.values()) kit.assets.dispose()
      setMessage(`戰鬥載入失敗：${String(error)}`)
      setStage('setup')
    }
  }
  const backToSetup = () => {
    if (kits) for (const kit of kits.values()) kit.assets.dispose()
    setKits(null)
    setStage('setup')
  }
  if (stage === 'battle' && kits) return <BattleView key={`${seed}:${selectedStage?.id ?? 'practice'}`} formation={formation} kits={kits} seed={seed} data={data} rules={rules} stageDef={selectedStage} enemies={enemies} onBack={backToSetup} onRestart={() => setSeed(s => s + 1)} />

  return <div className="play-app ep-app">
    <header className="ep-header"><button className="ep-brand" onClick={() => { if (stage !== 'loading') setStage('lobby') }}>RANGER<span>EPIC</span><small>回合制冒險</small></button>
      <nav aria-label="主選單">{([['lobby', '首頁'], ['stages', '關卡'], ['characters', '角色與職業'], ['setup', '自由編組']] as const).map(([page, label]) => <button key={page} disabled={stage === 'loading'} aria-current={stage === page ? 'page' : undefined} onClick={() => { setNotice(''); if (page === 'setup') setSelectedStage(null); setStage(page) }}>{label}</button>)}</nav><LangSwitch />
    </header>
    <InAppNotice />
    {notice && <p className="ep-notice" role="status">{notice}</p>}
    {loadError ? <div className="ep-load-state" role="alert"><h1>暫時無法載入角色</h1><p>{loadError}</p><button className="ep-primary" onClick={() => setAttempt(a => a + 1)}>重新載入</button></div>
      : !ready ? <div className="ep-load-state" role="status"><div className="pa-spinner" /><p>載入角色與職業…</p></div>
      : stage === 'lobby' ? <Lobby data={data} onBattle={() => setStage('stages')} onCharacters={() => setStage('characters')} />
      : stage === 'stages' ? <StageSelection stages={stages} enemies={enemies} onBack={() => setStage('lobby')} onSelect={picked => { setSelectedStage(picked); setStage('setup') }} />
      : stage === 'characters' ? <ClassSelection data={data} onBack={() => setStage('lobby')} onConfirm={row => {
        setFormation(f => cleanFormation(f.map(team => Object.fromEntries(Object.entries(team).map(([key, id]) => [key, data.find(d => d.playId === id)?.gameplayCharacter.id === row.gameplayCharacter.id ? row.playId : id]))), data))
        setNotice(`已選擇「${nameOf(row)}」。可在編組隊伍中加入此角色。`)
        setStage('setup')
      }} />
      : <TeamBuilder data={data} formation={formation} setFormation={setFormation} onStart={() => void start()} busy={stage === 'loading'} message={message} playerOnly={!!selectedStage} stageName={selectedStage?.names.zh || selectedStage?.names.en || selectedStage?.id || ''} />}
    {stage === 'loading' && <div className="pa-overlay"><div className="pa-load-card" role="status"><p>載入戰鬥 {progress.done}/{progress.total}</p><div className="pa-bar"><i style={{ width: `${progress.total ? progress.done / progress.total * 100 : 0}%` }} /></div></div></div>}
  </div>
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

function BattleView({ formation, kits, seed, data, rules, stageDef, enemies, onBack, onRestart }: {
  formation: Formation
  kits: Map<string, RangerKit>
  seed: number
  data: RangerData[]
  rules: BattleRulesV1
  stageDef: GameplayStage | null
  enemies: GameplayEnemy[]
  onBack: () => void
  onRestart: () => void
}) {
  const lang = useLang()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [revision, force] = useState(0)
  const rerender = useCallback(() => force(n => n + 1), [])
  const [waveIndex, setWaveIndex] = useState(0)
  const [stageComplete, setStageComplete] = useState(false)
  const carryRef = useRef<{ hp: Map<string, number>; gauge: number } | null>(null)
  const advanceLock = useRef(false)
  // เริ่มเกม: AUTO ปิด · ความเร็ว x1 (ผู้เล่นเลือกเปิดเอง)
  const [speed, setSpeed] = useState(1)
  const [auto, setAuto] = useState(false)
  const [paused, setPaused] = useState(false)
  const [detailUid, setDetailUid] = useState<string | null>(null)
  const gestureRef = useRef<BattleGesture | null>(null)
  const longPressRef = useRef<number | null>(null)
  const [dragLine, setDragLine] = useState<DragLine | null>(null)

  const clearLongPress = useCallback(() => {
    if (longPressRef.current != null) {
      window.clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }, [])

  useEffect(() => () => clearLongPress(), [clearLongPress])

  const thumbs = useMemo(() => {
    const m = new Map<string, HTMLImageElement>()
    for (const id of kits.keys()) { const img = new Image(); img.src = `/rangers/${id}/thumb.png`; m.set(id, img) }
    return m
  }, [kits])

  const scene = useMemo(() => {
    const byPlayId = new Map(data.map(d => [d.playId, d]))
    const setupOf = (playId: string, row: Row, lane: number): UnitSetup[] => {
      const d = byPlayId.get(playId)
      if (!d || !kits.has(d.item.id)) return []
      return [{
        rangerId: d.item.id,
        characterId: d.gameplayCharacter.id,
        classId: d.playId,
        assetVariantId: d.item.id,
        gameplayClass: d.gameplayClass,
        gameplayRules: rules,
        row, lane,
        element: d.config.element,
        category: d.config.category,
        role: d.config.role,
        skills: d.config.skills,
        stats: d.config.stats,
        passives: [],
        level: 1,
      }]
    }
    const setups = (team: Team): UnitSetup[] => SLOT_KEYS.flatMap(k => {
      const playId = formation[team][k]
      if (!playId) return []
      const [row, lane] = k.split('-') as [Row, string]
      return setupOf(playId, row, Number(lane))
    })
    const enemyById = new Map(enemies.map(e => [e.id, e]))
    const waveSetups = (): UnitSetup[] => {
      if (!stageDef) return setups(1)
      const wave = stageDef.waves[waveIndex]
      if (!wave) return []
      return wave.enemies.flatMap(entry => {
        const enemy = enemyById.get(entry.enemyId)
        const kit = enemy ? kits.get(enemy.assetVariantId) : undefined
        if (!enemy || !kit) return []
        const cls = enemyAsCombatClass(enemy)
        const adapted = adaptRangerConfigForGameplay(kit.config, cls)
        const [row, lane] = entry.slot.split('-') as [Row, string]
        return [{
          rangerId: enemy.assetVariantId,
          characterId: cls.characterId,
          classId: cls.id,
          assetVariantId: enemy.assetVariantId,
          gameplayClass: cls,
          gameplayRules: rules,
          row,
          lane: Number(lane),
          element: adapted.element,
          category: adapted.category,
          role: adapted.role,
          skills: adapted.skills,
          stats: adapted.stats,
          passives: [],
          level: 1,
        }]
      })
    }
    const battle = new Battle([setups(0), waveSetups()], seed + waveIndex)
    if (stageDef && carryRef.current) {
      for (const unit of battle.units.filter(u => u.team === 0)) {
        const hp = carryRef.current.hp.get(unit.uid)
        if (hp != null) {
          const carriedHp = Math.max(0, Math.min(unit.maxHp, hp))
          unit.hp = carriedHp
          unit.alive = carriedHp > 0
        }
      }
      battle.gameplayGauge[0] = carryRef.current.gauge
    }
    return new BattleScene(battle, kits, thumbs, rerender)
  }, [formation, kits, thumbs, seed, rerender, data, rules, stageDef, enemies, waveIndex])

  // เปิดให้เครื่องมือตรวจภาพเรียก scene ได้ (เช่นสั่งเดินเฟรมแล้วดัมพ์ภาพ) — ใช้ตอนพัฒนา
  useEffect(() => {
    (window as unknown as { __scene?: BattleScene }).__scene = scene
  }, [scene])

  useEffect(() => { advanceLock.current = false }, [scene])

  useEffect(() => {
    if (!stageDef || stageComplete || advanceLock.current || !scene.battle.over || scene.battle.winner !== 0) return
    advanceLock.current = true
    if (waveIndex + 1 < stageDef.waves.length) {
      carryRef.current = {
        hp: new Map(scene.battle.units.filter(u => u.team === 0).map(u => [u.uid, u.hp])),
        gauge: scene.battle.gameplayGauge[0],
      }
      setWaveIndex(i => i + 1)
    } else {
      setStageComplete(true)
    }
  }, [revision, scene, stageDef, stageComplete, waveIndex])

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
      case 'skillGauge': break
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


  // Angry Birds Epic-style interaction:
  // drag Ranger → enemy = normal attack; drag Ranger → ally / tap self = normal support.
  // When the shared gauge is full, drag the gauge onto a Ranger to arm/use that Ranger's skill.
  // Holding any Ranger/enemy for 2 seconds opens the detailed information panel.
  const onCanvasDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const p = toView(e)
    if (scene.cutinActive) { scene.skipCutin(); return }
    const hit = scene.hud.hitAt(p.x, p.y)
    if (hit && hit.kind !== 'skillGauge') { onHud(hit); return }
    if (scene.phase === 'intro') { scene.skipIntro(); return }

    if (detailUid) setDetailUid(null)
    clearLongPress()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* optional */ }

    if (hit?.kind === 'skillGauge') {
      gestureRef.current = { pointerId: e.pointerId, mode: 'skill', sourceUid: null, startView: p, moved: false, longPressed: false }
      setDragLine({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY, mode: 'skill' })
      return
    }

    const uid = scene.unitAt(p.x, p.y)
    if (!uid) return
    const unit = scene.battle.unit(uid)
    gestureRef.current = { pointerId: e.pointerId, mode: 'unit', sourceUid: uid, startView: p, moved: false, longPressed: false }

    const armedSkill = scene.pendingAction === 'skill1' && scene.pendingActor?.uid === uid
    const canAct = !!unit && unit.team === 0 && scene.phase === 'input'
    if (canAct && !armedSkill) scene.selectPlayerActor(uid)
    if (canAct) setDragLine({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY, mode: 'unit' })

    longPressRef.current = window.setTimeout(() => {
      const g = gestureRef.current
      if (!g || g.pointerId !== e.pointerId || g.moved || g.mode !== 'unit' || g.sourceUid !== uid) return
      g.longPressed = true
      setDragLine(null)
      setDetailUid(uid)
      rerender()
    }, LONG_PRESS_MS)
  }

  const onCanvasMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toView(e)
    scene.hud.hover = p
    const g = gestureRef.current
    if (!g || g.pointerId !== e.pointerId) return
    const moved = Math.hypot(p.x - g.startView.x, p.y - g.startView.y) >= DRAG_THRESHOLD
    if (moved && !g.moved) {
      g.moved = true
      clearLongPress()
    }
    if (dragLine) setDragLine(line => line ? { ...line, x2: e.clientX, y2: e.clientY } : line)
  }

  const endGesture = (e: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    const g = gestureRef.current
    if (!g || g.pointerId !== e.pointerId) return
    clearLongPress()
    gestureRef.current = null
    setDragLine(null)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* optional */ }
    if (cancelled || g.longPressed) return

    const p = toView(e)
    const targetUid = scene.unitAt(p.x, p.y)

    if (g.mode === 'skill') {
      const caster = targetUid ? scene.battle.unit(targetUid) : undefined
      if (caster && caster.team === 0 && scene.selectPlayerActor(caster.uid) && scene.battle.canUse(caster, 'skill1')) {
        scene.chooseAction('skill1')
        // Non-manual authored skills already know how targets are selected; execute immediately.
        // Manual skills stay armed and the player drags that Ranger to the desired target next.
        if (scene.pendingAction === 'skill1' && caster.gameplayClass?.skill.target.selector !== 'manual') {
          const autoTarget = scene.battle.autoTarget(caster, 'skill1')
          if (autoTarget) scene.chooseTarget(autoTarget.uid)
        }
      }
      rerender()
      return
    }

    const source = g.sourceUid ? scene.battle.unit(g.sourceUid) : undefined
    if (!source || source.team !== 0 || scene.phase !== 'input') return

    // A manual skill armed by the shared gauge uses the next drag from that Ranger to choose its target.
    if (scene.pendingAction === 'skill1' && scene.pendingActor?.uid === source.uid) {
      if (targetUid) scene.chooseTarget(targetUid)
      else scene.cancelPendingAction()
      rerender()
      return
    }

    const actualTargetUid = targetUid ?? (!g.moved ? source.uid : null)
    const target = actualTargetUid ? scene.battle.unit(actualTargetUid) : undefined
    if (!target || !scene.selectPlayerActor(source.uid)) return
    const action: ActionName = target.team === 0 ? 'skill2' : 'attack'
    if (!scene.battle.canUse(source, action)) return
    scene.chooseAction(action)
    if (scene.pendingAction === action) {
      scene.chooseTarget(target.uid)
      // Dropping on an invalid target (for example because of taunt) should not leave a hidden action armed.
      if (scene.pendingAction === action) scene.cancelPendingAction()
    }
    rerender()
  }

  const onCanvasUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    endGesture(e)
  }

  const onCanvasCancel = (e: React.PointerEvent<HTMLCanvasElement>) => endGesture(e, true)

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

  return (
    <div className={'battle' + (pressing ? ' pressing' : '')} onPointerDownCapture={onRootDown}>
      {/* วงคลื่นตอนคลิก — ลอยทับทุกอย่าง ไม่รับเมาส์ */}
      {ripples.map(q => (
        <span key={q.id} className="click-ripple" style={{ left: q.x, top: q.y }}>
          <i className="cr-ring" />
          <i className="cr-ring cr-ring2" />
        </span>
      ))}
      {stageDef && stageDef.waves.length > 1 && <div className="ep-wave-hud"><b>{stageDef.names.zh || stageDef.names.en || stageDef.id}</b><span>Wave {Math.min(waveIndex + 1, stageDef.waves.length)}/{stageDef.waves.length}</span></div>}
      {dragLine && <svg className="ep-drag-guide" aria-hidden="true"><line x1={dragLine.x1} y1={dragLine.y1} x2={dragLine.x2} y2={dragLine.y2} /><circle cx={dragLine.x2} cy={dragLine.y2} r="12" /></svg>}
      {scene.pendingAction === 'skill1' && scene.pendingActor?.team === 0 && <div className="ep-target-hint">{lang === 'zh' ? '技能已選擇：拖曳角色至目標' : lang === 'th' ? 'เลือกสกิลแล้ว: ลากตัวละครไปยังเป้าหมาย' : 'Skill armed: drag the Ranger to a target'}</div>}
      {detailUid && <UnitDetailModal unit={scene.battle.unit(detailUid) ?? null} scene={scene} lang={lang} onClose={() => setDetailUid(null)} />}
      {stageComplete && <div className="ep-stage-clear"><div><span>STAGE CLEAR</span><h2>{stageDef?.names.zh || stageDef?.names.en || stageDef?.id}</h2><p>所有波次已通過。</p><button className="ep-primary" onClick={onBack}>返回編組</button><button onClick={onRestart}>再次挑戰</button></div></div>}
      <RotateHint />
      {needFs && (
        <button className="fs-gate" onClick={() => enterGameFullscreen()}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" />
          </svg>
          <span>{ui('tapFullscreen')}</span>
        </button>
      )}
      <div className="battle-stage">
        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          onPointerDown={onCanvasDown}
          onPointerMove={onCanvasMove}
          onPointerUp={onCanvasUp}
          onPointerCancel={onCanvasCancel}
          onDoubleClick={e => e.preventDefault()}
          onContextMenu={e => e.preventDefault()}
          onPointerLeave={() => { if (!gestureRef.current) scene.hud.hover = null }}
        />
      </div>
    </div>
  )
}




function UnitDetailModal({ unit, scene, lang, onClose }: {
  unit: Unit | null
  scene: BattleScene
  lang: Lang
  onClose: () => void
}) {
  if (!unit) return null
  const cls = unit.gameplayClass
  const zh = lang === 'zh'
  const th = lang === 'th'
  const label = (z: string, e: string, t = e) => zh ? z : th ? t : e
  const targetSide = (side: 'enemy' | 'ally') => side === 'enemy' ? label('敵方', 'Enemy', 'ศัตรู') : label('我方', 'Ally', 'ฝ่ายเรา')
  const selector = (value: string) => ({
    manual: label('手動指定', 'Manual', 'เลือกเอง'),
    random: label('隨機', 'Random', 'สุ่ม'),
    lowestHp: label('體力最低', 'Lowest HP', 'HP ต่ำสุด'),
    highestHp: label('體力最高', 'Highest HP', 'HP สูงสุด'),
    lowestAttack: label('攻擊力最低', 'Lowest Attack', 'พลังโจมตีต่ำสุด'),
    highestAttack: label('攻擊力最高', 'Highest Attack', 'พลังโจมตีสูงสุด'),
  } as Record<string, string>)[value] ?? value
  const attackTarget = cls?.normalAttack.target === 'all' ? label('全體敵人', 'All enemies', 'ศัตรูทั้งหมด')
    : cls?.normalAttack.target === 'primaryPlusRandom' ? label(`主要目標 + 隨機 ${cls.normalAttack.extraTargets ?? 0} 名`, `Primary + ${cls.normalAttack.extraTargets ?? 0} random`, `เป้าหมายหลัก + สุ่ม ${cls.normalAttack.extraTargets ?? 0}`)
      : label('一名敵人', 'One enemy', 'ศัตรูหนึ่งตัว')
  const supportTarget = cls?.normalSupport.target === 'allAllies' ? label('全體友軍', 'All allies', 'เพื่อนทั้งหมด') : label('一名友軍／自己', 'One ally / self', 'เพื่อนหนึ่งตัว / ตัวเอง')
  const effectList = (effects: GameplayEffect[]) => effects.length ? effects.map((effect, i) => <li key={`${effect.type}:${i}`}>{effectSummary(effect, lang)}</li>) : <li>—</li>
  const stats = cls?.stats
  const statuses = unit.statuses

  return <div className="ep-unit-detail-backdrop" role="presentation" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section className="ep-unit-detail" role="dialog" aria-modal="true" aria-label={label('角色詳細資訊', 'Unit details', 'รายละเอียดตัวละคร')}>
      <header>
        <div><small>{unit.team === 0 ? label('我方角色', 'Ally', 'ฝ่ายเรา') : label('敵方角色', 'Enemy', 'ศัตรู')}</small><h2>{scene.nameOf(unit)}</h2>{cls && <p>{cls.role}</p>}</div>
        <button type="button" onClick={onClose} aria-label={label('關閉', 'Close', 'ปิด')}>×</button>
      </header>

      <div className="ep-detail-stats">
        <div><span>HP</span><b>{Math.round(stats?.hp ?? unit.maxHp)}</b></div>
        <div><span>{label('攻擊力', 'Attack', 'พลังโจมตี')}</span><b>{Math.round(stats?.attack ?? unit.atk)}</b></div>
        <div><span>{label('爆擊率', 'Crit Rate', 'คริติคอล')}</span><b>{Math.round(stats?.critRate ?? unit.crit)}%</b></div>
        <div><span>{label('爆擊傷害', 'Crit Damage', 'ดาเมจคริติคอล')}</span><b>{stats ? `${stats.critDamage}×` : `${unit.critDmg}%`}</b></div>
        <div><span>{label('命中率', 'Hit Rate', 'ความแม่นยำ')}</span><b>{Math.round(stats?.hitRate ?? unit.hit)}%</b></div>
      </div>

      {cls ? <div className="ep-detail-grid">
        <article><h3>{label('普通攻擊', 'Normal Attack', 'โจมตีปกติ')}</h3><p>{attackTarget} · {cls.normalAttack.hits} Hit{cls.normalAttack.hits === 1 ? '' : 's'} · Gauge +{cls.normalAttack.skillGaugeGain}%</p></article>
        <article><h3>{label('普通輔助', 'Normal Support', 'ช่วยเหลือปกติ')}</h3><p>{supportTarget}</p><ul>{effectList(cls.normalSupport.effects)}</ul></article>
        <article><h3>{cls.skill.name || label('技能', 'Skill', 'สกิล')}</h3>{cls.skill.description && <p>{cls.skill.description}</p>}<p>{targetSide(cls.skill.target.side)} · {cls.skill.target.count === 'all' ? label('全體', 'All', 'ทั้งหมด') : cls.skill.target.count} · {selector(cls.skill.target.selector)}</p><ul>{effectList(cls.skill.effects)}</ul></article>
        <article><h3>{label('能力', 'Abilities', 'ความสามารถ')}</h3>{cls.abilities.length ? cls.abilities.map(ability => <div className="ep-detail-ability" key={ability.id}><b>{ability.name || ability.id}</b><small>{zh ? TRIGGER_LABEL_ZH[ability.trigger] : ability.trigger}{ability.triggerValue != null ? ` · ${ability.triggerValue}` : ''}</small>{ability.description && <p>{ability.description}</p>}<ul>{effectList(ability.effects)}</ul></div>) : <p>—</p>}</article>
      </div> : <p className="ep-detail-legacy">{label('此單位仍使用舊版資料格式，目前顯示可取得的戰鬥數值與狀態。', 'This unit still uses the legacy data format; only available combat stats and statuses are shown.', 'ยูนิตนี้ยังใช้ข้อมูลแบบเดิม จะแสดงเฉพาะค่าสถานะที่มี')}</p>}

      <article className="ep-detail-status"><h3>{label('當前 Buff / Debuff / 狀態', 'Current Buffs / Debuffs / Status', 'บัฟ / ดีบัฟ / สถานะปัจจุบัน')}</h3>
        <div>{statuses.length ? statuses.map((s, i) => <span key={`${s.type}:${i}`}>{statusLabel(s.type)}{s.pct ? ` ${s.pct}%` : ''}{s.shieldHp ? ` ${Math.round(s.shieldHp)}` : ''} · {s.turns}R</span>) : <span>{label('無', 'None', 'ไม่มี')}</span>}</div>
      </article>
    </section>
  </div>
}

function effectSummary(effect: GameplayEffect, lang: Lang): string {
  const base = lang === 'zh' ? EFFECT_LABEL_ZH[effect.type] : effect.type
  const value = effect.value != null ? ` · ${effect.value}` : ''
  const duration = effect.duration != null ? ` · ${effect.duration}R` : ''
  const hits = effect.hits != null && effect.hits > 1 ? ` · ${effect.hits} Hits` : ''
  return base + value + duration + hits
}
