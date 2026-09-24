// ====================================================
// uiText.ts — ข้อความของหน้าทดลองเล่น (จัดทีม · โหลด) ภาษาอังกฤษ / ไทย
// ภาษาใช้ค่าเดียวกับจอดวล (i18n.ts · จำใน localStorage) — เปลี่ยนที่ไหนก็เปลี่ยนทั้งหน้า
// ====================================================

import { useEffect, useState } from 'react'
import type { Category, Role } from '@/lib/rangerClass'
import type { Row } from '@/lib/rangerConfig'
import { getLang, onLangChange, type Lang } from './i18n'

const T = {
  appTitle: ['RANGER ARENA', 'RANGER ARENA'],
  appSub: ['5v5 Turn-Based Battle', 'ดวลเทิร์นเบส 5v5'],
  myTeam: ['YOUR TEAM', 'ทีมของคุณ'],
  enemyTeam: ['ENEMY TEAM', 'ทีมศัตรู'],
  random: ['Random', 'สุ่ม'],
  clear: ['Clear', 'ล้าง'],
  start: ['START BATTLE', 'เริ่มดวล'],
  needBoth: ['Put at least 1 ranger in each team', 'ใส่เรนเจอร์อย่างน้อยทีมละ 1 ตัว'],
  loading: ['Loading rangers…', 'กำลังโหลดเรนเจอร์…'],
  loadFail: ['Loading failed', 'โหลดไม่สำเร็จ'],
  rangers: ['RANGERS', 'เรนเจอร์'],
  search: ['Search name…', 'ค้นหาชื่อ…'],
  all: ['All', 'ทั้งหมด'],
  element: ['Element', 'ธาตุ'],
  role: ['Role', 'ตำแหน่ง'],
  klass: ['Type', 'ชนิด'],
  sort: ['Sort', 'เรียง'],
  sortGrade: ['★ Grade', '★ ระดับ'],
  sortName: ['Name', 'ชื่อ'],
  sortHp: ['HP', 'HP'],
  sortAtk: ['ATK', 'ATK'],
  sortSpd: ['Speed', 'Speed'],
  noMatch: ['No rangers match these filters', 'ไม่มีเรนเจอร์ที่ตรงกับตัวกรอง'],
  noRangers: ['No rangers available yet', 'ยังไม่มีเรนเจอร์ที่พร้อมเล่น'],
  empty: ['Empty', 'ว่าง'],
  front: ['FRONT', 'แถวหน้า'],
  back: ['BACK', 'แถวหลัง'],
  info: ['Details', 'ข้อมูล'],
  remove: ['Remove', 'ลบ'],
  change: ['Change', 'เปลี่ยน'],
  current: ['IN SLOT', 'ช่องนี้'],
  close: ['Close', 'ปิด'],
  help: ['How to play', 'วิธีเล่น'],
  reserve: ['SPECIAL ROW', 'แถวพิเศษ'],
  reserveHint: ['Not on the field · summon on your turn to cast a skill', 'ไม่ลงสนาม · ถึงตาเราอัญเชิญมาร่ายสกิลได้'],
  howReserve: ['Special row (summon)', 'แถวพิเศษ (อัญเชิญ)'],
  reserveText: [
    'Each team can add up to 2 rangers to the special row. They stay off the field. On any of your turns you may summon one of them instead of acting (keys A S / D F) to cast its Skill 1 or 2 — it costs that skill\'s Cost, uses its own raw stats (no row bonus, no buffs), then leaves and rests for 8 of your team\'s turns.',
    'ใส่เรนเจอร์แถวพิเศษได้ทีมละ 2 ตัว ไม่ลงสนาม · ถึงตาใครในทีมก็ได้ เลือกอัญเชิญแทนการใช้ท่าของตัวเอง (ปุ่ม A S / D F) มาร่ายสกิล 1 หรือ 2 ของตัวนั้น · เสีย Cost ตามสกิล · ใช้ค่าพลังดิบ (ไม่ได้โบนัสแถว ไม่ได้บัฟ) แล้วกลับไปพัก 8 เทิร์นของทีม',
  ],
  rotate: ['Rotate your phone to landscape to play', 'หมุนโทรศัพท์เป็นแนวนอนเพื่อเล่น'],
  inAppWarn: ['This in-app browser cannot play full screen — open the game in Chrome for the best experience', 'เบราว์เซอร์ในแอปนี้เล่นแบบเต็มจอไม่ได้ — เปิดเกมใน Chrome จะเล่นได้เต็มจอ'],
  inAppHowTo: ['Tap ⋯ (top-right) and choose "Open in browser" / "Open in Safari" to play full screen', 'แตะ ⋯ มุมขวาบน แล้วเลือก "เปิดในเบราว์เซอร์" / "Open in Safari" เพื่อเล่นแบบเต็มจอ'],
  openBrowser: ['Open in Chrome', 'เปิดใน Chrome'],
  tapFullscreen: ['Tap to continue in full screen', 'แตะเพื่อเล่นต่อแบบเต็มจอ'],
  pickTitle: ['Choose a ranger — {team} · {row}', 'เลือกเรนเจอร์ — {team} · {row}'],
  inMine: ['YOURS', 'ทีมคุณ'],
  inEnemy: ['ENEMY', 'ศัตรู'],
  teamFull: ['Team is full', 'ทีมเต็มแล้ว'],
  pickHint: ['Click an empty slot to choose a ranger · click a card for details · drag cards into slots or between slots', 'คลิกช่องว่างเพื่อเลือกเรนเจอร์ · คลิกการ์ดเพื่อดูข้อมูล · ลากการ์ดใส่ช่อง หรือลากสลับตำแหน่ง'],
  placing: ['Selected: {name} — click an empty slot to place', 'เลือก {name} อยู่ — คลิกช่องว่างเพื่อวาง'],
  detailEmpty: ['Select a ranger to see stats and skills', 'เลือกเรนเจอร์เพื่อดูค่าพลังและสกิล'],
  stats: ['STATS', 'ค่าพลัง'],
  skills: ['SKILLS', 'สกิล'],
  ability: ['ROLE ABILITY', 'ความสามารถตำแหน่ง'],
  normalAttack: ['Attack', 'ตีธรรมดา'],
  normalAttackText: ['100% ATK · gains +1 Cost', '100% ATK · ได้ Cost +1'],
  cost: ['Cost', 'Cost'],
  goodFit: ['fits this row', 'เข้ากับแถวนี้'],
  howTo: ['HOW TO PLAY', 'วิธีเล่น'],
  howRows: ['Row bonuses', 'โบนัสตามแถว'],
  howRoles: ['Role abilities', 'ความสามารถของแต่ละตำแหน่ง'],
  howControls: ['Controls', 'การควบคุม'],
  controlsText: [
    'On your turn pick Attack / Skill 1 / Skill 2 (keys Z / X / C), then click a target. Press the same key again to auto-aim when there is only one choice. AUTO plays for you; the speed button cycles x1 → x2 → x4.',
    'ถึงตาคุณ: เลือกตีธรรมดา / สกิล 1 / สกิล 2 (ปุ่ม Z / X / C) แล้วคลิกเป้า · กดปุ่มเดิมซ้ำ = เล็งให้เองถ้ามีเป้าเดียว · AUTO = ให้เล่นเอง · ปุ่มความเร็วกดวน x1 → x2 → x4',
  ],
  energyText: [
    'Skills cost team energy (Cost). Normal attacks give +1 Cost. Win by defeating the whole enemy team — after 80 turns the team with more HP % wins.',
    'สกิลใช้พลังงานทีม (Cost) · ตีธรรมดาได้ Cost +1 · ชนะเมื่อล้มศัตรูหมดทีม — ครบ 80 เทิร์น ทีมที่เหลือเลือด % มากกว่าชนะ',
  ],
  statHp: ['HP', 'HP'], statAtk: ['ATK', 'ATK'], statDef: ['DEF', 'DEF'], statSpd: ['Speed', 'Speed'],
  statCrit: ['Crit', 'คริ'], statCritDmg: ['Crit DMG', 'คริดาเมจ'], statEvade: ['Evade', 'หลบ'], statHit: ['Hit', 'แม่นยำ'],
  statSkillEvade: ['Skill Evade', 'หลบสกิล'], statSkillHit: ['Skill Hit', 'แม่นสกิล'], statSkillRes: ['Resist', 'ต้านสกิล'],
  statSkillDmgRes: ['Skill DMG Res', 'ต้านดาเมจสกิล'],

  // ── หน้าหลัก (Lobby) ──
  lobby: ['LOBBY', 'หน้าหลัก'],
  reserveRow: ['RESERVE', 'แถวพิเศษ'],
  lvShort: ['Lv.', 'Lv.'],
  power: ['POWER', 'พลังรวม'],
  myTeamShort: ['MY TEAM', 'ทีมของฉัน'],
  editTeam: ['Edit team', 'แก้ไขทีม'],
  noTeamYet: ['No team set yet', 'ยังไม่ได้จัดทีม'],
  modes: ['GAME MODES', 'โหมดเล่น'],
  soon: ['Soon', 'เร็วๆ นี้'],
  ready: ['Ready', 'พร้อมเล่น'],
  modePractice: ['Practice Duel', 'ดวลฝึกซ้อม'],
  modePracticeSub: ['Build both teams and fight right away', 'จัดทีมสองฝั่งแล้วลงดวลได้เลย'],
  modeCampaign: ['Campaign', 'โหมดเนื้อเรื่อง'],
  modeCampaignSub: ['Clear stages, earn gold and gear', 'ตะลุยด่าน เก็บเงินและไอเทม'],
  modeArena: ['Arena', 'สนามประลอง'],
  modeArenaSub: ['Fight other players’ defence teams', 'ท้าทีมตั้งรับของผู้เล่นคนอื่น'],
  modeBoss: ['Boss Raid', 'ล่าบอส'],
  modeBossSub: ['Team up against a huge boss', 'รุมบอสตัวใหญ่กับเพื่อนร่วมทีม'],
  modeDaily: ['Daily Quests', 'ภารกิจประจำวัน'],
  modeDailySub: ['Small missions, daily rewards', 'ภารกิจเล็กๆ รับรางวัลทุกวัน'],
  navHeroes: ['Heroes', 'ฮีโร่'],
  navTeam: ['Team', 'ทีม'],
  navBag: ['Bag', 'กระเป๋า'],
  navShop: ['Shop', 'ร้านค้า'],
  navGacha: ['Summon', 'กาชา'],
  navMail: ['Mail', 'กล่องข้อความ'],
  navSettings: ['Settings', 'ตั้งค่า'],
  battleNow: ['BATTLE', 'ลงดวล'],
  panelHeroesSub: ['Level up, evolve and inspect every hero you own', 'อัปเลเวล วิวัฒนาการ และดูข้อมูลฮีโร่ทุกตัวที่มี'],
  panelBagSub: ['Materials, gear and consumables', 'วัตถุดิบ อุปกรณ์สวมใส่ และของใช้'],
  panelShopSub: ['Daily deals, packs and currency exchange', 'ของลดประจำวัน แพ็กเกจ และแลกเปลี่ยนสกุลเงิน'],
  panelGachaSub: ['Summon new heroes with gems or tickets', 'สุ่มฮีโร่ตัวใหม่ด้วยเพชรหรือตั๋ว'],
  panelMailSub: ['Rewards and news from the team', 'ของรางวัลและข่าวจากทีมงาน'],
  wip: ['Under construction', 'กำลังพัฒนา'],
  wipNote: ['The layout is ready — the system will be filled in later.', 'วางโครงหน้าไว้แล้ว เดี๋ยวค่อยใส่ระบบจริงทีหลัง'],
  theme: ['Theme', 'ธีม'],
  themeNeon: ['Neon', 'นีออน'],
  themePixel: ['Pixel', 'พิกเซล'],
  language: ['Language', 'ภาษา'],
  resetProfile: ['Reset demo data', 'ล้างข้อมูลทดลอง'],
  more: ['More', 'เพิ่มเติม'],
  // ── หน้าฮีโร่ ──
  tabInfo: ['Info', 'ข้อมูล'],
  tabSkills: ['Skills', 'สกิล'],
  tabUpgrade: ['Upgrade', 'อัพเกรด'],
  tabLimit: ['Limit Break', 'ข้ามขีดจำกัด'],
  powAtk: ['Attack', 'พลังโจมตี'],
  powHp: ['Health', 'พลังชีวิต'],
  powDef: ['Defence', 'พลังป้องกัน'],
  powSpd: ['Attack Speed', 'ความเร็วโจมตี'],
  powCrit: ['Crit Rate', 'อัตราคริติคอล'],
  gearWeapon: ['Weapon', 'อาวุธ'],
  gearArmor: ['Armor', 'เกราะ'],
  gearAcc: ['Accessory', 'เครื่องประดับ'],
  gearTome: ['Tome', 'คัมภีร์'],
  filter: ['Filter', 'ฟิลเตอร์'],
  levelLabel: ['Level', 'เลเวล'],
  ownedHeroes: ['Heroes', 'ฮีโร่ทั้งหมด'],
  panelUpgradeSub: ['Spend gold and materials to raise stats', 'ใช้เงินและวัตถุดิบเพิ่มค่าพลัง'],
  panelLimitSub: ['Break the level cap with duplicate heroes', 'ใช้ตัวซ้ำปลดเพดานเลเวล'],
  levelSoon: ['Level system is not in yet', 'ระบบเลเวลยังไม่เปิด'],
  skillAttack: ['Attack skill', 'สกิลโจมตี'],
  skillBuff: ['Buff skill', 'สกิลบัฟ'],
  // ── หน้ากาชา ──
  bannerStd: ['Standard Summon', 'ตู้เรนเจอร์ถาวร'],
  bannerStdSub: ['All rangers, always available', 'เรนเจอร์ทุกตัว เปิดตลอดเวลา'],
  bannerEvent: ['Event Summon', 'ตู้เรนเจอร์อีเวนต์'],
  bannerEventSub: ['Featured rangers, limited time', 'เรนเจอร์พิเศษ เปิดช่วงเวลาจำกัด'],
  bannerGear: ['Equipment Summon', 'ตู้อุปกรณ์'],
  bannerGearSub: ['Weapons, armor and more', 'อาวุธ เกราะ และอื่นๆ'],
  gearSoon: ['Equipment system is not in yet', 'ระบบอุปกรณ์ยังไม่เปิด'],
  pull1: ['Summon ×1', 'สุ่ม 1 ครั้ง'],
  pull10: ['Summon ×10', 'สุ่ม 10 ครั้ง'],
  pickUp: ['PICK UP', 'อัตราพิเศษ'],
  rates: ['Rates', 'อัตราออก'],
  guarantee10: ['×10 guarantees Rare or better', 'สุ่ม 10 ครั้ง การันตีระดับหายากขึ้นไป'],
  notEnoughGem: ['Not enough gems', 'เพชรไม่พอ'],
  tapPack: ['Tap the pack to open', 'แตะซองเพื่อเปิด'],
  tapCard: ['Tap a card to reveal', 'แตะการ์ดเพื่อเปิด'],
  skipAll: ['Skip', 'ข้ามทั้งหมด'],
  done: ['Done', 'เสร็จสิ้น'],
  rarityCommon: ['Common', 'ธรรมดา'],
  rarityRare: ['Rare', 'หายาก'],
  rarityEpic: ['Epic', 'พิเศษ'],
  rarityLegend: ['Legendary', 'ตำนาน'],
  newTag: ['NEW', 'ใหม่'],
  freeGem: ['Prototype: gems are not charged yet', 'โหมดทดลอง: ยังไม่หักเพชร'],
  navProfile: ['Profile', 'โปรไฟล์'],
  navEvents: ['Events', 'กิจกรรม'],
  navQuests: ['Quests', 'เควส'],
  navPass: ['Season Pass', 'ซีซั่นพาส'],
  navNotice: ['Notice', 'ประกาศ'],
  navGuild: ['Guild', 'กิลด์'],
  navRank: ['Ranking', 'อันดับ'],
  navCodex: ['Codex', 'สารานุกรม'],
  navAchieve: ['Achievements', 'ความสำเร็จ'],
  panelRankSub: ['Season leaderboards', 'ตารางอันดับประจำซีซั่น'],
  panelCodexSub: ['Every hero, item and enemy you have met', 'รวมฮีโร่ ไอเทม และศัตรูที่เคยเจอ'],
  panelAchieveSub: ['Milestones and their rewards', 'เป้าหมายสะสมและของรางวัล'],
  navForge: ['Upgrade', 'อัพอาวุธ'],
  navFriends: ['Friends', 'เพื่อน'],
  addFriend: ['Add friend', 'เพิ่มเพื่อน'],
  online: ['online', 'ออนไลน์'],
  play: ['PLAY', 'เล่น'],
  leader: ['Leader', 'หัวหน้าทีม'],
  modeStory: ['Main Story', 'เนื้อเรื่องหลัก'],
  modeStorySub: ['Clear the story stage by stage', 'ไล่เก็บด่านตามเนื้อเรื่อง'],
  modeSide: ['Side Story', 'เนื้อเรื่องพิเศษ'],
  modeSideSub: ['Limited chapters and events', 'ตอนพิเศษและกิจกรรมตามช่วงเวลา'],
  modeDungeon: ['Dungeon', 'ดันเจี้ยน'],
  modeDungeonSub: ['Farm gold and upgrade materials', 'เก็บเงินและวัตถุดิบอัปเกรด'],
  modeTower: ['Tower', 'หอคอย'],
  modeTowerSub: ['Climb floor by floor, no healing between', 'ไต่ทีละชั้น เลือดไม่ฟื้นระหว่างชั้น'],
  panelEventsSub: ['Limited-time events and rewards', 'กิจกรรมช่วงเวลาและของรางวัล'],
  panelQuestsSub: ['Daily, weekly and achievement quests', 'เควสรายวัน รายสัปดาห์ และความสำเร็จ'],
  panelPassSub: ['Season rewards track', 'เส้นทางรางวัลประจำซีซั่น'],
  panelNoticeSub: ['Patch notes and announcements', 'ประกาศและบันทึกการอัปเดต'],
  panelGuildSub: ['Guild hall, members and guild war', 'บ้านกิลด์ สมาชิก และสงครามกิลด์'],
  panelForgeSub: ['Upgrade and enhance gear', 'อัปเกรดและตีบวกอุปกรณ์'],
  panelFriendsSub: ['Friend list, support heroes and gifts', 'รายชื่อเพื่อน ฮีโร่ช่วยรบ และของขวัญ'],
} as const satisfies Record<string, readonly [string, string]>

