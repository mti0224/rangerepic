// ====================================================
// RangerEditor — โหมดสร้าง/ตั้งค่าRanger
//   ซ้าย  : ราย名稱Rangerในเครื่อง + ปุ่มโหลดตัวใหม่จาก lerico
//   กลาง  : canvas (ลากจุด) + แถบไทม์ไลน์ + ปุ่มความ快
//   ขวา   : แท็บตั้งค่า
// ทุกอย่างเซฟลง public/rangers/<id>/ranger.json ผ่าน dev API
// ====================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EditorStage, { type AnchorHandle } from './EditorStage'
import { loadRangerAssets, type RangerAssets } from '@/lib/rangerAssets'
import { SPEED_PROFILES } from '@/lib/samPlayer'
import { CATEGORY_LABEL, ELEMENT_LABEL, ELEMENTS, randomStats, ROLES, rolesOf, STAT_LABEL, type Category } from '@/lib/rangerClass'
import SkillEditor from './SkillEditor'
import { newPassive, PASSIVES, PASSIVE_TYPES, type PassiveDef, type PassiveType } from '@/lib/passives'
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

const TAB_LABELS: Record<Tab, string> = {
  general: '一般',
  portrait: '頭像',
  clips: '動畫片段',
  anchors: '錨點',
  attack: '普通攻擊',
  skill1: '技能 1',
  skill2: '技能 2',
  cutin: '技能過場',
}

const ANCHOR_COLORS = {
  ground: '#4ade80',
  hitPoint: '#f87171',
  overhead: '#fbbf24',
  muzzle: '#60a5fa',
  impact: '#f472b6',
  finish: '#f97316',
  walk: '#34d399',
}

