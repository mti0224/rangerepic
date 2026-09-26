// ====================================================
// i18n.ts (editor) — Editor 語言：ไทย / English / 繁體中文
//
// 記住本機語言選擇；本專案預設 = 繁體中文
// แยกจาก i18n ของหน้าเล่น (src/play/i18n.ts) เพราะคนละหน้า คนละ bundle
//
// ทุกตารางเก็บเป็นชุด 3 ช่องเรียงตาม ELANGS: [th, en, zh]
// เพิ่มภาษาใหม่ = เพิ่มรหัสใน ELANGS แล้วเติมช่องท้ายทุกตาราง (TypeScript ฟ้องให้เองถ้าลืม)
//
// ป้ายของ lib (ธาตุ · ตำแหน่ง · พาสซีฟ · ความสามารถสกิล) ทำสำเนาไว้ที่นี่แทนการแก้ lib
// เพราะ lib ใช้ร่วมกับหน้าเล่นและสคริปต์ทดสอบ — คีย์ยังเป็นตัวเดียวกัน จึงไม่มีทางหลุด
// ====================================================

import { useEffect, useState } from 'react'
import type { Category, Element, Role } from '@/lib/rangerClass'
import type { Stats } from '@/lib/rangerConfig'
import type { EffectType, HealScale, LifestealScope, SkillArea } from '@/lib/skills'
import type { PassiveType } from '@/lib/passives'
import type { GameText } from '@/lib/rangerApi'

export type ELang = 'th' | 'en' | 'zh'
export const ELANGS: ELang[] = ['th', 'en', 'zh']
export const ELANG_LABEL: Record<ELang, string> = { th: 'ไทย', en: 'EN', zh: '繁中' }

/** ข้อความ 1 ชุด เรียงตาม ELANGS */
type L3 = readonly [string, string, string]

const STORAGE_KEY = 'lr:editor-lang:v2'
const isELang = (v: unknown): v is ELang => typeof v === 'string' && (ELANGS as string[]).includes(v)

let lang: ELang = (() => {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    return isELang(v) ? v : 'zh'
  } catch { return 'zh' }
})()

export const getELang = (): ELang => lang