export type UiKey = keyof typeof T
export const ui = (k: UiKey, vars?: Record<string, string>): string => {
  let s: string = T[k][getLang() === 'th' ? 1 : 0]
  if (vars) for (const [key, v] of Object.entries(vars)) s = s.replace(`{${key}}`, v)
  return s
}

/** ภาษาปัจจุบัน — คอมโพเนนต์ที่เรียกจะรีเรนเดอร์เมื่อเปลี่ยนภาษา */
export function useLang(): Lang {
  const [l, setL] = useState<Lang>(getLang())
  useEffect(() => onLangChange(setL), [])
  return l
}

const pick = (pair: readonly [string, string]) => pair[getLang() === 'th' ? 1 : 0]

/** ความสามารถประจำตำแหน่ง (ตรงกับค่าจริงใน lib/roleTraits.ts) */
const TRAIT: Record<Role, { label: readonly [string, string]; text: readonly [string, string] }> = {
  tank: { label: ['Wall', 'กำแพง'], text: ['Takes 15% less damage · enemies tend to target it first', 'รับดาเมจลดลง 15% · ศัตรูมักเล็งตัวนี้ก่อน'] },
  fighter: { label: ['Lifesteal', 'ดูดเลือด'], text: ['Heals 15% of the damage it deals', 'ฟื้นเลือด 15% ของดาเมจที่ทำได้'] },
  shooter: { label: ['Sharpshooter', 'ยิงแม่น'], text: ['Normal attacks deal 25% more', 'ตีปกติแรงขึ้น 25%'] },
  assassin: { label: ['Assassinate', 'ลอบสังหาร'], text: ['Can hit any enemy (skips the front row) · +30% vs targets below half HP', 'ตีข้ามแถวได้ทุกตัว · ตีเป้าที่เลือดต่ำกว่าครึ่ง +30%'] },
  mage: { label: ['Arcane Power', 'เวทรุนแรง'], text: ['Skill damage +20%', 'ดาเมจสกิลแรงขึ้น 20%'] },
  support: { label: ['Caretaker', 'สายเลี้ยง'], text: ['Heals and shields +25% · team starts with +1 Cost', 'ฮีล/โล่ที่ให้เพิ่ม 25% · ทีมเริ่มเกมพลังงาน +1'] },
}
export const traitLabel = (r: Role): string => pick(TRAIT[r].label)
export const traitText = (r: Role): string => pick(TRAIT[r].text)

/** โบนัสแถว (ตรงกับ lib/formation.ts) */
export const rowBonusText = (row: Row): string =>
  row === 'front'
    ? pick(['DEF +30% · HP +15% — best for Tank / Fighter', 'DEF +30% · HP +15% — เหมาะกับแทงค์ / ไฟเตอร์'])
    : pick(['ATK +15% · Crit +8 — best for Shooter / Assassin / Mage / Support', 'ATK +15% · คริ +8 — เหมาะกับนักยิง / นักฆ่า / นักเวท / ซัพพอร์ต'])
export const rowBonusShort = (row: Row): string => (row === 'front' ? 'DEF +30% · HP +15%' : pick(['ATK +15% · Crit +8', 'ATK +15% · คริ +8']))

const CATEGORY: Record<Category, readonly [string, string]> = { str: ['STR', 'พลัง'], agi: ['AGI', 'ว่องไว'], int: ['INT', 'ไหวพริบ'] }
export const categoryName = (c: Category): string => pick(CATEGORY[c])
