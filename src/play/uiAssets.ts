// ====================================================
// uiAssets.ts — รูป UI ของจอดวล (public/ui/) · โหลดครั้งเดียวแล้วเก็บไว้ใช้ซ้ำ
// ยังโหลดไม่เสร็จ/ไม่มีไฟล์ → คืน null แล้วผู้วาดใช้รูปทรงแทนไปก่อน
// ====================================================

import type { Category, Element } from '@/lib/rangerClass'

export const UI_SRC = {
  element: {
    fire: '/ui/Fire.png', water: '/ui/Water.png', wood: '/ui/Tree.png', light: '/ui/Light.png', dark: '/ui/Dark.png',
  } as Record<Element, string>,
  category: { str: '/ui/Str.png', agi: '/ui/Agi.png', int: '/ui/Int.png' } as Record<Category, string>,
  setting: '/ui/setting.png',
  /** ไอคอนเล็ก 30×28: ดาบ = ตีธรรมดา · โล่ = ค่าโล่ · หัวใจ = HP · คริสตัล = Cost/พลังงาน */
  atk: '/ui/atk.png',
  def: '/ui/def.png',
  hp: '/ui/hp.png',
  mineral: '/ui/mineral.png',
  /** ป้าย VS กลางบน */
  vs: '/ui/VS.png',
  /**
   * กรอบรูปเรนเจอร์มุมซ้ายล่าง (114×127) ตาม Evolution — s = Normal (ทอง) · u = Ultra (ฟ้า) · h = Hyper (ชมพู)
   * back = พื้นหลัง (ล่างสุด) · font = กรอบหน้า (ทับรูป — กลางโปร่งใส แถบล่างทึบ)
   */
  frame: {
    normal: { back: '/ui/frame_s_back.png', front: '/ui/frame_s_font.png' },
    ultra: { back: '/ui/frame_u_back.png', front: '/ui/frame_u_font.png' },
    hyper: { back: '/ui/frame_h_back.png', front: '/ui/frame_h_font.png' },
  },
}

const cache = new Map<string, HTMLImageElement>()

/** รูปที่พร้อมวาดแล้ว (ยังไม่พร้อม = null) */
export function uiImage(src: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null
  let img = cache.get(src)
  if (!img) { img = new Image(); img.src = src; cache.set(src, img) }
  return img.complete && img.naturalWidth > 0 ? img : null
}

export const elementIcon = (e: Element | undefined) => (e ? uiImage(UI_SRC.element[e]) : null)
export const categoryIcon = (c: Category | undefined) => (c ? uiImage(UI_SRC.category[c]) : null)
