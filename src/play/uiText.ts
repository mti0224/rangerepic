// ====================================================
// uiText.ts — ข้อความของหน้าเล่น (หน้าหลัก · จัดทีม · ฮีโร่ · กาชา · โหลด)
// ภาษาใช้ค่าเดียวกับจอดวล (i18n.ts · จำใน localStorage) — เปลี่ยนที่ไหนก็เปลี่ยนทั้งเกม
//
// ทุกข้อความเก็บเป็นชุด 4 ช่องเรียงตาม LANGS ของ i18n.ts: [en, th, zh, jp]
// เพิ่มภาษาใหม่ = เพิ่มรหัสใน LANGS แล้วเติมช่องท้ายทุกบรรทัด (TypeScript ฟ้องให้เองถ้าลืม)
// ====================================================

import { useEffect, useState } from 'react'
import type { Category, Role } from '@/lib/rangerClass'
import type { Row } from '@/lib/rangerConfig'
import { LANGS, getLang, onLangChange, type Lang } from './i18n'

/** ข้อความ 1 ชุด เรียงตาม LANGS */
type L4 = readonly [string, string, string, string]

const T = {
  appTitle: ['RANGER ARENA', 'RANGER ARENA', 'RANGER ARENA', 'RANGER ARENA'],
  appSub: ['5v5 Turn-Based Battle', 'ดวลเทิร์นเบส 5v5', '5v5 回合制對戰', '5v5 ターン制バトル'],
  myTeam: ['YOUR TEAM', 'ทีมของคุณ', '我方隊伍', '自分の編成'],
  enemyTeam: ['ENEMY TEAM', 'ทีมศัตรู', '敵方隊伍', '敵の編成'],
  random: ['Random', 'สุ่ม', '隨機', 'ランダム'],
  clear: ['Clear', 'ล้าง', '清除', 'クリア'],
  start: ['START BATTLE', 'เริ่มดวล', '開始戰鬥', 'バトル開始'],
  needBoth: ['Put at least 1 ranger in each team', 'ใส่เรนเจอร์อย่างน้อยทีมละ 1 ตัว', '每隊至少放入 1 名英雄', '各チームに最低1体は編成してください'],
  loading: ['Loading rangers…', 'กำลังโหลดเรนเจอร์…', '載入英雄中…', 'ヒーローを読み込み中…'],
  loadFail: ['Loading failed', 'โหลดไม่สำเร็จ', '載入失敗', '読み込み失敗'],
  rangers: ['RANGERS', 'เรนเจอร์', '英雄列表', 'ヒーロー一覧'],
  search: ['Search name…', 'ค้นหาชื่อ…', '搜尋名稱…', '名前で検索…'],
  all: ['All', 'ทั้งหมด', '全部', 'すべて'],
  element: ['Element', 'ธาตุ', '屬性', '属性'],
  role: ['Role', 'ตำแหน่ง', '職業', 'ロール'],
  klass: ['Type', 'ชนิด', '類型', 'タイプ'],
  sort: ['Sort', 'เรียง', '排序', '並び替え'],
  sortGrade: ['★ Grade', '★ ระดับ', '★ 星級', '★ レア度'],
  sortName: ['Name', 'ชื่อ', '名稱', '名前'],
  sortLevel: ['Level', 'เลเวล', '等級', 'レベル'],
  sortFav: ['★ Favorite', '★ ที่ชอบ', '★ 最愛', '★ お気に入り'],
  favAdd: ['Add to favorites', 'เพิ่มเป็นฮีโร่ที่ชอบ', '加入最愛', 'お気に入りに追加'],
  favRemove: ['Remove from favorites', 'เอาออกจากฮีโร่ที่ชอบ', '移出最愛', 'お気に入りから外す'],
  sortHp: ['HP', 'HP', 'HP', 'HP'],
  sortAtk: ['ATK', 'ATK', 'ATK', 'ATK'],
  sortSpd: ['Speed', 'Speed', '速度', '速度'],
  noMatch: ['No rangers match these filters', 'ไม่มีเรนเจอร์ที่ตรงกับตัวกรอง', '沒有符合篩選的英雄', '条件に合うヒーローがいません'],
  noRangers: ['No rangers available yet', 'ยังไม่มีเรนเจอร์ที่พร้อมเล่น', '目前沒有可用的英雄', '利用できるヒーローがありません'],
  empty: ['Empty', 'ว่าง', '空位', '空き'],
  front: ['FRONT', 'แถวหน้า', '前排', '前列'],
  back: ['BACK', 'แถวหลัง', '後排', '後列'],
  info: ['Details', 'ข้อมูล', '詳細', '詳細'],
  remove: ['Remove', 'ลบ', '移除', '外す'],
  change: ['Change', 'เปลี่ยน', '更換', '変更'],
  current: ['IN SLOT', 'ช่องนี้', '此格', 'このスロット'],
  close: ['Close', 'ปิด', '關閉', '閉じる'],
  help: ['How to play', 'วิธีเล่น', '遊玩方式', '遊び方'],
  reserve: ['SPECIAL ROW', 'แถวพิเศษ', '特殊列', '特殊枠'],
  reserveHint: [
    'Not on the field · summon on your turn to cast a skill',
    'ไม่ลงสนาม · ถึงตาเราอัญเชิญมาร่ายสกิลได้',
    '不上場 · 輪到我方時可召喚施放技能',
    '出撃せず · 自分のターンに召喚して技を使える',
  ],
  howReserve: ['Special row (summon)', 'แถวพิเศษ (อัญเชิญ)', '特殊列（召喚）', '特殊枠（召喚）'],
  reserveText: [
    'Each team can add up to 2 rangers to the special row. They stay off the field. On any of your turns you may summon one of them instead of acting (keys A S / D F) to cast its Skill 1 or 2 — it costs that skill\'s Cost, uses its own raw stats (no row bonus, no buffs), then leaves and rests for 8 of your team\'s turns.',
    'ใส่เรนเจอร์แถวพิเศษได้ทีมละ 2 ตัว ไม่ลงสนาม · ถึงตาใครในทีมก็ได้ เลือกอัญเชิญแทนการใช้ท่าของตัวเอง (ปุ่ม A S / D F) มาร่ายสกิล 1 หรือ 2 ของตัวนั้น · เสีย Cost ตามสกิล · ใช้ค่าพลังดิบ (ไม่ได้โบนัสแถว ไม่ได้บัฟ) แล้วกลับไปพัก 8 เทิร์นของทีม',
    '每隊最多可放 2 名英雄在特殊列，不會上場。輪到我方任一角色時，可改為召喚他們（按鍵 A S / D F）施放技能1或2 — 消耗該技能的能量，使用原始能力值（無列加成、無增益），之後退場並休息我方 8 個回合。',
    '特殊枠には各チーム最大2体まで編成でき、戦場には出ません。自分のターンに行動の代わりに召喚（キー A S / D F）してスキル1か2を使用します — そのスキルのコストを消費し、素の能力値（列ボーナス・バフなし）で発動したあと退場し、自チームの8ターン休みます。',
  ],
  rotate: ['Rotate your phone to landscape to play', 'หมุนโทรศัพท์เป็นแนวนอนเพื่อเล่น', '請將手機轉為橫向遊玩', 'スマホを横向きにしてプレイしてください'],
  inAppWarn: [
    'This in-app browser cannot play full screen — open the game in Chrome for the best experience',
    'เบราว์เซอร์ในแอปนี้เล่นแบบเต็มจอไม่ได้ — เปิดเกมใน Chrome จะเล่นได้เต็มจอ',
    '此 App 內建瀏覽器無法全螢幕 — 請用 Chrome 開啟以獲得最佳體驗',
    'アプリ内ブラウザでは全画面にできません — Chrome で開くのがおすすめです',
  ],
  inAppHowTo: [
    'Tap ⋯ (top-right) and choose "Open in browser" / "Open in Safari" to play full screen',
    'แตะ ⋯ มุมขวาบน แล้วเลือก "เปิดในเบราว์เซอร์" / "Open in Safari" เพื่อเล่นแบบเต็มจอ',
    '點右上角 ⋯ 選擇「用瀏覽器開啟」/「Open in Safari」即可全螢幕遊玩',
    '右上の ⋯ から「ブラウザで開く」/「Safari で開く」を選ぶと全画面で遊べます',
  ],
  openBrowser: ['Open in Chrome', 'เปิดใน Chrome', '用 Chrome 開啟', 'Chrome で開く'],
  tapFullscreen: ['Tap to continue in full screen', 'แตะเพื่อเล่นต่อแบบเต็มจอ', '點擊以全螢幕繼續', 'タップして全画面で続ける'],
  pickTitle: ['Choose a ranger — {team} · {row}', 'เลือกเรนเจอร์ — {team} · {row}', '選擇英雄 — {team} · {row}', 'ヒーローを選択 — {team} · {row}'],
  inMine: ['YOURS', 'ทีมคุณ', '我方', '自分'],
  inEnemy: ['ENEMY', 'ศัตรู', '敵方', '敵'],
  teamFull: ['Team is full', 'ทีมเต็มแล้ว', '隊伍已滿', '編成が満員です'],
  pickHint: [
    'Click an empty slot to choose a ranger · click a card for details · drag cards into slots or between slots',
    'คลิกช่องว่างเพื่อเลือกเรนเจอร์ · คลิกการ์ดเพื่อดูข้อมูล · ลากการ์ดใส่ช่อง หรือลากสลับตำแหน่ง',
    '點空格選擇英雄 · 點卡片看詳細 · 可將卡片拖入格子或互相拖曳交換',
    '空きスロットをクリックしてヒーローを選択 · カードをクリックで詳細 · ドラッグで配置や入れ替えができます',
  ],
  placing: ['Selected: {name} — click an empty slot to place', 'เลือก {name} อยู่ — คลิกช่องว่างเพื่อวาง', '已選擇：{name} — 點空格放入', '選択中：{name} — 空きスロットをクリックで配置'],
  detailEmpty: ['Select a ranger to see stats and skills', 'เลือกเรนเจอร์เพื่อดูค่าพลังและสกิล', '選擇英雄以查看能力值與技能', 'ヒーローを選ぶと能力値とスキルを表示'],
  stats: ['STATS', 'ค่าพลัง', '能力值', '能力値'],
  skills: ['SKILLS', 'สกิล', '技能', 'スキル'],
  ability: ['ROLE ABILITY', 'ความสามารถตำแหน่ง', '職業能力', 'ロール特性'],
  normalAttack: ['Attack', 'ตีธรรมดา', '普通攻擊', '通常攻撃'],
  normalAttackText: ['100% ATK · gains +1 Cost', '100% ATK · ได้ Cost +1', '攻擊力 100% · 獲得能量 +1', '攻撃力100% · コスト +1 獲得'],
  cost: ['Cost', 'Cost', '能量', 'コスト'],
  goodFit: ['fits this row', 'เข้ากับแถวนี้', '適合此排', 'この列に適性'],
  howTo: ['HOW TO PLAY', 'วิธีเล่น', '遊玩方式', '遊び方'],
  howRows: ['Row bonuses', 'โบนัสตามแถว', '排列加成', '列ボーナス'],
  howRoles: ['Role abilities', 'ความสามารถของแต่ละตำแหน่ง', '各職業能力', 'ロールごとの特性'],
  howControls: ['Controls', 'การควบคุม', '操作方式', '操作方法'],
  controlsText: [
    'On your turn pick Attack / Skill 1 / Skill 2 (keys Z / X / C), then click a target. Press the same key again to auto-aim when there is only one choice. AUTO plays for you; the speed button cycles x1 → x2 → x4.',
    'ถึงตาคุณ: เลือกตีธรรมดา / สกิล 1 / สกิล 2 (ปุ่ม Z / X / C) แล้วคลิกเป้า · กดปุ่มเดิมซ้ำ = เล็งให้เองถ้ามีเป้าเดียว · AUTO = ให้เล่นเอง · ปุ่มความเร็วกดวน x1 → x2 → x4',
    '輪到你時選擇 普通攻擊 / 技能1 / 技能2（按鍵 Z / X / C）再點擊目標。再按一次同一鍵，若只有一個目標會自動瞄準。AUTO 會自動戰鬥；速度鍵循環 x1 → x2 → x4。',
    '自分のターンに通常攻撃 / スキル1 / スキル2（キー Z / X / C）を選び、目標をクリック。同じキーをもう一度押すと対象が1つのときは自動で狙います。AUTO は自動戦闘、速度ボタンは x1 → x2 → x4 の順に切り替わります。',
  ],
  energyText: [
    'Skills cost team energy (Cost). Normal attacks give +1 Cost. Win by defeating the whole enemy team — after 80 turns the team with more HP % wins.',
    'สกิลใช้พลังงานทีม (Cost) · ตีธรรมดาได้ Cost +1 · ชนะเมื่อล้มศัตรูหมดทีม — ครบ 80 เทิร์น ทีมที่เหลือเลือด % มากกว่าชนะ',
    '技能會消耗隊伍能量（Cost），普通攻擊可獲得 +1。打倒敵方全隊即獲勝 — 滿 80 回合時由剩餘 HP% 較高的一方獲勝。',
    'スキルはチームコストを消費し、通常攻撃で +1 獲得します。敵を全滅させれば勝利 — 80ターン経過時は残りHP％が高いチームの勝ちです。',
  ],
  statHp: ['HP', 'HP', 'HP', 'HP'],
  statAtk: ['ATK', 'ATK', '攻擊', '攻撃'],
  statDef: ['DEF', 'DEF', '防禦', '防御'],
  statSpd: ['Speed', 'Speed', '速度', '速度'],
  statCrit: ['Crit', 'คริ', '爆擊率', '会心率'],
  statCritDmg: ['Crit DMG', 'คริดาเมจ', '爆擊傷害', '会心ダメージ'],
  statEvade: ['Evade', 'หลบ', '閃避', '回避'],
  statHit: ['Hit', 'แม่นยำ', '命中', '命中'],
  statSkillEvade: ['Skill Evade', 'หลบสกิล', '技能閃避', '技回避'],
  statSkillHit: ['Skill Hit', 'แม่นสกิล', '技能命中', '技命中'],
  statSkillRes: ['Resist', 'ต้านสกิล', '技能抗性', '技耐性'],
  statSkillDmgRes: ['Skill DMG Res', 'ต้านดาเมจสกิล', '技能傷害抗性', '技ダメージ耐性'],

  // ── หน้าหลัก (Lobby) ──
  lobby: ['LOBBY', 'หน้าหลัก', '大廳', 'ロビー'],
  reserveRow: ['RESERVE', 'แถวพิเศษ', '特殊列', '特殊枠'],
  lvShort: ['Lv.', 'Lv.', 'Lv.', 'Lv.'],
  power: ['POWER', 'พลังรวม', '戰力', '戦力'],
  myTeamShort: ['MY TEAM', 'ทีมของฉัน', '我的隊伍', 'マイ編成'],
  editTeam: ['Edit team', 'แก้ไขทีม', '編輯隊伍', '編成を変更'],
  noTeamYet: ['No team set yet', 'ยังไม่ได้จัดทีม', '尚未編隊', 'まだ編成していません'],
  modes: ['GAME MODES', 'โหมดเล่น', '遊戲模式', 'ゲームモード'],
  soon: ['Soon', 'เร็วๆ นี้', '即將推出', '近日公開'],
  ready: ['Ready', 'พร้อมเล่น', '可遊玩', 'プレイ可能'],
  modePractice: ['Practice Duel', 'ดวลฝึกซ้อม', '練習對戰', '練習バトル'],
  modePracticeSub: ['Build both teams and fight right away', 'จัดทีมสองฝั่งแล้วลงดวลได้เลย', '編排雙方隊伍後立即開打', '両チームを編成してすぐ対戦'],
  modeCampaign: ['Campaign', 'โหมดเนื้อเรื่อง', '劇情模式', 'キャンペーン'],
  modeCampaignSub: ['Clear stages, earn gold and gear', 'ตะลุยด่าน เก็บเงินและไอเทม', '闖關取得金幣與裝備', 'ステージを攻略して金貨や装備を獲得'],
  modeArena: ['Arena', 'สนามประลอง', '競技場', 'アリーナ'],
  modeArenaSub: ['Fight other players’ defence teams', 'ท้าทีมตั้งรับของผู้เล่นคนอื่น', '挑戰其他玩家的防守隊伍', '他プレイヤーの防衛編成に挑戦'],
  modeBoss: ['Boss Raid', 'ล่าบอส', '首領討伐', 'ボス討伐'],
  modeBossSub: ['Team up against a huge boss', 'รุมบอสตัวใหญ่กับเพื่อนร่วมทีม', '與隊友合力挑戰巨大首領', '仲間と巨大ボスに挑む'],
  modeDaily: ['Daily Quests', 'ภารกิจประจำวัน', '每日任務', 'デイリークエスト'],
  modeDailySub: ['Small missions, daily rewards', 'ภารกิจเล็กๆ รับรางวัลทุกวัน', '小任務，每日獎勵', '小さな任務で毎日報酬'],
  navHeroes: ['Heroes', 'ฮีโร่', '英雄', 'ヒーロー'],
  navTeam: ['Team', 'ทีม', '隊伍', '編成'],
  navBag: ['Bag', 'กระเป๋า', '背包', 'バッグ'],
  navShop: ['Shop', 'ร้านค้า', '商店', 'ショップ'],
  navGacha: ['Summon', 'กาชา', '召喚', 'ガチャ'],
  navMail: ['Mail', 'กล่องข้อความ', '信箱', 'メール'],
  navSettings: ['Settings', 'ตั้งค่า', '設定', '設定'],
  battleNow: ['BATTLE', 'ลงดวล', '出戰', '出撃'],
  panelHeroesSub: ['Level up, evolve and inspect every hero you own', 'อัปเลเวล วิวัฒนาการ และดูข้อมูลฮีโร่ทุกตัวที่มี', '升級、進化並查看所有擁有的英雄', '所持ヒーローの育成・進化・確認'],
  panelBagSub: ['Materials, gear and consumables', 'วัตถุดิบ อุปกรณ์สวมใส่ และของใช้', '素材、裝備與消耗品', '素材・装備・消費アイテム'],
  panelShopSub: ['Daily deals, packs and currency exchange', 'ของลดประจำวัน แพ็กเกจ และแลกเปลี่ยนสกุลเงิน', '每日特價、禮包與貨幣兌換', '日替わり商品・パック・通貨交換'],
  panelGachaSub: ['Summon new heroes with gems or tickets', 'สุ่มฮีโร่ตัวใหม่ด้วยเพชรหรือตั๋ว', '用寶石或召喚券獲得新英雄', 'ジェムやチケットで新ヒーローを召喚'],
  panelMailSub: ['Rewards and news from the team', 'ของรางวัลและข่าวจากทีมงาน', '獎勵與官方消息', '報酬と運営からのお知らせ'],
  wip: ['Under construction', 'กำลังพัฒนา', '開發中', '開発中'],
  wipNote: ['The layout is ready — the system will be filled in later.', 'วางโครงหน้าไว้แล้ว เดี๋ยวค่อยใส่ระบบจริงทีหลัง', '版面已完成，系統之後會補上。', 'レイアウトは完成、システムは後ほど実装します。'],
  theme: ['Theme', 'ธีม', '主題', 'テーマ'],
  themeNeon: ['Neon', 'นีออน', '霓虹', 'ネオン'],
  themePixel: ['Pixel', 'พิกเซล', '像素', 'ピクセル'],
  language: ['Language', 'ภาษา', '語言', '言語'],
  resetProfile: ['Reset demo data', 'ล้างข้อมูลทดลอง', '重設測試資料', 'デモデータをリセット'],
  more: ['More', 'เพิ่มเติม', '更多', 'もっと見る'],

  // ── หน้าฮีโร่ ──
  tabInfo: ['Info', 'ข้อมูล', '資訊', '情報'],
  tabSkills: ['Skills', 'สกิล', '技能', 'スキル'],
  tabUpgrade: ['Upgrade', 'อัพเกรด', '升級', '強化'],
  tabLimit: ['Limit Break', 'ข้ามขีดจำกัด', '突破上限', '限界突破'],
  powAtk: ['Attack', 'พลังโจมตี', '攻擊力', '攻撃力'],
  powHp: ['Health', 'พลังชีวิต', '生命值', '体力'],
  powDef: ['Defence', 'พลังป้องกัน', '防禦力', '防御力'],
  powSpd: ['Attack Speed', 'ความเร็วโจมตี', '攻擊速度', '攻撃速度'],
  powCrit: ['Crit Rate', 'อัตราคริติคอล', '爆擊率', '会心率'],
  gearWeapon: ['Weapon', 'อาวุธ', '武器', '武器'],
  gearArmor: ['Armor', 'เกราะ', '防具', '防具'],
  gearAcc: ['Accessory', 'เครื่องประดับ', '飾品', 'アクセサリー'],
  gearTome: ['Tome', 'คัมภีร์', '祕典', '秘伝書'],
  filter: ['Filter', 'ฟิลเตอร์', '篩選', 'フィルター'],
  levelLabel: ['Level', 'เลเวล', '等級', 'レベル'],
  ownedHeroes: ['Heroes', 'ฮีโร่ทั้งหมด', '英雄', 'ヒーロー'],
  panelUpgradeSub: ['Spend gold and materials to raise stats', 'ใช้เงินและวัตถุดิบเพิ่มค่าพลัง', '消耗金幣與素材提升能力值', '金貨と素材で能力値を強化'],
  panelLimitSub: ['Break the level cap with duplicate heroes', 'ใช้ตัวซ้ำปลดเพดานเลเวล', '用重複英雄突破等級上限', '重複ヒーローでレベル上限を突破'],
  levelSoon: ['Level system is not in yet', 'ระบบเลเวลยังไม่เปิด', '等級系統尚未開放', 'レベルシステムは未実装'],
  skillAttack: ['Attack skill', 'สกิลโจมตี', '攻擊技能', '攻撃スキル'],
  skillBuff: ['Buff skill', 'สกิลบัฟ', '增益技能', 'バフスキル'],

  // ── หน้ากาชา ──
  bannerStd: ['Standard Summon', 'ตู้เรนเจอร์ถาวร', '常駐召喚', '恒常ガチャ'],
  bannerStdSub: ['All rangers, always available', 'เรนเจอร์ทุกตัว เปิดตลอดเวลา', '所有英雄，常時開放', '全ヒーロー・常時開催'],
  bannerEvent: ['Event Summon', 'ตู้เรนเจอร์อีเวนต์', '活動召喚', 'イベントガチャ'],
  bannerEventSub: ['Featured rangers, limited time', 'เรนเจอร์พิเศษ เปิดช่วงเวลาจำกัด', '限時推薦英雄', '期間限定のピックアップ'],
  bannerGear: ['Equipment Summon', 'ตู้อุปกรณ์', '裝備召喚', '装備ガチャ'],
  bannerGearSub: ['Weapons, armor and more', 'อาวุธ เกราะ และอื่นๆ', '武器、防具與更多', '武器や防具など'],
  gearSoon: ['Equipment system is not in yet', 'ระบบอุปกรณ์ยังไม่เปิด', '裝備系統尚未開放', '装備システムは未実装'],
  pull1: ['Summon ×1', 'สุ่ม 1 ครั้ง', '召喚 ×1', '1回召喚'],
  pull10: ['Summon ×10', 'สุ่ม 10 ครั้ง', '召喚 ×10', '10回召喚'],
  pickUp: ['PICK UP', 'อัตราพิเศษ', '機率UP', 'ピックアップ'],
  rates: ['Rates', 'อัตราออก', '機率', '排出率'],
  guarantee10: ['×10 guarantees Rare or better', 'สุ่ม 10 ครั้ง การันตีระดับหายากขึ้นไป', '召喚 ×10 保證稀有以上', '10回召喚でレア以上確定'],
  notEnoughGem: ['Not enough gems', 'เพชรไม่พอ', '寶石不足', 'ジェムが足りません'],
  tapPack: ['Tap the pack to open', 'แตะซองเพื่อเปิด', '點擊卡包開啟', 'パックをタップして開封'],
  tapCard: ['Tap a card to reveal', 'แตะการ์ดเพื่อเปิด', '點擊卡片翻開', 'カードをタップしてめくる'],
  skipAll: ['Skip', 'ข้ามทั้งหมด', '全部跳過', 'すべてスキップ'],
  done: ['Done', 'เสร็จสิ้น', '完成', '完了'],
  rarityCommon: ['Common', 'ธรรมดา', '普通', 'ノーマル'],
  rarityRare: ['Rare', 'หายาก', '稀有', 'レア'],
  rarityEpic: ['Epic', 'พิเศษ', '史詩', 'エピック'],
  rarityLegend: ['Legendary', 'ตำนาน', '傳說', 'レジェンド'],
  newTag: ['NEW', 'ใหม่', '新', 'NEW'],
  freeGem: ['Prototype: gems are not charged yet', 'โหมดทดลอง: ยังไม่หักเพชร', '測試中：暫不扣除寶石', 'テスト中：ジェムは消費しません'],

  // ── เมนูอื่นในหน้าหลัก ──
  navProfile: ['Profile', 'โปรไฟล์', '個人檔案', 'プロフィール'],
  navEvents: ['Events', 'กิจกรรม', '活動', 'イベント'],
  navQuests: ['Quests', 'เควส', '任務', 'クエスト'],
  navPass: ['Season Pass', 'ซีซั่นพาส', '季票', 'シーズンパス'],
  navNotice: ['Notice', 'ประกาศ', '公告', 'お知らせ'],
  navGuild: ['Guild', 'กิลด์', '公會', 'ギルド'],
  navRank: ['Ranking', 'อันดับ', '排行榜', 'ランキング'],
  navCodex: ['Codex', 'สารานุกรม', '圖鑑', '図鑑'],
  navAchieve: ['Achievements', 'ความสำเร็จ', '成就', '実績'],
  panelRankSub: ['Season leaderboards', 'ตารางอันดับประจำซีซั่น', '賽季排行榜', 'シーズンランキング'],
  panelCodexSub: ['Every hero, item and enemy you have met', 'รวมฮีโร่ ไอเทม และศัตรูที่เคยเจอ', '收錄遇過的英雄、道具與敵人', '出会ったヒーロー・アイテム・敵を収録'],
  panelAchieveSub: ['Milestones and their rewards', 'เป้าหมายสะสมและของรางวัล', '成就目標與獎勵', '達成目標と報酬'],
  navForge: ['Upgrade', 'อัพอาวุธ', '裝備強化', '装備強化'],
  navFriends: ['Friends', 'เพื่อน', '好友', 'フレンド'],
  addFriend: ['Add friend', 'เพิ่มเพื่อน', '加好友', 'フレンド追加'],
  online: ['online', 'ออนไลน์', '線上', 'オンライン'],
  play: ['PLAY', 'เล่น', '開始', 'プレイ'],
  leader: ['Leader', 'หัวหน้าทีม', '隊長', 'リーダー'],
  modeStory: ['Main Story', 'เนื้อเรื่องหลัก', '主線劇情', 'メインストーリー'],
  modeStorySub: ['Clear the story stage by stage', 'ไล่เก็บด่านตามเนื้อเรื่อง', '依序攻略劇情關卡', 'ストーリーを順に攻略'],
  modeSide: ['Side Story', 'เนื้อเรื่องพิเศษ', '支線劇情', 'サイドストーリー'],
  modeSideSub: ['Limited chapters and events', 'ตอนพิเศษและกิจกรรมตามช่วงเวลา', '限時章節與活動', '期間限定の章とイベント'],
  modeDungeon: ['Dungeon', 'ดันเจี้ยน', '地下城', 'ダンジョン'],
  modeDungeonSub: ['Farm gold and upgrade materials', 'เก็บเงินและวัตถุดิบอัปเกรด', '收集金幣與強化素材', '金貨と強化素材を集める'],
  modeTower: ['Tower', 'หอคอย', '爬塔', 'タワー'],
  modeTowerSub: ['Climb floor by floor, no healing between', 'ไต่ทีละชั้น เลือดไม่ฟื้นระหว่างชั้น', '逐層挑戰，層間不回復', '階層ごとに挑戦、HPは回復しない'],
  panelEventsSub: ['Limited-time events and rewards', 'กิจกรรมช่วงเวลาและของรางวัล', '限時活動與獎勵', '期間限定イベントと報酬'],
  panelQuestsSub: ['Daily, weekly and achievement quests', 'เควสรายวัน รายสัปดาห์ และความสำเร็จ', '每日、每週與成就任務', 'デイリー・ウィークリー・実績クエスト'],
  panelPassSub: ['Season rewards track', 'เส้นทางรางวัลประจำซีซั่น', '賽季獎勵路線', 'シーズン報酬トラック'],
  panelNoticeSub: ['Patch notes and announcements', 'ประกาศและบันทึกการอัปเดต', '更新內容與公告', 'アップデート情報とお知らせ'],
  panelGuildSub: ['Guild hall, members and guild war', 'บ้านกิลด์ สมาชิก และสงครามกิลด์', '公會大廳、成員與公會戰', 'ギルドホール・メンバー・ギルド戦'],
  panelForgeSub: ['Upgrade and enhance gear', 'อัปเกรดและตีบวกอุปกรณ์', '升級與強化裝備', '装備の強化と精錬'],
  panelFriendsSub: ['Friend list, support heroes and gifts', 'รายชื่อเพื่อน ฮีโร่ช่วยรบ และของขวัญ', '好友列表、助戰英雄與贈禮', 'フレンド一覧・助っ人・ギフト'],

  // ── อุปกรณ์ · เลเวลฮีโร่ ──
  rarityMythic: ['Mythic', 'ตำนานเทพ', '神話', 'ミシック'],
  gearEmpty: ['Empty', 'ว่าง', '空', '空き'],
  gearEquip: ['Equip', 'สวมใส่', '裝備', '装備する'],
  gearUnequip: ['Unequip', 'ถอดออก', '卸下', '外す'],
  gearSwapFrom: ['Take from {name}', 'ย้ายมาจาก {name}', '從 {name} 取下', '{name} から付け替え'],
  gearEquippedOn: ['On {name}', 'ใส่อยู่กับ {name}', '裝備於 {name}', '{name} が装備中'],
  gearInBag: ['In bag', 'อยู่ในกระเป๋า', '在背包中', 'バッグ内'],
  gearMain: ['Main stat', 'ค่าหลัก', '主屬性', 'メイン'],
  gearSubs: ['Random stats', 'ค่าสุ่ม', '隨機屬性', 'ランダム'],
  gearElemBonus: ['Element match', 'ธาตุตรงกัน', '屬性相符', '属性一致'],
  gearElemNeed: ['Needs a {el} hero', 'ต้องใส่กับฮีโร่ธาตุ{el}', '需{el}屬性英雄', '{el}属性のヒーロー専用'],
  gearSet: ['Set', 'เซ็ต', '套裝', 'セット'],
  gearSetPieces: ['{n} pieces', '{n} ชิ้น', '{n} 件', '{n} 点'],
  gearEnhance: ['Enhance', 'ตีบวก', '強化', '強化'],
  gearFree: ['Prototype: free, no materials used', 'โหมดทดลอง: ฟรี ไม่ใช้วัตถุดิบ', '測試中：免費，不消耗素材', 'テスト中：素材不要・無料'],
  gearPick: ['Choose {slot}', 'เลือก{slot}', '選擇{slot}', '{slot}を選択'],
  gearNoneForSlot: ['No gear for this slot', 'ไม่มีอุปกรณ์สำหรับช่องนี้', '此欄位沒有裝備', 'この枠の装備がありません'],
  gearTomeSoon: ['Tomes are not in yet', 'ยังไม่มีคัมภีร์', '祕典尚未開放', '秘伝書は未実装'],
  gearCount: ['{n} items', '{n} ชิ้น', '{n} 件', '{n} 個'],
  gearSelectHint: ['Select an item to see its details', 'เลือกอุปกรณ์เพื่อดูรายละเอียด', '選擇裝備以查看詳細', '装備を選ぶと詳細を表示'],
  gearSortRarity: ['Rarity', 'ระดับ', '稀有度', 'レア度'],
  gearSortLevel: ['Enhance', 'ขั้นตีบวก', '強化等級', '強化値'],
  gearActiveSets: ['Active sets', 'เซ็ตที่ทำงาน', '已啟動套裝', '発動中のセット'],
  gearNoSet: ['No set bonus yet', 'ยังไม่มีโบนัสเซ็ต', '尚無套裝效果', 'セット効果なし'],
  heroLevelTitle: ['Hero Level', 'เลเวลฮีโร่', '英雄等級', 'ヒーローレベル'],
  heroLevelNote: [
    'Levels raise HP · ATK · DEF only — the other rates come from gear',
    'เลเวลเพิ่มแค่ HP · ATK · DEF — อัตราอื่นๆ ได้จากอุปกรณ์',
    '等級只提升 HP · 攻擊 · 防禦 — 其他比率來自裝備',
    'レベルで上がるのは HP・攻撃・防御のみ — 他の率は装備から',
  ],
  heroLevelFree: ['Prototype: change freely, no resources used', 'โหมดทดลอง: ปรับได้อิสระ ไม่เสียทรัพยากร', '測試中：可自由調整，不消耗資源', 'テスト中：自由に変更可・消費なし'],
  heroLevelGain: ['vs Lv.1', 'เทียบ Lv.1', '相比 Lv.1', 'Lv.1 比'],
  heroLevelBattle: ['Applies to your team in battle', 'มีผลกับทีมเราในจอดวล', '在戰鬥中套用於我方隊伍', 'バトルで自分のチームに反映'],
  psExecute: ['+{n}% damage vs targets below half HP', 'ตีเป้าเลือดต่ำกว่าครึ่ง แรงขึ้น {n}%', '對半血以下目標傷害 +{n}%', 'HP半分以下の相手へのダメージ +{n}%'],
  psLifesteal: ['Heals {n}% of damage dealt', 'ฟื้นเลือด {n}% ของดาเมจที่ทำได้', '回復造成傷害的 {n}%', '与ダメージの{n}%を回復'],
  psTough: ['Takes {n}% less damage', 'รับดาเมจลดลง {n}%', '受到傷害 -{n}%', '被ダメージ -{n}%'],
  psHealUp: ['Heals & shields +{n}%', 'ฮีล/โล่ที่ให้ +{n}%', '治療與護盾 +{n}%', '回復・シールド +{n}%'],
  psAtkUp: ['ATK +{n}% (innate)', 'พลังโจมตี +{n}% (ติดตัว)', '攻擊力 +{n}%（固有）', '攻撃力 +{n}%（固有）'],
  psCritUp: ['Crit rate +{n}', 'อัตราคริ +{n}', '爆擊率 +{n}', '会心率 +{n}'],
  psSpeedUp: ['Speed +{n}% (innate)', 'ความเร็ว +{n}% (ติดตัว)', '速度 +{n}%（固有）', '速度 +{n}%（固有）'],

  // ── เซ็ตทีม ──
  teamsTitle: ['Teams', 'จัดทีม', '隊伍編成', 'チーム編成'],
  teamLabel: ['Team', 'ทีม', '隊伍', 'チーム'],
  teamDefaultName: ['Team {n}', 'ทีม {n}', '隊伍 {n}', 'チーム {n}'],
  teamRename: ['Tap to rename', 'แตะเพื่อตั้งชื่อ', '點擊以命名', 'タップで名前を変更'],
  teamEdit: ['Edit', 'แก้ไข', '編輯', '編集'],
  teamDelete: ['Delete', 'ลบ', '刪除', '削除'],
  teamDeleteConfirm: ['Delete this team?', 'ลบทีมนี้?', '刪除此隊伍？', 'このチームを削除？'],
  teamAdd: ['Add team', 'เพิ่มทีม', '新增隊伍', 'チームを追加'],
  teamsMax: ['Up to {n} teams', 'จัดได้สูงสุด {n} ทีม', '最多 {n} 隊', '最大 {n} チームまで'],
  teamsEmpty: ['No teams yet — add one below', 'ยังไม่มีทีม — กดเพิ่มทีมด้านล่าง', '尚無隊伍 — 請於下方新增', 'まだチームがありません — 下から追加'],
  teamDone: ['Done', 'เสร็จ', '完成', '完了'],
  teamEditTitle: ['Edit team', 'แก้ไขทีม', '編輯隊伍', 'チームを編集'],
  teamPickHint: [
    'Pick a slot, then tap a hero below · tap × to remove',
    'เลือกช่อง แล้วแตะฮีโร่ด้านล่าง · แตะ × เพื่อเอาออก',
    '先選欄位，再點下方英雄 · 點 × 移除',
    '枠を選んでから下のヒーローをタップ · × で外す',
  ],
  teamInTeam: ['In team', 'อยู่ในทีม', '已在隊中', '編成中'],
  rowSpecial: ['Special', 'พิเศษ', '特殊', '特殊'],
  presetUse: ['Saved team', 'เซ็ตทีม', '已存隊伍', '保存チーム'],
  presetPick: ['Load a saved team…', 'เลือกเซ็ตทีมที่จัดไว้…', '載入已存隊伍…', '保存チームを読み込む…'],
  presetLoaded: ['Loaded “{name}”', 'ใช้เซ็ต “{name}” แล้ว', '已載入「{name}」', '「{name}」を読み込みました'],

  // ── โหมดเนื้อเรื่อง ──
  stageLocked: ['Clear the previous stage first', 'ต้องผ่านด่านก่อนหน้าก่อน', '請先通過前一關', '前のステージをクリアしてください'],
  stageBoss: ['BOSS', 'บอส', '首領', 'ボス'],
  stageEnemies: ['Enemies', 'ศัตรู', '敵人', '敵'],
  stageGoals: ['Star goals', 'เงื่อนไขดาว', '星級條件', '星の条件'],
  star1: ['Win the battle', 'ชนะการต่อสู้', '贏得戰鬥', 'バトルに勝利'],
  star2: ['No hero knocked out', 'ไม่มีฮีโร่ฝั่งเราล้ม', '無英雄倒下', '味方が1人も倒れない'],
  star3: ['Win within {n} turns', 'ชนะภายใน {n} เทิร์น', '{n} 回合內獲勝', '{n}ターン以内に勝利'],
  stageRewards: ['Rewards', 'รางวัล', '獎勵', '報酬'],
  stageFirstClear: ['First clear', 'ผ่านครั้งแรก', '首次通關', '初回クリア'],
  stageDropChance: ['Replay: {n}% chance', 'เล่นซ้ำ: โอกาส {n}%', '重玩：{n}% 機率', '再挑戦：{n}%の確率'],
  stageEnergy: ['Energy {n}', 'พลังงาน {n}', '體力 {n}', 'スタミナ {n}'],
  stageEnergyFree: ['Prototype: energy not used', 'โหมดทดลอง: ยังไม่หักพลังงาน', '測試中：不消耗體力', 'テスト中：スタミナ消費なし'],
  stageTeam: ['Team', 'ทีม', '隊伍', 'チーム'],
  stageNoTeam: ['No saved teams yet', 'ยังไม่มีเซ็ตทีม', '尚無已存隊伍', '保存チームがありません'],
  stageMakeTeam: ['Make a team', 'ไปจัดทีม', '前往編隊', 'チームを編成'],
  stageEmptyTeam: ['This team has no heroes on the field', 'ทีมนี้ไม่มีฮีโร่ลงสนาม', '此隊伍沒有上場英雄', 'このチームは出撃メンバーがいません'],
  stageStart: ['Battle', 'เริ่มต่อสู้', '開戰', '出撃'],
  stageBest: ['Best', 'ดีที่สุด', '最佳', 'ベスト'],
  resultWin: ['Victory', 'ชนะ', '勝利', '勝利'],
  resultLose: ['Defeat', 'แพ้', '戰敗', '敗北'],
  resultNewStage: ['Stage {n} unlocked!', 'ปลดล็อคด่าน {n} แล้ว!', '已解鎖第 {n} 關！', 'ステージ{n}が解放！'],
  resultAllClear: ['Chapter cleared!', 'ผ่านครบทั้งบทแล้ว!', '本章全數通關！', 'この章をクリア！'],
  resultOk: ['OK', 'ตกลง', '確定', 'OK'],
  resultNoReward: ['No rewards — try again!', 'ไม่ได้รับรางวัล — ลองใหม่อีกครั้ง!', '沒有獎勵 — 再試一次！', '報酬なし — もう一度挑戦！'],
  backToMap: ['Map', 'แผนที่', '地圖', 'マップ'],

  // ── หน้าจบด่าน ──
  seExit: ['Exit', 'ออก', '離開', '退出'],
  seReplay: ['Play again', 'เล่นต่อ', '再玩一次', 'もう一度'],
  seNext: ['Next stage', 'ไปด่านต่อไป', '下一關', '次のステージ'],
  seExp: ['EXP', 'EXP', 'EXP', 'EXP'],
  seKo: ['KO', 'ล้ม', '倒下', '戦闘不能'],
  seReserveHalf: ['Special · ½ EXP', 'พิเศษ · EXP ½', '特殊 · EXP ½', '特殊 · EXP ½'],
  seTurns: ['{n} turns', '{n} เทิร์น', '{n} 回合', '{n}ターン'],
  seTryAgain: [
    'Level up your heroes or enhance their gear, then try again',
    'ลองอัปเลเวลฮีโร่หรือตีบวกอุปกรณ์ แล้วลองใหม่อีกครั้ง',
    '提升英雄等級或強化裝備後再挑戰',
    'レベル上げや装備強化をして再挑戦しよう',
  ],

  // ── ซีซั่นพาส ──
  passDaysLeft: ['{n} days left', 'เหลือ {n} วัน', '剩餘 {n} 天', '残り{n}日'],
  passFree: ['FREE', 'ฟรี', '免費', 'フリー'],
  passPremium: ['PREMIUM', 'พรีเมียม', '進階', 'プレミアム'],
  passUnlock: ['Unlock Premium', 'ปลดล็อคพรีเมียม', '解鎖進階', 'プレミアム解放'],
  passOwned: ['Premium active', 'พรีเมียมเปิดแล้ว', '已啟用進階', 'プレミアム有効'],
  passTestFree: ['Prototype: free', 'โหมดทดลอง: ฟรี', '測試中：免費', 'テスト中：無料'],
  passClaim: ['Claim', 'รับ', '領取', '受取'],
  passClaimAll: ['Claim all ({n})', 'รับทั้งหมด ({n})', '全部領取（{n}）', 'すべて受取（{n}）'],
  passNothing: ['Nothing to claim', 'ยังไม่มีของให้รับ', '沒有可領取的獎勵', '受け取れる報酬なし'],
  passLevel: ['Pass Level', 'เลเวลพาส', '通行證等級', 'パスレベル'],
  passLevelHint: ['Prototype: change level freely', 'โหมดทดลอง: ปรับเลเวลได้อิสระ', '測試中：可自由調整等級', 'テスト中：レベル自由変更'],
  passReset: ['Reset pass', 'รีเซ็ตพาส', '重置通行證', 'パスをリセット'],
  passRanger: ['Ranger', 'เรนเจอร์', '英雄', 'ヒーロー'],
  passGot: ['Rewards received', 'ได้รับรางวัล', '獲得獎勵', '報酬獲得'],
  passGold: ['Gold', 'เงิน', '金幣', 'ゴールド'],
  passGem: ['Gems', 'เพชร', '寶石', 'ジェム'],
  passTapClose: ['Tap to close', 'แตะเพื่อปิด', '點擊關閉', 'タップで閉じる'],
  passRangerNote: [
    'Hero ownership is not in yet — ranger rewards are shown only',
    'ยังไม่มีระบบครอบครองฮีโร่ — รางวัลเรนเจอร์แสดงไว้ก่อน',
    '尚無英雄持有系統 — 英雄獎勵僅供展示',
    'ヒーロー所持システムは未実装 — ヒーロー報酬は表示のみ',
  ],
} as const satisfies Record<string, L4>