const listeners = new Set<(l: ELang) => void>()
export function setELang(next: ELang): void {
  if (next === lang) return
  lang = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* โหมดส่วนตัว — ไม่จำก็ได้ */ }
  for (const fn of listeners) fn(next)
}
export function onELangChange(fn: (l: ELang) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** ช่องของภาษาปัจจุบัน */
const li = (): number => {
  const i = ELANGS.indexOf(lang)
  return i < 0 ? 0 : i
}
const pick = (row: L3): string => row[li()]

/** ภาษาปัจจุบัน — คอมโพเนนต์ที่เรียกจะรีเรนเดอร์เมื่อเปลี่ยนภาษา */
export function useELang(): ELang {
  const [l, setL] = useState<ELang>(getELang())
  useEffect(() => onELangChange(setL), [])
  return l
}

/** ชื่อจากข้อมูลเกมตามภาษาที่เลือก (ไม่มี → ไล่ไปภาษาถัดไปที่มี) */
export function gameName(name: GameText | null | undefined): string | null {
  if (!name) return null
  const order: (keyof GameText)[] = [lang, ...(['th', 'en', 'zh'] as const).filter(l => l !== lang)]
  for (const l of order) {
    const v = name[l]
    if (v && v.trim()) return v
  }
  return null
}

// ─────────────────────────────── ข้อความของหน้า ───────────────────────────────

const T = {
  // ── แถบบนสุด ──
  navPlay: ['⚔ ทดลองเล่น 5v5 ↗', '⚔ Try 5v5 ↗', '⚔ 試玩 5v5 ↗'],
  language: ['ภาษา', 'Language', '語言'],

  // ── แท็บ ──
  tabGeneral: ['ทั่วไป', 'General', '一般'],
  tabPortrait: ['รูปหน้า', 'Portrait', '頭像'],
  tabClips: ['คลิป', 'Clips', '動畫'],
  tabAnchors: ['จุดยึด', 'Anchors', '錨點'],
  tabAttack: ['ตีธรรมดา', 'Attack', '普攻'],
  tabSkill1: ['สกิล 1', 'Skill 1', '技能1'],
  tabSkill2: ['สกิล 2', 'Skill 2', '技能2'],
  tabCutin: ['คัตซีน', 'Cut-in', '演出'],

  // ── ข้อความสถานะ ──
  stLoading: ['กำลังโหลด...', 'Loading…', '載入中…'],
  stBullets: [' · กระสุน {list}', ' · bullets {list}', ' · 彈道 {list}'],
  stNoBullets: [' · ไม่มีกระสุน (ตีประชิด)', ' · no bullet file (melee)', ' · 無彈道檔（近戰）'],
  stLoadedSaved: ['โหลดค่าที่บันทึกไว้แล้ว', 'Loaded the saved settings', '已載入儲存的設定'],
  stNewRanger: ['เรนเจอร์ใหม่ — ยังไม่เคยตั้งค่า', 'New ranger — never configured', '新英雄 — 尚未設定過'],
  stLoadFail: ['โหลดไม่สำเร็จ: {err}', 'Load failed: {err}', '載入失敗：{err}'],
  stSaved: ['บันทึกลง public/rangers/{id}/ranger.json แล้ว', 'Saved to public/rangers/{id}/ranger.json', '已儲存至 public/rangers/{id}/ranger.json'],
  stSaveFail: ['บันทึกไม่สำเร็จ: {err}', 'Save failed: {err}', '儲存失敗：{err}'],
  stApproved: [
    'อนุมัติแล้ว — ตัวนี้พร้อมเล่น จะขึ้นในหน้าจัดทีม',
    'Approved — this ranger is playable and will show in the team screen',
    '已核可 — 此英雄可上場，會出現在編隊畫面',
  ],
  stUnapproved: [
    'ยกเลิกอนุมัติแล้ว — ตัวนี้จะไม่ขึ้นในหน้าจัดทีม',
    'Approval removed — this ranger will not show in the team screen',
    '已取消核可 — 此英雄不會出現在編隊畫面',
  ],
  stApproveFail: ['อนุมัติไม่สำเร็จ: {err}', 'Approve failed: {err}', '核可失敗：{err}'],
  stDeleted: [
    'ลบ {id} แล้ว — ย้ายไปไว้ที่ {to} (ย้ายกลับมาที่ public/rangers/ เพื่อกู้คืน)',
    'Deleted {id} — moved to {to} (move it back to public/rangers/ to restore)',
    '已刪除 {id} — 移至 {to}（移回 public/rangers/ 即可復原）',
  ],
  stDeleteFail: ['ลบไม่สำเร็จ: {err}', 'Delete failed: {err}', '刪除失敗：{err}'],
  stFetching: ['กำลังดึงข้อมูลเกมจาก lerico…', 'Fetching game data from lerico…', '正在從 lerico 取得遊戲資料…'],
  stDataFail: ['โหลดข้อมูลไม่สำเร็จ: {err}', 'Data refresh failed: {err}', '資料更新失敗：{err}'],
  stDataOk: ['อัปเดตข้อมูลเกม {n} ตัว', 'Updated game data for {n} rangers', '已更新 {n} 名英雄的遊戲資料'],
  stDataRenamed: [' · ตั้งชื่อตามเกม {n} ตัว', ' · renamed {n} from the game', ' · 依遊戲改名 {n} 名'],
  stDataMissing: [' · ไม่พบ {ids}', ' · not found: {ids}', ' · 找不到 {ids}'],
  stDataStale: [
    ' · (บางส่วนใช้แคชเดิม — API ต้นทางมีปัญหา)',
    ' · (some parts came from the old cache — the upstream API had trouble)',
    ' · （部分使用舊快取 — 來源 API 有問題）',
  ],
  stFetchRanger: ['กำลังโหลด {id} จาก lerico...', 'Fetching {id} from lerico…', '正在從 lerico 取得 {id}…'],
  stNotFound: ['ไม่พบเรนเจอร์นี้', 'That ranger was not found', '找不到這名英雄'],
  stFetched: ['โหลด {id} สำเร็จ ({kb} KB)', 'Fetched {id} ({kb} KB)', '已取得 {id}（{kb} KB）'],

  // ── หมุดที่ลากได้ ──
  anchorGroundFoot: ['จุดยืน (เท้า)', 'Stand point (feet)', '站立點（腳）'],
  anchorGround: ['จุดยืน', 'Stand point', '站立點'],
  anchorHit: ['จุดโดนตี', 'Hit point', '受擊點'],
  anchorOverhead: ['เหนือหัว', 'Overhead', '頭頂'],
  anchorWalkStop: ['จุดหยุดเดิน', 'Walk stop', '走位停點'],
  autoSuffix: [' (อัตโนมัติ)', ' (auto)', '（自動）'],
  anchorMuzzle: ['จุดปล่อย', 'Muzzle', '發射點'],
  anchorEndNormal: ['ปลายทาง normal', 'normal end point', 'normal 終點'],
  anchorBuffSpawn: ['จุดเกิดบัฟ', 'Buff spawn', '增益出現點'],
  anchorFxSpawn: ['จุดเกิดเอฟเฟกต์', 'Effect spawn', '特效出現點'],
  anchorImpact: ['จุดกระทบ', 'Impact', '命中點'],
  anchorFinish: ['จุด finish (ระเบิด)', 'finish point (burst)', 'finish 點（爆炸）'],

  // ── แผงซ้าย: รายชื่อ ──
  rangers: ['เรนเจอร์', 'Rangers', '英雄'],
  refreshTitle: [
    'ดึงธาตุ ชนิด ชื่อ และไอคอนสกิลของทุกตัวจาก API ของ lerico ใหม่',
    'Re-fetch element, type, name and skill icons for every ranger from the lerico API',
    '重新從 lerico API 取得所有英雄的屬性、類型、名稱與技能圖示',
  ],
  refreshing: ['กำลังโหลดข้อมูล…', 'Refreshing…', '更新中…'],
  refreshBtn: ['🔄 โหลดข้อมูลอีกครั้ง', '🔄 Refresh game data', '🔄 重新載入資料'],
  addPlaceholder: ['เช่น u1607e-sh', 'e.g. u1607e-sh', '例如 u1607e-sh'],
  starsAlt: ['{n} ดาว', '{n} stars', '{n} 星'],
  tagReady: ['✓ พร้อมเล่น', '✓ Playable', '✓ 可上場'],
  tagConfigured: ['ตั้งค่าแล้ว', 'Configured', '已設定'],
  tagUnconfigured: ['ยังไม่ตั้งค่า', 'Not configured', '尚未設定'],
  listEmpty: [
    'ยังไม่มีเรนเจอร์ — พิมพ์รหัสด้านบนเพื่อโหลด',
    'No rangers yet — type an id above to fetch one',
    '還沒有英雄 — 在上方輸入代碼即可載入',
  ],

  // ── กลางจอ: เวที ──
  fireBtn: ['⚔ ทดสอบยิง', '⚔ Test fire', '⚔ 測試發射'],
  hintLocked: [
    'โหมดยืนจริง — เท้าถูกล็อกกับเส้นพื้นเหมือนตอนอยู่ในแมพ',
    'Live stance — the feet are locked to the ground line just like in a battle',
    '實戰站位 — 腳部鎖在地面線上，和實戰一樣',
  ],
  hintPin: [
    'โหมดตั้งหมุด — ลากหมุดเขียวไปที่เท้าของตัวละคร',
    'Pin mode — drag the green pin onto the character’s feet',
    '設點模式 — 把綠色標記拖到角色腳下',
  ],
  hintTail: [
    'Shift = ล็อกจำนวนเต็ม · ลากพื้นหลัง = เลื่อนจอ · สกรอลล์ = ซูม',
    'Shift = snap to whole numbers · drag the background = pan · scroll = zoom',
    'Shift = 鎖定整數 · 拖曳背景 = 平移 · 滾輪 = 縮放',
  ],
  pickRanger: ['เลือกเรนเจอร์จากรายการทางซ้าย', 'Pick a ranger from the list on the left', '請從左側列表選擇英雄'],

  // ── แท็บทั่วไป ──
  gameDataLabel: ['ข้อมูลจากเกม:', 'From the game:', '遊戲資料：'],
  gradeLine: ['ระดับ {n} ดาว · Evolution', 'Grade {n} stars · Evolution', '{n} 星 · Evolution'],
  elementWord: ['ธาตุ', 'Element', '屬性'],
  categoryWord: ['ชนิด', 'Type', '類型'],
  suggestWord: ['แนะนำ', 'suggested', '建議'],
  applyGame: ['ใช้ค่าจากเกม', 'Use the game’s values', '套用遊戲數值'],
  noGameData: [
    'ยังไม่มีข้อมูลจากเกม (ธาตุ/ชนิด/ไอคอนสกิล) — กด “โหลดข้อมูลอีกครั้ง” เมื่อ API ต้นทางใช้ได้',
    'No game data yet (element / type / skill icons) — press “Refresh game data” once the upstream API works',
    '尚無遊戲資料（屬性／類型／技能圖示）— 來源 API 可用時請按「重新載入資料」',
  ],
  fName: ['ชื่อ', 'Name', '名稱'],
  fRole: ['ตำแหน่ง', 'Role', '職業'],
  hStats: ['ค่าสถานะ', 'Stats', '能力值'],
  rollStats: ['🎲 สุ่มค่าพลังที่เหมาะกับ{role}', '🎲 Roll stats that suit a {role}', '🎲 隨機產生適合{role}的數值'],
  hPassive: ['พาสซีฟพิเศษ', 'Special passives', '特殊被動'],
  passiveNote: [
    'ความสามารถติดตัวตลอดเกม ไม่ต้องร่าย ไม่เสีย Cost — คนละส่วนกับความสามารถประจำตำแหน่ง',
    'Always-on abilities: no casting, no Cost — separate from the role ability',
    '全場生效的能力，不需施放也不耗能量 — 與職業能力是不同的東西',
  ],
  noPassive: ['ยังไม่มีพาสซีฟ — เพิ่มจากรายการด้านล่าง', 'No passives yet — add one from the list below', '尚無被動 — 請從下方清單新增'],
  remove: ['ลบ', 'Remove', '移除'],
  addPassive: ['+ เพิ่มพาสซีฟ…', '+ Add a passive…', '+ 新增被動…'],
  metaClips: ['fps {fps} · {clips} คลิป · {sprites} สไปรต์', 'fps {fps} · {clips} clips · {sprites} sprites', 'fps {fps} · {clips} 動畫 · {sprites} 圖塊'],

  // ── แท็บคลิป ──
  clipsNote: [
    'จับคู่คลิปในไฟล์เข้ากับสถานะที่เกมต้องใช้',
    'Map the clips inside the file to the states the game needs',
    '把檔案內的動畫對應到遊戲需要的狀態',
  ],
  none: ['— ไม่มี —', '— none —', '— 無 —'],

  // ── แท็บจุดยึด ──
  anchorsHelp1: [
    '{stand} = ชี้ว่าตรงไหนบนภาพคือเท้า — ลากให้ตรงกับเท้าจริง แล้วเส้นประจะบอกแนว',
    '{stand} = marks where the feet are on the sprite — drag it onto the real feet and the dashed line will show the alignment',
    '{stand} = 標示圖上哪裡是腳 — 拖到實際腳下，虛線會顯示對齊位置',
  ],
  anchorsHelp2: [
    'พอไปแท็บอื่นหรือลงแมพ ตัวละครจะถูกเลื่อนให้เท้าตรงกับช่องยืนพอดีเอง',
    'On the other tabs and in battle the character is shifted so those feet land exactly on the slot',
    '切到其他分頁或上場時，角色會被自動位移讓腳剛好對到格位',
  ],
  anchorsHelp3: [
    '{hit} กับ {over} วัดจากเท้า จึงย้ายตามไปด้วยเสมอ',
    '{hit} and {over} are measured from the feet, so they always follow it',
    '{hit} 與 {over} 以腳為基準，因此會一起移動',
  ],

  // ── แท็บท่า (ตีธรรมดา / สกิล) ──
  hSkillCombat: ['ความสามารถในการรบ', 'Combat ability', '戰鬥能力'],
  hCutin: ['คัตซีนร่ายสกิล', 'Skill cut-in', '技能演出'],
  hasCutin: ['● มีคัตซีน', '● has a cut-in', '● 有演出'],
  noCutinYet: ['○ ยังไม่มีคัตซีน', '○ no cut-in yet', '○ 尚無演出'],
  goCutin: ['🎬 ไปเมนูคัตซีน', '🎬 Go to the cut-in tab', '🎬 前往演出分頁'],
  hAnim: ['อนิเมชั่น', 'Animation', '動畫'],
  fCastPre: ['ช่วงร่าย ส่วนที่ 1 (ท่า 3 ส่วน)', 'Cast part 1 (3-part motion)', '施放第1段（三段式動作）'],
  fCast: ['คลิปช่วงร่าย (cast)', 'Cast clip', '施放動畫（cast）'],
  fRelease: ['คลิปช่วงปล่อย (release)', 'Release clip', '出手動畫（release）'],
  fReadyLen: ['เฟรมที่ปล่อยกระสุน (readyLen)', 'Frame the bullet leaves (readyLen)', '彈道射出的影格（readyLen）'],
  useThisFrame: ['ใช้เฟรมนี้ ({n})', 'Use this frame ({n})', '使用此影格（{n}）'],
  castLongWarn: [
    'ช่วงร่ายยาว {castLen}f แต่ {tail}f ท้ายตัวละครหายตัวไปแล้ว',
    'The cast is {castLen}f long, but the character has already vanished for the last {tail}f',
    '施放長 {castLen}f，但最後 {tail}f 角色已經消失',
  ],
  ruleJoint: [
    'จังหวะตามกฎคือรอยต่อช่วงร่าย→ปล่อย',
    'The rule puts the timing at the cast→release seam',
    '規則的時間點在 施放→出手 的交界',
  ],
  useRuleValue: ['ใช้ค่าตามกฎ ({n})', 'Use the rule’s value ({n})', '採用規則值（{n}）'],
  fCastCap: ['เพดานเวลาช่วงร่าย (วินาที)', 'Cast time cap (seconds)', '施放時間上限（秒）'],
  unlimited: ['ไม่จำกัด', 'unlimited', '不限'],
  hApproach: ['เดินเข้าไปก่อนโจมตี', 'Walk in before attacking', '攻擊前先走位'],
  approachCheck: [
    'เดินไปหาเป้าก่อนร่าย (ตีใกล้ / สกิลระยะประชิด)',
    'Walk up to the target before casting (melee attack / close-range skill)',
    '施放前先走向目標（近戰攻擊／近距離技能）',
  ],
  fStopOffset: [
    'จุดหยุดเดิน (เทียบจุดยืนของเป้า · x ลบ = หน้าเป้า)',
    'Walk stop (relative to the target’s stand point · negative x = in front of it)',
    '走位停點（相對目標站立點 · x 為負 = 在目標前方）',
  ],
  fStopX: [
    'เลื่อนแกน X ของจุดหยุด (ลบ = ยืนหน้าเป้า · ยิ่งลบยิ่งห่าง)',
    'Stop point X offset (negative = stand in front · more negative = farther away)',
    '停點 X 位移（負值 = 站在目標前方 · 越負越遠）',
  ],
  resetDefault: ['กลับเป็นค่าเริ่มต้น', 'Back to the default', '回到預設值'],
  frontLimitTitle: [
    'ระยะที่แถวหน้าบนของเราห่างจากแถวหน้าบนของศัตรูในสนาม',
    'The distance from our top front-row slot to the enemy’s top front-row slot on the field',
    '我方前排上格與敵方前排上格在場上的距離',
  ],
  frontLimitBtn: ['[ ลิมิตชนหน้า ]', '[ front-line limit ]', '[ 前排極限 ]'],
  frontLimitMeta: [
    'x = {x} · แถวหน้าบน ↔ แถวหน้าบนศัตรู',
    'x = {x} · top front row ↔ enemy top front row',
    'x = {x} · 前排上格 ↔ 敵方前排上格',
  ],
  fWalkSpeed: ['ความเร็วการเคลื่อนที่ (หน่วย/วินาที)', 'Move speed (units/second)', '移動速度（單位／秒）'],
  speedSlow: ['ช้า', 'Slow', '慢'],
  speedNormal: ['ปกติ', 'Normal', '普通'],
  speedFast: ['เร็ว', 'Fast', '快'],
  speedDash: ['พุ่ง', 'Dash', '衝刺'],
  returnHome: ['โจมตีเสร็จแล้วเดินกลับที่เดิม', 'Walk back after the attack', '攻擊後走回原位'],
  walkNote: ['เดิน {dist} หน่วย ≈ {sec}s', 'Walks {dist} units ≈ {sec}s', '走 {dist} 單位 ≈ {sec}s'],
  walkRoundTrip: [' · ไป-กลับ {sec}s', ' · round trip {sec}s', ' · 往返 {sec}s'],
  noWalkClip: [
    ' · ⚠ ไม่มีคลิปเดิน ใช้ท่ายืนแทน (ตั้งได้ที่แท็บคลิป)',
    ' · ⚠ no walk clip, using the idle pose instead (set it on the Clips tab)',
    ' · ⚠ 沒有走路動畫，改用待機動作（可在動畫分頁設定）',
  ],
  hShot: ['การยิง', 'Projectile', '發射'],
  instantNote: [
    'ท่านี้ไม่บิน (เกิดที่เป้าเลย) — ความเร็วไม่มีผล เวลาขึ้นกับความยาวคลิป normal',
    'This motion does not fly (it spawns on the target) — speed has no effect, the timing follows the normal clip length',
    '此招式不飛行（直接在目標生成）— 速度無效，時間取決於 normal 動畫長度',
  ],
  fBulletSpeed: ['ความเร็วกระสุน', 'Bullet speed', '彈速'],
  fromGameData: [' (จากข้อมูลเกม)', ' (from the game data)', '（來自遊戲資料）'],
  manualSet: [' (ตั้งเอง)', ' (manual)', '（自訂）'],
  bulletSpeedMeta: [
    '≈ {perSec} หน่วย/วินาที · บินถึงเป้า {ticks} ติ๊ก = {sec}s',
    '≈ {perSec} units/second · reaches the target in {ticks} ticks = {sec}s',
    '≈ {perSec} 單位／秒 · 抵達目標 {ticks} tick = {sec}s',
  ],
  backToGameValue: ['กลับไปใช้ค่าจากข้อมูลเกม ({base})', 'Back to the game data value ({base})', '回到遊戲資料的數值（{base}）'],
  fAimDir: ['ทิศกระสุน', 'Bullet facing', '彈道朝向'],
  aimTilt: [
    'เฉียงตามจุดกระทบ (ยิงเป้าสูง/ต่ำกว่า หัวกระสุนชี้ไปทางนั้น · ทางโค้งหมุนตามโค้ง)',
    'Tilt toward the impact point (aim higher or lower and the head points that way · an arc rotates along the curve)',
    '依命中點傾斜（射向較高或較低的目標時彈頭會指過去 · 曲線彈道會沿著曲線轉）',
  ],
  aimTiltFinish: [
    'finish (ระเบิดตอนถึงเป้า) เฉียงตามด้วย',
    'the finish (burst on arrival) tilts too',
    'finish（抵達時的爆炸）也跟著傾斜',
  ],
  aimTiltNeed: ['ติ๊ก "เฉียงตามจุดกระทบ" ก่อน', 'Tick “tilt toward the impact point” first', '請先勾選「依命中點傾斜」'],
  rotateMore: ['หมุนเพิ่ม', 'extra rotation', '額外旋轉'],
  reset: ['รีเซ็ต', 'Reset', '重設'],
  fPositioning: ['จุดปล่อย / จุดตก', 'Muzzle / impact', '發射點／命中點'],
  posAuto: ['คำนวณจากข้อมูลเกม (กฎ Kiwi)', 'Computed from the game data (Kiwi rules)', '依遊戲資料計算（Kiwi 規則）'],
  posManual: ['ตั้งเอง (ลากหมุด)', 'Manual (drag the pins)', '自訂（拖曳標記）'],
  noGameMove: [
    'ท่านี้ไม่มีข้อมูลเกม — ต้องตั้งตำแหน่งและกระสุนเอง',
    'No game data for this motion — set the positions and the bullet by hand',
    '此招式沒有遊戲資料 — 位置與彈道需自行設定',
  ],
  fMuzzle: ['จุดปล่อย (เทียบจุดยืน)', 'Muzzle (relative to the stand point)', '發射點（相對站立點）'],
  fImpact: ['จุดตก (เทียบจุดยืนของเป้า)', 'Impact (relative to the target’s stand point)', '命中點（相對目標站立點）'],
  finishSplit: [
    'แยกตำแหน่ง finish (ระเบิด) ออกจากปลายทาง normal (กระสุน)',
    'Separate the finish (burst) position from the normal end point (bullet)',
    '將 finish（爆炸）位置與 normal 終點（彈道）分開',
  ],
  fFinishCaster: ['จุด finish (เทียบจุดยืนผู้ร่าย)', 'finish point (relative to the caster’s stand point)', 'finish 點（相對施放者站立點）'],
  fFinishTarget: ['จุด finish (เทียบจุดยืนของเป้า)', 'finish point (relative to the target’s stand point)', 'finish 點（相對目標站立點）'],
  noFinishClip: [
    '⚠ ไฟล์กระสุนของท่านี้ไม่มีคลิป finish — จุดนี้จะไม่มีอะไรให้เห็น',
    '⚠ this motion’s bullet file has no finish clip — nothing will show at this point',
    '⚠ 此招式的彈道檔沒有 finish 動畫 — 這個點不會有任何畫面',
  ],
  fTargetDist: ['ระยะหุ่นเป้า', 'Dummy distance', '假人距離'],
  hBulletManual: ['กระสุน (ตั้งเอง)', 'Bullet (manual)', '彈道（自訂）'],
  noBulletFile: [
    'ไม่มีไฟล์กระสุน — ตีประชิด เป้าโดนตีทันทีที่เฟรมปล่อย',
    'No bullet file — melee, the target is hit the moment the release frame plays',
    '沒有彈道檔 — 近戰，出手影格當下即命中',
  ],
  fBulletFile: ['ไฟล์กระสุน', 'Bullet file', '彈道檔'],
  bulletNone: ['ไม่มี (ตีประชิด)', 'none (melee)', '無（近戰）'],
  bulletDefault: [' (ค่ามาตรฐาน)', ' (default)', '（預設）'],
  fBulletMode: ['วิธีไปถึงเป้า', 'How it reaches the target', '抵達目標的方式'],
  modeFlight: ['บินจากปากกระบอก', 'Flies from the muzzle', '從發射點飛出'],
  modeAtTarget: ['ไม่บิน (เกิดที่เป้า)', 'No flight (spawns on the target)', '不飛行（在目標生成）'],
  fPath: ['วิถี', 'Path', '軌跡'],
  pathStraight: ['พุ่งตรง', 'Straight', '直線'],
  pathArc: ['ปาโค้ง', 'Arc', '拋物線'],
  fBulletSpeedUnit: ['ความเร็ว (unit/วิ)', 'Speed (units/s)', '速度（單位／秒）'],

  // ── แถบบันทึก ──
  save: ['บันทึก', 'Save', '儲存'],
  saved: ['บันทึกแล้ว', 'Saved', '已儲存'],
  approveOnTitle: [
    'กดเพื่อยกเลิก — ตัวนี้จะไม่ขึ้นในหน้าจัดทีม',
    'Click to undo — this ranger will not show in the team screen',
    '點擊取消 — 此英雄將不會出現在編隊畫面',
  ],
  approveOffTitle: [
    'บอกว่าตัวนี้ตั้งค่าเสร็จแล้ว พร้อมเล่น — จะขึ้นในหน้าจัดทีม (บันทึกให้ทันที)',
    'Mark this ranger as finished and playable — it will show in the team screen (saves right away)',
    '標記為設定完成、可上場 — 會出現在編隊畫面（立即儲存）',
  ],
  approvedBtn: ['✓ อนุมัติแล้ว (พร้อมเล่น)', '✓ Approved (playable)', '✓ 已核可（可上場）'],
  approveBtn: ['✓ อนุมัติ — พร้อมเล่น', '✓ Approve — playable', '✓ 核可 — 可上場'],
  deleteTitle: ['ลบเรนเจอร์ตัวนี้', 'Delete this ranger', '刪除此英雄'],
  deleteBtn: ['🗑 ลบ', '🗑 Delete', '🗑 刪除'],
  confirmDelTitle: ['ลบเรนเจอร์นี้?', 'Delete this ranger?', '要刪除這名英雄嗎？'],
  confirmDelBody1: [
    'ไฟล์ทั้งหมดของตัวนี้ (ภาพ อนิเมชัน ค่าที่ตั้งไว้) จะถูกย้ายไปถังขยะ',
    'Every file of this ranger (art, animation, settings) is moved to the trash folder',
    '此英雄的所有檔案（圖像、動畫、設定）會被移到回收資料夾',
  ],
  confirmDelBody2: [
    'จะหายจากรายชื่อและหน้าจัดทีม · ถ้าลบผิด ย้ายโฟลเดอร์กลับมาที่',
    'It disappears from the list and the team screen · if this was a mistake, move the folder back to',
    '會從列表與編隊畫面消失 · 若誤刪，請把資料夾移回',
  ],
  confirmDelBody3: ['เพื่อกู้คืน', 'to restore it', '即可復原'],
  cancel: ['ยกเลิก', 'Cancel', '取消'],

  // ── สรุปการยิง (อ่านอย่างเดียว) ──
  basisSelfBuff: ['ตัวเอง (บัฟ)', 'self (buff)', '自身（增益）'],
  basisFrontLine: ['ศัตรูแนวหน้า', 'enemy front line', '敵方前線'],
  basisRearLine: ['ศัตรูแนวหลัง', 'enemy rear line', '敵方後線'],
  meleeBuff: ['บัฟ — ไม่มีไฟล์กระสุน', 'Buff — no bullet file', '增益 — 無彈道檔'],
  meleeAttack: [
    'ตีประชิด — ไม่มีไฟล์กระสุน เป้าโดนตีทันทีที่เฟรมปล่อย',
    'Melee — no bullet file, the target is hit the moment the release frame plays',
    '近戰 — 無彈道檔，出手影格當下即命中',
  ],
  fileFromData: ['ไฟล์ตามข้อมูล: {f} (ไม่มีในเครื่อง)', 'File per the data: {f} (not on disk)', '資料指定檔案：{f}（本機沒有）'],
  basisNote: [
    '觸發基準: {b} — ตอนนี้ยิงไปหาเป้าที่เล็งเสมอ',
    '觸發基準: {b} — for now it always fires at the aimed target',
    '觸發基準：{b} — 目前一律射向瞄準的目標',
  ],
  typeBuff: ['บัฟ (เกิดที่ตัวผู้ร่าย)', 'Buff (spawns on the caster)', '增益（在施放者身上生成）'],
  typeInstant: ['ไม่บิน (เกิดคาเป้า)', 'No flight (spawns on the target)', '不飛行（在目標生成）'],
  typeFly: ['กระสุนบิน', 'Flying bullet', '飛行彈道'],
  aimGround: ['พื้น (MAIN)', 'ground (MAIN)', '地面（MAIN）'],
  aimCenter: ['กลางตัว (CENTER)', 'body centre (CENTER)', '身體中心（CENTER）'],
  fileWord: ['ไฟล์', 'file', '檔案'],
  flyWord: ['บิน', 'flight', '飛行'],
  tickWord: ['ติ๊ก', 'ticks', 'tick'],
  tailLine: [
    'ท่ายิงหลังปล่อยเหลือ {t}s → ',
    '{t}s of the motion is left after release → ',
    '出手後動作還剩 {t}s → ',
  ],
  bulletLate: ['กระสุนจบช้ากว่าท่า {d}s', 'the bullet ends {d}s after the motion', '彈道比動作晚 {d}s 結束'],
  bulletEarly: ['กระสุนจบก่อนท่า', 'the bullet ends before the motion', '彈道比動作先結束'],
  aimWord: ['เล็ง: ', 'Aim: ', '瞄準：'],
  offWord: ['(ปิด)', '(off)', '（關）'],
  speedManualGame: ['{n} (ตั้งเอง, เกม {g})', '{n} (manual, game {g})', '{n}（自訂，遊戲 {g}）'],
  basisAimNote: ['觸發基準: {b} (ยิงเป้าที่เล็ง)', '觸發基準: {b} (fires at the aimed target)', '觸發基準：{b}（射向瞄準的目標）'],
  areaUnits: [' · Area {pt}pt ({u} หน่วย)', ' · Area {pt}pt ({u} units)', ' · Area {pt}pt（{u} 單位）'],
  arcNote: ['ปาโค้ง ยอดสูง {n}', 'Arc, peak {n}', '拋物線，最高 {n}'],
  selfArcNote: [
    'คลิปลอยขึ้นเองแล้ว → ไม่ใส่โค้งซ้ำ',
    'The clip already rises by itself → no extra arc is added',
    '動畫本身已有上升 → 不再額外加曲線',
  ],
  overrideNote: ['ใช้ค่ายกเว้นรายไฟล์: {json}', 'Per-file override in use: {json}', '使用單檔例外設定：{json}'],

  // ── เวลาของท่า ──
  castLine: [
    'ร่าย {c}f = {cs}s · ปล่อย {r}f = {rs}s',
    'Cast {c}f = {cs}s · release {r}f = {rs}s',
    '施放 {c}f = {cs}s · 出手 {r}f = {rs}s',
  ],
  totalLine: [' รวม {t}s', ' total {t}s', ' 合計 {t}s'],
  adviceCast: [
    'ช่วงร่ายยาว — ตั้งเพดานเวลาช่วงร่ายได้',
    'Long cast — you can set a cast time cap',
    '施放偏長 — 可設定施放時間上限',
  ],
  adviceRelease: [
    'ช่วงปล่อยยาว — เพดานเวลาช่วยไม่ได้ ต้องพึ่งปุ่มเร่ง x2/x3',
    'Long release — the cap does not help here, use the x2/x3 speed buttons',
    '出手偏長 — 上限無效，需靠 x2／x3 加速鈕',
  ],

  // ── ตัวแก้สกิล ──
  basisSelf: ['ตัวเอง', 'self', '自身'],
  basisFront: ['ศัตรูแถวหน้า', 'enemy front row', '敵方前排'],
  basisRear: ['ศัตรูแถวหลัง', 'enemy back row', '敵方後排'],
  inGameAim: ['ในเกมเล็ง: {b}', 'In-game aim: {b}', '遊戲中瞄準：{b}'],
  fKind: ['ประเภท', 'Kind', '類型'],
  kindAttack: ['สกิลโจมตี', 'Attack skill', '攻擊技能'],
  kindBuff: ['สกิลบัฟ', 'Buff skill', '增益技能'],
  fArea: ['ความกว้าง', 'Area', '範圍'],
  rowNote: [
    'แถวหน้าของศัตรูมี 2 ตัว → เลือกได้แค่แถวหน้า (โดนทั้งแถว) · เหลือ 1 หรือ 0 → เลือกแถวหลังได้',
    'While the enemy front row has 2 units you can only pick the front row (the whole row is hit) · at 1 or 0 left the back row opens up',
    '敵方前排有 2 人時只能選前排（整排受擊）· 剩 1 人或 0 人時才能選後排',
  ],
  wideNote: [
    'ชะงัก/ห้ามสกิลจากสกิลวงกว้างติดยากกว่า: ทั้งแถว ×0.7 · ทั้งหมด ×0.5 ของโอกาสปกติ',
    'Stun / silence from wide skills lands less often: whole row ×0.7 · everyone ×0.5 of the normal chance',
    '範圍技的暈眩／沉默較難命中：整排 ×0.7 · 全體 ×0.5 的原機率',
  ],
  noEffects: [
    'ยังไม่มีความสามารถ — เพิ่มจากรายการด้านล่าง',
    'No effects yet — add one from the list below',
    '尚無效果 — 請從下方清單新增',
  ],
  addEffect: ['+ เพิ่มความสามารถ…', '+ Add an effect…', '+ 新增效果…'],

  // ── ตัวแก้รูปหน้า ──
  noThumb: [
    'ไม่พบ thumb.png ของตัวนี้ — โหลดไฟล์เรนเจอร์ใหม่จาก lerico ก่อน',
    'No thumb.png for this ranger — fetch its files from lerico first',
    '找不到此英雄的 thumb.png — 請先從 lerico 重新載入檔案',
  ],
  loadingImg: ['กำลังโหลดรูป…', 'Loading the image…', '圖片載入中…'],
  portraitHelp1: [
    'ลากกรอบสีทองไปครอบหน้าของเรนเจอร์ — กรอบขนาดเท่ากันทุกตัว ({n}×{n} px) ย่อ/ขยายไม่ได้',
    'Drag the gold frame over the ranger’s face — the frame is the same size for everyone ({n}×{n} px) and cannot be resized',
    '把金色框拖到英雄的臉上 — 所有人的框大小相同（{n}×{n} px），無法縮放',
  ],
  portraitHelp2: [
    'รูปนี้ใช้เป็นรูปเรนเจอร์ในจอดวล (มุมซ้ายล่าง และแถบลำดับเทิร์น) · ปุ่มลูกศรขยับทีละ 1 (Shift = 5)',
    'This crop is the ranger’s portrait in battle (bottom-left panel and the turn rail) · arrow keys move by 1 (Shift = 5)',
    '此裁切用於戰鬥中的頭像（左下面板與出手順序條）· 方向鍵每次移動 1（Shift = 5）',
  ],
  bottomLeft: ['มุมซ้ายล่าง', 'Bottom-left', '左下角'],
  portraitMeta: ['กึ่งกลาง ({x}, {y}) · รูป {w}×{h}', 'Centre ({x}, {y}) · image {w}×{h}', '中心（{x}, {y}）· 圖片 {w}×{h}'],
  autoGuess: [' · เดาอัตโนมัติ', ' · auto-guessed', ' · 自動推測'],
  backToAuto: ['↺ กลับไปใช้ตำแหน่งอัตโนมัติ', '↺ Back to the automatic position', '↺ 回到自動位置'],

  // ── สตูดิโอคัตซีน ──
  noClipToCapture: ['ท่านี้ไม่มีคลิปให้จับภาพ', 'This motion has no clip to capture', '此招式沒有可擷取的動畫'],
  frameNoArt: [
    'เฟรมที่เลือกไม่มีภาพ — เลือกเฟรมอื่นจากแถบด้านล่าง',
    'The selected frame is empty — pick another one from the strip below',
    '所選影格沒有畫面 — 請從下方選其他影格',
  ],
  noCutinFor: ['{skill} — ยังไม่มีคัตซีน', '{skill} — no cut-in yet', '{skill} — 尚無演出'],
  enableCutin: ['＋ เปิดคัตซีนให้สกิลนี้', '＋ Add a cut-in for this skill', '＋ 為此技能開啟演出'],
  playPreview: ['▶ เล่นตัวอย่าง', '▶ Preview', '▶ 播放預覽'],
  enemySideView: ['ดูแบบฝั่งศัตรู', 'View as the enemy side', '以敵方視角檢視'],
  adjustAll: ['ปรับภาพรวม', 'Adjust everything', '調整整體'],
  adjustBullet: ['ปรับกระสุน ({f})', 'Adjust the bullet ({f})', '調整彈道（{f}）'],
  dragBullet: ['ลาก = ย้ายกระสุน', 'drag = move the bullet', '拖曳 = 移動彈道'],
  dragAll: ['ลาก = ย้ายทั้งภาพ', 'drag = move everything', '拖曳 = 移動整體'],
  cutinHintTail: [
    'ล้อเมาส์ = ซูม · ลูกศร = ขยับทีละนิด · กรอบประ = ขนาดจุดโฟกัส',
    'scroll = zoom · arrow keys = nudge · dashed frame = focus size',
    '滾輪 = 縮放 · 方向鍵 = 微調 · 虛線框 = 對焦範圍',
  ],
  bulletFrameLabel: ['เฟรมกระสุน ({f})', 'Bullet frame ({f})', '彈道影格（{f}）'],
  bodyFrameLabel: ['เฟรมตัวเรนเจอร์', 'Character frame', '角色影格'],
  prevFrame: ['เฟรมก่อนหน้า', 'Previous frame', '上一影格'],
  nextFrame: ['เฟรมถัดไป', 'Next frame', '下一影格'],
  noCutinShort: ['○ ไม่มี', '○ none', '○ 無'],
  cutinEnable: ['มีคัตซีนตอนใช้สกิลนี้', 'Play a cut-in when this skill is used', '使用此技能時播放演出'],
  layers: ['เลเยอร์', 'Layers', '圖層'],
  layerBody: ['ตัวเรนเจอร์ (body)', 'Character (body)', '角色（body）'],
  layerBullet: ['กระสุน / เอฟเฟกต์ของสกิล', 'Bullet / skill effect', '彈道／技能特效'],
  ownBullet: [' (ของสกิลนี้)', ' (this skill’s)', '（此技能的）'],
  noBulletForThis: ['ตัวนี้ไม่มีไฟล์กระสุน', 'This ranger has no bullet file', '此英雄沒有彈道檔'],
  layerNote: [
    'ต้องเปิดอย่างน้อย 1 เลเยอร์ · กระสุนวาดทับตัว',
    'At least one layer must stay on · the bullet is drawn over the character',
    '至少要開啟 1 個圖層 · 彈道會畫在角色之上',
  ],
  cutinTitle: ['ข้อความ', 'Caption', '文字'],
  backToSkillName: ['กลับไปใช้ชื่อสกิล', 'Back to the skill name', '回到技能名稱'],
  zoom: ['ซูม', 'Zoom', '縮放'],
  resetPosZoomFrame: ['↺ รีเซ็ตตำแหน่ง/ซูม/เฟรม', '↺ Reset position / zoom / frame', '↺ 重設位置／縮放／影格'],
  cutinNote1: [
    'ซูมมากเกิน ×3 รูปสไปรต์จะเริ่มแตก · ข้อความว่าง = ใช้ชื่อสกิลจากข้อมูลเกม',
    'Past ×3 the sprite starts to break up · an empty caption falls back to the skill name from the game data',
    '超過 ×3 圖塊會開始糊掉 · 文字留空則使用遊戲資料的技能名稱',
  ],
  // ── ป้ายบนแผนการยิงในเวที (เปิดด้วย planLabels) ──
  planRelease: ['ปล่อย', 'release', '發射'],
  planBuff: ['บัฟ', 'buff', '增益'],
  planHere: ['เกิดที่นี่', 'spawns here', '在此生成'],
  planLand: ['ตก', 'lands', '落點'],
  planBurst: ['ระเบิด', 'burst', '爆炸'],

  cutinNote2: [
    'กด Save ด้านบนเพื่อบันทึกลง ranger.json',
    'Press Save above to write it into ranger.json',
    '按上方 Save 即可寫入 ranger.json',
  ],
} as const satisfies Record<string, L3>

export type EKey = keyof typeof T
export const e = (k: EKey, vars?: Record<string, string | number>): string => {
  let s: string = T[k][li()]
  if (vars) for (const [key, v] of Object.entries(vars)) s = s.replaceAll(`{${key}}`, String(v))
  return s
}

// ─────────────────────── ป้ายของ lib (คีย์เดียวกับ lib เป๊ะ) ───────────────────────

const ELEMENT: Record<Element, L3> = {
  fire: ['ไฟ (Fire)', 'Fire', '火 (Fire)'],
  water: ['น้ำ (Water)', 'Water', '水 (Water)'],
  wood: ['ไม้ (Wood)', 'Wood', '木 (Wood)'],
  light: ['แสง (Light)', 'Light', '光 (Light)'],
  dark: ['มืด (Dark)', 'Dark', '暗 (Dark)'],
}
export const elementLabel = (x: Element): string => pick(ELEMENT[x])

const CATEGORY: Record<Category, L3> = {
  str: ['พลัง (STR)', 'Power (STR)', '力量 (STR)'],
  agi: ['ว่องไว (AGI)', 'Speed (AGI)', '敏捷 (AGI)'],
  int: ['ไหวพริบ (INT)', 'Technique (INT)', '智力 (INT)'],
}
export const categoryLabel = (c: Category): string => pick(CATEGORY[c])

const ROLE: Record<Role, L3> = {
  tank: ['แทงค์', 'Tank', '坦克'],
  fighter: ['ไฟเตอร์', 'Fighter', '戰士'],
  shooter: ['นักยิง', 'Shooter', '射手'],
  assassin: ['นักฆ่า', 'Assassin', '刺客'],
  mage: ['นักเวท', 'Mage', '法師'],
  support: ['ซัพพอร์ต', 'Support', '輔助'],
}
export const roleLabel = (r: Role): string => pick(ROLE[r])

const ROLE_HINT: Record<Role, L3> = {
  tank: ['เลือดเยอะ อึด ตีเบา', 'Lots of HP, tough, hits softly', '血量高、耐打、傷害低'],
  fighter: ['เลือดเยอะรองจากแทงค์ แต่ตีแรงกว่า', 'Second-toughest after the tank, but hits harder', '血量僅次坦克，但傷害更高'],
  shooter: ['ตีกายภาพแรง คริสูง', 'Strong physical hits, high crit', '物理傷害高、爆擊高'],
  assassin: ['ตีกายภาพรุนแรง คริสูง เลือดน้อย เร็ว', 'Very strong physical hits, high crit, low HP, fast', '物理爆發極高、爆擊高、血少、速度快'],
  mage: ['ตีเวทแรง มักเป็นวงกว้าง', 'Strong magic, usually wide area', '法術傷害高，多為範圍攻擊'],
  support: ['ตีเวทเบากว่า เน้นติดสถานะ/บัฟเพื่อน', 'Weaker magic, focuses on statuses and buffing allies', '法傷較低，專注異常狀態與隊友增益'],
}
export const roleHint = (r: Role): string => pick(ROLE_HINT[r])

const STAT: Record<keyof Stats, L3> = {
  hp: ['HP', 'HP', 'HP'],
  atk: ['ATK', 'ATK', '攻擊'],
  def: ['DEF', 'DEF', '防禦'],
  spd: ['Speed', 'Speed', '速度'],
  crit: ['Critical Rate %', 'Critical Rate %', '爆擊率 %'],
  critDmg: ['Critical Damage %', 'Critical Damage %', '爆擊傷害 %'],
  evade: ['Evade Rate %', 'Evade Rate %', '閃避率 %'],
  hit: ['Hit Rate %', 'Hit Rate %', '命中率 %'],
  skillEvade: ['Skill Evade Rate %', 'Skill Evade Rate %', '技能閃避率 %'],
  skillHit: ['Skill Hit Rate %', 'Skill Hit Rate %', '技能命中率 %'],
  skillRes: ['Skill Resistance %', 'Skill Resistance %', '技能抗性 %'],
  skillDmgRes: ['Skill Damage Resistance %', 'Skill Damage Resistance %', '技能傷害抗性 %'],
}
export const statLabel = (k: keyof Stats): string => pick(STAT[k])
/** ลำดับช่องค่าพลังในแท็บทั่วไป — ยึดตารางนี้ ไม่ใช่คีย์ใน config (ไฟล์เก่าอาจขาดบางค่า) */
export const STAT_KEYS = Object.keys(STAT) as (keyof Stats)[]

const PASSIVE_LABEL: Record<PassiveType, L3> = {
  execute: ['ลอบสังหาร', 'Execute', '處決'],
  lifesteal: ['ดูดเลือด', 'Lifesteal', '吸血'],
  tough: ['อึด', 'Tough', '堅韌'],
  atkUp: ['พลังโจมตีติดตัว', 'Innate ATK', '固有攻擊力'],
  critUp: ['คริติคอลติดตัว', 'Innate crit', '固有爆擊'],
  speedUp: ['ความเร็วติดตัว', 'Innate speed', '固有速度'],
  healUp: ['มือฟื้นฟู', 'Healer’s touch', '治療專精'],
}
export const passiveLabel = (p: PassiveType): string => pick(PASSIVE_LABEL[p])

const PASSIVE_NOTE: Record<PassiveType, L3> = {
  execute: ['ตีเป้าที่เลือดต่ำกว่าครึ่งหลอด แรงขึ้น x%', 'Hits targets below half HP for x% more', '對半血以下目標傷害提高 x%'],
  lifesteal: ['ฟื้นเลือดตัวเอง x% ของดาเมจที่ทำได้', 'Heals itself for x% of the damage it deals', '將造成傷害的 x% 轉為自身治療'],
  tough: ['รับความเสียหายทุกแหล่งลดลง x%', 'Takes x% less damage from every source', '受到各種來源的傷害降低 x%'],
  atkUp: ['พลังโจมตีมากขึ้น x% ตลอดเกม', 'ATK is x% higher all game', '全場攻擊力提高 x%'],
  critUp: ['อัตราคริมากขึ้น x จุด ตลอดเกม', 'Crit rate is x points higher all game', '全場爆擊率提高 x 點'],
  speedUp: ['ความเร็วมากขึ้น x% ตลอดเกม', 'Speed is x% higher all game', '全場速度提高 x%'],
  healUp: ['ฮีล/โล่ที่ตัวนี้ให้ แรงขึ้น x%', 'Heals and shields from this unit are x% stronger', '此單位的治療與護盾提高 x%'],
}
export const passiveNote = (p: PassiveType): string => pick(PASSIVE_NOTE[p])

const AREA: Record<SkillArea, L3> = {
  single_front: ['โจมตีเดี่ยว (แถวหน้าก่อน)', 'Single target (front row first)', '單體攻擊（前排優先）'],
  single_any: ['โจมตีเดี่ยว (ตัวไหนก็ได้)', 'Single target (any unit)', '單體攻擊（任意目標）'],
  row: ['โจมตีทั้งแถว (แถวหน้าก่อน)', 'Whole row (front row first)', '整排攻擊（前排優先）'],
  row_any: ['โจมตีทั้งแถว (เลือกแถวได้)', 'Whole row (pick the row)', '整排攻擊（可選排）'],
  all: ['โจมตีทั้งหมด', 'All enemies', '全體攻擊'],
  self: ['บัฟตัวเอง', 'Buff self', '增益自身'],
  own_row: ['บัฟแถวของตัวเอง', 'Buff own row', '增益自身該排'],
  ally_single: ['บัฟเพื่อน 1 ตัวที่เลือก', 'Buff one chosen ally', '增益指定 1 名隊友'],
  ally_all: ['บัฟเพื่อนทั้งหมด', 'Buff all allies', '增益全體隊友'],
}
export const areaLabel = (a: SkillArea): string => pick(AREA[a])

const HEAL_SCALE: Record<HealScale, L3> = {
  targetHp: ['% ของ HP สูงสุดของเป้า', '% of the target’s max HP', '目標最大 HP 的 %'],
  casterHp: ['% ของ HP สูงสุดของผู้ร่าย', '% of the caster’s max HP', '施放者最大 HP 的 %'],
  casterAtk: ['% ของ ATK ผู้ร่าย', '% of the caster’s ATK', '施放者攻擊力的 %'],
}
export const healScaleLabel = (s: HealScale): string => pick(HEAL_SCALE[s])

const LIFESTEAL_SCOPE: Record<LifestealScope, L3> = {
  self: ['ฮีลแค่ตัวเอง', 'Heal self only', '僅治療自身'],
  own_row: ['ฮีลแถวตัวเอง', 'Heal own row', '治療自身該排'],
  ally_all: ['ฮีลเพื่อนทั้งหมด', 'Heal all allies', '治療全體隊友'],
}
export const lifestealScopeLabel = (s: LifestealScope): string => pick(LIFESTEAL_SCOPE[s])

/** ป้ายของช่องตัวเลขในความสามารถ — คีย์คือข้อความไทยที่ตั้งไว้ใน lib/skills.ts */
const PARAM: Record<string, L3> = {
  '%': ['%', '%', '%'],
  '% Speed': ['% Speed', '% Speed', '% 速度'],
  '% ของ ATK': ['% ของ ATK', '% of ATK', '攻擊力的 %'],
  '% ของ ATK/เทิร์น': ['% ของ ATK/เทิร์น', '% of ATK per turn', '每回合攻擊力的 %'],
  '% ของ HP สูงสุดของผู้ร่าย': ['% ของ HP สูงสุดของผู้ร่าย', '% of the caster’s max HP', '施放者最大 HP 的 %'],
  '% ของ HP สูงสุดตัวเอง': ['% ของ HP สูงสุดตัวเอง', '% of own max HP', '自身最大 HP 的 %'],
  '% ของดาเมจที่ทำ': ['% ของดาเมจที่ทำ', '% of the damage dealt', '造成傷害的 %'],
  '% ต่อเทิร์น': ['% ต่อเทิร์น', '% per turn', '每回合 %'],
  '% ที่ลด': ['% ที่ลด', '% reduced', '降低的 %'],
  'Cost': ['Cost', 'Cost', '能量'],
  'เทิร์น': ['เทิร์น', 'turns', '回合'],
  'เพิกเฉยโล่ขาว %': ['เพิกเฉยโล่ขาว %', 'ignore white shield %', '無視白盾 %'],
}
export const paramLabel = (thai: string): string => (PARAM[thai] ? pick(PARAM[thai]) : thai)

const EFFECT_LABEL: Record<EffectType, L3> = {
  damage: ['สร้างความเสียหาย', 'Deal damage', '造成傷害'],
  damageHp: ['ความเสียหายตามเลือดผู้ร่าย', 'Damage based on the caster’s HP', '依施放者生命造成傷害'],
  elementShift: ['เปลี่ยนธาตุของเป้า', 'Change the target’s element', '改變目標屬性'],
  selfHpCost: ['แลกด้วยเลือดตัวเอง', 'Pay with your own HP', '以自身生命為代價'],
  selfVulnerable: ['แลกด้วยความเปราะบางของตัวเอง', 'Pay by becoming vulnerable', '以自身脆弱為代價'],
  trueDamage: ['ความเสียหายจริง', 'True damage', '真實傷害'],
  breakInvincible: ['ยกเลิกทักษะอมตะ (ทะลุบาเรีย)', 'Break invincibility (pierce the barrier)', '解除無敵（穿透屏障）'],
  stun: ['ทำให้ชะงัก', 'Stun', '暈眩'],
  skillEvadeDown: ['ลดอัตราหลบทักษะ', 'Lower skill evade', '降低技能閃避'],
  skillResDown: ['ลดอัตราต้านทักษะ', 'Lower skill resistance', '降低技能抗性'],
  evadeDown: ['ลดอัตราหลบหลีก', 'Lower evade', '降低閃避'],
  dispelBuffs: ['ยกเลิกบัฟของศัตรู', 'Dispel the enemy’s buffs', '驅散敵方增益'],
  atkDown: ['ลดพลังโจมตี', 'Lower ATK', '降低攻擊力'],
  healBlock: ['ลดการฟื้นฟู', 'Reduce healing', '降低治療'],
  silence: ['ห้ามใช้ทักษะ', 'Silence', '沉默'],
  speedDown: ['ลดความเร็ว', 'Lower speed', '降低速度'],
  critDown: ['ลดอัตราคริติคอล', 'Lower crit rate', '降低爆擊率'],
  critDmgDown: ['ลดดาเมจคริติคอล', 'Lower crit damage', '降低爆擊傷害'],
  hitDown: ['ลดความแม่นยำ (ตีปกติ)', 'Lower accuracy (normal attacks)', '降低命中（普攻）'],
  skillHitDown: ['ลดความแม่นยำทักษะ', 'Lower skill accuracy', '降低技能命中'],
  poison: ['ติดพิษ (ดาเมจต่อเนื่อง)', 'Poison (damage over time)', '中毒（持續傷害）'],
  burn: ['ติดไฟไหม้ (ดาเมจต่อเนื่อง)', 'Burn (damage over time)', '燃燒（持續傷害）'],
  bleed: ['ติดเลือดไหล (ดาเมจต่อเนื่อง)', 'Bleed (damage over time)', '流血（持續傷害）'],
  vulnerable: ['เปราะบาง (รับดาเมจเพิ่ม)', 'Vulnerable (takes more damage)', '脆弱（受傷加重）'],
  turnBurn: ['เร่งเทิร์นของเป้า', 'Burn the target’s turns', '加速目標回合計時'],
  sealCleanse: ['ขัดขวางการล้างผลด้านลบ', 'Seal debuff cleansing', '封鎖淨化'],
  lifesteal: ['ดูดเลือด', 'Lifesteal', '吸血'],
  atkUp: ['เพิ่มพลังโจมตี', 'Raise ATK', '提升攻擊力'],
  heal: ['ฟื้นฟูพลังชีวิต', 'Heal', '回復生命'],
  regen: ['ฟื้นฟูต่อเนื่อง', 'Regeneration', '持續回復'],
  shield: ['เพิ่มโล่', 'Shield', '給予護盾'],
  barrier: ['บาเรียอมตะ', 'Invincible barrier', '無敵屏障'],
  evadeUp: ['เพิ่มอัตราหลบหลีก', 'Raise evade', '提升閃避'],
  skillEvadeUp: ['เพิ่มอัตราหลบทักษะ', 'Raise skill evade', '提升技能閃避'],
  skillResUp: ['เพิ่มอัตราต้านทักษะ', 'Raise skill resistance', '提升技能抗性'],
  speedUp: ['เร่งความเร็ว', 'Raise speed', '提升速度'],
  actionAdvance: ['ดึงเทิร์น', 'Advance the turn', '拉前回合'],
  critDmgUp: ['เพิ่มความเสียหายคริ', 'Raise crit damage', '提升爆擊傷害'],
  critUp: ['เพิ่มอัตราคริ', 'Raise crit rate', '提升爆擊率'],
  hitUp: ['เพิ่มความแม่นยำ (ตีปกติ)', 'Raise accuracy (normal attacks)', '提升命中（普攻）'],
  skillHitUp: ['เพิ่มความแม่นยำทักษะ', 'Raise skill accuracy', '提升技能命中'],
  cleanse: ['ล้างผลด้านลบ', 'Cleanse debuffs', '淨化負面效果'],
  toughUp: ['เพิ่มความทนทาน (รับดาเมจลด)', 'Raise toughness (takes less damage)', '提升堅韌（受傷減少）'],
  skillDmgResUp: ['เพิ่มต้านความเสียหายสกิล', 'Raise skill damage resistance', '提升技能傷害抗性'],
  reflect: ['สะท้อนความเสียหาย', 'Reflect damage', '反射傷害'],
  taunt: ['ยั่วยุ (ศัตรูต้องตีปกติใส่ตัวนี้)', 'Taunt (enemies must normal-attack this unit)', '嘲諷（敵人普攻必須打此單位）'],
  energyGain: ['เพิ่ม Cost พลังงานให้ทีม', 'Give the team Cost', '為隊伍增加能量'],
}
export const effectLabel = (t: EffectType): string => pick(EFFECT_LABEL[t])

const EFFECT_NOTE: Partial<Record<EffectType, L3>> = {
  damageHp: [
    'ฐานดาเมจ = HP สูงสุดของผู้ร่าย (ไม่ใช่ ATK) — เหมาะกับตัวถึก · หัก DEF/ธาตุ/คริ ตามปกติ',
    'Damage base = the caster’s max HP (not ATK) — good for bulky units · DEF, element and crit apply as usual',
    '傷害基準 = 施放者最大 HP（非攻擊力）— 適合肉身角色 · 防禦／屬性／爆擊照常計算',
  ],
  elementShift: [
    'เป้ากลายเป็นธาตุนี้ชั่วคราว → ใช้แก้ทางธาตุให้ทีมเราตีแรงขึ้น',
    'The target temporarily becomes this element → use it to give your team an elemental edge',
    '目標暫時變成此屬性 → 可為我方製造屬性優勢',
  ],
  selfHpCost: [
    'เสียเลือดตอนร่าย (ไม่ตายจากท่านี้ — เหลืออย่างน้อย 1)',
    'Loses HP on cast (never lethal — at least 1 HP is left)',
    '施放時扣血（不會因此死亡 — 至少保留 1 點）',
  ],
  selfVulnerable: [
    'ผู้ร่ายรับดาเมจเพิ่มขึ้นชั่วคราว',
    'The caster takes more damage for a while',
    '施放者短時間內受傷加重',
  ],
  trueDamage: [
    'ลงเลือดตรงๆ ไม่สนโล่ขาว · ไม่หัก DEF · ไม่คริ · บาเรียอมตะยังกันได้ (ใส่ "ยกเลิกทักษะอมตะ" คู่กันเพื่อทะลุ)',
    'Hits HP directly, ignores the white shield · no DEF · no crit · an invincible barrier still blocks it (pair it with “Break invincibility” to pierce)',
    '直接扣血、無視白盾 · 不計防禦 · 不會爆擊 · 無敵屏障仍可擋（搭配「解除無敵」才能穿透）',
  ],
  healBlock: [
    '100% = ฟื้นเลือดไม่ได้เลย · มีผลกับฮีล ฟื้นฟูต่อเนื่อง และดูดเลือด (โล่ยังได้)',
    '100% = no healing at all · affects heals, regeneration and lifesteal (shields still work)',
    '100% = 完全無法回血 · 影響治療、持續回復與吸血（護盾仍有效）',
  ],
  speedDown: ['มีผลทันที: เทิร์นของเป้าถูกเลื่อนออกไป', 'Takes effect at once: the target’s turn is pushed back', '立即生效：目標的回合被往後推'],
  hitDown: [
    'ตีปกติของเป้าพลาดง่ายขึ้น (ตัวที่เป้าตีหลบได้มากขึ้น)',
    'The target’s normal attacks miss more often',
    '目標的普攻更容易落空',
  ],
  skillHitDown: ['สกิลโจมตีของเป้าพลาดง่ายขึ้น', 'The target’s attack skills miss more often', '目標的攻擊技更容易落空'],
  poison: [
    'ต้นเทิร์นของเป้า · หัก DEF · ไม่คริ · บาเรียไม่กัน',
    'At the start of the target’s turn · DEF applies · no crit · the barrier does not block it',
    '在目標回合開始時 · 計算防禦 · 不會爆擊 · 屏障擋不住',
  ],
  burn: [
    'ต้นเทิร์นของเป้า · หัก DEF · ไม่คริ · บาเรียไม่กัน',
    'At the start of the target’s turn · DEF applies · no crit · the barrier does not block it',
    '在目標回合開始時 · 計算防禦 · 不會爆擊 · 屏障擋不住',
  ],
  bleed: [
    'ต้นเทิร์นของเป้า · หัก DEF · ไม่คริ · บาเรียไม่กัน',
    'At the start of the target’s turn · DEF applies · no crit · the barrier does not block it',
    '在目標回合開始時 · 計算防禦 · 不會爆擊 · 屏障擋不住',
  ],
  vulnerable: [
    'เป้ารับความเสียหายจากทุกแหล่งเพิ่มขึ้น (ใช้แทนการลด DEF)',
    'The target takes more damage from every source (use it instead of lowering DEF)',
    '目標受到各種來源的傷害提高（用來取代降防）',
  ],
  turnBurn: [
    'บัฟ/ดีบัฟของเป้าหมดไวขึ้นเท่านี้เทิร์น · ดาเมจต่อเนื่องทำงานทันทีตามจำนวนเทิร์นที่เร่ง',
    'The target’s buffs and debuffs expire this many turns sooner · damage over time fires at once for those turns',
    '目標的增益／減益提前這麼多回合結束 · 持續傷害會依加速的回合數立即結算',
  ],
  sealCleanse: ['เป้าใช้สกิลล้างดีบัฟไม่ได้', 'The target cannot use cleanse skills', '目標無法使用淨化技能'],
  lifesteal: [
    'ยอดฮีลรวมแบ่งเท่าๆ กันให้ทุกตัวในขอบเขต · ติดห้ามฟื้นฟูจะไม่ได้',
    'The total heal is split evenly across everyone in scope · blocked while healing is sealed',
    '總治療量平分給範圍內所有人 · 被禁療時無效',
  ],
  speedUp: ['มีผลทันที: เทิร์นถัดไปของเป้ามาเร็วขึ้น', 'Takes effect at once: the target’s next turn comes sooner', '立即生效：目標的下個回合提早到來'],
  actionAdvance: [
    '100% = ได้เล่นต่อทันที · ใช้กับตัวเองไม่ได้',
    '100% = act again immediately · cannot target the caster',
    '100% = 立即再行動一次 · 無法對自己使用',
  ],
  toughUp: [
    'ตรงข้ามกับเปราะบาง — ใช้แทนการเพิ่ม DEF',
    'The opposite of Vulnerable — use it instead of raising DEF',
    '與「脆弱」相反 — 用來取代加防',
  ],
  reflect: [
    'สะท้อนตามดาเมจ HP ที่ได้รับจริง · ไม่คริ · ไม่สะท้อนต่อเป็นลูกโซ่',
    'Reflects a percentage of actual HP damage taken · cannot crit · cannot chain-reflect',
    '依實際承受的 HP 傷害反射 · 不會爆擊 · 不會形成連鎖反射',
  ],
  taunt: [
    'มีผลกับการตีธรรมดาของศัตรู · หลายตัวยั่วยุพร้อมกัน = ศัตรูเลือกได้เฉพาะตัวที่ยั่วยุ',
    'Affects the enemy’s normal attacks · with several taunters the enemy may only pick among them',
    '影響敵方普攻 · 多人同時嘲諷時，敵方只能從嘲諷者中選擇',
  ],
}
export const effectNote = (t: EffectType): string | null => {
  const row = EFFECT_NOTE[t]
  return row ? pick(row) : null
}
