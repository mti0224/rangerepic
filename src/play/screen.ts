// ====================================================
// screen.ts — หน้าจอแบบเกม (หน้าทดลองเล่นเท่านั้น)
//   · มือถือ/แท็บเล็ต (จอสัมผัส): กดเริ่มดวล → เต็มจอ + ล็อกแนวนอน (Android Chrome ทำได้จริง)
//     iPhone Safari ไม่มี Fullscreen/ล็อกจอให้เว็บ → ใช้ป้าย "หมุนเป็นแนวนอน" แทน (+ Add to Home Screen = เต็มจอ)
//   · ห้ามซูม: pinch / ดับเบิลแตะ / Ctrl+ล้อเมาส์ / Ctrl + - 0
// ====================================================

import { useEffect, useState } from 'react'

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> }
type FsEl = HTMLElement & { webkitRequestFullscreen?: (opt?: unknown) => Promise<void> | void }
type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> }

/** จอสัมผัสเป็นหลัก (มือถือ / แท็บเล็ต) */
export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true

/** เบราว์เซอร์นี้ให้เว็บเข้าเต็มจอได้ไหม (iPhone Safari = ไม่ได้) */
export const canFullscreen = (): boolean => {
  if (typeof document === 'undefined') return false
  const el = document.documentElement as FsEl
  return !!(document.fullscreenEnabled || el.webkitRequestFullscreen)
}

export const isFullscreen = (): boolean => {
  const d = document as FsDoc
  return !!(d.fullscreenElement || d.webkitFullscreenElement)
}

/**
 * เต็มจอ + ล็อกแนวนอน — ต้องเรียกจากการกด/แตะของผู้ใช้โดยตรง (เบราว์เซอร์บังคับ)
 * ไม่รองรับ/ถูกปฏิเสธ = เงียบไว้ เกมยังเล่นได้ในหน้าต่างปกติ
 */
export function enterGameFullscreen(): void {
  if (isFullscreen()) { void lockLandscape(); return }
  const el = document.documentElement as FsEl
  try {
    const p = el.requestFullscreen
      ? el.requestFullscreen({ navigationUI: 'hide' })
      : el.webkitRequestFullscreen?.()
    Promise.resolve(p).then(() => lockLandscape()).catch(() => {})
  } catch { /* ไม่รองรับ */ }
}

async function lockLandscape(): Promise<void> {
  try { await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape') } catch { /* ไม่รองรับ (เช่น เดสก์ท็อป / iOS) */ }
}

// ── เบราว์เซอร์ในแอป (Facebook / Messenger / LINE / Instagram / TikTok ...) ──
// เปิดลิงก์จากแชตแล้วมักเปิดในเบราว์เซอร์ในแอป ซึ่งไม่ให้เว็บเต็มจอ/ล็อกจอ → ชวนเปิดใน Chrome / Safari แทน

export type InAppKind = 'line' | 'facebook' | 'instagram' | 'tiktok' | 'other'

export function inAppBrowser(): InAppKind | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (/\bLine\//i.test(ua)) return 'line'
  if (/FBAN|FBAV|FB_IAB|FBIOS|Messenger/i.test(ua)) return 'facebook'
  if (/Instagram/i.test(ua)) return 'instagram'
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'tiktok'
  // Android WebView ทั่วไป (แอปอื่นๆ): มี "; wv)" ใน UA
  if (/Android/i.test(ua) && /; wv\)/.test(ua)) return 'other'
  return null
}

export const isIOS = (): boolean =>
  typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/**
 * พยายามเปิดหน้านี้ในเบราว์เซอร์จริง
 *   LINE: ?openExternalBrowser=1 (LINE รองรับเอง) · Android: intent → Chrome · iOS: ทำให้ไม่ได้ (คืน false ให้บอกวิธีเอง)
 */
export function openInExternalBrowser(): boolean {
  const kind = inAppBrowser()
  const url = new URL(window.location.href)
  if (kind === 'line') {
    url.searchParams.set('openExternalBrowser', '1')
    window.location.href = url.toString()
    return true
  }
  if (/Android/i.test(navigator.userAgent)) {
    const rest = url.host + url.pathname + url.search + url.hash
    window.location.href = `intent://${rest}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.toString())};end`
    return true
  }
  return false
}

/** สถานะเต็มจอ (อัปเดตเมื่อเข้า/ออก เช่น ผู้เล่นปัดออกเอง) */
export function useFullscreen(): boolean {
  const [fs, setFs] = useState(() => typeof document !== 'undefined' && isFullscreen())
  useEffect(() => {
    const on = () => setFs(isFullscreen())
    document.addEventListener('fullscreenchange', on)
    document.addEventListener('webkitfullscreenchange', on)
    return () => {
      document.removeEventListener('fullscreenchange', on)
      document.removeEventListener('webkitfullscreenchange', on)
    }
  }, [])
  return fs
}

/** ห้ามซูมทั้งหน้า (เรียกครั้งเดียวตอนเปิดหน้า) — ช่องพิมพ์ยังพิมพ์ได้ปกติ */
export function installNoZoom(): void {
  if (typeof window === 'undefined') return
  const stop = (e: Event) => e.preventDefault()
  // Ctrl/⌘ + ล้อเมาส์ · pinch บน touchpad (Chrome ส่งมาเป็น wheel + ctrlKey)
  window.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) e.preventDefault() }, { passive: false })
  // Ctrl/⌘ + = - 0
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Digit0', 'Numpad0'].includes(e.code)) e.preventDefault()
  })
  // iOS Safari: pinch (ไม่สน user-scalable=no)
  document.addEventListener('gesturestart', stop, { passive: false } as AddEventListenerOptions)
  document.addEventListener('gesturechange', stop, { passive: false } as AddEventListenerOptions)
  // สองนิ้วขึ้นไป = pinch → ห้าม
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault() }, { passive: false })
}