export type UiKey = keyof typeof T
/** ช่องของภาษาปัจจุบัน */
const li = (): number => {
  const i = LANGS.indexOf(getLang())
  return i < 0 ? 0 : i
}
export const ui = (k: UiKey, vars?: Record<string, string>): string => {
  let s: string = T[k][li()]
  if (vars) for (const [key, v] of Object.entries(vars)) s = s.replace(`{${key}}`, v)
  return s
}

/** ภาษาปัจจุบัน — คอมโพเนนต์ที่เรียกจะรีเรนเดอร์เมื่อเปลี่ยนภาษา */
export function useLang(): Lang {
  const [l, setL] = useState<Lang>(getLang())
  useEffect(() => onLangChange(setL), [])
  return l
}

const pick = (row: L4) => row[li()]

/** ความสามารถประจำตำแหน่ง (ตรงกับค่าจริงใน lib/roleTraits.ts) */
const TRAIT: Record<Role, { label: L4; text: L4 }> = {
  tank: {
    label: ['Wall', 'กำแพง', '銅牆', '壁'],
    text: [
      'Takes 15% less damage · enemies tend to target it first',
      'รับดาเมจลดลง 15% · ศัตรูมักเล็งตัวนี้ก่อน',
      '受到傷害降低 15% · 敵人會優先攻擊',
      '被ダメージ15%減 · 敵に狙われやすい',
    ],
  },
  fighter: {
    label: ['Lifesteal', 'ดูดเลือด', '吸血', '吸血'],
    text: ['Heals 15% of the damage it deals', 'ฟื้นเลือด 15% ของดาเมจที่ทำได้', '造成傷害的 15% 轉為治療', '与えたダメージの15%を回復'],
  },
  shooter: {
    label: ['Sharpshooter', 'ยิงแม่น', '神射', '狙撃'],
    text: ['Normal attacks deal 25% more', 'ตีปกติแรงขึ้น 25%', '普通攻擊傷害 +25%', '通常攻撃のダメージ +25%'],
  },
  assassin: {
    label: ['Assassinate', 'ลอบสังหาร', '暗殺', '暗殺'],
    text: [
      'Can hit any enemy (skips the front row) · +30% vs targets below half HP',
      'ตีข้ามแถวได้ทุกตัว · ตีเป้าที่เลือดต่ำกว่าครึ่ง +30%',
      '可攻擊任意敵人（無視前排）· 對半血以下目標 +30%',
      '前列を無視して任意の敵を攻撃 · HP半分以下の相手に +30%',
    ],
  },
  mage: {
    label: ['Arcane Power', 'เวทรุนแรง', '祕法', '魔力'],
    text: ['Skill damage +20%', 'ดาเมจสกิลแรงขึ้น 20%', '技能傷害 +20%', 'スキルダメージ +20%'],
  },
  support: {
    label: ['Caretaker', 'สายเลี้ยง', '守護', '支援'],
    text: [
      'Heals and shields +25% · team starts with +1 Cost',
      'ฮีล/โล่ที่ให้เพิ่ม 25% · ทีมเริ่มเกมพลังงาน +1',
      '治療與護盾 +25% · 隊伍開場能量 +1',
      '回復とシールド +25% · 開始時チームコスト +1',
    ],
  },
}
export const traitLabel = (r: Role): string => pick(TRAIT[r].label)
export const traitText = (r: Role): string => pick(TRAIT[r].text)

