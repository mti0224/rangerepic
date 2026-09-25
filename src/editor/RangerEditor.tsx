// ====================================================
// RangerEditor — โหมดสร้าง/ตั้งค่าเรนเจอร์
//   ซ้าย  : รายชื่อเรนเจอร์ในเครื่อง + ปุ่มโหลดตัวใหม่จาก lerico
//   กลาง  : canvas (ลากจุด) + แถบไทม์ไลน์ + ปุ่มความเร็ว
//   ขวา   : แท็บตั้งค่า
// ทุกอย่างเซฟลง public/rangers/<id>/ranger.json ผ่าน dev API
// ====================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EditorStage, { type AnchorHandle } from './EditorStage'
import { loadRangerAssets, type RangerAssets } from '@/lib/rangerAssets'
import { SPEED_PROFILES } from '@/lib/samPlayer'
import { ELEMENTS, randomStats, ROLES, rolesOf, type Category } from '@/lib/rangerClass'
import SkillEditor from './SkillEditor'
import { newPassive, PASSIVES, PASSIVE_TYPES, type PassiveDef, type PassiveType } from '@/lib/passives'
import {
  categoryLabel, e, elementLabel, gameName, passiveLabel, passiveNote, roleHint, roleLabel, statLabel, STAT_KEYS, useELang,
  type EKey,
} from './i18n'
import { CutinPanel, CutinStage } from './CutinStudio'
import type { SkillSlot } from '@/lib/skills'
import PortraitEditor from './PortraitEditor'
import { EVOLUTION_LABEL, evolutionOf, starImageUrl } from '@/lib/rangerGrade'
import { loadGameInfo, refreshGameData, type GameInfo } from '@/lib/rangerApi'
import { KIND_OF, PreviewScene } from './previewScene'
import { frontLineGap } from '@/play/battleScene'
import { properNameZhTw } from '@/play/zhNames'
import {
  ACTION_NAMES, DEFAULT_APPROACH, DEFAULT_BULLET, DEFAULT_PROJECTILE_SPEED, defaultRangerConfig, migrateRangerConfig, withDefaultGround,
  readyLengthUntilVanish,
  type ActionName, type RangerConfig, type Vec2,
} from '@/lib/rangerConfig'
import { bulletOverride, PROJECTILE_FALLBACK_SPEED, PROJECTILE_SPEED_SCALE, PT_TO_WORLD, type ShotPlan } from '@/lib/shotRules'
import {
  deleteRanger, downloadConfig, fetchRangerAssets, listRangers,
  loadRangerConfig, saveRangerConfig, type RangerListItem,
} from '@/lib/rangerApi'

type Tab = 'general' | 'portrait' | 'clips' | 'anchors' | ActionName | 'cutin'

const TAB_KEYS = {
  general: 'tabGeneral',
  portrait: 'tabPortrait',
  clips: 'tabClips',
  anchors: 'tabAnchors',
  attack: 'tabAttack',
  skill1: 'tabSkill1',
  skill2: 'tabSkill2',
  cutin: 'tabCutin',
} as const satisfies Record<Tab, EKey>

const ANCHOR_COLORS = {
  ground: '#4ade80',
  hitPoint: '#f87171',
  overhead: '#fbbf24',
  muzzle: '#60a5fa',
  impact: '#f472b6',
  finish: '#f97316',
  walk: '#34d399',
}

// ── ระยะห่างระหว่างตัวเรากับหุ่นเป้า ──
// ตัวละครกว้างเฉลี่ย ~138 หน่วย (กว้างสุด 203) ระยะ 480 จึงเหลือช่องว่างพอให้
// เห็นกระสุนบินจริงๆ แม้เป็นตัวใหญ่ — ค่านี้จำไว้ในเครื่อง ตั้งครั้งเดียวใช้ได้ตลอด
const TARGET_DISTANCE_KEY = 'lr:targetDistance'
const DEFAULT_TARGET_DISTANCE = 480

function loadTargetDistance(): number {
  try {
    const n = Number(localStorage.getItem(TARGET_DISTANCE_KEY))
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TARGET_DISTANCE
  } catch {
    return DEFAULT_TARGET_DISTANCE
  }
}

// ── อ่าน/เขียนค่าใน config ด้วย path แบบจุด ──
function setPath<T extends object>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.')
  const clone = structuredClone(obj)
  let cur = clone as Record<string, unknown>
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]] as Record<string, unknown>
  cur[keys[keys.length - 1]] = value
  return clone
}

