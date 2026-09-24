// ====================================================
// samParser.ts — SAM binary animation parser
// Port จาก lerico_res/sam_player.js
// ====================================================

const _TWIPS = 20.0
const _Q16   = 65536.0

export interface SamImage {
  name: string
  w: number
  h: number
  m: [number, number, number, number, number, number]  // 2D transform matrix
}

// Per-frame snapshot: [objNum, resNum, matrix, color]
export type SamFrameObject = [number, number, number[], number[]]
export type SamFrame = SamFrameObject[]

export class SAMParser {
  view: DataView
  raw: Uint8Array
  pos = 0
  animRate = 24
  images: SamImage[] = []
  animations: Record<string, SamFrame[]> = {}
  animNames: string[] = []
  allSegments: [string, number, number][] = []
  // ความยาว (จำนวนเฟรม) ของช่วง "เตรียมท่า" (ready/cast) ก่อนถึงช่วง "ปล่อยจริง" (trigger)
  // ของแต่ละ combo anim ที่ applyAttackCombos() รวมไว้ — ใช้จับจังหวะปล่อยกระสุน
  comboReadyLength: Record<string, number> = {}

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer)
    this.raw = new Uint8Array(buffer)
    this._parse()
  }

  private _u8(): number  { return this.raw[this.pos++] }
  private _u16(): number { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v }
  private _i16(): number { const v = this.view.getInt16 (this.pos, true); this.pos += 2; return v }
  private _i32(): number { const v = this.view.getInt32 (this.pos, true); this.pos += 4; return v }
  private _str(): string {
    const L = this._u16()
    let s = ''
    for (let i = 0; i < L; i++) s += String.fromCharCode(this.raw[this.pos + i])
    this.pos += L
    return s
  }

  private _parse(): void {
    const magic = this._i32()
    if (magic !== 0x2E53414D) throw new Error('Bad SAM magic: 0x' + (magic >>> 0).toString(16))
    if (this._i32() !== 1)    throw new Error('Unsupported SAM version')

    this.animRate = this._u8()
    this._i32(); this._i32() // x, y
    this._i32(); this._i32() // canvas_w, canvas_h

    const nImages = this._i16()
    for (let k = 0; k < nImages; k++) {
      const name = this._str()
      const w   = this._i16()
      const h   = this._i16()
      const m00 = this._i32() / (_Q16 * _TWIPS)
      const m01 = this._i32() / (_Q16 * _TWIPS)
      const m10 = this._i32() / (_Q16 * _TWIPS)
      const m11 = this._i32() / (_Q16 * _TWIPS)
      const m02 = this._i16() / _TWIPS
      const m12 = this._i16() / _TWIPS
      this.images.push({ name, w, h, m: [m00, m01, m10, m11, m02, m12] })
    }

    const FF_REMOVES = 0x01, FF_ADDS = 0x02, FF_MOVES = 0x04, FF_FRAME_NAME = 0x08
    const MF_ROTATE = 0x4000, MF_COLOR = 0x2000, MF_MATRIX = 0x1000, MF_LONGCOORDS = 0x0800

    const nFrames = this._i16()
    interface ObjState { res: number; m: number[]; color: number[]; moved: boolean }
    const objects: Record<number, ObjState> = {}
    const depthMem: Record<number, ObjState> = {}
    let curAnim = '_intro'
    this.animations[curAnim] = []
    this.animNames.push(curAnim)

    for (let fi = 0; fi < nFrames; fi++) {
      const flags = this._u8()

      if (flags & FF_REMOVES) {
        const n = this._u8()
        for (let i = 0; i < n; i++) {
          const id = this._i16()
          if (objects[id]) depthMem[id] = objects[id]
          delete objects[id]
        }
      }

      if (flags & FF_ADDS) {
        const n = this._u8()
        for (let i = 0; i < n; i++) {
          const objNum = this._i16() & 0x07FF
          const resNum = this._u8()
          objects[objNum] = depthMem[objNum]
            ? { res: resNum, m: [...depthMem[objNum].m], color: [...depthMem[objNum].color], moved: true }
            : { res: resNum, m: [1, 0, 0, 1, 0, 0], color: [255, 255, 255, 255], moved: false }
        }
      }

      if (flags & FF_MOVES) {
        const n = this._u8()
        for (let i = 0; i < n; i++) {
          const foan = this._u16()
          const objNum = foan & 0x07FF
          const mFlags = foan & 0xF800

          if (!objects[objNum]) {
            objects[objNum] = { res: 0, m: [1, 0, 0, 1, 0, 0], color: [255, 255, 255, 255], moved: false }
          }

          const obj = objects[objNum]
          obj.moved = true

          let m00 = 1, m01 = 0, m10 = 0, m11 = 1
          if (mFlags & MF_MATRIX) {
            m00 = this._i32() / _Q16; m01 = this._i32() / _Q16
            m10 = this._i32() / _Q16; m11 = this._i32() / _Q16
          } else if (mFlags & MF_ROTATE) {
            const rot = this._i16() / 1000.0
            const c = Math.cos(rot), s = Math.sin(rot)
            m00 = c; m01 = -s; m10 = s; m11 = c
          }

          let m02: number, m12: number
          if (mFlags & MF_LONGCOORDS) {
            m02 = this._i32() / _TWIPS
            m12 = this._i32() / _TWIPS
          } else {
            m02 = this._i16() / _TWIPS
            m12 = this._i16() / _TWIPS
          }

          obj.m = [m00, m01, m10, m11, m02, m12]
          if (mFlags & MF_COLOR) obj.color = [this._u8(), this._u8(), this._u8(), this._u8()]
          depthMem[objNum] = { res: obj.res, m: [...obj.m], color: [...obj.color], moved: true }
        }
      }

      if (flags & FF_FRAME_NAME) {
        const name = this._str()
        if (!this.animations[name]) { this.animations[name] = []; this.animNames.push(name) }
        curAnim = name
      }

      const snap: SamFrame = []
      for (const k of Object.keys(objects).map(Number).sort((a, b) => a - b)) {
        const o = objects[k]
        if (o.moved) snap.push([k, o.res, [...o.m], [...o.color]])
      }
      this.animations[curAnim].push(snap)
    }

    if (!this.animations['_intro']?.length) {
      delete this.animations['_intro']
      const i = this.animNames.indexOf('_intro')
      if (i >= 0) this.animNames.splice(i, 1)
    }

    // _all = ทุก animation รวมกัน (ใช้สำหรับ autoFit)
    const allFrames: SamFrame[] = []
    for (const n of [...this.animNames]) {
      const start = allFrames.length
      allFrames.push(...this.animations[n])
      this.allSegments.push([n, start, allFrames.length])
    }
    this.animations['_all'] = allFrames
    this.animNames.unshift('_all')
  }
}

