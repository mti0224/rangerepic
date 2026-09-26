// ====================================================
// actionPlan.ts — วางแผนการโจมตี 1 ครั้งของเรนเจอร์ 1 ตัว
// ใช้ร่วมกันระหว่างฉากทดสอบใน editor (PreviewScene) กับสนามรบ 5v5 (BattleScene)
//
// ทุกพิกัดอยู่ใน "kiwi space" ของผู้โจมตี = พิกัดดิบของไฟล์ .sam ตอนยืนที่เดิมและหันขวา
// ฉากแต่ละแบบค่อยแปลงผลลัพธ์ไปเป็นพิกัดของตัวเอง (สนามรบต้องกลับด้านให้ทีมขวา)
// ====================================================

import type { AttackKind, MoveData } from './gameData'
import type { RangerAssets } from './rangerAssets'
import type { ActionName, RangerConfig, Vec2 } from './rangerConfig'
import {
  DEFAULT_FPS, PROJECTILE_SPEED_SCALE,
  isInstantMove, planShot,
  type ShotPlan, type TargetPoints,
} from './shotRules'

export const KIND_OF: Record<ActionName, AttackKind> = { attack: 'normal', skill1: 'skill1', skill2: 'skill2' }

export function bodyFpsOf(assets: RangerAssets, cfg: RangerConfig): number {
  return cfg.fps || assets.sam.animRate || DEFAULT_FPS
}

/** จุดยืน (เท้า) ในพิกัดไฟล์ — ค่าที่ตั้งเองก่อน ถ้ายังไม่ได้ตั้งใช้ค่าที่หาจากเงาในไฟล์ */
export function standOf(assets: RangerAssets, cfg: RangerConfig): Vec2 {
  const g = cfg.anchors.ground
  if (g.x !== 0 || g.y !== 0) return g
  return assets.geometry.autoStand ?? { x: 0, y: 0 }
}

/** จุดรับดาเมจ / ระดับอก ของเรนเจอร์ตัวนี้ในพิกัดไฟล์ของมันเอง */
export function bodyPointsOf(assets: RangerAssets, cfg: RangerConfig): { stand: Vec2; face: Vec2; center: Vec2 | null } {
  const stand = standOf(assets, cfg)
  const geo = assets.geometry
  return {
    stand,
    face: geo.faceAnchor ?? stand,
    center: geo.centerY !== null ? { x: stand.x, y: geo.centerY } : null,
  }
}

/** ข้อมูลท่าจากเกม — ไม่มีก็สร้างจากค่าที่ตั้งเองใน editor */
export function resolveMove(
  assets: RangerAssets, cfg: RangerConfig, name: ActionName,
): { meta: MoveData; synthetic: boolean } | null {
  // Gameplay may map a semantic action (for example Normal Support = skill2)
  // to another raw animation slot. Body animation and projectile metadata must
  // use the same source slot or bullets from an unrelated attack can leak in.
  const visualName = cfg.actions[name].visualSource ?? name
  const kind = KIND_OF[visualName]
  const fromGame = assets.gameData?.moves[kind]
  if (fromGame) {
    // ความเร็วที่ตั้งเองใช้ได้เฉพาะท่าที่บินอยู่แล้ว — ห้ามทำให้ท่าไม่บินกลายเป็นบิน
    const override = cfg.actions[name].moveSpeedOverride
    const meta = override && override > 0 && !isInstantMove(fromGame)
      ? { ...fromGame, moveSpeed: override }
      : fromGame
    return { meta, synthetic: false }
  }

  const p = cfg.actions[name].projectile
  if (!p) return null
  return {
    synthetic: true,
    meta: {
      animationPart: p.asset,
      start: { x: 1, y: 0 },
      moveSpeed: p.speed / bodyFpsOf(assets, cfg) / PROJECTILE_SPEED_SCALE,
      angle: { start: 0, end: 0 },
      motion: {
        type: p.path === 'arc' ? 'CURVE' : 'LINEAR',
        enabled: p.mode === 'flight',
        rotation: p.rotate === 'alongPath' ? 'ALONG_PATH' : 'FIXED',
        loopNormal: false,
      },
      hitPointRate: null,
    },
  }
}

/**
 * ระยะที่ต้องเดินไปถึงจุดหยุด (kiwi space เทียบจากจุดยืนเดิม)
 * @param targetMain จุดยืนของเป้า ใน kiwi space ของผู้โจมตี
 */
export function approachOffsetOf(cfg: RangerConfig, name: ActionName, stand: Vec2, targetMain: Vec2): Vec2 {
  const ap = cfg.actions[name].approach
  if (!ap?.enabled) return { x: 0, y: 0 }
  return { x: targetMain.x + ap.stopOffset.x - stand.x, y: targetMain.y - stand.y + ap.stopOffset.y }
}

/**
 * วางแผนการโจมตี 1 ครั้ง
 * @param target จุดบนตัวเป้า ใน kiwi space ของผู้โจมตี (ตอนยืนที่เดิม)
 * ท่าที่ติ๊กเดินเข้าไป: คิดเหมือนยืนอยู่ที่จุดหยุด แล้วเลื่อนผลกลับเป็นพิกัดเทียบที่ยืนเดิม
 */
export function planAction(
  assets: RangerAssets, cfg: RangerConfig, name: ActionName, target: TargetPoints,
): ShotPlan {
  const kind = KIND_OF[name]
  const a = cfg.actions[name]
  const stand = standOf(assets, cfg)
  const move = resolveMove(assets, cfg, name)
  const off = approachOffsetOf(cfg, name, stand, target.main)
  const shift = (v: Vec2, k: number): Vec2 => ({ x: v.x + off.x * k, y: v.y + off.y * k })

  if (!move) {
    return { type: 'melee', isBuff: false, hit: { aimRear: false, isSkill: kind !== 'normal', areaWorld: 0, centerX: target.main.x } }
  }

  const plan = planShot({
    rangerId: assets.id,
    kind,
    meta: move.meta,
    skill: kind === 'normal' ? null : assets.gameData?.skills[kind] ?? null,
    stand,
    bodyFps: bodyFpsOf(assets, cfg),
    front: { main: shift(target.main, -1), face: shift(target.face, -1), center: target.center ? shift(target.center, -1) : null },
    rear: null,   // เป้าเดียว = ตัวที่เล็ง
    bulletFor: suffix => assets.bullets[suffix]?.geometry,
    manual: move.synthetic || a.positioning === 'manual' ? { muzzle: a.muzzle, impactOffset: a.impactOffset } : null,
    arcPeakOverride: move.synthetic ? a.projectile?.arcHeight ?? null : null,
    fitNormalOverride: move.synthetic ? a.projectile?.fitFlight === true : false,
    aimTilt: a.aimTilt === true,
    aimTiltOffset: a.aimTiltOffset ?? 0,
    aimTiltFinish: a.aimTiltFinish === true,
  })
  if (plan.type === 'melee') return plan
  const moved = off.x === 0 && off.y === 0 ? plan : { ...plan, start: shift(plan.start, 1), end: shift(plan.end, 1) }
  if (!a.finishSplit) return moved
  // จุดระเบิดแยก: ฐานเดียวกับ impactOffset — เท้าเป้า (บัฟ = เท้าผู้ร่าย ณ จุดที่ยืนร่าย)
  const base = moved.isBuff ? shift(stand, 1) : target.main
  return { ...moved, finishAt: { x: base.x + a.finishOffset.x, y: base.y + a.finishOffset.y } }
}