export default function RangerEditor() {
  useELang()
  const [rangers, setRangers] = useState<RangerListItem[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [assets, setAssets] = useState<RangerAssets | null>(null)
  /** ข้อมูลจากเกม (public/rangers/<id>/stats.json) — ยังไม่เคยโหลดได้ = null */
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [config, setConfig] = useState<RangerConfig | null>(null)
  const [tab, setTab] = useState<Tab>('anchors')
  /** เมนูคัตซีน: กำลังแก้ของสกิลไหน */
  const [cutinSlot, setCutinSlot] = useState<SkillSlot>('skill1')
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [status, setStatus] = useState('')
  const [dirty, setDirty] = useState(false)
  const [newId, setNewId] = useState('')
  const [targetDistance, setTargetDistance] = useState(loadTargetDistance)
  /** กล่องยืนยันการลบ (เปิดอยู่ = id ที่จะลบ) */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [scene, setScene] = useState<PreviewScene | null>(null)
  const frameRef = useRef({ frame: 0, total: 0 })
  const [frameView, setFrameView] = useState({ frame: 0, total: 0 })

  // ── รายชื่อเรนเจอร์ ──
  // เก็บใน ref ด้วย เพื่อให้ effect โหลดเรนเจอร์อ่านรายชื่อล่าสุดได้
  // โดยไม่ต้องผูก rangers เป็น dependency (ไม่งั้นกด Save ทีนึงจะรีโหลด asset ใหม่ทั้งชุด)
  const rangersRef = useRef<RangerListItem[]>([])
  rangersRef.current = rangers

  const refreshList = useCallback(async () => {
    try {
      const list = await listRangers()
      rangersRef.current = list
      setRangers(list)
      return list
    } catch (err) {
      setStatus(String(err))
      return []
    }
  }, [])
  useEffect(() => { void refreshList() }, [refreshList])

  // ── โหลดเรนเจอร์ที่เลือก ──
  useEffect(() => {
    if (!selected) return
    let dead = false
    let loaded: RangerAssets | null = null
    setStatus(e('stLoading'))
    const bullets = rangersRef.current.find(r => r.id === selected)?.bullets ?? []
    void (async () => {
      try {
        const a = await loadRangerAssets(selected, bullets)
        if (dead) { a.dispose(); return }
        loaded = a
        const saved = await loadRangerConfig(selected)
        const info = await loadGameInfo(selected)
        if (dead) return
        setAssets(a)
        setGameInfo(info)
        const base = withDefaultGround(saved ? migrateRangerConfig(saved) : defaultRangerConfig(selected, a.sam, bullets), a.geometry.autoStand)
        // 使用者手動命名保留；自動名稱優先採 RangerBook 繁中名稱。
        const zhName = properNameZhTw(selected)
        const autoNamed = !base.name || base.name === selected || base.name === info?.name.th || base.name === info?.name.en
        const localizedBase = zhName && autoNamed ? { ...base, name: zhName } : base
        setConfig(saved || !info ? localizedBase : applyGameInfo(localizedBase, info))
        setDirty(!saved)
        const bulNote = bullets.length ? e('stBullets', { list: bullets.join(', ') }) : e('stNoBullets')
        setStatus(e(saved ? 'stLoadedSaved' : 'stNewRanger') + bulNote)
      } catch (err) {
        if (!dead) setStatus(e('stLoadFail', { err: String(err) }))
      }
    })()
    // ไม่ปลด asset ตรงนี้ — ตัวเก่ายังถูกวาดอยู่จนกว่าฉากใหม่จะเข้าที่
    // (ปลดเร็วไปแล้ว drawImage จะ throw กลางคัน ทำให้ transform ค้างและภาพซ้อน)
    return () => { dead = true; void loaded }
  }, [selected])

  // ── สร้าง player ใหม่เมื่อเปลี่ยนคลิป/ความเร็ว (ไม่ผูกกับการลากจุด) ──
  const action = ACTION_NAMES.includes(tab as ActionName) ? (tab as ActionName) : null
  const actionCfg = action && config ? config.actions[action] : null
  const clipKey = action
    ? `${actionCfg?.castPre ?? ''}|${actionCfg?.cast ?? ''}|${actionCfg?.release ?? ''}|${actionCfg?.castSpeedCap ?? ''}`
    : config?.clips.idle ?? ''

  // สร้างฉากใหม่เมื่อเปลี่ยนเรนเจอร์ แล้วค่อยปลด asset ตัวเก่าทิ้ง
  const liveAssetsRef = useRef<RangerAssets | null>(null)
  useEffect(() => {
    if (!assets || !config) { setScene(null); return }
    setScene(new PreviewScene(assets, config))

    const prev = liveAssetsRef.current
    liveAssetsRef.current = assets
    // ปลดของเก่าหลังเฟรมถัดไป — ให้แน่ใจว่าไม่มีใครวาดมันอีกแล้ว
    if (prev && prev !== assets) setTimeout(() => prev.dispose(), 120)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets])

  // ปิดหน้าแล้วคืนหน่วยความจำให้หมด
  useEffect(() => () => { liveAssetsRef.current?.dispose() }, [])

  // ฉากต้องเห็น config ล่าสุดเสมอ (ลากจุดแล้วยิงใหม่ต้องใช้ค่าใหม่ทันที)
  useEffect(() => { if (scene && config) scene.setConfig(config) }, [scene, config])

  const stand: Vec2 = config && (config.anchors.ground.x !== 0 || config.anchors.ground.y !== 0)
    ? config.anchors.ground
    : assets?.geometry.autoStand ?? { x: 0, y: 0 }

  const plan: ShotPlan | null = useMemo(() => {
    if (!scene || !action || !config) return null
    scene.setConfig(config)
    scene.targetDistance = targetDistance
    return scene.planFor(action)
  }, [scene, action, config, targetDistance])

  const manual = !!actionCfg && (actionCfg.positioning === 'manual' || !assets?.gameData?.moves[KIND_OF[action!]])

  const showTarget = !!action
  // แท็บจุดยึด = โหมดตั้งหมุดบนภาพ (ไม่ล็อก) ที่เหลือ = โหมดยืนจริงเหมือนในแมพ
  const groundLocked = tab !== 'anchors'
  useEffect(() => {
    if (!scene) return
    scene.targetDistance = targetDistance
    scene.showTarget = showTarget
    scene.groundLocked = groundLocked
    scene.showPlan = !!action
    scene.planLabels = false   // หมุดที่ลากได้อยู่ตำแหน่งเดียวกันแล้ว
  }, [scene, targetDistance, showTarget, groundLocked, action, manual])

  useEffect(() => {
    try { localStorage.setItem(TARGET_DISTANCE_KEY, String(targetDistance)) } catch { /* โหมดส่วนตัว — ไม่จำก็ได้ */ }
  }, [targetDistance])

  // เปลี่ยนคลิป/ความเร็ว → กลับไปเล่นวนแบบแก้ไข
  useEffect(() => {
    if (!scene || !config) return
    if (action && actionCfg) scene.loopAction(action, speed)
    else scene.loopClip(config.clips.idle, speed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, clipKey, speed, action])

  const fire = useCallback(() => {
    if (!scene || !action) return
    setPlaying(true)
    scene.fire(action, speed)
  }, [scene, action, speed])

  const onTick = useCallback((frame: number, total: number) => {
    frameRef.current = { frame, total }
  }, [])

  // อัปเดตเลขเฟรมบนจอแค่ 12 ครั้ง/วินาที — ไม่ re-render React ทุกเฟรม
  useEffect(() => {
    const t = setInterval(() => setFrameView({ ...frameRef.current }), 80)
    return () => clearInterval(t)
  }, [])

  // ── ท่าที่ติ๊กเดินเข้าไป: ผู้โจมตีไปยืนตรงไหน (เทียบจากที่ยืนเดิม) ──
  const approachOff: Vec2 = useMemo(() => {
    if (!scene || !action || !config) return { x: 0, y: 0 }
    scene.setConfig(config)
    scene.targetDistance = targetDistance
    return scene.approachOffset(action)
  }, [scene, action, config, targetDistance])

  // ── ตำแหน่งจุดปล่อย/จุดตกที่ใช้อยู่จริงตอนนี้ (ในหน่วยเดียวกับ muzzle / impactOffset) ──
  // โหมดอัตโนมัติ: แปลงจากแผนการยิงที่คำนวณได้ → ลากหมุดแล้วสลับเป็น "ตั้งเอง" โดยเริ่มจากค่านี้
  // ภาพจึงไม่กระโดดตอนเริ่มลาก
  const livePoints = useMemo(() => {
    if (!scene || !action || !config || !plan || plan.type !== 'shot') return null
    const a = config.actions[action]
    if (manual) return { muzzle: a.muzzle, impactOffset: a.impactOffset, plan }
    // จุดยืนของผู้โจมตี "ตอนร่าย" — ท่าที่เดินเข้าไปคือจุดหยุด
    const st = { x: scene.stand.x + approachOff.x, y: scene.stand.y + approachOff.y }
    const base = plan.isBuff ? st : scene.targetPoints(targetDistance).main
    const r = (n: number) => Math.round(n * 10) / 10
    return {
      muzzle: { x: r(plan.start.x - st.x), y: r(plan.start.y - st.y) },
      impactOffset: { x: r(plan.end.x - base.x), y: r(plan.end.y - base.y) },
      plan,
    }
  }, [scene, action, config, plan, manual, targetDistance, approachOff])
  const livePointsRef = useRef(livePoints)
  livePointsRef.current = livePoints

  // ── หมุดที่ลากได้ ขึ้นกับแท็บที่เปิดอยู่ ──
  const handles = useMemo<AnchorHandle[]>(() => {
    if (!config) return []
    if (tab === 'anchors') {
      return [
        { key: 'anchors.ground', label: e('anchorGroundFoot'), color: ANCHOR_COLORS.ground, value: config.anchors.ground, space: 'sprite' },
        { key: 'anchors.hitPoint', label: e('anchorHit'), color: ANCHOR_COLORS.hitPoint, value: config.anchors.hitPoint, space: 'self' },
        { key: 'anchors.overhead', label: e('anchorOverhead'), color: ANCHOR_COLORS.overhead, value: config.anchors.overhead, space: 'self' },
      ]
    }
    if (action) {
      const list: AnchorHandle[] = []
      const ap = config.actions[action].approach
      if (ap?.enabled) {
        list.push({ key: `actions.${action}.approach.stopOffset`, label: e('anchorWalkStop'), color: ANCHOR_COLORS.walk, value: ap.stopOffset, space: 'target' })
      }
      if (!livePoints) return list
      const p = livePoints.plan
      const suffix = manual ? '' : e('autoSuffix')
      // ท่าไม่บินเกิดที่จุดตกเลย จุดปล่อยไม่มีผล จึงไม่ให้ลาก
      if (!p.isInstant) {
        list.push({ key: `actions.${action}.muzzle`, label: e('anchorMuzzle') + suffix, color: ANCHOR_COLORS.muzzle, value: livePoints.muzzle, space: 'self' })
      }
      const split = config.actions[action].finishSplit
      list.push({
        key: `actions.${action}.impactOffset`,
        label: e(split ? 'anchorEndNormal' : p.isBuff ? 'anchorBuffSpawn' : p.isInstant ? 'anchorFxSpawn' : 'anchorImpact') + suffix,
        color: ANCHOR_COLORS.impact,
        value: livePoints.impactOffset,
        space: p.isBuff ? 'self' : 'target',
      })
      if (split) {
        list.push({
          key: `actions.${action}.finishOffset`,
          label: e('anchorFinish'),
          color: ANCHOR_COLORS.finish,
          value: config.actions[action].finishOffset,
          space: p.isBuff ? 'self' : 'target',
        })
      }
      return list
    }
    return []
  }, [config, tab, action, manual, livePoints])

  const onAnchorChange = useCallback((key: string, v: Vec2) => {
    setConfig(c => {
      if (!c) return c
      const m = key.match(/^actions.(attack|skill1|skill2).(muzzle|impactOffset)$/)
      const live = livePointsRef.current
      if (m && live && c.actions[m[1] as ActionName].positioning !== 'manual') {
        // ลากหมุดในโหมดอัตโนมัติ → สลับเป็นตั้งเอง พร้อมคัดลอกค่าที่คำนวณไว้ทั้งสองจุด
        const name = m[1] as ActionName
        let next = setPath(c, `actions.${name}.positioning`, 'manual')
        next = setPath(next, `actions.${name}.muzzle`, live.muzzle)
        next = setPath(next, `actions.${name}.impactOffset`, live.impactOffset)
        return setPath(next, key, v)
      }
      return setPath(c, key, v)
    })
    setDirty(true)
  }, [])

  const setConfigAndDirty = useCallback((fn: (c: RangerConfig) => RangerConfig) => {
    setConfig(c => (c ? fn(c) : c))
    setDirty(true)
  }, [])

  const edit = useCallback((path: string, value: unknown) => {
    setConfig(c => (c ? setPath(c, path, value) : c))
    setDirty(true)
  }, [])

  // ── บันทึก ──
  const save = async () => {
    if (!config) return
    try {
      await saveRangerConfig(config)
      setDirty(false)
      setStatus(e('stSaved', { id: config.id }))
      void refreshList()
    } catch (err) {
      setStatus(e('stSaveFail', { err: String(err) }))
    }
  }

  // ── อนุมัติ: พร้อมเล่น → แสดงในหน้าจัดทีม (บันทึกทันที รวมการแก้ที่ยังไม่ได้บันทึกด้วย) ──
  const toggleApprove = async () => {
    if (!config) return
    const next = { ...config, approved: !config.approved }
    try {
      await saveRangerConfig(next)
      setConfig(next)
      setDirty(false)
      setStatus(e(next.approved ? 'stApproved' : 'stUnapproved'))
      void refreshList()
    } catch (err) {
      setStatus(e('stApproveFail', { err: String(err) }))
    }
  }

  // ── ลบ (หลังกดยืนยัน): ย้ายโฟลเดอร์ไปถังขยะ แล้วล้างตัวที่เลือกอยู่ ──
  const doDelete = async (id: string) => {
    setConfirmDelete(null)
    try {
      const r = await deleteRanger(id)
      if (selected === id) {
        assets?.dispose()
        setAssets(null)
        setConfig(null)
        setGameInfo(null)
        setSelected(null)
        setDirty(false)
      }
      setStatus(e('stDeleted', { id, to: r.movedTo }))
      void refreshList()
    } catch (err) {
      setStatus(e('stDeleteFail', { err: String(err) }))
    }
  }

  // ── โหลดเรนเจอร์ตัวใหม่จาก lerico ──
  const refreshData = async () => {
    setRefreshing(true)
    setStatus(e('stFetching'))
    try {
      const r = await refreshGameData()
      const stale = Object.values(r.sources).some(v => v !== 'api')
      const renamed = r.renamed ?? {}
      const nRenamed = Object.keys(renamed).length
      if (r.error) setStatus(e('stDataFail', { err: r.error }))
      else setStatus(
        e('stDataOk', { n: r.ok.length })
        + (nRenamed ? e('stDataRenamed', { n: nRenamed }) : '')
        + (r.missing.length ? e('stDataMissing', { ids: r.missing.join(', ') }) : '')
        + (stale ? e('stDataStale') : ''),
      )
      // ตัวที่เปิดอยู่ถูกเปลี่ยนชื่อ → ใช้ชื่อใหม่ในหน้าแก้ด้วย (ไม่งั้นกด Save แล้วชื่อเก่าทับกลับ)
      if (selected && renamed[selected]) setConfig(c => (c && c.id === selected ? { ...c, name: renamed[selected] } : c))
      if (selected) setGameInfo(await loadGameInfo(selected))
      await refreshList()
    } catch (err) {
      setStatus(e('stDataFail', { err: String(err) }))
    } finally {
      setRefreshing(false)
    }
  }

  const addRanger = async () => {
    const id = newId.trim().toLowerCase()
    if (!id) return
    setStatus(e('stFetchRanger', { id }))
    try {
      const r = await fetchRangerAssets(id)
      if (!r.ok) throw new Error(e('stNotFound'))
      const kb = (r.written ?? []).reduce((s, w) => s + w.bytes, 0) / 1024
      setStatus(e('stFetched', { id, kb: kb.toFixed(0) }))
      setNewId('')
      await refreshList()
      setSelected(id)
    } catch (err) {
      setStatus(e('stLoadFail', { err: String(err) }))
    }
  }

  const clipNames = assets ? assets.sam.animNames.filter(n => n !== '_all') : []
  const availableBullets = assets ? Object.keys(assets.bullets).sort() : []

  return (
    <div className="editor">
      {/* ───────── ซ้าย: รายชื่อ ───────── */}
      <aside className="panel left">
        <h2>{e('rangers')}</h2>
        <div className="refresh-row">
          <button disabled={refreshing} onClick={() => void refreshData()}
            title={e('refreshTitle')}>
            {refreshing ? e('refreshing') : e('refreshBtn')}
          </button>
        </div>
        <div className="add-row">
          <input
            value={newId}
            onChange={ev => setNewId(ev.target.value)}
            onKeyDown={ev => { if (ev.key === 'Enter') void addRanger() }}
            placeholder={e('addPlaceholder')}
          />
          <button onClick={() => void addRanger()}>+</button>
        </div>
        <ul className="ranger-list">
          {rangers.map(r => (
            <li key={r.id}>
              <button
                className={r.id === selected ? 'sel' : ''}
                onClick={() => setSelected(r.id)}
              >
                <img src={'/rangers/' + r.id + '/thumb.png'} alt="" onError={ev => { ev.currentTarget.style.visibility = 'hidden' }} />
                <span>
                  <b>{listName(r)}</b>
                  {starImageUrl(r.grade, evolutionOf(r.id)) && (
                    <img className="stars" src={starImageUrl(r.grade, evolutionOf(r.id))!} alt={e('starsAlt', { n: r.grade ?? '?' })}
                      title={`${e('starsAlt', { n: r.grade ?? '?' })} · ${EVOLUTION_LABEL[evolutionOf(r.id)]}`} />
                  )}
                  <i className={r.approved ? 'approved' : ''}>{e(r.approved ? 'tagReady' : r.configured ? 'tagConfigured' : 'tagUnconfigured')}</i>
                </span>
              </button>
            </li>
          ))}
          {!rangers.length && <li className="empty">{e('listEmpty')}</li>}
        </ul>
      </aside>

      {/* ───────── กลาง: เวที ───────── */}
      <main className="stage-wrap">
        {assets && config && tab === 'cutin' ? (
          <CutinStage
            assets={assets}
            config={config}
            info={gameInfo}
            slot={cutinSlot}
            onChange={next => edit('cutins', { ...config.cutins, [cutinSlot]: next })}
          />
        ) : assets && config ? (
          <>
            <EditorStage
              assets={assets}
              scene={scene}
              playing={playing}
              handles={handles}
              targetDistance={targetDistance}
              showTarget={showTarget}
              ground={stand}
              impactDistance={targetDistance}
              selfOffset={approachOff}
              groundLocked={groundLocked}
              onAnchorChange={onAnchorChange}
              onTick={onTick}
            />
            <div className="transport">
              <button onClick={() => setPlaying(p => !p)}>{playing ? '⏸' : '▶'}</button>
              <input
                type="range"
                min={0}
                max={Math.max(0, frameView.total - 1)}
                value={frameView.frame}
                onChange={ev => { setPlaying(false); scene?.seek(Number(ev.target.value)) }}
              />
              <span className="frame-num">{frameView.frame} / {frameView.total}</span>
              <div className="speeds">
                {[1, 2, 3].map(s => (
                  <button key={s} className={s === speed ? 'sel' : ''} onClick={() => setSpeed(s)}>x{s}</button>
                ))}
              </div>
              {action && <button className="fire" onClick={fire}>{e('fireBtn')}</button>}
            </div>
            <div className="hint">
              {e(groundLocked ? 'hintLocked' : 'hintPin')}
              {' · '}{e('hintTail')}
            </div>
          </>
        ) : (
          <div className="placeholder">{e('pickRanger')}</div>
        )}
      </main>

      {/* ───────── ขวา: ตั้งค่า ───────── */}
      <aside className="panel right">
        {config && assets ? (
          <>
            <div className="tabs">
              {(Object.keys(TAB_KEYS) as Tab[]).map(t => (
                <button key={t} className={t === tab ? 'sel' : ''} onClick={() => setTab(t)}>
                  {e(TAB_KEYS[t])}
                </button>
              ))}
            </div>

            <div className="tab-body">
              {tab === 'general' && (
                <>
                  {gameInfo ? (
                    <div className="cast-info">
                      {e('gameDataLabel')} <b>{gameName(gameInfo.name) ?? gameInfo.name.en}</b>
                      <div className="grade-row">
                        {starImageUrl(gameInfo.grade, evolutionOf(config.id)) && <img className="stars" src={starImageUrl(gameInfo.grade, evolutionOf(config.id))!} alt="" />}
                        <span>{e('gradeLine', { n: gameInfo.grade ?? '?' })} <b>{EVOLUTION_LABEL[evolutionOf(config.id)]}</b></span>
                      </div>
                      {gameInfo.suggest.element && <>{e('elementWord')} {elementLabel(gameInfo.suggest.element)}</>}
                      {gameInfo.suggest.category && <> · {e('categoryWord')} {categoryLabel(gameInfo.suggest.category)}</>}
                      {gameInfo.suggest.role && <> · {e('suggestWord')} {roleLabel(gameInfo.suggest.role)}</>}
                      <div style={{ marginTop: 6 }}>
                        <button onClick={() => setConfigAndDirty(c => applyGameInfo(c, gameInfo))}>{e('applyGame')}</button>
                      </div>
                    </div>
                  ) : (
                    <p className="note">{e('noGameData')}</p>
                  )}
                  <Field label={e('fName')}>
                    <input value={config.name} onChange={ev => edit('name', ev.target.value)} />
                  </Field>
                  <Field label={e('elementWord')}>
                    <select value={config.element} onChange={ev => edit('element', ev.target.value)}>
                      {ELEMENTS.map(x => <option key={x} value={x}>{elementLabel(x)}</option>)}
                    </select>
                  </Field>
                  <Field label={e('categoryWord')}>
                    <select value={config.category} onChange={ev => {
                      const c = ev.target.value as Category
                      edit('category', c)
                      // ตำแหน่งต้องอยู่ในชนิดเดียวกัน — เปลี่ยนชนิดแล้วเลือกตำแหน่งแรกของชนิดนั้นให้
                      if (ROLES[config.role].category !== c) edit('role', rolesOf(c)[0])
                    }}>
                      {(['str', 'agi', 'int'] as Category[]).map(c => (
                        <option key={c} value={c}>{categoryLabel(c)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={e('fRole')}>
                    <select value={config.role} onChange={ev => edit('role', ev.target.value)}>
                      {rolesOf(config.category).map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    </select>
                    <span className="note" style={{ margin: 0 }}>{roleHint(config.role)}</span>
                  </Field>
                  <h3>{e('hStats')}</h3>
                  <div style={{ marginBottom: 8 }}>
                    <button className="primary" style={{ width: '100%' }} onClick={() => edit('stats', randomStats(config.role))}>
                      {e('rollStats', { role: roleLabel(config.role) })}
                    </button>
                  </div>
                  <div className="stats-grid">
                    {STAT_KEYS.map(k => (
                      <label key={k}>
                        <span>{statLabel(k)}</span>
                        <input
                          type="number"
                          value={config.stats[k]}
                          onChange={ev => edit('stats.' + k, Number(ev.target.value))}
                        />
                      </label>
                    ))}
                  </div>
                  <h3>{e('hPassive')}</h3>
                  <p className="note">{e('passiveNote')}</p>
                  {(() => {
                    const list: PassiveDef[] = config.passives ?? []
                    const setList = (next: PassiveDef[]) => edit('passives', next)
                    const addable = PASSIVE_TYPES.filter(t => !list.some(p => p.type === t))
                    return (
                      <>
                        <div className="effect-list">
                          {list.length === 0 && <p className="note">{e('noPassive')}</p>}
                          {list.map((p, i) => {
                            const def = PASSIVES[p.type]
                            return (
                              <div key={p.type} className="effect-row">
                                <span className="effect-name">
                                  {passiveLabel(p.type)}
                                  <small className="effect-note">{passiveNote(p.type)}</small>
                                </span>
                                <label className="effect-param">
                                  <input type="number" min={0} max={def.max} step={5} value={p.pct}
                                    onChange={ev => {
                                      const n = Math.round(Number(ev.target.value))
                                      const pct = Number.isFinite(n) ? Math.max(0, Math.min(def.max, n)) : def.default
                                      setList(list.map((x, j) => (j === i ? { ...x, pct } : x)))
                                    }} />
                                  <span>%</span>
                                </label>
                                <button className="effect-x" title={e('remove')} onClick={() => setList(list.filter((_, j) => j !== i))}>×</button>
                              </div>
                            )
                          })}
                        </div>
                        {addable.length > 0 && (
                          <select className="effect-add" value="" onChange={ev => {
                            if (!ev.target.value) return
                            setList([...list, newPassive(ev.target.value as PassiveType)])
                          }}>
                            <option value="">{e('addPassive')}</option>
                            {addable.map(t => <option key={t} value={t}>{passiveLabel(t)}</option>)}
                          </select>
                        )}
                      </>
                    )
                  })()}
                  <div className="meta">{e('metaClips', { fps: config.fps, clips: assets.sam.animNames.length - 1, sprites: assets.sam.images.length })}</div>
                </>
              )}

              {tab === 'cutin' && (
                <CutinPanel
                  assets={assets}
                  config={config}
                  info={gameInfo}
                  slot={cutinSlot}
                  onSlot={setCutinSlot}
                  onChange={(slot, next) => edit('cutins', { ...config.cutins, [slot]: next })}
                />
              )}

              {tab === 'portrait' && (
                <PortraitEditor config={config} onChange={p => edit('face', p)} />
              )}

              {tab === 'clips' && (
                <>
                  <p className="note">{e('clipsNote')}</p>
                  {(Object.keys(config.clips) as (keyof typeof config.clips)[]).map(k => (
                    <Field key={k} label={k}>
                      <select
                        value={config.clips[k] ?? ''}
                        onChange={ev => edit('clips.' + k, ev.target.value || null)}
                      >
                        <option value="">{e('none')}</option>
                        {clipNames.map(n => <option key={n} value={n}>{n} ({assets.sam.animations[n].length}f)</option>)}
                      </select>
                    </Field>
                  ))}
                </>
              )}

              {tab === 'anchors' && (
                <>
                  <p className="note">
                    {e('anchorsHelp1', { stand: e('anchorGround') })}<br />
                    {e('anchorsHelp2')}<br />
                    {e('anchorsHelp3', { hit: e('anchorHit'), over: e('anchorOverhead') })}
                  </p>
                  {(['ground', 'hitPoint', 'overhead'] as const).map(k => (
                    <VecField
                      key={k}
                      label={e(k === 'ground' ? 'anchorGround' : k === 'hitPoint' ? 'anchorHit' : 'anchorOverhead')}
                      color={ANCHOR_COLORS[k]}
                      value={config.anchors[k]}
                      onChange={v => edit('anchors.' + k, v)}
                    />
                  ))}
                </>
              )}

              {action && actionCfg && (() => {
                const kind = KIND_OF[action]
                const gameMove = assets.gameData?.moves[kind] ?? null
                const clipOpts = clipNames.map(n => <option key={n} value={n}>{n} ({assets.sam.animations[n].length}f)</option>)
                const castLen = [actionCfg.castPre, actionCfg.cast]
                  .reduce((n, c) => n + (c ? assets.sam.animations[c]?.length ?? 0 : 0), 0)
                return (
                  <>
                    {action !== 'attack' && (
                      <>
                        <h3 style={{ marginTop: 0 }}>{e('hSkillCombat')}</h3>
                        <SkillEditor
                          skill={config.skills[action]}
                          rangerId={config.id}
                          info={gameInfo?.skills[action] ?? null}
                          onChange={next => edit('skills.' + action, next)}
                        />
                        <h3>{e('hCutin')}</h3>
                        <div className="cutin-actions">
                          <span className="note" style={{ margin: 0 }}>{e(config.cutins?.[action]?.enabled ? 'hasCutin' : 'noCutinYet')}</span>
                          <button onClick={() => { setCutinSlot(action); setTab('cutin') }}>{e('goCutin')}</button>
                        </div>
                        <h3>{e('hAnim')}</h3>
                      </>
                    )}
                    {actionCfg.castPre && (
                      <Field label={e('fCastPre')}>
                        <select value={actionCfg.castPre} onChange={ev => edit('actions.' + action + '.castPre', ev.target.value || null)}>
                          <option value="">{e('none')}</option>{clipOpts}
                        </select>
                      </Field>
                    )}
                    <Field label={e('fCast')}>
                      <select value={actionCfg.cast ?? ''} onChange={ev => edit('actions.' + action + '.cast', ev.target.value || null)}>
                        <option value="">{e('none')}</option>{clipOpts}
                      </select>
                    </Field>
                    <Field label={e('fRelease')}>
                      <select value={actionCfg.release} onChange={ev => edit('actions.' + action + '.release', ev.target.value)}>
                        {clipOpts}
                      </select>
                    </Field>

                    <Field label={e('fReadyLen')}>
                      <div className="inline">
                        <input type="number" value={actionCfg.releaseFrame}
                          onChange={ev => edit('actions.' + action + '.releaseFrame', Number(ev.target.value))} />
                        <button onClick={() => edit('actions.' + action + '.releaseFrame', frameView.frame)}>
                          {e('useThisFrame', { n: frameView.frame })}
                        </button>
                      </div>
                    </Field>
                    {(() => {
                      const suggest = readyLengthUntilVanish(assets.sam, actionCfg.castPre, actionCfg.cast)
                      if (suggest === actionCfg.releaseFrame || suggest === 0) return null
                      return (
                        <div className="cast-info warn">
                          {castLen > suggest
                            ? e('castLongWarn', { castLen, tail: castLen - suggest })
                            : e('ruleJoint')}
                          <i>
                            <button onClick={() => edit('actions.' + action + '.releaseFrame', suggest)}>
                              {e('useRuleValue', { n: suggest })}
                            </button>
                          </i>
                        </div>
                      )
                    })()}

                    <Field label={e('fCastCap')}>
                      <input type="number" step="0.1" placeholder={e('unlimited')} value={actionCfg.castSpeedCap ?? ''}
                        onChange={ev => edit('actions.' + action + '.castSpeedCap', ev.target.value === '' ? null : Number(ev.target.value))} />
                    </Field>

                    <CastInfo
                      castFrames={castLen}
                      releaseFrames={assets.sam.animations[actionCfg.release]?.length ?? 0}
                      fps={config.fps}
                      speed={speed}
                      cap={actionCfg.castSpeedCap}
                    />

                    <h3>{e('hApproach')}</h3>
                    <label className="check">
                      <input type="checkbox" checked={actionCfg.approach.enabled}
                        onChange={ev => edit('actions.' + action + '.approach.enabled', ev.target.checked)} />
                      {e('approachCheck')}
                    </label>
                    {actionCfg.approach.enabled && (() => {
                      const ap = actionCfg.approach
                      const walkDist = Math.hypot(approachOff.x, approachOff.y)
                      const walkSec = walkDist / Math.max(1, ap.speed) / (SPEED_PROFILES[speed]?.release ?? 1)
                      return (
                        <>
                          <VecField label={e('fStopOffset')} color={ANCHOR_COLORS.walk}
                            value={ap.stopOffset} onChange={v => edit('actions.' + action + '.approach.stopOffset', v)} />
                          <Field label={e('fStopX')}>
                            <div className="inline">
                              <input type="range" min={-800} max={300} step={1} value={ap.stopOffset.x}
                                onChange={ev => edit('actions.' + action + '.approach.stopOffset', { ...ap.stopOffset, x: Number(ev.target.value) })} />
                              <input type="number" step={1} value={ap.stopOffset.x} style={{ maxWidth: 76 }}
                                onChange={ev => edit('actions.' + action + '.approach.stopOffset', { ...ap.stopOffset, x: Number(ev.target.value) || 0 })} />
                              <button title={e('resetDefault')} disabled={ap.stopOffset.x === DEFAULT_APPROACH.stopOffset.x}
                                onClick={() => edit('actions.' + action + '.approach.stopOffset', { ...ap.stopOffset, x: DEFAULT_APPROACH.stopOffset.x })}>↺</button>
                            </div>
                            {(() => {
                              const limit = -Math.round(frontLineGap())
                              return (
                                <div className="inline">
                                  <button disabled={ap.stopOffset.x === limit}
                                    title={e('frontLimitTitle')}
                                    onClick={() => edit('actions.' + action + '.approach.stopOffset', { ...ap.stopOffset, x: limit })}>
                                    {e('frontLimitBtn')}
                                  </button>
                                  <span className="meta">{e('frontLimitMeta', { x: limit })}</span>
                                </div>
                              )
                            })()}
                          </Field>
                          <Field label={e('fWalkSpeed')}>
                            <div className="inline">
                              <input type="range" min={50} max={2000} step={10} value={ap.speed}
                                onChange={ev => edit('actions.' + action + '.approach.speed', Number(ev.target.value))} />
                              <input type="number" min={1} step={10} value={ap.speed} style={{ maxWidth: 76 }}
                                onChange={ev => edit('actions.' + action + '.approach.speed', Math.max(1, Number(ev.target.value) || 1))} />
                            </div>
                            <div className="inline">
                              {([['speedSlow', 300], ['speedNormal', 600], ['speedFast', 1000], ['speedDash', 1800]] as const).map(([key, v]) => (
                                <button key={key} className={ap.speed === v ? 'sel' : ''}
                                  onClick={() => edit('actions.' + action + '.approach.speed', v)}>
                                  {e(key)} {v}
                                </button>
                              ))}
                            </div>
                          </Field>
                          <label className="check">
                            <input type="checkbox" checked={ap.returnHome}
                              onChange={ev => edit('actions.' + action + '.approach.returnHome', ev.target.checked)} />
                            {e('returnHome')}
                          </label>
                          <p className="note">
                            {e('walkNote', { dist: walkDist.toFixed(0), sec: walkSec.toFixed(2) })}
                            {ap.returnHome ? e('walkRoundTrip', { sec: (walkSec * 2).toFixed(2) }) : ''}
                            {!config.clips.walk && e('noWalkClip')}
                          </p>
                        </>
                      )
                    })()}

                    <h3>{e('hShot')}</h3>
                    {plan && (
                      <ShotSummary
                        plan={plan}
                        assets={assets}
                        kind={kind}
                        fps={config.fps}
                        speedMul={SPEED_PROFILES[speed]?.release ?? 1}
                        tailSec={actionTailSec(assets, config, actionCfg, speed)}
                        speedOverride={actionCfg.moveSpeedOverride}
                      />
                    )}

                    {plan && plan.type === 'shot' && gameMove && (
                      plan.isInstant ? (
                        <p className="note">{e('instantNote')}</p>
                      ) : (() => {
                        const base = gameMove.moveSpeed > 0 ? gameMove.moveSpeed : PROJECTILE_FALLBACK_SPEED
                        const cur = actionCfg.moveSpeedOverride ?? base
                        const set = (n: number | null) => edit('actions.' + action + '.moveSpeedOverride',
                          n === null || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 10) / 10)
                        const perSec = cur * PROJECTILE_SPEED_SCALE * (config.fps || 30)
                        return (
                          <Field label={e('fBulletSpeed') + e(actionCfg.moveSpeedOverride === null ? 'fromGameData' : 'manualSet')}>
                            <div className="inline">
                              <input type="range" min={1} max={Math.max(150, Math.ceil(base * 3))} step={1} value={cur}
                                onChange={ev => set(Number(ev.target.value))} />
                              <input type="number" min={1} step={1} value={cur} style={{ maxWidth: 70 }}
                                onChange={ev => set(Number(ev.target.value))} />
                            </div>
                            <span className="note" style={{ margin: 0 }}>
                              {e('bulletSpeedMeta', {
                                perSec: perSec.toFixed(0),
                                ticks: plan.travelTicks,
                                sec: (plan.travelTicks / (config.fps || 30) / (SPEED_PROFILES[speed]?.release ?? 1)).toFixed(2),
                              })}
                            </span>
                            {actionCfg.moveSpeedOverride !== null && (
                              <button onClick={() => set(null)}>{e('backToGameValue', { base })}</button>
                            )}
                          </Field>
                        )
                      })()
                    )}

                    {plan && plan.type === 'shot' && !plan.isInstant && (() => {
                      const tilt = actionCfg.aimTilt === true
                      const off = actionCfg.aimTiltOffset ?? 0
                      const setOff = (n: number) => edit('actions.' + action + '.aimTiltOffset', Number.isFinite(n) ? Math.max(-180, Math.min(180, Math.round(n))) : 0)
                      return (
                        <Field label={e('fAimDir')}>
                          <label className="check">
                            <input type="checkbox" checked={tilt} onChange={ev => edit('actions.' + action + '.aimTilt', ev.target.checked)} />
                            {e('aimTilt')}
                          </label>
                          <label className="check" style={tilt ? undefined : { opacity: 0.45, cursor: 'not-allowed' }}
                            title={tilt ? '' : e('aimTiltNeed')}>
                            <input type="checkbox" disabled={!tilt} checked={tilt && actionCfg.aimTiltFinish === true}
                              onChange={ev => edit('actions.' + action + '.aimTiltFinish', ev.target.checked)} />
                            {e('aimTiltFinish')}
                          </label>
                          {tilt && (
                            <div className="inline">
                              <span className="note" style={{ margin: 0, whiteSpace: 'nowrap' }}>{e('rotateMore')}</span>
                              <input type="range" min={-180} max={180} step={1} value={off} onChange={ev => setOff(Number(ev.target.value))} />
                              <input type="number" min={-180} max={180} step={1} value={off} style={{ maxWidth: 70 }} onChange={ev => setOff(Number(ev.target.value))} />
                              <span className="note" style={{ margin: 0 }}>°</span>
                              <button disabled={off === 0} onClick={() => setOff(0)}>{e('reset')}</button>
                            </div>
                          )}
                        </Field>
                      )
                    })()}

                    <Field label={e('fPositioning')}>
                      <select
                        value={manual ? 'manual' : 'auto'}
                        disabled={!gameMove}
                        onChange={ev => edit('actions.' + action + '.positioning', ev.target.value)}
                      >
                        <option value="auto">{e('posAuto')}</option>
                        <option value="manual">{e('posManual')}</option>
                      </select>
                    </Field>
                    {!gameMove && <p className="note">{e('noGameMove')}</p>}
                    {manual && (
                      <>
                        <VecField label={e('fMuzzle')} color={ANCHOR_COLORS.muzzle} value={actionCfg.muzzle}
                          onChange={v => edit('actions.' + action + '.muzzle', v)} />
                        <VecField label={e('fImpact')} color={ANCHOR_COLORS.impact} value={actionCfg.impactOffset}
                          onChange={v => edit('actions.' + action + '.impactOffset', v)} />
                      </>
                    )}
                    {plan && plan.type === 'shot' && (
                      <>
                        <label className="check">
                          <input type="checkbox" checked={actionCfg.finishSplit}
                            onChange={ev => {
                              // เปิดครั้งแรก: เริ่มจุด finish ที่ปลายทางกระสุนตอนนี้ ภาพจะไม่กระโดด
                              if (ev.target.checked && livePoints) edit('actions.' + action + '.finishOffset', { ...livePoints.impactOffset })
                              edit('actions.' + action + '.finishSplit', ev.target.checked)
                            }} />
                          {e('finishSplit')}
                        </label>
                        {actionCfg.finishSplit && (
                          <>
                            <VecField label={e(plan.isBuff ? 'fFinishCaster' : 'fFinishTarget')}
                              color={ANCHOR_COLORS.finish} value={actionCfg.finishOffset}
                              onChange={v => edit('actions.' + action + '.finishOffset', v)} />
                            {plan.finishFrames === 0 && <p className="note">{e('noFinishClip')}</p>}
                          </>
                        )}
                      </>
                    )}
                    <Field label={e('fTargetDist')}>
                      <input type="number" value={targetDistance} onChange={ev => setTargetDistance(Number(ev.target.value))} />
                    </Field>

                    {!gameMove && (
                      <>
                        <h3>{e('hBulletManual')}</h3>
                        {availableBullets.length === 0 ? (
                          <p className="note">{e('noBulletFile')}</p>
                        ) : (
                          <Field label={e('fBulletFile')}>
                            <select
                              value={actionCfg.projectile?.asset ?? ''}
                              onChange={ev => edit('actions.' + action + '.projectile', ev.target.value
                                ? {
                                    asset: ev.target.value,
                                    mode: actionCfg.projectile?.mode ?? 'flight',
                                    path: actionCfg.projectile?.path ?? 'straight',
                                    arcHeight: actionCfg.projectile?.arcHeight ?? null,
                                    speed: actionCfg.projectile?.speed ?? DEFAULT_PROJECTILE_SPEED,
                                    rotate: actionCfg.projectile?.rotate ?? 'none',
                                    fitFlight: actionCfg.projectile?.fitFlight ?? false,
                                  }
                                : null)}
                            >
                              <option value="">{e('bulletNone')}</option>
                              {availableBullets.map(b => (
                                <option key={b} value={b}>{b}{b === DEFAULT_BULLET[action] ? e('bulletDefault') : ''}</option>
                              ))}
                            </select>
                          </Field>
                        )}
                        {actionCfg.projectile && (
                          <>
                            <Field label={e('fBulletMode')}>
                              <select value={actionCfg.projectile.mode}
                                onChange={ev => edit('actions.' + action + '.projectile.mode', ev.target.value)}>
                                <option value="flight">{e('modeFlight')}</option>
                                <option value="atTarget">{e('modeAtTarget')}</option>
                              </select>
                            </Field>
                            <Field label={e('fPath')}>
                              <select value={actionCfg.projectile.path}
                                onChange={ev => edit('actions.' + action + '.projectile.path', ev.target.value)}>
                                <option value="straight">{e('pathStraight')}</option>
                                <option value="arc">{e('pathArc')}</option>
                              </select>
                            </Field>
                            <Field label={e('fBulletSpeedUnit')}>
                              <input type="number" value={actionCfg.projectile.speed}
                                onChange={ev => edit('actions.' + action + '.projectile.speed', Number(ev.target.value))} />
                            </Field>
                          </>
                        )}
                      </>
                    )}
                  </>
                )
              })()}
            </div>

            <div className="save-bar">
              <button className="primary" onClick={() => void save()} disabled={!dirty}>
                {e(dirty ? 'save' : 'saved')}
              </button>
              <button onClick={() => downloadConfig(config)}>Export</button>
            </div>
            <div className="save-bar">
              <button
                className={config.approved ? 'approve on' : 'approve'}
                onClick={() => void toggleApprove()}
                title={e(config.approved ? 'approveOnTitle' : 'approveOffTitle')}
              >
                {e(config.approved ? 'approvedBtn' : 'approveBtn')}
              </button>
              {/* ลบตามโฟลเดอร์ที่เลือกในรายชื่อ (ไม่ใช้ id ในไฟล์ — กันลบผิดตัวถ้า id ในไฟล์ไม่ตรงชื่อโฟลเดอร์) */}
              <button className="danger" onClick={() => selected && setConfirmDelete(selected)} title={e('deleteTitle')}>{e('deleteBtn')}</button>
            </div>
          </>
        ) : (
          <div className="placeholder">—</div>
        )}
        <div className="status">{status}</div>
      </aside>

      {/* ───────── กล่องยืนยันการลบ ───────── */}
      {confirmDelete && (
        <div className="modal-back" onClick={() => setConfirmDelete(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={ev => ev.stopPropagation()}>
            <h3>{e('confirmDelTitle')}</h3>
            {(() => {
              const r = rangers.find(x => x.id === confirmDelete)
              return <p><b>{r ? listName(r) : confirmDelete}</b> ({confirmDelete})</p>
            })()}
            <p className="note">
              {e('confirmDelBody1')} <code>data/deleted-rangers/</code><br />
              {e('confirmDelBody2')} <code>public/rangers/</code> {e('confirmDelBody3')}
            </p>
            <div className="modal-actions">
              <button onClick={() => setConfirmDelete(null)} autoFocus>{e('cancel')}</button>
              <button className="danger" onClick={() => void doDelete(confirmDelete)}>{e('deleteBtn')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * ชื่อในรายชื่อด้านซ้าย — ชื่อที่พิมพ์เองใน ranger.json ชนะเสมอ
 * ถ้าชื่อที่บันทึกไว้เป็นชื่อจากเกม (ตั้งอัตโนมัติ) ค่อยสลับตามภาษาที่เลือก
 */
function listName(r: RangerListItem): string {
  const g = r.gameNames
  if (!g) return r.name
  const auto = r.name === g.th || r.name === g.en || r.name === g.zh
  return auto ? gameName(g) ?? r.name : r.name
}

// ── ชิ้นส่วน UI เล็กๆ ──

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function VecField({ label, color, value, onChange }: {
  label: string; color: string; value: Vec2; onChange: (v: Vec2) => void
}) {
  return (
    <div className="vec-field">
      <div className="vec-head">
        <span className="dot" style={{ background: color }} />
        <span className="vec-label">{label}</span>
      </div>
      <div className="vec-inputs">
        <label>
          <span>x</span>
          <input type="number" step="0.1" value={value.x} onChange={ev => onChange({ ...value, x: Number(ev.target.value) })} />
        </label>
        <label>
          <span>y</span>
          <input type="number" step="0.1" value={value.y} onChange={ev => onChange({ ...value, y: Number(ev.target.value) })} />
        </label>
      </div>
    </div>
  )
}

/**
 * เวลาที่เหลือของท่าโจมตี นับจากเฟรมที่ปล่อยกระสุน ไปจนท่าเล่นจบ
 * ใช้เทียบว่ากระสุนจะจบก่อนหรือหลังตัวละครกลับไปยืนเฉยๆ
 */
function actionTailSec(
  assets: RangerAssets, cfg: RangerConfig, a: RangerConfig['actions'][ActionName], speed: number,
): number {
  const prof = SPEED_PROFILES[speed] ?? SPEED_PROFILES[1]
  const fps = cfg.fps || 30
  const castLen = [a.castPre, a.cast].reduce((n, c) => n + (c ? assets.sam.animations[c]?.length ?? 0 : 0), 0)
  const relLen = assets.sam.animations[a.release]?.length ?? 0

  let castSec = castLen / (fps * prof.cast)
  if (a.castSpeedCap && castSec > a.castSpeedCap) castSec = a.castSpeedCap
  const relSec = relLen / (fps * prof.release)
  const atRelease = a.releaseFrame <= castLen
    ? (castLen ? (a.releaseFrame / castLen) * castSec : 0)
    : castSec + (a.releaseFrame - castLen) / (fps * prof.release)
  return Math.max(0, castSec + relSec - atRelease)
}

const BASIS_KEY = { self: 'basisSelfBuff', front: 'basisFrontLine', rear: 'basisRearLine' } as const

/** สรุปว่ากฎตัดสินท่านี้ว่าอะไร และจะกินเวลาเท่าไหร่ — อ่านอย่างเดียว */
function ShotSummary({ plan, assets, kind, fps, speedMul, tailSec, speedOverride }: {
  plan: ShotPlan
  assets: RangerAssets
  kind: 'normal' | 'skill1' | 'skill2'
  fps: number
  speedMul: number
  tailSec: number
  speedOverride: number | null
}) {
  const move = assets.gameData?.moves[kind] ?? null
  const skill = kind === 'normal' ? null : assets.gameData?.skills[kind] ?? null
  const sec = (ticks: number) => ticks / (fps || 30) / speedMul

  const basis = skill?.basis
    ? e(BASIS_KEY[skill.basis.type as keyof typeof BASIS_KEY]) + (skill.basis.multiplier ? ` ×${skill.basis.multiplier}` : '')
    : null

  if (plan.type === 'melee') {
    return (
      <div className="cast-info">
        {e(plan.isBuff ? 'meleeBuff' : 'meleeAttack')}
        {move && <b>{e('fileFromData', { f: move.animationPart ?? '-' })}</b>}
        {basis && <i style={{ color: 'var(--dim)' }}>{e('basisNote', { b: basis })}</i>}
      </div>
    )
  }

  const bullet = assets.bullets[plan.suffix]
  const ov = bullet ? bulletOverride(bullet.geometry.fileKey) : undefined
  const type = e(plan.isBuff ? 'typeBuff' : plan.isInstant ? 'typeInstant' : 'typeFly')
  const aim = plan.isBuff ? '-' : e(plan.aimGround ? 'aimGround' : 'aimCenter')
  const total = sec(plan.travelTicks) + sec(plan.finishTicks)
  const over = total - tailSec

  return (
    <div className={'cast-info' + (over > 0.8 ? ' warn' : '')}>
      {type} · {e('fileWord')} {plan.suffix}
      <b>
        {plan.isInstant ? 'normal ' : e('flyWord') + ' '}{plan.travelTicks} {e('tickWord')} = {sec(plan.travelTicks).toFixed(2)}s
        {' → finish '}{plan.finishFrames}f = {sec(plan.finishTicks).toFixed(2)}s
      </b>
      <i style={{ color: over > 0.8 ? 'var(--warn)' : 'var(--dim)' }}>
        {e('tailLine', { t: tailSec.toFixed(2) })}
        {over > 0 ? e('bulletLate', { d: over.toFixed(2) }) : e('bulletEarly')}
      </i>
      <i style={{ color: 'var(--dim)' }}>
        {e('aimWord')}{aim}
        {move && ` · motion ${move.motion.type}${move.motion.enabled ? '' : e('offWord')} · ${move.motion.rotation}`}
        {move && ` · speed ${!plan.isInstant && speedOverride ? e('speedManualGame', { n: speedOverride, g: move.moveSpeed }) : move.moveSpeed} · start (${move.start.x}, ${move.start.y})`}
        {move?.hitPointRate !== null && move?.hitPointRate !== undefined && ` · hitPointRate ${move.hitPointRate}`}
      </i>
      {(basis || skill?.area) && (
        <i style={{ color: 'var(--dim)' }}>
          {basis && e('basisAimNote', { b: basis })}
          {skill?.area ? e('areaUnits', { pt: skill.area, u: (skill.area * PT_TO_WORLD).toFixed(0) }) : ''}
        </i>
      )}
      {plan.hasArc && <i style={{ color: 'var(--dim)' }}>{e('arcNote', { n: plan.arcPeak.toFixed(0) })}</i>}
      {bullet?.geometry.selfArc && <i style={{ color: 'var(--dim)' }}>{e('selfArcNote')}</i>}
      {ov && <i>{e('overrideNote', { json: JSON.stringify(ov) })}</i>}
    </div>
  )
}

/** โชว์ว่าท่านี้กินเวลาเท่าไหร่จริงที่ความเร็วปัจจุบัน — ตัวชี้วัดจังหวะเกม */
function CastInfo({ castFrames, releaseFrames, fps, speed, cap }: {
  castFrames: number; releaseFrames: number; fps: number; speed: number; cap: number | null
}) {
  const prof = SPEED_PROFILES[speed] ?? SPEED_PROFILES[1]
  let castSec = castFrames / (fps * prof.cast)
  if (cap && castSec > cap) castSec = cap
  const relSec = releaseFrames / (fps * prof.release)
  const total = castSec + relSec

  // ชี้ให้ตรงเฟสที่เป็นตัวถ่วงจริง — เพดานเวลาช่วยได้เฉพาะเฟสร่ายเท่านั้น
  const advice =
    castSec > 0.8 ? e('adviceCast')
    : relSec > 1.0 ? e('adviceRelease')
    : null

  return (
    <div className={'cast-info' + (total > 1.6 ? ' warn' : '')}>
      {e('castLine', { c: castFrames, cs: castSec.toFixed(2), r: releaseFrames, rs: relSec.toFixed(2) })}
      <b>{e('totalLine', { t: total.toFixed(2) })}</b>
      {total > 1.6 && advice && <i>{advice}</i>}
    </div>
  )
}

/** เติมธาตุ / ชนิด / ตำแหน่ง / ชื่อ จากข้อมูลเกม (ค่าที่ไม่มีในข้อมูลคงเดิม) */
function applyGameInfo(cfg: RangerConfig, info: GameInfo): RangerConfig {
  const g = info.suggest
  const category = g.category ?? cfg.category
  const role = g.role && ROLES[g.role].category === category ? g.role : ROLES[cfg.role].category === category ? cfg.role : rolesOf(category)[0]
  return {
    ...cfg,
    // 儲存名稱以 RangerBook 繁中為優先；手動命名則不覆蓋。
    name: (!cfg.name || cfg.name === cfg.id || cfg.name === info.name.th || cfg.name === info.name.en)
      ? properNameZhTw(cfg.id) ?? info.name.zh ?? info.name.th ?? info.name.en ?? cfg.name
      : cfg.name,
    element: g.element ?? cfg.element,
    category,
    role,
  }
}