// ── Auto-combine attack animations เป็น combo เดียว ──
//   PAIRS  : ready + attack  → All_xxx
//   TRIPLETS: part1 + part2 + part3 → All_xxx
//     s_action_attack_1/2 = Cast, s_action_attack_3 = Recovery
// เฟรมนี้มีภาพให้เห็นไหม (มีอ็อบเจกต์ที่ alpha > 0 และอ้างรูปที่มีจริง)
function frameHasArt(sam: SAMParser, frame: SamFrame): boolean {
  for (const [, resNum, , color] of frame) {
    if (color[3] > 0 && resNum < sam.images.length) return true
  }
  return false
}
// ── ตัดเฟรมท้ายของช่วง "เตรียมท่า" ที่ไม่มีภาพออก ──
// บางตัวละครหายตัวไปก่อนช่วงเตรียมจะจบ (ท่าวาป/ดำดิน) เฟรมท้ายๆ จึงว่างเปล่า
// ถ้ารอจนครบช่วงเตรียมจริง กระสุนจะออกช้ากว่าที่ควรโดยไม่มีอะไรให้ดูระหว่างนั้น
// เช่น u1229h-poseidon s2_attack_ready ยาว 40 เฟรม แต่ 17 เฟรมท้ายว่าง (หายตัวที่เฟรม 23)
// → คืนค่า 23 กระสุนจึงออกทันทีที่ตัวละครหายตัว เร็วขึ้น 0.57 วินาที
// ตัวที่ไม่มีเฟรมว่าง (ส่วนใหญ่) ได้ค่าเดิมไม่เปลี่ยน
function readyLengthUntilVanish(sam: SAMParser, comboName: string, readyLen: number): number {
  const frames = sam.animations[comboName]
  if (!frames || readyLen <= 0) return readyLen
  let n = readyLen
  while (n > 0 && !frameHasArt(sam, frames[n - 1])) n--
  return n
}

export function applyAttackCombos(sam: SAMParser): void {
  // ── Pairs (ready + attack) ──
  const PAIRS: [string, string, string][] = [
    ['All_attack',    'attack_ready',    'attack'   ],
    ['All_s_attack',  's_attack_ready',  's_attack' ],
    ['All_s2_attack', 's2_attack_ready', 's2_attack'],
  ]
  for (const [comboName, readyName, atkName] of PAIRS) {
    const hasReady = sam.animNames.includes(readyName)
    const hasAtk   = sam.animNames.includes(atkName)
    if (!hasReady && !hasAtk) continue

    sam.animations[comboName] = [
      ...(hasReady ? sam.animations[readyName] : []),
      ...(hasAtk   ? sam.animations[atkName]   : []),
    ]
    sam.comboReadyLength[comboName] = readyLengthUntilVanish(sam, comboName, hasReady ? sam.animations[readyName].length : 0)
    const insertAt = Math.min(
      hasReady ? sam.animNames.indexOf(readyName) : Infinity,
      hasAtk   ? sam.animNames.indexOf(atkName)   : Infinity,
    )
    sam.animNames.splice(insertAt, 0, comboName)
    for (const n of [readyName, atkName]) {
      const i = sam.animNames.indexOf(n)
      if (i !== -1) { sam.animNames.splice(i, 1); delete sam.animations[n] }
    }
  }

  // ── Triplets (action skill: part1 + part2 + part3) ──
  //   part1+part2 = Cast time, part3 = Recovery
  const TRIPLETS: [string, string, string, string][] = [
    ['All_s_action_attack',  's_action_attack_1',  's_action_attack_2',  's_action_attack_3' ],
    ['All_s2_action_attack', 's2_action_attack_1', 's2_action_attack_2', 's2_action_attack_3'],
  ]
  for (const [comboName, p1, p2, p3] of TRIPLETS) {
    const parts = [p1, p2, p3].filter(n => sam.animNames.includes(n))
    if (parts.length === 0) continue

    sam.animations[comboName] = parts.flatMap(n => sam.animations[n])
    // part3 (Recovery) คือช่วงที่ปล่อยจริง — ความยาว "ready" คือผลรวมของ part1+part2 (Cast) เท่านั้น
    sam.comboReadyLength[comboName] = readyLengthUntilVanish(sam, comboName,
      parts.filter(n => n !== p3).reduce((s, n) => s + sam.animations[n].length, 0))

    const insertAt = Math.min(...parts.map(n => sam.animNames.indexOf(n)))
    sam.animNames.splice(insertAt, 0, comboName)

    for (const n of parts) {
      const i = sam.animNames.indexOf(n)
      if (i !== -1) { sam.animNames.splice(i, 1); delete sam.animations[n] }
    }
  }
}
