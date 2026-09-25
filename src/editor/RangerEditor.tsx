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
  general: 'ทั่วไป',
  portrait: 'รูปหน้า',
  clips: 'คลิป',
  anchors: 'จุดยึด',
  attack: 'ตีธรรมดา',
  skill1: 'สกิล 1',
  skill2: 'สกิล 2',
  cutin: 'คัตซีน',
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
    } catch (e) {
      setStatus(String(e))
      return []
    }
  }, [])
  useEffect(() => { void refreshList() }, [refreshList])

  // ── โหลดเรนเจอร์ที่เลือก ──
  useEffect(() => {
    if (!selected) return
    let dead = false
    let loaded: RangerAssets | null = null
    setStatus('กำลังโหลด...')
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
        // ตัวที่ยังไม่เคยบันทึก → เติมธาตุ/ชนิด/ตำแหน่ง/ชื่อจากข้อมูลเกมให้เลย (ตัวที่บันทึกแล้วกดปุ่มใช้เอง)
        setConfig(saved || !info ? base : applyGameInfo(base, info))
        setDirty(!saved)
        const bulNote = bullets.length ? ' · กระสุน ' + bullets.join(', ') : ' · ไม่มีกระสุน (ตีประชิด)'
        setStatus((saved ? 'โหลดค่าที่บันทึกไว้แล้ว' : 'เรนเจอร์ใหม่ — ยังไม่เคยตั้งค่า') + bulNote)
      } catch (e) {
        if (!dead) setStatus('โหลดไม่สำเร็จ: ' + String(e))
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
        { key: 'anchors.ground', label: 'จุดยืน (เท้า)', color: ANCHOR_COLORS.ground, value: config.anchors.ground, space: 'sprite' },
        { key: 'anchors.hitPoint', label: 'จุดโดนตี', color: ANCHOR_COLORS.hitPoint, value: config.anchors.hitPoint, space: 'self' },
        { key: 'anchors.overhead', label: 'เหนือหัว', color: ANCHOR_COLORS.overhead, value: config.anchors.overhead, space: 'self' },
      ]
    }
    if (action) {
      const list: AnchorHandle[] = []
      const ap = config.actions[action].approach
      if (ap?.enabled) {
        list.push({ key: `actions.${action}.approach.stopOffset`, label: 'จุดหยุดเดิน', color: ANCHOR_COLORS.walk, value: ap.stopOffset, space: 'target' })
      }
      if (!livePoints) return list
      const p = livePoints.plan
      const suffix = manual ? '' : ' (อัตโนมัติ)'
      // ท่าไม่บินเกิดที่จุดตกเลย จุดปล่อยไม่มีผล จึงไม่ให้ลาก
      if (!p.isInstant) {
        list.push({ key: `actions.${action}.muzzle`, label: 'จุดปล่อย' + suffix, color: ANCHOR_COLORS.muzzle, value: livePoints.muzzle, space: 'self' })
      }
      const split = config.actions[action].finishSplit
      list.push({
        key: `actions.${action}.impactOffset`,
        label: (split ? 'ปลายทาง normal' : p.isBuff ? 'จุดเกิดบัฟ' : p.isInstant ? 'จุดเกิดเอฟเฟกต์' : 'จุดกระทบ') + suffix,
        color: ANCHOR_COLORS.impact,
        value: livePoints.impactOffset,
        space: p.isBuff ? 'self' : 'target',
      })
      if (split) {
        list.push({
          key: `actions.${action}.finishOffset`,
          label: 'จุด finish (ระเบิด)',
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
      setStatus('บันทึกลง public/rangers/' + config.id + '/ranger.json แล้ว')
      void refreshList()
    } catch (e) {
      setStatus('บันทึกไม่สำเร็จ: ' + String(e))
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
      setStatus(next.approved ? 'อนุมัติแล้ว — ตัวนี้พร้อมเล่น จะขึ้นในหน้าจัดทีม' : 'ยกเลิกอนุมัติแล้ว — ตัวนี้จะไม่ขึ้นในหน้าจัดทีม')
      void refreshList()
    } catch (e) {
      setStatus('อนุมัติไม่สำเร็จ: ' + String(e))
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
      setStatus(`ลบ ${id} แล้ว — ย้ายไปไว้ที่ ${r.movedTo} (ย้ายกลับมาที่ public/rangers/ เพื่อกู้คืน)`)
      void refreshList()
    } catch (e) {
      setStatus('ลบไม่สำเร็จ: ' + String(e))
    }
  }

  // ── โหลดเรนเจอร์ตัวใหม่จาก lerico ──
  const refreshData = async () => {
    setRefreshing(true)
    setStatus('กำลังดึงข้อมูลเกมจาก lerico…')
    try {
      const r = await refreshGameData()
      const stale = Object.values(r.sources).some(v => v !== 'api')
      const renamed = r.renamed ?? {}
      const nRenamed = Object.keys(renamed).length
      if (r.error) setStatus('โหลดข้อมูลไม่สำเร็จ: ' + r.error)
      else setStatus(`อัปเดตข้อมูลเกม ${r.ok.length} ตัว${nRenamed ? ` · ตั้งชื่อตามเกม ${nRenamed} ตัว` : ''}${r.missing.length ? ' · ไม่พบ ' + r.missing.join(', ') : ''}${stale ? ' · (บางส่วนใช้แคชเดิม — API ต้นทางมีปัญหา)' : ''}`)
      // ตัวที่เปิดอยู่ถูกเปลี่ยนชื่อ → ใช้ชื่อใหม่ในหน้าแก้ด้วย (ไม่งั้นกด Save แล้วชื่อเก่าทับกลับ)
      if (selected && renamed[selected]) setConfig(c => (c && c.id === selected ? { ...c, name: renamed[selected] } : c))
      if (selected) setGameInfo(await loadGameInfo(selected))
      await refreshList()
    } catch (e) {
      setStatus('โหลดข้อมูลไม่สำเร็จ: ' + String(e))
    } finally {
      setRefreshing(false)
    }
  }

  const addRanger = async () => {
    const id = newId.trim().toLowerCase()
    if (!id) return
    setStatus('กำลังโหลด ' + id + ' จาก lerico...')
    try {
      const r = await fetchRangerAssets(id)
      if (!r.ok) throw new Error('ไม่พบเรนเจอร์นี้')
      const kb = (r.written ?? []).reduce((s, w) => s + w.bytes, 0) / 1024
      setStatus('โหลด ' + id + ' สำเร็จ (' + kb.toFixed(0) + ' KB)')
      setNewId('')
      await refreshList()
      setSelected(id)
    } catch (e) {
      setStatus('โหลดไม่สำเร็จ: ' + String(e))
    }
  }

  const clipNames = assets ? assets.sam.animNames.filter(n => n !== '_all') : []
  const availableBullets = assets ? Object.keys(assets.bullets).sort() : []

  return (
    <div className="editor">
      {/* ───────── ซ้าย: รายชื่อ ───────── */}
      <aside className="panel left">
        <h2>เรนเจอร์</h2>
        <div className="refresh-row">
          <button disabled={refreshing} onClick={() => void refreshData()}
            title="ดึงธาตุ ชนิด ชื่อ และไอคอนสกิลของทุกตัวจาก API ของ lerico ใหม่">
            {refreshing ? 'กำลังโหลดข้อมูล…' : '🔄 โหลดข้อมูลอีกครั้ง'}
          </button>
        </div>
        <div className="add-row">
          <input
            value={newId}
            onChange={e => setNewId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void addRanger() }}
            placeholder="เช่น u1607e-sh"
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
                    <img className="stars" src={starImageUrl(r.grade, evolutionOf(r.id))!} alt={`${r.grade} ดาว`} title={`${r.grade} ดาว · ${EVOLUTION_LABEL[evolutionOf(r.id)]}`} />
                  )}
                  <i className={r.approved ? 'approved' : ''}>{r.approved ? '✓ พร้อมเล่น' : r.configured ? 'ตั้งค่าแล้ว' : 'ยังไม่ตั้งค่า'}</i>
                </span>
              </button>
            </li>
          ))}
          {!rangers.length && <li className="empty">ยังไม่มีเรนเจอร์ — พิมพ์รหัสด้านบนเพื่อโหลด</li>}
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
              {action && <button className="fire" onClick={fire}>⚔ ทดสอบยิง</button>}
            </div>
            <div className="hint">
              {groundLocked
                ? 'โหมดยืนจริง — เท้าถูกล็อกกับเส้นพื้นเหมือนตอนอยู่ในแมพ'
                : 'โหมดตั้งหมุด — ลากหมุดเขียวไปที่เท้าของตัวละคร'}
              {' · '}Shift = ล็อกจำนวนเต็ม · ลากพื้นหลัง = เลื่อนจอ · สกรอลล์ = ซูม
            </div>
          </>
        ) : (
          <div className="placeholder">เลือกเรนเจอร์จากรายการทางซ้าย</div>
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
                        <span>ระดับ {gameInfo.grade ?? '?'} ดาว · Evolution <b>{EVOLUTION_LABEL[evolutionOf(config.id)]}</b></span>
                      </div>
                      {gameInfo.suggest.element && <>ธาตุ {ELEMENT_LABEL[gameInfo.suggest.element]}</>}
                      {gameInfo.suggest.category && <> · ชนิด {CATEGORY_LABEL[gameInfo.suggest.category]}</>}
                      {gameInfo.suggest.role && <> · แนะนำ {ROLES[gameInfo.suggest.role].label}</>}
                      <div style={{ marginTop: 6 }}>
                        <button onClick={() => setConfigAndDirty(c => applyGameInfo(c, gameInfo))}>ใช้ค่าจากเกม</button>
                      </div>
                    </div>
                  ) : (
                    <p className="note">ยังไม่มีข้อมูลจากเกม (ธาตุ/ชนิด/ไอคอนสกิล) — กด “โหลดข้อมูลอีกครั้ง” เมื่อ API ต้นทางใช้ได้</p>
                  )}
                  <Field label="ชื่อ">
                    <input value={config.name} onChange={e => edit('name', e.target.value)} />
                  </Field>
                  <Field label="ธาตุ">
                    <select value={config.element} onChange={e => edit('element', e.target.value)}>
                      {ELEMENTS.map(x => <option key={x} value={x}>{ELEMENT_LABEL[x]}</option>)}
                    </select>
                  </Field>
                  <Field label="ชนิด">
                    <select value={config.category} onChange={e => {
                      const c = e.target.value as Category
                      edit('category', c)
                      // ตำแหน่งต้องอยู่ในชนิดเดียวกัน — เปลี่ยนชนิดแล้วเลือกตำแหน่งแรกของชนิดนั้นให้
                      if (ROLES[config.role].category !== c) edit('role', rolesOf(c)[0])
                    }}>
                      {(Object.keys(CATEGORY_LABEL) as Category[]).map(c => (
                        <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="ตำแหน่ง">
                    <select value={config.role} onChange={e => edit('role', e.target.value)}>
                      {rolesOf(config.category).map(r => <option key={r} value={r}>{ROLES[r].label}</option>)}
                    </select>
                    <span className="note" style={{ margin: 0 }}>{ROLES[config.role].hint}</span>
                  </Field>
                  <h3>ค่าสถานะ</h3>
                  <div style={{ marginBottom: 8 }}>
                    <button className="primary" style={{ width: '100%' }} onClick={() => edit('stats', randomStats(config.role))}>
                      🎲 สุ่มค่าพลังที่เหมาะกับ{ROLES[config.role].label}
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
                  <h3>พาสซีฟพิเศษ</h3>
                  <p className="note">ความสามารถติดตัวตลอดเกม ไม่ต้องร่าย ไม่เสีย Cost — คนละส่วนกับความสามารถประจำตำแหน่ง</p>
                  {(() => {
                    const list: PassiveDef[] = config.passives ?? []
                    const setList = (next: PassiveDef[]) => edit('passives', next)
                    const addable = PASSIVE_TYPES.filter(t => !list.some(p => p.type === t))
                    return (
                      <>
                        <div className="effect-list">
                          {list.length === 0 && <p className="note">ยังไม่มีพาสซีฟ — เพิ่มจากรายการด้านล่าง</p>}
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
                                <button className="effect-x" title="ลบ" onClick={() => setList(list.filter((_, j) => j !== i))}>×</button>
                              </div>
                            )
                          })}
                        </div>
                        {addable.length > 0 && (
                          <select className="effect-add" value="" onChange={e => {
                            if (!e.target.value) return
                            setList([...list, newPassive(e.target.value as PassiveType)])
                          }}>
                            <option value="">+ เพิ่มพาสซีฟ…</option>
                            {addable.map(t => <option key={t} value={t}>{PASSIVES[t].label}</option>)}
                          </select>
                        )}
                      </>
                    )
                  })()}
                  <div className="meta">fps {config.fps} · {assets.sam.animNames.length - 1} คลิป · {assets.sam.images.length} สไปรต์</div>
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
                  <p className="note">จับคู่คลิปในไฟล์เข้ากับสถานะที่เกมต้องใช้</p>
                  {(Object.keys(config.clips) as (keyof typeof config.clips)[]).map(k => (
                    <Field key={k} label={k}>
                      <select
                        value={config.clips[k] ?? ''}
                        onChange={e => edit('clips.' + k, e.target.value || null)}
                      >
                        <option value="">— ไม่มี —</option>
                        {clipNames.map(n => <option key={n} value={n}>{n} ({assets.sam.animations[n].length}f)</option>)}
                      </select>
                    </Field>
                  ))}
                </>
              )}

              {tab === 'anchors' && (
                <>
                  <p className="note">
                    <b>จุดยืน</b> = ชี้ว่าตรงไหนบนภาพคือเท้า — ลากให้ตรงกับเท้าจริง แล้วเส้นประจะบอกแนว<br />
                    พอไปแท็บอื่นหรือลงแมพ ตัวละครจะถูกเลื่อนให้เท้าตรงกับช่องยืนพอดีเอง<br />
                    <b>จุดโดนตี</b> กับ <b>เหนือหัว</b> วัดจากเท้า จึงย้ายตามไปด้วยเสมอ
                  </p>
                  {(['ground', 'hitPoint', 'overhead'] as const).map(k => (
                    <VecField
                      key={k}
                      label={k === 'ground' ? 'จุดยืน' : k === 'hitPoint' ? 'จุดโดนตี' : 'เหนือหัว'}
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
                        <h3 style={{ marginTop: 0 }}>ความสามารถในการรบ</h3>
                        <SkillEditor
                          skill={config.skills[action]}
                          rangerId={config.id}
                          info={gameInfo?.skills[action] ?? null}
                          onChange={next => edit('skills.' + action, next)}
                        />
                        <h3>คัตซีนร่ายสกิล</h3>
                        <div className="cutin-actions">
                          <span className="note" style={{ margin: 0 }}>{config.cutins?.[action]?.enabled ? '● มีคัตซีน' : '○ ยังไม่มีคัตซีน'}</span>
                          <button onClick={() => { setCutinSlot(action); setTab('cutin') }}>🎬 ไปเมนูคัตซีน</button>
                        </div>
                        <h3>อนิเมชั่น</h3>
                      </>
                    )}
                    {actionCfg.castPre && (
                      <Field label="ช่วงร่าย ส่วนที่ 1 (ท่า 3 ส่วน)">
                        <select value={actionCfg.castPre} onChange={e => edit('actions.' + action + '.castPre', e.target.value || null)}>
                          <option value="">— ไม่มี —</option>{clipOpts}
                        </select>
                      </Field>
                    )}
                    <Field label="คลิปช่วงร่าย (cast)">
                      <select value={actionCfg.cast ?? ''} onChange={e => edit('actions.' + action + '.cast', e.target.value || null)}>
                        <option value="">— ไม่มี —</option>{clipOpts}
                      </select>
                    </Field>
                    <Field label="คลิปช่วงปล่อย (release)">
                      <select value={actionCfg.release} onChange={e => edit('actions.' + action + '.release', e.target.value)}>
                        {clipOpts}
                      </select>
                    </Field>

                    <Field label="เฟรมที่ปล่อยกระสุน (readyLen)">
                      <div className="inline">
                        <input type="number" value={actionCfg.releaseFrame}
                          onChange={e => edit('actions.' + action + '.releaseFrame', Number(e.target.value))} />
                        <button onClick={() => edit('actions.' + action + '.releaseFrame', frameView.frame)}>
                          ใช้เฟรมนี้ ({frameView.frame})
                        </button>
                      </div>
                    </Field>
                    {(() => {
                      const suggest = readyLengthUntilVanish(assets.sam, actionCfg.castPre, actionCfg.cast)
                      if (suggest === actionCfg.releaseFrame || suggest === 0) return null
                      return (
                        <div className="cast-info warn">
                          {castLen > suggest
                            ? `ช่วงร่ายยาว ${castLen}f แต่ ${castLen - suggest}f ท้ายตัวละครหายตัวไปแล้ว`
                            : 'จังหวะตามกฎคือรอยต่อช่วงร่าย→ปล่อย'}
                          <i>
                            <button onClick={() => edit('actions.' + action + '.releaseFrame', suggest)}>
                              ใช้ค่าตามกฎ ({suggest})
                            </button>
                          </i>
                        </div>
                      )
                    })()}

                    <Field label="เพดานเวลาช่วงร่าย (วินาที)">
                      <input type="number" step="0.1" placeholder="ไม่จำกัด" value={actionCfg.castSpeedCap ?? ''}
                        onChange={e => edit('actions.' + action + '.castSpeedCap', e.target.value === '' ? null : Number(e.target.value))} />
                    </Field>

                    <CastInfo
                      castFrames={castLen}
                      releaseFrames={assets.sam.animations[actionCfg.release]?.length ?? 0}
                      fps={config.fps}
                      speed={speed}
                      cap={actionCfg.castSpeedCap}
                    />

                    <h3>เดินเข้าไปก่อนโจมตี</h3>
                    <label className="check">
                      <input type="checkbox" checked={actionCfg.approach.enabled}
                        onChange={e => edit('actions.' + action + '.approach.enabled', e.target.checked)} />
                      เดินไปหาเป้าก่อนร่าย (ตีใกล้ / สกิลระยะประชิด)
                    </label>
                    {actionCfg.approach.enabled && (() => {
                      const ap = actionCfg.approach
                      const walkDist = Math.hypot(approachOff.x, approachOff.y)
                      const walkSec = walkDist / Math.max(1, ap.speed) / (SPEED_PROFILES[speed]?.release ?? 1)
                      return (
                        <>
                          <VecField label="จุดหยุดเดิน (เทียบจุดยืนของเป้า · x ลบ = หน้าเป้า)" color={ANCHOR_COLORS.walk}
                            value={ap.stopOffset} onChange={v => edit('actions.' + action + '.approach.stopOffset', v)} />
                          <Field label="เลื่อนแกน X ของจุดหยุด (ลบ = ยืนหน้าเป้า · ยิ่งลบยิ่งห่าง)">
                            <div className="inline">
                              <input type="range" min={-800} max={300} step={1} value={ap.stopOffset.x}
                                onChange={e => edit('actions.' + action + '.approach.stopOffset', { ...ap.stopOffset, x: Number(e.target.value) })} />
                              <input type="number" step={1} value={ap.stopOffset.x} style={{ maxWidth: 76 }}
                                onChange={e => edit('actions.' + action + '.approach.stopOffset', { ...ap.stopOffset, x: Number(e.target.value) || 0 })} />
                              <button title="กลับเป็นค่าเริ่มต้น" disabled={ap.stopOffset.x === DEFAULT_APPROACH.stopOffset.x}
                                onClick={() => edit('actions.' + action + '.approach.stopOffset', { ...ap.stopOffset, x: DEFAULT_APPROACH.stopOffset.x })}>↺</button>
                            </div>
                            {(() => {
                              const limit = -Math.round(frontLineGap())
                              return (
                                <div className="inline">
                                  <button disabled={ap.stopOffset.x === limit}
                                    title="ระยะที่แถวหน้าบนของเราห่างจากแถวหน้าบนของศัตรูในสนาม"
                                    onClick={() => edit('actions.' + action + '.approach.stopOffset', { ...ap.stopOffset, x: limit })}>
                                    [ ลิมิตชนหน้า ]
                                  </button>
                                  <span className="meta">x = {limit} · แถวหน้าบน ↔ แถวหน้าบนศัตรู</span>
                                </div>
                              )
                            })()}
                          </Field>
                          <Field label="ความเร็วการเคลื่อนที่ (หน่วย/วินาที)">
                            <div className="inline">
                              <input type="range" min={50} max={2000} step={10} value={ap.speed}
                                onChange={e => edit('actions.' + action + '.approach.speed', Number(e.target.value))} />
                              <input type="number" min={1} step={10} value={ap.speed} style={{ maxWidth: 76 }}
                                onChange={e => edit('actions.' + action + '.approach.speed', Math.max(1, Number(e.target.value) || 1))} />
                            </div>
                            <div className="inline">
                              {([['ช้า', 300], ['ปกติ', 600], ['เร็ว', 1000], ['พุ่ง', 1800]] as const).map(([label, v]) => (
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
                            โจมตีเสร็จแล้วเดินกลับที่เดิม
                          </label>
                          <p className="note">
                            เดิน {walkDist.toFixed(0)} หน่วย ≈ {walkSec.toFixed(2)}s{ap.returnHome ? ` · ไป-กลับ ${(walkSec * 2).toFixed(2)}s` : ''}
                            {!config.clips.walk && ' · ⚠ ไม่มีคลิปเดิน ใช้ท่ายืนแทน (ตั้งได้ที่แท็บคลิป)'}
                          </p>
                        </>
                      )
                    })()}

                    <h3>การยิง</h3>
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
                        <p className="note">ท่านี้ไม่บิน (เกิดที่เป้าเลย) — ความเร็วไม่มีผล เวลาขึ้นกับความยาวคลิป normal</p>
                      ) : (() => {
                        const base = gameMove.moveSpeed > 0 ? gameMove.moveSpeed : PROJECTILE_FALLBACK_SPEED
                        const cur = actionCfg.moveSpeedOverride ?? base
                        const set = (n: number | null) => edit('actions.' + action + '.moveSpeedOverride',
                          n === null || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 10) / 10)
                        const perSec = cur * PROJECTILE_SPEED_SCALE * (config.fps || 30)
                        return (
                          <Field label={'ความเร็วกระสุน' + (actionCfg.moveSpeedOverride === null ? ' (จากข้อมูลเกม)' : ' (ตั้งเอง)')}>
                            <div className="inline">
                              <input type="range" min={1} max={Math.max(150, Math.ceil(base * 3))} step={1} value={cur}
                                onChange={e => set(Number(e.target.value))} />
                              <input type="number" min={1} step={1} value={cur} style={{ maxWidth: 70 }}
                                onChange={e => set(Number(e.target.value))} />
                            </div>
                            <span className="note" style={{ margin: 0 }}>
                              ≈ {perSec.toFixed(0)} หน่วย/วินาที · บินถึงเป้า {plan.travelTicks} ติ๊ก = {(plan.travelTicks / (config.fps || 30) / (SPEED_PROFILES[speed]?.release ?? 1)).toFixed(2)}s
                            </span>
                            {actionCfg.moveSpeedOverride !== null && (
                              <button onClick={() => set(null)}>กลับไปใช้ค่าจากข้อมูลเกม ({base})</button>
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
                        <Field label="ทิศกระสุน">
                          <label className="check">
                            <input type="checkbox" checked={tilt} onChange={e => edit('actions.' + action + '.aimTilt', e.target.checked)} />
                            เฉียงตามจุดกระทบ (ยิงเป้าสูง/ต่ำกว่า หัวกระสุนชี้ไปทางนั้น · ทางโค้งหมุนตามโค้ง)
                          </label>
                          <label className="check" style={tilt ? undefined : { opacity: 0.45, cursor: 'not-allowed' }}
                            title={tilt ? '' : 'ติ๊ก "เฉียงตามจุดกระทบ" ก่อน'}>
                            <input type="checkbox" disabled={!tilt} checked={tilt && actionCfg.aimTiltFinish === true}
                              onChange={e => edit('actions.' + action + '.aimTiltFinish', e.target.checked)} />
                            finish (ระเบิดตอนถึงเป้า) เฉียงตามด้วย
                          </label>
                          {tilt && (
                            <div className="inline">
                              <span className="note" style={{ margin: 0, whiteSpace: 'nowrap' }}>หมุนเพิ่ม</span>
                              <input type="range" min={-180} max={180} step={1} value={off} onChange={e => setOff(Number(e.target.value))} />
                              <input type="number" min={-180} max={180} step={1} value={off} style={{ maxWidth: 70 }} onChange={e => setOff(Number(e.target.value))} />
                              <span className="note" style={{ margin: 0 }}>°</span>
                              <button disabled={off === 0} onClick={() => setOff(0)}>รีเซ็ต</button>
                            </div>
                          )}
                        </Field>
                      )
                    })()}

                    <Field label="จุดปล่อย / จุดตก">
                      <select
                        value={manual ? 'manual' : 'auto'}
                        disabled={!gameMove}
                        onChange={e => edit('actions.' + action + '.positioning', e.target.value)}
                      >
                        <option value="auto">คำนวณจากข้อมูลเกม (กฎ Kiwi)</option>
                        <option value="manual">ตั้งเอง (ลากหมุด)</option>
                      </select>
                    </Field>
                    {!gameMove && <p className="note">ท่านี้ไม่มีข้อมูลเกม — ต้องตั้งตำแหน่งและกระสุนเอง</p>}
                    {manual && (
                      <>
                        <VecField label="จุดปล่อย (เทียบจุดยืน)" color={ANCHOR_COLORS.muzzle} value={actionCfg.muzzle}
                          onChange={v => edit('actions.' + action + '.muzzle', v)} />
                        <VecField label="จุดตก (เทียบจุดยืนของเป้า)" color={ANCHOR_COLORS.impact} value={actionCfg.impactOffset}
                          onChange={v => edit('actions.' + action + '.impactOffset', v)} />
                      </>
                    )}
                    {plan && plan.type === 'shot' && (
                      <>
                        <label className="check">
                          <input type="checkbox" checked={actionCfg.finishSplit}
                            onChange={e => {
                              // เปิดครั้งแรก: เริ่มจุด finish ที่ปลายทางกระสุนตอนนี้ ภาพจะไม่กระโดด
                              if (e.target.checked && livePoints) edit('actions.' + action + '.finishOffset', { ...livePoints.impactOffset })
                              edit('actions.' + action + '.finishSplit', e.target.checked)
                            }} />
                          แยกตำแหน่ง finish (ระเบิด) ออกจากปลายทาง normal (กระสุน)
                        </label>
                        {actionCfg.finishSplit && (
                          <>
                            <VecField label={'จุด finish (' + (plan.isBuff ? 'เทียบจุดยืนผู้ร่าย' : 'เทียบจุดยืนของเป้า') + ')'}
                              color={ANCHOR_COLORS.finish} value={actionCfg.finishOffset}
                              onChange={v => edit('actions.' + action + '.finishOffset', v)} />
                            {plan.finishFrames === 0 && <p className="note">⚠ ไฟล์กระสุนของท่านี้ไม่มีคลิป finish — จุดนี้จะไม่มีอะไรให้เห็น</p>}
                          </>
                        )}
                      </>
                    )}
                    <Field label="ระยะหุ่นเป้า">
                      <input type="number" value={targetDistance} onChange={e => setTargetDistance(Number(e.target.value))} />
                    </Field>

                    {!gameMove && (
                      <>
                        <h3>กระสุน (ตั้งเอง)</h3>
                        {availableBullets.length === 0 ? (
                          <p className="note">ไม่มีไฟล์กระสุน — ตีประชิด เป้าโดนตีทันทีที่เฟรมปล่อย</p>
                        ) : (
                          <Field label="ไฟล์กระสุน">
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
                              <option value="">ไม่มี (ตีประชิด)</option>
                              {availableBullets.map(b => (
                                <option key={b} value={b}>{b}{b === DEFAULT_BULLET[action] ? ' (ค่ามาตรฐาน)' : ''}</option>
                              ))}
                            </select>
                          </Field>
                        )}
                        {actionCfg.projectile && (
                          <>
                            <Field label="วิธีไปถึงเป้า">
                              <select value={actionCfg.projectile.mode}
                                onChange={e => edit('actions.' + action + '.projectile.mode', e.target.value)}>
                                <option value="flight">บินจากปากกระบอก</option>
                                <option value="atTarget">ไม่บิน (เกิดที่เป้า)</option>
                              </select>
                            </Field>
                            <Field label="วิถี">
                              <select value={actionCfg.projectile.path}
                                onChange={e => edit('actions.' + action + '.projectile.path', e.target.value)}>
                                <option value="straight">พุ่งตรง</option>
                                <option value="arc">ปาโค้ง</option>
                              </select>
                            </Field>
                            <Field label="ความเร็ว (unit/วิ)">
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
                {dirty ? 'บันทึก' : 'บันทึกแล้ว'}
              </button>
              <button onClick={() => downloadConfig(config)}>匯出設定</button>
            </div>
            <div className="save-bar">
              <button
                className={config.approved ? 'approve on' : 'approve'}
                onClick={() => void toggleApprove()}
                title={config.approved ? 'กดเพื่อยกเลิก — ตัวนี้จะไม่ขึ้นในหน้าจัดทีม' : 'บอกว่าตัวนี้ตั้งค่าเสร็จแล้ว พร้อมเล่น — จะขึ้นในหน้าจัดทีม (บันทึกให้ทันที)'}
              >
                {config.approved ? '✓ อนุมัติแล้ว (พร้อมเล่น)' : '✓ อนุมัติ — พร้อมเล่น'}
              </button>
              {/* ลบตามโฟลเดอร์ที่เลือกในรายชื่อ (ไม่ใช้ id ในไฟล์ — กันลบผิดตัวถ้า id ในไฟล์ไม่ตรงชื่อโฟลเดอร์) */}
              <button className="danger" onClick={() => selected && setConfirmDelete(selected)} title="ลบเรนเจอร์ตัวนี้">🗑 ลบ</button>
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
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h3>ลบเรนเจอร์นี้?</h3>
            <p><b>{properNameZhTw(confirmDelete) ?? rangers.find(r => r.id === confirmDelete)?.name ?? confirmDelete}</b> ({confirmDelete})</p>
            <p className="note">
              ไฟล์ทั้งหมดของตัวนี้ (ภาพ อนิเมชัน ค่าที่ตั้งไว้) จะถูกย้ายไปถังขยะ <code>data/deleted-rangers/</code><br />
              จะหายจากรายชื่อและหน้าจัดทีม · ถ้าลบผิด ย้ายโฟลเดอร์กลับมาที่ <code>public/rangers/</code> เพื่อกู้คืน
            </p>
            <div className="modal-actions">
              <button onClick={() => setConfirmDelete(null)} autoFocus>ยกเลิก</button>
              <button className="danger" onClick={() => void doDelete(confirmDelete)}>🗑 ลบ</button>
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

const BASIS_LABEL = { self: 'ตัวเอง (บัฟ)', front: 'ศัตรูแนวหน้า', rear: 'ศัตรูแนวหลัง' } as const

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
        {plan.isBuff ? 'บัฟ — ไม่มีไฟล์กระสุน' : 'ตีประชิด — ไม่มีไฟล์กระสุน เป้าโดนตีทันทีที่เฟรมปล่อย'}
        {move && <b>ไฟล์ตามข้อมูล: {move.animationPart ?? '-'} (ไม่มีในเครื่อง)</b>}
        {basis && <i style={{ color: 'var(--dim)' }}>觸發基準: {basis} — ตอนนี้ยิงไปหาเป้าที่เล็งเสมอ</i>}
      </div>
    )
  }

  const bullet = assets.bullets[plan.suffix]
  const ov = bullet ? bulletOverride(bullet.geometry.fileKey) : undefined
  const type = plan.isBuff ? 'บัฟ (เกิดที่ตัวผู้ร่าย)'
    : plan.isInstant ? 'ไม่บิน (เกิดคาเป้า)'
    : 'กระสุนบิน'
  const aim = plan.isBuff ? '-'
    : plan.aimGround ? 'พื้น (MAIN)'
    : 'กลางตัว (CENTER)'
  const total = sec(plan.travelTicks) + sec(plan.finishTicks)
  const over = total - tailSec

  return (
    <div className={'cast-info' + (over > 0.8 ? ' warn' : '')}>
      {type} · ไฟล์ {plan.suffix}
      <b>
        {plan.isInstant ? 'normal ' : 'บิน '}{plan.travelTicks} ติ๊ก = {sec(plan.travelTicks).toFixed(2)}s
        {' → finish '}{plan.finishFrames}f = {sec(plan.finishTicks).toFixed(2)}s
      </b>
      <i style={{ color: over > 0.8 ? 'var(--warn)' : 'var(--dim)' }}>
        ท่ายิงหลังปล่อยเหลือ {tailSec.toFixed(2)}s → {over > 0 ? `กระสุนจบช้ากว่าท่า ${over.toFixed(2)}s` : 'กระสุนจบก่อนท่า'}
      </i>
      <i style={{ color: 'var(--dim)' }}>
        เล็ง: {aim}
        {move && ` · motion ${move.motion.type}${move.motion.enabled ? '' : '(ปิด)'} · ${move.motion.rotation}`}
        {move && ` · speed ${!plan.isInstant && speedOverride ? `${speedOverride} (ตั้งเอง, เกม ${move.moveSpeed})` : move.moveSpeed} · start (${move.start.x}, ${move.start.y})`}
        {move?.hitPointRate !== null && move?.hitPointRate !== undefined && ` · hitPointRate ${move.hitPointRate}`}
      </i>
      {(basis || skill?.area) && (
        <i style={{ color: 'var(--dim)' }}>
          {basis && `觸發基準: ${basis} (ยิงเป้าที่เล็ง)`}
          {skill?.area ? ` · Area ${skill.area}pt (${(skill.area * PT_TO_WORLD).toFixed(0)} หน่วย)` : ''}
        </i>
      )}
      {plan.hasArc && <i style={{ color: 'var(--dim)' }}>ปาโค้ง ยอดสูง {plan.arcPeak.toFixed(0)}</i>}
      {bullet?.geometry.selfArc && <i style={{ color: 'var(--dim)' }}>คลิปลอยขึ้นเองแล้ว → ไม่ใส่โค้งซ้ำ</i>}
      {ov && <i>ใช้ค่ายกเว้นรายไฟล์: {JSON.stringify(ov)}</i>}
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
    castSec > 0.8 ? 'ช่วงร่ายยาว — ตั้งเพดานเวลาช่วงร่ายได้'
    : relSec > 1.0 ? 'ช่วงปล่อยยาว — เพดานเวลาช่วยไม่ได้ ต้องพึ่งปุ่มเร่ง x2/x3'
    : null

  return (
    <div className={'cast-info' + (total > 1.6 ? ' warn' : '')}>
      ร่าย {castFrames}f = {castSec.toFixed(2)}s · ปล่อย {releaseFrames}f = {relSec.toFixed(2)}s
      <b> รวม {total.toFixed(2)}s</b>
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
    name: cfg.name === cfg.id ? info.name.th ?? info.name.en ?? cfg.name : cfg.name,
    element: g.element ?? cfg.element,
    category,
    role,
  }
}