/** โบนัสแถว (ตรงกับ lib/formation.ts) */
const ROW_BONUS: Record<Row, L4> = {
  front: [
    'DEF +30% · HP +15% — best for Tank / Fighter',
    'DEF +30% · HP +15% — เหมาะกับแทงค์ / ไฟเตอร์',
    'DEF +30% · HP +15% — 適合坦克 / 戰士',
    'DEF +30% · HP +15% — タンク / ファイター向け',
  ],
  back: [
    'ATK +15% · Crit +8 — best for Shooter / Assassin / Mage / Support',
    'ATK +15% · คริ +8 — เหมาะกับนักยิง / นักฆ่า / นักเวท / ซัพพอร์ต',
    'ATK +15% · 爆擊 +8 — 適合射手 / 刺客 / 法師 / 輔助',
    'ATK +15% · 会心 +8 — シューター / アサシン / メイジ / サポート向け',
  ],
}
const ROW_BONUS_SHORT: Record<Row, L4> = {
  front: ['DEF +30% · HP +15%', 'DEF +30% · HP +15%', 'DEF +30% · HP +15%', 'DEF +30% · HP +15%'],
  back: ['ATK +15% · Crit +8', 'ATK +15% · คริ +8', 'ATK +15% · 爆擊 +8', 'ATK +15% · 会心 +8'],
}
export const rowBonusText = (row: Row): string => pick(ROW_BONUS[row])
export const rowBonusShort = (row: Row): string => pick(ROW_BONUS_SHORT[row])

const CATEGORY: Record<Category, L4> = {
  str: ['STR', 'พลัง', '力量', 'パワー'],
  agi: ['AGI', 'ว่องไว', '敏捷', 'スピード'],
  int: ['INT', 'ไหวพริบ', '智力', 'テクニック'],
}
export const categoryName = (c: Category): string => pick(CATEGORY[c])
