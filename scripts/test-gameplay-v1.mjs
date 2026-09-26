// Focused regression tests for RangerEpic Gameplay V1.
// Bundles the TypeScript battle modules with esbuild, matching the existing test suite style.

import { build } from 'esbuild'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const tempFiles = []
const bundle = async (entry, name) => {
  const outfile = path.join(ROOT, 'node_modules', `.tmp-${name}.mjs`)
  tempFiles.push(outfile)
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
    alias: { '@': path.join(ROOT, 'src') },
  })
  return import(pathToFileURL(outfile).href + `?v=${Date.now()}-${name}`)
}

const B = await bundle('src/play/battle.ts', 'gameplay-v1-battle')
const A = await bundle('src/lib/gameplayAdapter.ts', 'gameplay-v1-adapter')

let pass = 0
let fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name} — got ${JSON.stringify(got)}${ok ? '' : `, want ${JSON.stringify(want)}`}`)
  if (ok) pass++
  else fail++
}

const rules = {
  schemaVersion: 1,
  skillGaugeMax: 100,
  defaultNormalAttackGaugeGain: 5,
  defaultCritDamageMultiplier: 3,
  critRateMin: 0,
  critRateMax: 100,
  hitRateMin: 0,
  hitRateMax: 100,
  statFloor: 0,
  playerActsFirst: true,
  freeOrderWithinPhase: true,
  durationDecrementsAt: 'roundEnd',
  dotTicksAt: 'roundEnd',
  hotTicksAt: 'sidePhaseEnd',
  reflectCanCrit: false,
  reflectTriggersReflect: false,
  poisonCanKill: true,
  shieldAbsorbsPoison: true,
  shieldAbsorbsDeadlyPoison: true,
}

const baseClass = (over = {}) => ({
  schemaVersion: 1,
  id: 'test_class',
  characterId: 'test_character',
  assetVariantId: 'test_asset',
  role: '未分類',
  names: { zh: '測試角色', en: 'Test', th: '', jp: '' },
  stats: { hp: 1000, attack: 100, critRate: 0, critDamage: 3, hitRate: 100 },
  normalAttack: { target: 'single', hits: 1, skillGaugeGain: 5 },
  normalSupport: { target: 'singleAlly', effects: [] },
  skill: { target: { side: 'enemy', count: 1, selector: 'manual' }, effects: [{ type: 'damage', value: 150, hits: 1 }] },
  abilities: [],
  ...over,
})

const legacyStats = cls => ({
  hp: cls.stats.hp,
  atk: cls.stats.attack,
  def: 0,
  spd: 100,
  crit: cls.stats.critRate,
  critDmg: cls.stats.critDamage * 100,
  evade: 0,
  hit: cls.stats.hitRate,
  skillEvade: 0,
  skillHit: cls.stats.hitRate,
  skillRes: 0,
  skillDmgRes: 0,
})

const setup = (id, cls, lane = 0) => ({
  rangerId: id,
  characterId: cls.characterId,
  classId: cls.id + '_' + id,
  assetVariantId: id,
  gameplayClass: cls,
  gameplayRules: rules,
  row: 'front',
  lane,
  stats: legacyStats(cls),
  role: 'fighter',
  skills: {
    skill1: A.gameplaySkillToLegacy(cls.skill),
    skill2: A.gameplayNormalSupportToLegacy(cls.normalSupport),
  },
  passives: [],
})

const oneVsOne = (leftClass = baseClass(), rightClass = baseClass({ id: 'right_class' })) =>
  new B.Battle([[setup('left', leftClass)], [setup('right', rightClass)]], 123)

// Shared skill gauge + Player Phase / Enemy Phase.
{
  const cls = baseClass()
  const foe = baseClass({ id: 'foe' })
  const b = new B.Battle([
    [setup('a1', cls, 0), setup('a2', cls, 1)],
    [setup('b1', foe, 0), setup('b2', foe, 1)],
  ], 1)
  const first = b.nextActor()
  check('Gameplay V1 starts with Player Phase', [b.gameplayRound, b.gameplayPhase, first.team], [1, 0, 0])
  b.commitAction(first, 'attack')
  b.resolveAction(first, 'attack', b.units.find(u => u.team === 1))
  b.endTurn(first)
  check('Normal attack adds to one shared team gauge', b.gameplayGaugeOf(0), 5)
  const second = b.units.find(u => u.uid === '0-front-1')
  check('Another ally may be selected before it acts', b.canChooseGameplayActor(second), true)
  b.gameplayGauge[0] = 100
  check('Any ally can use Skill when shared gauge is full', b.canUse(second, 'skill1'), true)
  b.commitAction(second, 'skill1')
  check('Using Skill consumes the shared gauge', b.gameplayGaugeOf(0), 0)
  b.endTurn(second)
  const enemy = b.nextActor()
  check('After all player units act, Enemy Phase starts', [b.gameplayPhase, enemy.team], [1, 1])
}

// Gameplay damage ignores legacy DEF / variance, and only normal attacks can crit.
{
  const cls = baseClass()
  const b = oneVsOne(cls)
  const [a, t] = b.units
  t.def = 999999
  const r = b.applyHit(a, t, 'attack')
  check('Gameplay normal attack uses exact Attack x 100% without legacy DEF/variance', r.damage, 100)
}

// whileOnField ability conditions are live.
{
  const cls = baseClass({
    abilities: [{
      id: 'bloodlust',
      trigger: 'whileOnField',
      conditions: [{ type: 'selfHpPercent', operator: '<=', value: 50 }],
      effects: [{ type: 'attackUp', value: 40, duration: 1 }],
    }],
  })
  const b = oneVsOne(cls)
  const a = b.units[0]
  check('whileOnField ability is inactive above threshold', b.effAtk(a), 100)
  a.hp = 500
  check('whileOnField HP<=50% ability applies immediately', b.effAtk(a), 140)
}

// Same-type status layers stack independently.
{
  const cls = baseClass({
    normalSupport: { target: 'singleAlly', effects: [{ type: 'attackUp', value: 30, duration: 2 }] },
  })
  const b = oneVsOne(cls)
  const a = b.units[0]
  b.resolveAction(a, 'skill2', a)
  b.resolveAction(a, 'skill2', a)
  check('Two ATK-up layers are both retained', a.statuses.filter(s => s.gameplayType === 'attackUp').length, 2)
  check('Two +30% layers stack to +60%', b.effAtk(a), 160)
}

// HoT ticks at the affected side's Phase End.
{
  const cls = baseClass({
    normalSupport: { target: 'singleAlly', effects: [{ type: 'heal', value: 20, duration: 2 }] },
  })
  const b = oneVsOne(cls)
  const a = b.units[0]
  a.hp = 500
  b.resolveAction(a, 'skill2', a)
  check('duration>1 heal does not heal immediately', a.hp, 500)
  b.endTurn(a)
  b.nextActor() // leaving Player Phase => HoT tick
  check('HoT heals at Player Phase End', a.hp, 700)
}

// DoT ticks at Round End before duration decrement.
{
  const cls = baseClass({
    skill: {
      target: { side: 'enemy', count: 1, selector: 'manual' },
      effects: [{ type: 'damageOverTime', value: 10, duration: 1 }],
    },
  })
  const b = oneVsOne(cls)
  const [a, t] = b.units
  b.resolveAction(a, 'skill1', t)
  b.endTurn(a)
  const enemyActor = b.nextActor()
  b.endTurn(enemyActor)
  b.nextActor() // leaving Enemy Phase => Round End
  check('Attack-based DoT ticks at Round End (Attack 100 x 10% = 10)', t.hp, 990)
  check('duration=1 DoT expires after its Round End tick', t.statuses.some(s => s.gameplayType === 'damageOverTime'), false)
}

// Poison and deadly poison may coexist.
{
  const cls = baseClass({
    skill: {
      target: { side: 'enemy', count: 1, selector: 'manual' },
      effects: [
        { type: 'poison', value: 10, duration: 2 },
        { type: 'deadlyPoison', value: 10, duration: 2 },
      ],
    },
  })
  const b = oneVsOne(cls)
  const [a, t] = b.units
  b.resolveAction(a, 'skill1', t)
  check('Poison and deadly poison are separate layers', t.statuses.filter(s => s.gameplayType === 'poison' || s.gameplayType === 'deadlyPoison').length, 2)
}

// Reflect uses actual HP damage and does not chain.
{
  const attackerClass = baseClass({ id: 'attacker' })
  const defenderClass = baseClass({
    id: 'defender',
    normalSupport: { target: 'singleAlly', effects: [{ type: 'reflect', value: 50, duration: 2 }] },
  })
  const b = oneVsOne(attackerClass, defenderClass)
  const [a, d] = b.units
  b.resolveAction(d, 'skill2', d)
  b.resolveAction(a, 'attack', d)
  check('Reflect returns 50% of actual HP damage', [d.hp, a.hp], [900, 950])
}

// Fixed damage is a literal value and honors Hit count.
{
  const cls = baseClass({
    skill: {
      target: { side: 'enemy', count: 1, selector: 'manual' },
      effects: [{ type: 'fixedDamage', value: 77, hits: 2 }],
    },
  })
  const b = oneVsOne(cls)
  const [a, t] = b.units
  b.resolveAction(a, 'skill1', t)
  check('Fixed damage 77 x 2 deals exactly 154', t.hp, 846)
}

for (const file of tempFiles) await rm(file, { force: true })

console.log(`\nGameplay V1: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