// ── ระยะห่างระหว่างตัวเรา與หุ่นเป้า ──
// 個 Rangerละครกว้างเฉลี่ย ~138 單位 (กว้างสุด 203) ระยะ 480 จึงเหลือช่องว่างพอให้
// เห็น投射物飛行จริงๆ แม้เป็นตัวใหญ่ — ค่านี้จำไว้ในเครื่อง ตั้งครั้งเดียวใช้ได้ตลอด
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
  const [rangers, setRangers] = useState<RangerListItem[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [assets, setAssets] = useState<RangerAssets | null>(null)
  /** ข้อมูลจากเกม (public/rangers/<id>/stats.json) — ยังไม่เคยโหลดได้ = null */
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [config, setConfig] = useState<RangerConfig | null>(null)
  const [tab, setTab] = useState<Tab>('anchors')
  /** เมนู技能過場: กำลังแก้ของสกิลไหน */
  const [cutinSlot, setCutinSlot] = useState<SkillSlot>('skill1')
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [status, setStatus] = useState('')
  const [dirty, setDirty] = useState(false)
  const [newId, setNewId] = useState('')
  const [targetDistance, setTargetDistance] = useState(loadTargetDistance)
  /** กล่องยืนยันการ已刪除 (เ關閉อยู่ = id ที่จะ刪除) */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [scene, setScene] = useState<PreviewScene | null>(null)
  const frameRef = useRef({ frame: 0, total: 0 })
  const [frameView, setFrameView] = useState({ frame: 0, total: 0 })

  // ── ราย名稱Ranger ──
  // เก็บใน ref ด้วย เพื่อให้ effect โหลดRangerอ่านราย名稱ล่าสุดได้
  // โดยไม่ต้องผูก rangers เป็น dependency (ไม่งั้นกด Save ทีนึงจะรีโหลด asset ใหม่ทั้งชุด)
  const rangersRef = useRef<RangerListItem[]>([])
  rangersRef.current = rangers

  const refreshList = useCallback(async () => {
    try {
      const list = await listRangers()
      rangersRef.current = list
      setRangers(list)
      return list
    } catch (e) {
      setStatus(String(e))
      return []
    }
  }, [])
  useEffect(() => { void refreshList() }, [refreshList])

  // ── โหลดRangerที่เลือก ──
  useEffect(() => {
    if (!selected) return
    let dead = false
    let loaded: RangerAssets | null = null
    setStatus('載入中...')
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
        // 資料庫已有繁中名稱時，自動名稱優先顯示繁中；使用者手動命名則保留。
        const zhName = properNameZhTw(selected)
        const autoNamed = !base.name || base.name === selected || base.name === info?.name.th || base.name === info?.name.en
        const localizedBase = zhName && autoNamed ? { ...base, name: zhName } : base
        setConfig(saved || !info ? localizedBase : applyGameInfo(localizedBase, info))
        setDirty(!saved)
        const bulNote = bullets.length ? ' · 投射物 ' + bullets.join(', ') : ' · 無投射物（近戰）'
        setStatus((saved ? '已載入儲存設定' : '新 Ranger — 尚未設定') + bulNote)
      } catch (e) {
        if (!dead) setStatus('載入失敗: ' + String(e))
      }
    })()
    // ไม่ปลด asset ตรงนี้ — 個 Rangerเก่ายังถูกวาดอยู่จนกว่าฉากใหม่จะเข้าที่
    // (ปลด快ไปแล้ว drawImage จะ throw กลางคัน ทำให้ transform ค้างและภาพซ้อน)
    return () => { dead = true; void loaded }
  }, [selected])

  // ── สร้าง player ใหม่เมื่อเปลี่ยน動畫片段/ความ快 (ไม่ผูก與การลากจุด) ──
  const action = ACTION_NAMES.includes(tab as ActionName) ? (tab as ActionName) : null
  const actionCfg = action && config ? config.actions[action] : null
  const clipKey = action
    ? `${actionCfg?.castPre ?? ''}|${actionCfg?.cast ?? ''}|${actionCfg?.release ?? ''}|${actionCfg?.castSpeedCap ?? ''}`
    : config?.clips.idle ?? ''

  // สร้างฉากใหม่เมื่อเปลี่ยนRangerค่อยปลด asset 個 Rangerเก่าทิ้ง
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

  // 關閉หน้าแล้วคืน單位ความจำให้หมด
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
  // แท็บ錨點 = โหมดตั้งหมุดบนภาพ (ไม่ล็อก) ที่เหลือ = โหมดยืนจริงเหมือนในแมพ
  const groundLocked = tab !== 'anchors'
  useEffect(() => {
    if (!scene) return
    scene.targetDistance = targetDistance
    scene.showTarget = showTarget
    scene.groundLocked = groundLocked
    scene.showPlan = !!action
    scene.planLabels = false   // หมุดที่ลากได้อยู่職業เดียวกันแล้ว
  }, [scene, targetDistance, showTarget, groundLocked, action, manual])

  useEffect(() => {
    try { localStorage.setItem(TARGET_DISTANCE_KEY, String(targetDistance)) } catch { /* โหมดส่วนตัว — ไม่จำก็ได้ */ }
  }, [targetDistance])

  // เปลี่ยน動畫片段/ความ快 → กลับไปเล่นวนแบบแก้ไข
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

  // ── 職業發射點/จุดตกที่ใช้อยู่จริงตอนนี้ (ใน單位เดียว與 muzzle / impactOffset) ──
  // โหมดอัตโนมัติ: แปลงจากแผน投射物設定ที่คำนวณได้ → ลากหมุดแล้วสลับเป็น "ตั้งเอง" โดยเริ่มจากค่านี้
  // ภาพจึงไม่กระโดดตอนเริ่มลาก
  const livePoints = useMemo(() => {
    if (!scene || !action || !config || !plan || plan.type !== 'shot') return null
    const a = config.actions[action]
    if (manual) return { muzzle: a.muzzle, impactOffset: a.impactOffset, plan }
    // 站立點ของผู้โจมตี "ตอนร่าย" — ท่าที่เดินเข้าไปคือจุดหยุด
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

  // ── หมุดที่ลากได้ ขึ้น與แท็บที่เ關閉อยู่ ──
  const handles = useMemo<AnchorHandle[]>(() => {
    if (!config) return []
    if (tab === 'anchors') {
      return [
        { key: 'anchors.ground', label: '站立點（腳）', color: ANCHOR_COLORS.ground, value: config.anchors.ground, space: 'sprite' },
        { key: 'anchors.hitPoint', label: '受擊點', color: ANCHOR_COLORS.hitPoint, value: config.anchors.hitPoint, space: 'self' },
        { key: 'anchors.overhead', label: '頭頂', color: ANCHOR_COLORS.overhead, value: config.anchors.overhead, space: 'self' },
      ]
    }
    if (action) {
      const list: AnchorHandle[] = []
      const ap = config.actions[action].approach
      if (ap?.enabled) {
        list.push({ key: `actions.${action}.approach.stopOffset`, label: '停止移動點', color: ANCHOR_COLORS.walk, value: ap.stopOffset, space: 'target' })
      }
      if (!livePoints) return list
      const p = livePoints.plan
      const suffix = manual ? '' : '（自動）'
      // ท่าไม่บินเกิดที่จุดตกเลย 發射點ไม่มีผล จึงไม่ให้ลาก
      if (!p.isInstant) {
        list.push({ key: `actions.${action}.muzzle`, label: '發射點' + suffix, color: ANCHOR_COLORS.muzzle, value: livePoints.muzzle, space: 'self' })
      }
      const split = config.actions[action].finishSplit
      list.push({
        key: `actions.${action}.impactOffset`,
        label: (split ? 'normal 終點' : p.isBuff ? '增益生成點' : p.isInstant ? '效果生成點' : '命中點') + suffix,
        color: ANCHOR_COLORS.impact,
        value: livePoints.impactOffset,
        space: p.isBuff ? 'self' : 'target',
      })
      if (split) {
        list.push({
          key: `actions.${action}.finishOffset`,
          label: 'finish 點（爆炸）',
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

  // ── 儲存 ──
  const save = async () => {
    if (!config) return
    try {
      await saveRangerConfig(config)
      setDirty(false)
      setStatus('已儲存至 public/rangers/' + config.id + '/ranger.json')
      void refreshList()
    } catch (e) {
      setStatus('儲存失敗: ' + String(e))
    }
  }

  // ── อนุมัติ: พร้อมเล่น → แสดงในหน้าจัดทีม (儲存ทันที รวมการแก้ที่ยังไม่ได้儲存ด้วย) ──
  const toggleApprove = async () => {
    if (!config) return
    const next = { ...config, approved: !config.approved }
    try {
      await saveRangerConfig(next)
      setConfig(next)
      setDirty(false)
      setStatus(next.approved ? '已核准 — 此 Ranger 可遊玩，會顯示於隊伍編輯頁' : '已取消核准 — 此 Ranger 不會顯示於隊伍編輯頁')
      void refreshList()
    } catch (e) {
      setStatus('核准失敗: ' + String(e))
    }
  }

  // ── 已刪除 (หลังกดยืนยัน): ย้ายโฟลเดอร์ไปถังขยะล้างตัวที่เลือกอยู่ ──
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
      setStatus(`已刪除 ${id} — 已移至 ${r.movedTo} (移回 public/rangers/ 即可復原)`)
      void refreshList()
    } catch (e) {
      setStatus('刪除失敗: ' + String(e))
    }
  }

  // ── โหลดRangerตัวใหม่จาก lerico ──
  const refreshData = async () => {
    setRefreshing(true)
    setStatus('正在從 lerico 取得遊戲資料…')
    try {
      const r = await refreshGameData()
      const stale = Object.values(r.sources).some(v => v !== 'api')
      const renamed = r.renamed ?? {}
      const nRenamed = Object.keys(renamed).length
      if (r.error) setStatus('載入資料失敗: ' + r.error)
      else setStatus(`已更新遊戲資料 ${r.ok.length} 個 Ranger${nRenamed ? ` · 依遊戲資料命名 ${nRenamed} 個 Ranger` : ''}${r.missing.length ? ' · 找不到 ' + r.missing.join(', ') : ''}${stale ? ' · (部分使用舊快取 — 上游 API 發生問題)' : ''}`)
      // 個 Rangerที่เ關閉อยู่ถูกเปลี่ยน名稱 → ใช้名稱ใหม่ในหน้าแก้ด้วย (ไม่งั้นกด Save名稱เก่าทับกลับ)
      if (selected && renamed[selected]) setConfig(c => (c && c.id === selected ? { ...c, name: renamed[selected] } : c))
      if (selected) setGameInfo(await loadGameInfo(selected))
      await refreshList()
    } catch (e) {
      setStatus('載入資料失敗: ' + String(e))
    } finally {
      setRefreshing(false)
    }
  }

  const addRanger = async () => {
    const id = newId.trim().toLowerCase()
    if (!id) return
    setStatus('正在下載 ' + id + '（來源：lerico）...')
    try {
      const r = await fetchRangerAssets(id)
      if (!r.ok) throw new Error('找不到此 Ranger')
      const kb = (r.written ?? []).reduce((s, w) => s + w.bytes, 0) / 1024
      setStatus('下載 ' + id + ' 完成（' + kb.toFixed(0) + ' KB）')
      setNewId('')
      await refreshList()
      setSelected(id)
    } catch (e) {
      setStatus('載入失敗: ' + String(e))
    }
  }

  const clipNames = assets ? assets.sam.animNames.filter(n => n !== '_all') : []
  const availableBullets = assets ? Object.keys(assets.bullets).sort() : []

  return (
    <div className="editor">
      {/* ───────── ซ้าย: ราย名稱 ───────── */}
      <aside className="panel left">
        <h2>Ranger</h2>
        <div className="refresh-row">
          <button disabled={refreshing} onClick={() => void refreshData()}
            title="重新從 lerico API 取得所有 Ranger 的屬性、類型、名稱與技能圖示">
            {refreshing ? '正在載入資料…' : '🔄 重新載入資料'}
          </button>
        </div>
        <div className="add-row">
          <input
            value={newId}
            onChange={e => setNewId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void addRanger() }}
            placeholder="例如 u1607e-sh"
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
                <img src={'/rangers/' + r.id + '/thumb.png'} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
                <span>
                  <b>{properNameZhTw(r.id) ?? r.name}</b>
                  {starImageUrl(r.grade, evolutionOf(r.id)) && (
                    <img className="stars" src={starImageUrl(r.grade, evolutionOf(r.id))!} alt={`${r.grade} 星`} title={`${r.grade} 星 · ${EVOLUTION_LABEL[evolutionOf(r.id)]}`} />
                  )}
                  <i className={r.approved ? 'approved' : ''}>{r.approved ? '✓ 可遊玩' : r.configured ? '已設定' : '尚未設定'}</i>
                </span>
              </button>
            </li>
          ))}
          {!rangers.length && <li className="empty">尚無 Ranger — 請在上方輸入 ID 下載</li>}
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
                onChange={e => { setPlaying(false); scene?.seek(Number(e.target.value)) }}
              />
              <span className="frame-num">{frameView.frame} / {frameView.total}</span>
              <div className="speeds">
                {[1, 2, 3].map(s => (
                  <button key={s} className={s === speed ? 'sel' : ''} onClick={() => setSpeed(s)}>x{s}</button>
                ))}
              </div>
              {action && <button className="fire" onClick={fire}>⚔ 測試攻擊</button>}
            </div>
            <div className="hint">
              {groundLocked
                ? '實際站立模式 — 腳部會像戰場中一樣鎖定在地面線上'
                : '錨點設定模式 — 將綠色錨點拖曳到角色腳部'}
              {' · '}Shift = 鎖定整數 · 拖曳背景 = 平移畫面 · 滾輪 = 縮放
            </div>
          </>
        ) : (
          <div className="placeholder">請從左側清單選擇 Ranger</div>
        )}
      </main>

      {/* ───────── ขวา: ตั้งค่า ───────── */}
      <aside className="panel right">
        {config && assets ? (
          <>
            <div className="tabs">
              {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
                <button key={t} className={t === tab ? 'sel' : ''} onClick={() => setTab(t)}>
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>

            <div className="tab-body">
              {tab === 'general' && (
                <>
                  {gameInfo ? (
                    <div className="cast-info">
                      遊戲資料：<b>{properNameZhTw(config.id) ?? gameInfo.name.en ?? gameInfo.name.th}</b>
                      <div className="grade-row">
                        {starImageUrl(gameInfo.grade, evolutionOf(config.id)) && <img className="stars" src={starImageUrl(gameInfo.grade, evolutionOf(config.id))!} alt="" />}
                        <span>星級 {gameInfo.grade ?? '?'} 星 · 進化類型 <b>{EVOLUTION_LABEL[evolutionOf(config.id)]}</b></span>
                      </div>
                      {gameInfo.suggest.element && <>屬性 {ELEMENT_LABEL[gameInfo.suggest.element]}</>}
                      {gameInfo.suggest.category && <> · 類型 {CATEGORY_LABEL[gameInfo.suggest.category]}</>}
                      {gameInfo.suggest.role && <> · 建議 {ROLES[gameInfo.suggest.role].label}</>}
                      <div style={{ marginTop: 6 }}>
                        <button onClick={() => setConfigAndDirty(c => applyGameInfo(c, gameInfo))}>套用遊戲資料</button>
                      </div>
                    </div>
                  ) : (
                    <p className="note">尚無遊戲資料（屬性／類型／技能圖示）— 上游 API 可用時請按「重新載入資料」</p>
                  )}
                  <Field label="名稱">
                    <input value={config.name} onChange={e => edit('name', e.target.value)} />
                  </Field>
                  <Field label="屬性">
                    <select value={config.element} onChange={e => edit('element', e.target.value)}>
                      {ELEMENTS.map(x => <option key={x} value={x}>{ELEMENT_LABEL[x]}</option>)}
                    </select>
                  </Field>
                  <Field label="類型">
                    <select value={config.category} onChange={e => {
                      const c = e.target.value as Category
                      edit('category', c)
                      // 職業ต้องอยู่ใน類型เดียวกัน — เปลี่ยน類型แล้วเลือก職業แรกของ類型นั้นให้
                      if (ROLES[config.role].category !== c) edit('role', rolesOf(c)[0])
                    }}>
                      {(Object.keys(CATEGORY_LABEL) as Category[]).map(c => (
                        <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="職業">
                    <select value={config.role} onChange={e => edit('role', e.target.value)}>
                      {rolesOf(config.category).map(r => <option key={r} value={r}>{ROLES[r].label}</option>)}
                    </select>
                    <span className="note" style={{ margin: 0 }}>{ROLES[config.role].hint}</span>
                  </Field>
                  <h3>能力值</h3>
                  <div style={{ marginBottom: 8 }}>
                    <button className="primary" style={{ width: '100%' }} onClick={() => edit('stats', randomStats(config.role))}>
                      🎲 隨機產生適合{ROLES[config.role].label}
                    </button>
                  </div>
                  <div className="stats-grid">
                    {(Object.keys(STAT_LABEL) as (keyof typeof config.stats)[]).map(k => (
                      <label key={k}>
                        <span>{STAT_LABEL[k]}</span>
                        <input
                          type="number"
                          value={config.stats[k]}
                          onChange={e => edit('stats.' + k, Number(e.target.value))}
                        />
                      </label>
                    ))}
                  </div>
                  <h3>特殊被動</h3>
                  <p className="note">整場戰鬥持續生效，不需施放且不消耗 Cost；與職業固有能力分開計算</p>
                  {(() => {
                    const list: PassiveDef[] = config.passives ?? []
                    const setList = (next: PassiveDef[]) => edit('passives', next)
                    const addable = PASSIVE_TYPES.filter(t => !list.some(p => p.type === t))
                    return (
                      <>
                        <div className="effect-list">
                          {list.length === 0 && <p className="note">尚無被動效果 — 可從下方清單新增</p>}
                          {list.map((p, i) => {
                            const def = PASSIVES[p.type]
                            return (
                              <div key={p.type} className="effect-row">
                                <span className="effect-name">
                                  {def.label}
                                  <small className="effect-note">{def.note}</small>
                                </span>
                                <label className="effect-param">
                                  <input type="number" min={0} max={def.max} step={5} value={p.pct}
                                    onChange={e => {
                                      const n = Math.round(Number(e.target.value))
                                      const pct = Number.isFinite(n) ? Math.max(0, Math.min(def.max, n)) : def.default
                                      setList(list.map((x, j) => (j === i ? { ...x, pct } : x)))
                                    }} />
                                  <span>%</span>
                                </label>
                                <button className="effect-x" title="刪除" onClick={() => setList(list.filter((_, j) => j !== i))}>×</button>
                              </div>
                            )
                          })}
                        </div>
                        {addable.length > 0 && (
                          <select className="effect-add" value="" onChange={e => {
                            if (!e.target.value) return
                            setList([...list, newPassive(e.target.value as PassiveType)])
                          }}>
                            <option value="">+ 新增被動…</option>
                            {addable.map(t => <option key={t} value={t}>{PASSIVES[t].label}</option>)}
                          </select>
                        )}
                      </>
                    )
                  })()}
                  <div className="meta">fps {config.fps} · {assets.sam.animNames.length - 1} 動畫片段 · {assets.sam.images.length} Sprite</div>
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
                  <p className="note">將檔案中的動畫片段對應到遊戲所需狀態</p>
                  {(Object.keys(config.clips) as (keyof typeof config.clips)[]).map(k => (
                    <Field key={k} label={k}>
                      <select
                        value={config.clips[k] ?? ''}
                        onChange={e => edit('clips.' + k, e.target.value || null)}
                      >
                        <option value="">— 無 —</option>
                        {clipNames.map(n => <option key={n} value={n}>{n} ({assets.sam.animations[n].length}f)</option>)}
                      </select>
                    </Field>
                  ))}
                </>
              )}

              {tab === 'anchors' && (
                <>
                  <p className="note">
                    <b>站立點</b> = 指定圖片中腳部的位置；拖到實際腳部後，虛線會顯示對齊基準<br />
                    切換到其他分頁或戰場後，角色會自動位移，使腳部準確對齊站位格<br />
                    <b>受擊點</b> 與 <b>頭頂</b> 皆以腳部為基準，因此會一起移動
                  </p>
                  {(['ground', 'hitPoint', 'overhead'] as const).map(k => (
                    <VecField
                      key={k}
                      label={k === 'ground' ? '站立點' : k === 'hitPoint' ? '受擊點' : '頭頂'}
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
                        <h3 style={{ marginTop: 0 }}>戰鬥技能設定</h3>
                        <SkillEditor
                          skill={config.skills[action]}
                          rangerId={config.id}
                          info={gameInfo?.skills[action] ?? null}
                          onChange={next => edit('skills.' + action, next)}
                        />
                        <h3>技能施放過場</h3>
                        <div className="cutin-actions">
                          <span className="note" style={{ margin: 0 }}>{config.cutins?.[action]?.enabled ? '● 已設定過場' : '○ 尚未設定過場'}</span>
                          <button onClick={() => { setCutinSlot(action); setTab('cutin') }}>🎬 前往過場編輯</button>
                        </div>
                        <h3>動畫</h3>
                      </>
                    )}
                    {actionCfg.castPre && (
                      <Field label="施放前段 1（3 段式動畫）">
                        <select value={actionCfg.castPre} onChange={e => edit('actions.' + action + '.castPre', e.target.value || null)}>
                          <option value="">— 無 —</option>{clipOpts}
                        </select>
                      </Field>
                    )}
                    <Field label="施放動畫（cast）">
                      <select value={actionCfg.cast ?? ''} onChange={e => edit('actions.' + action + '.cast', e.target.value || null)}>
                        <option value="">— 無 —</option>{clipOpts}
                      </select>
                    </Field>
                    <Field label="釋放動畫（release）">
                      <select value={actionCfg.release} onChange={e => edit('actions.' + action + '.release', e.target.value)}>
                        {clipOpts}
                      </select>
                    </Field>

                    <Field label="投射物發射幀（readyLen）">
                      <div className="inline">
                        <input type="number" value={actionCfg.releaseFrame}
                          onChange={e => edit('actions.' + action + '.releaseFrame', Number(e.target.value))} />
                        <button onClick={() => edit('actions.' + action + '.releaseFrame', frameView.frame)}>
                          使用此幀 ({frameView.frame})
                        </button>
                      </div>
                    </Field>
                    {(() => {
                      const suggest = readyLengthUntilVanish(assets.sam, actionCfg.castPre, actionCfg.cast)
                      if (suggest === actionCfg.releaseFrame || suggest === 0) return null
                      return (
                        <div className="cast-info warn">
                          {castLen > suggest
                            ? `施放階段共 ${castLen}f，但最後 ${castLen - suggest}f 角色已消失`
                            : '依規則應在施放→釋放的交界點'}
                          <i>
                            <button onClick={() => edit('actions.' + action + '.releaseFrame', suggest)}>
                              使用規則值 ({suggest})
                            </button>
                          </i>
                        </div>
                      )
                    })()}

                    <Field label="施放階段時間上限（秒）">
                      <input type="number" step="0.1" placeholder="不限" value={actionCfg.castSpeedCap ?? ''}
                        onChange={e => edit('actions.' + action + '.castSpeedCap', e.target.value === '' ? null : Number(e.target.value))} />
                    </Field>

                    <CastInfo
                      castFrames={castLen}
                      releaseFrames={assets.sam.animations[actionCfg.release]?.length ?? 0}
                      fps={config.fps}
                      speed={speed}
                      cap={actionCfg.castSpeedCap}
                    />

                    <h3>攻擊前先接近目標</h3>
                    <label className="check">
                      <input type="checkbox" checked={actionCfg.approach.enabled}
                        onChange={e => edit('actions.' + action + '.approach.enabled', e.target.checked)} />
                      施放前先移動至目標附近（近戰／近距離技能）
                    </label>
                    {actionCfg.approach.enabled && (() => {
                      const ap = actionCfg.approach
                      const walkDist = Math.hypot(approachOff.x, approachOff.y)
                      const walkSec = walkDist / Math.max(1, ap.speed) / (SPEED_PROFILES[speed]?.release ?? 1)
                      return (
                        <>
                          <VecField label="停止移動點（以目標站立點為基準；x 為負 = 目標前方）" color={ANCHOR_COLORS.walk}
                            value={ap.stopOffset} onChange={v => edit('actions.' + action + '.approach.stopOffset', v)} />
                          <Field label="停止點 X 軸偏移（負值 = 站在目標前方；越負距離越遠）">
                            <div className="inline">
                              <input type="range" min={-800} max={300} step={1} value={ap.stopOffset.x}
                                onChange={e => edit('actions.' + action + '.approach.stopOffset', { ...ap.stopOffset, x: Number(e.target.value) })} />
                              <input type="number" step={1} value={ap.stopOffset.x} style={{ maxWidth: 76 }}
                                onChange={e => edit('actions.' + action + '.approach.stopOffset', { ...ap.stopOffset, x: Number(e.target.value) || 0 })} />
                              <button title="恢復預設值" disabled={ap.stopOffset.x === DEFAULT_APPROACH.stopOffset.x}
                                onClick={() => edit('actions.' + action + '.approach.stopOffset', { ...ap.stopOffset, x: DEFAULT_APPROACH.stopOffset.x })}>↺</button>
                            </div>
                            {(() => {
                              const limit = -Math.round(frontLineGap())
                              return (
                                <div className="inline">
                                  <button disabled={ap.stopOffset.x === limit}
                                    title="戰場上我方最前排與敵方最前排之間的距離"
                                    onClick={() => edit('actions.' + action + '.approach.stopOffset', { ...ap.stopOffset, x: limit })}>
                                    [ 前排碰撞限制 ]
                                  </button>
                                  <span className="meta">x = {limit} · 我方最前排 ↔ 敵方最前排</span>
                                </div>
                              )
                            })()}
                          </Field>
                          <Field label="移動速度（單位／秒）">
                            <div className="inline">
                              <input type="range" min={50} max={2000} step={10} value={ap.speed}
                                onChange={e => edit('actions.' + action + '.approach.speed', Number(e.target.value))} />
                              <input type="number" min={1} step={10} value={ap.speed} style={{ maxWidth: 76 }}
                                onChange={e => edit('actions.' + action + '.approach.speed', Math.max(1, Number(e.target.value) || 1))} />
                            </div>
                            <div className="inline">
                              {([['慢', 300], ['一般', 600], ['快', 1000], ['衝刺', 1800]] as const).map(([label, v]) => (
                                <button key={label} className={ap.speed === v ? 'sel' : ''}
                                  onClick={() => edit('actions.' + action + '.approach.speed', v)}>
                                  {label} {v}
                                </button>
                              ))}
                            </div>
                          </Field>
                          <label className="check">
                            <input type="checkbox" checked={ap.returnHome}
                              onChange={e => edit('actions.' + action + '.approach.returnHome', e.target.checked)} />
                            攻擊結束後返回原位
                          </label>
                          <p className="note">
                            移動 {walkDist.toFixed(0)} 單位 ≈ {walkSec.toFixed(2)}s{ap.returnHome ? ` · 往返 ${(walkSec * 2).toFixed(2)}s` : ''}
                            {!config.clips.walk && ' · ⚠ 沒有走路動畫，將使用待機動畫（可在「動畫片段」分頁設定）'}
                          </p>
                        </>
                      )
                    })()}

                    <h3>投射物設定</h3>
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
                        <p className="note">此動作不飛行（直接生成於目標）— 速度不影響，持續時間取決於 normal 動畫長度</p>
                      ) : (() => {
                        const base = gameMove.moveSpeed > 0 ? gameMove.moveSpeed : PROJECTILE_FALLBACK_SPEED
                        const cur = actionCfg.moveSpeedOverride ?? base
                        const set = (n: number | null) => edit('actions.' + action + '.moveSpeedOverride',
                          n === null || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 10) / 10)
                        const perSec = cur * PROJECTILE_SPEED_SCALE * (config.fps || 30)
                        return (
                          <Field label={'投射物速度' + (actionCfg.moveSpeedOverride === null ? '（來自遊戲資料）' : '（自訂）')}>
                            <div className="inline">
                              <input type="range" min={1} max={Math.max(150, Math.ceil(base * 3))} step={1} value={cur}
                                onChange={e => set(Number(e.target.value))} />
                              <input type="number" min={1} step={1} value={cur} style={{ maxWidth: 70 }}
                                onChange={e => set(Number(e.target.value))} />
                            </div>
                            <span className="note" style={{ margin: 0 }}>
                              ≈ {perSec.toFixed(0)} 單位／秒 · 飛抵目標 {plan.travelTicks} tick = {(plan.travelTicks / (config.fps || 30) / (SPEED_PROFILES[speed]?.release ?? 1)).toFixed(2)}s
                            </span>
                            {actionCfg.moveSpeedOverride !== null && (
                              <button onClick={() => set(null)}>恢復遊戲資料值 ({base})</button>
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
                        <Field label="投射物方向">
                          <label className="check">
                            <input type="checkbox" checked={tilt} onChange={e => edit('actions.' + action + '.aimTilt', e.target.checked)} />
                            依命中點傾斜（攻擊較高／較低目標時，投射物朝向目標；弧線會隨軌跡旋轉）
                          </label>
                          <label className="check" style={tilt ? undefined : { opacity: 0.45, cursor: 'not-allowed' }}
                            title={tilt ? '' : '請先勾選「依命中點傾斜」'}>
                            <input type="checkbox" disabled={!tilt} checked={tilt && actionCfg.aimTiltFinish === true}
                              onChange={e => edit('actions.' + action + '.aimTiltFinish', e.target.checked)} />
                            finish（抵達目標時爆炸）也套用傾斜
                          </label>
                          {tilt && (
                            <div className="inline">
                              <span className="note" style={{ margin: 0, whiteSpace: 'nowrap' }}>額外旋轉</span>
                              <input type="range" min={-180} max={180} step={1} value={off} onChange={e => setOff(Number(e.target.value))} />
                              <input type="number" min={-180} max={180} step={1} value={off} style={{ maxWidth: 70 }} onChange={e => setOff(Number(e.target.value))} />
                              <span className="note" style={{ margin: 0 }}>°</span>
                              <button disabled={off === 0} onClick={() => setOff(0)}>重設</button>
                            </div>
                          )}
                        </Field>
                      )
                    })()}

                    <Field label="發射點／落點">
                      <select
                        value={manual ? 'manual' : 'auto'}
                        disabled={!gameMove}
                        onChange={e => edit('actions.' + action + '.positioning', e.target.value)}
                      >
                        <option value="auto">依遊戲資料計算（Kiwi 規則）</option>
                        <option value="manual">手動設定（拖曳錨點）</option>
                      </select>
                    </Field>
                    {!gameMove && <p className="note">此動作沒有遊戲資料 — 必須手動設定位置與投射物</p>}
                    {manual && (
                      <>
                        <VecField label="發射點（以自身站立點為基準）" color={ANCHOR_COLORS.muzzle} value={actionCfg.muzzle}
                          onChange={v => edit('actions.' + action + '.muzzle', v)} />
                        <VecField label="落點（以目標站立點為基準）" color={ANCHOR_COLORS.impact} value={actionCfg.impactOffset}
                          onChange={v => edit('actions.' + action + '.impactOffset', v)} />
                      </>
                    )}
                    {plan && plan.type === 'shot' && (
                      <>
                        <label className="check">
                          <input type="checkbox" checked={actionCfg.finishSplit}
                            onChange={e => {
                              // เ關閉ครั้งแรก: เริ่มจุด finish ที่ปลายทาง投射物ตอนนี้ ภาพจะไม่กระโดด
                              if (e.target.checked && livePoints) edit('actions.' + action + '.finishOffset', { ...livePoints.impactOffset })
                              edit('actions.' + action + '.finishSplit', e.target.checked)
                            }} />
                          將 finish（爆炸）位置與 normal（投射物）終點分開
                        </label>
                        {actionCfg.finishSplit && (
                          <>
                            <VecField label={'finish 點（' + (plan.isBuff ? '以施放者站立點為基準' : '以目標站立點為基準') + '）'}
                              color={ANCHOR_COLORS.finish} value={actionCfg.finishOffset}
                              onChange={v => edit('actions.' + action + '.finishOffset', v)} />
                            {plan.finishFrames === 0 && <p className="note">⚠ 此動作的投射物檔案沒有 finish 動畫，因此此位置不會顯示效果</p>}
                          </>
                        )}
                      </>
                    )}
                    <Field label="測試目標距離">
                      <input type="number" value={targetDistance} onChange={e => setTargetDistance(Number(e.target.value))} />
                    </Field>

                    {!gameMove && (
                      <>
                        <h3>投射物（自訂）</h3>
                        {availableBullets.length === 0 ? (
                          <p className="note">沒有投射物檔案 — 視為近戰，目標會在發射幀立即受擊</p>
                        ) : (
                          <Field label="投射物檔案">
                            <select
                              value={actionCfg.projectile?.asset ?? ''}
                              onChange={e => edit('actions.' + action + '.projectile', e.target.value
                                ? {
                                    asset: e.target.value,
                                    mode: actionCfg.projectile?.mode ?? 'flight',
                                    path: actionCfg.projectile?.path ?? 'straight',
                                    arcHeight: actionCfg.projectile?.arcHeight ?? null,
                                    speed: actionCfg.projectile?.speed ?? DEFAULT_PROJECTILE_SPEED,
                                    rotate: actionCfg.projectile?.rotate ?? 'none',
                                    fitFlight: actionCfg.projectile?.fitFlight ?? false,
                                  }
                                : null)}
                            >
                              <option value="">無（近戰）</option>
                              {availableBullets.map(b => (
                                <option key={b} value={b}>{b}{b === DEFAULT_BULLET[action] ? '（預設值）' : ''}</option>
                              ))}
                            </select>
                          </Field>
                        )}
                        {actionCfg.projectile && (
                          <>
                            <Field label="到達目標方式">
                              <select value={actionCfg.projectile.mode}
                                onChange={e => edit('actions.' + action + '.projectile.mode', e.target.value)}>
                                <option value="flight">從發射點飛行</option>
                                <option value="atTarget">不飛行（直接生成於目標）</option>
                              </select>
                            </Field>
                            <Field label="軌跡">
                              <select value={actionCfg.projectile.path}
                                onChange={e => edit('actions.' + action + '.projectile.path', e.target.value)}>
                                <option value="straight">直線</option>
                                <option value="arc">拋物線</option>
                              </select>
                            </Field>
                            <Field label="速度（unit／秒）">
                              <input type="number" value={actionCfg.projectile.speed}
                                onChange={e => edit('actions.' + action + '.projectile.speed', Number(e.target.value))} />
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
                {dirty ? '儲存' : '已儲存'}
              </button>
              <button onClick={() => downloadConfig(config)}>匯出設定</button>
            </div>
            <div className="save-bar">
              <button
                className={config.approved ? 'approve on' : 'approve'}
                onClick={() => void toggleApprove()}
                title={config.approved ? '按下可取消核准；此 Ranger 將不再顯示於隊伍編輯頁' : '標記此 Ranger 已設定完成並可遊玩；會立即儲存並顯示於隊伍編輯頁'}
              >
                {config.approved ? '✓ 已核准（可遊玩）' : '✓ 核准為可遊玩'}
              </button>
              {/* 刪除ตามโฟลเดอร์ที่เลือกในราย名稱 (ไม่ใช้ id ใน檔案 — กัน刪除ผิดตัวถ้า id ในไฟล์ไม่ตรง名稱โฟลเดอร์) */}
              <button className="danger" onClick={() => selected && setConfirmDelete(selected)} title="刪除此 Ranger">🗑 刪除</button>
            </div>
          </>
        ) : (
          <div className="placeholder">—</div>
        )}
        <div className="status">{status}</div>
      </aside>

      {/* ───────── กล่องยืนยันการ已刪除 ───────── */}
      {confirmDelete && (
        <div className="modal-back" onClick={() => setConfirmDelete(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h3>刪除此 Ranger？</h3>
            <p><b>{properNameZhTw(confirmDelete) ?? rangers.find(r => r.id === confirmDelete)?.name ?? confirmDelete}</b> ({confirmDelete})</p>
            <p className="note">
              此 Ranger 的所有檔案（圖片、動畫、設定）將移至回收資料夾 <code>data/deleted-rangers/</code><br />
              將從清單與隊伍編輯頁移除；若誤刪，可將資料夾移回 <code>public/rangers/</code>  以復原
            </p>
            <div className="modal-actions">
              <button onClick={() => setConfirmDelete(null)} autoFocus>取消</button>
              <button className="danger" onClick={() => void doDelete(confirmDelete)}>🗑 刪除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
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
          <input type="number" step="0.1" value={value.x} onChange={e => onChange({ ...value, x: Number(e.target.value) })} />
        </label>
        <label>
          <span>y</span>
          <input type="number" step="0.1" value={value.y} onChange={e => onChange({ ...value, y: Number(e.target.value) })} />
        </label>
      </div>
    </div>
  )
}

/**
 * เวลาที่เหลือของท่าโจมตี นับจากเฟรมที่ปล่อย投射物 ไปจนท่าเล่นจบ
 * ใช้เทียบว่า投射物จะจบก่อนหรือหลังตัวละครกลับไปยืนเฉยๆ
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

const BASIS_LABEL = { self: '自身（增益）', front: '前排敵人', rear: '後排敵人' } as const

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
    ? BASIS_LABEL[skill.basis.type] + (skill.basis.multiplier ? ` ×${skill.basis.multiplier}` : '')
    : null

  if (plan.type === 'melee') {
    return (
      <div className="cast-info">
        {plan.isBuff ? '增益 — 無投射物檔案' : '近戰 — 無投射物檔案，目標會在發射幀立即受擊'}
        {move && <b>資料指定檔案: {move.animationPart ?? '-'} (本機不存在)</b>}
        {basis && <i style={{ color: 'var(--dim)' }}>觸發基準: {basis} — 目前固定攻擊所選目標</i>}
      </div>
    )
  }

  const bullet = assets.bullets[plan.suffix]
  const ov = bullet ? bulletOverride(bullet.geometry.fileKey) : undefined
  const type = plan.isBuff ? '增益（生成於施放者）'
    : plan.isInstant ? '不飛行（生成於目標）'
    : '投射物飛行'
  const aim = plan.isBuff ? '-'
    : plan.aimGround ? '地面（MAIN）'
    : '角色中心（CENTER）'
  const total = sec(plan.travelTicks) + sec(plan.finishTicks)
  const over = total - tailSec

  return (
    <div className={'cast-info' + (over > 0.8 ? ' warn' : '')}>
      {type} · 檔案 {plan.suffix}
      <b>
        {plan.isInstant ? 'normal ' : '飛行 '}{plan.travelTicks} tick = {sec(plan.travelTicks).toFixed(2)}s
        {' → finish '}{plan.finishFrames}f = {sec(plan.finishTicks).toFixed(2)}s
      </b>
      <i style={{ color: over > 0.8 ? 'var(--warn)' : 'var(--dim)' }}>
        釋放後動作剩餘 {tailSec.toFixed(2)}s → {over > 0 ? `投射物比角色動作晚結束 ${over.toFixed(2)}s` : '投射物早於角色動作結束'}
      </i>
      <i style={{ color: 'var(--dim)' }}>
        瞄準：{aim}
        {move && ` · motion ${move.motion.type}${move.motion.enabled ? '' : '(關閉)'} · ${move.motion.rotation}`}
        {move && ` · speed ${!plan.isInstant && speedOverride ? `${speedOverride} (自訂，遊戲資料 ${move.moveSpeed})` : move.moveSpeed} · start (${move.start.x}, ${move.start.y})`}
        {move?.hitPointRate !== null && move?.hitPointRate !== undefined && ` · hitPointRate ${move.hitPointRate}`}
      </i>
      {(basis || skill?.area) && (
        <i style={{ color: 'var(--dim)' }}>
          {basis && `觸發基準: ${basis} (攻擊所選目標)`}
          {skill?.area ? ` · Area ${skill.area}pt (${(skill.area * PT_TO_WORLD).toFixed(0)} 單位)` : ''}
        </i>
      )}
      {plan.hasArc && <i style={{ color: 'var(--dim)' }}>拋物線最高點 {plan.arcPeak.toFixed(0)}</i>}
      {bullet?.geometry.selfArc && <i style={{ color: 'var(--dim)' }}>動畫本身已有上下浮動 → 不再額外套用弧線</i>}
      {ov && <i>使用檔案例外設定：{JSON.stringify(ov)}</i>}
    </div>
  )
}

/** โชว์ว่าท่านี้กินเวลาเท่าไหร่จริงที่ความ快ปัจจุบัน — 個 Rangerชี้วัดจังหวะเกม */
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
    castSec > 0.8 ? '施放階段較長 — 可設定施放時間上限'
    : relSec > 1.0 ? '釋放階段較長 — 時間上限不適用，需要使用 x2／x3 加速'
    : null

  return (
    <div className={'cast-info' + (total > 1.6 ? ' warn' : '')}>
      施放 {castFrames}f = {castSec.toFixed(2)}s · 釋放 {releaseFrames}f = {relSec.toFixed(2)}s
      <b> 總計 {total.toFixed(2)}s</b>
      {total > 1.6 && advice && <i>{advice}</i>}
    </div>
  )
}

/** เติม屬性 / 類型 / 職業 / 名稱 จากข้อมูลเกม (ค่าที่ไม่มีในข้อมูลคงเดิม) */
function applyGameInfo(cfg: RangerConfig, info: GameInfo): RangerConfig {
  const g = info.suggest
  const category = g.category ?? cfg.category
  const role = g.role && ROLES[g.role].category === category ? g.role : ROLES[cfg.role].category === category ? cfg.role : rolesOf(category)[0]
  return {
    ...cfg,
    name: (!cfg.name || cfg.name === cfg.id || cfg.name === info.name.th || cfg.name === info.name.en)
      ? properNameZhTw(cfg.id) ?? info.name.zh ?? info.name.th ?? info.name.en ?? cfg.name
      : cfg.name,
    element: g.element ?? cfg.element,
    category,
    role,
  }
}
