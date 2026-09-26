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

// Authored animation slots must remap the raw Ranger visual actions per class.
{
  const cls = baseClass({
    normalAttack: { target: 'single', hits: 1, skillGaugeGain: 5, animation: 'skill2' },
    normalSupport: { target: 'singleAlly', animation: 'attack', effects: [] },
    skill: { animation: 'skill1', target: { side: 'enemy', count: 1, selector: 'manual' }, effects: [{ type: 'damage', value: 150, hits: 1 }] },
  })
  const raw = {
    name: 'Raw',
    stats: { hp: 1, atk: 1, def: 1, spd: 1, crit: 0, critDmg: 100, evade: 0, hit: 100, skillEvade: 0, skillHit: 100, skillRes: 0 },
    actions: {
      attack: { marker: 'attack' },
      skill1: { marker: 'skill1' },
      skill2: { marker: 'skill2' },
    },
    skills: {},
    passives: [],
  }
  const adapted = A.adaptRangerConfigForGameplay(raw, cls)
  check('Gameplay animation choices remap raw visual action slots', [
    adapted.actions.attack.marker,
    adapted.actions.skill1.marker,
    adapted.actions.skill2.marker,
  ], ['skill2', 'skill1', 'attack'])
}

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

// battleStart ability events may create timed statuses.
{
  const cls = baseClass({
    abilities: [{
      id: 'opening-buff',
      trigger: 'battleStart',
      conditions: [],
      effects: [{ type: 'attackUp', value: 20, duration: 2, abilityTarget: 'self' }],
    }],
  })
  const b = oneVsOne(cls)
  const a = b.units[0]
  check('battleStart ability applies a timed self buff', [a.statuses.filter(s => s.gameplayType === 'attackUp').length, b.effAtk(a)], [1, 120])
}

// afterDamaged can target the attacker without chaining forever.
{
  const attackerClass = baseClass({ id: 'event-attacker' })
  const defenderClass = baseClass({
    id: 'event-defender',
    abilities: [{
      id: 'thorns-event',
      trigger: 'afterDamaged',
      conditions: [{ type: 'receivedDamage', operator: '>=', value: 100 }],
      effects: [{ type: 'fixedDamage', value: 25, hits: 1, abilityTarget: 'attacker' }],
    }],
  })
  const b = oneVsOne(attackerClass, defenderClass)
  const [a, d] = b.units
  b.resolveAction(a, 'attack', d)
  check('afterDamaged ability uses actual damage and attacker scope', [d.hp, a.hp], [900, 975])
}

// statusApplied receives the original Gameplay effect type.
{
  const attackerClass = baseClass({
    id: 'status-attacker',
    skill: {
      target: { side: 'enemy', count: 1, selector: 'manual' },
      effects: [{ type: 'attackDown', value: 30, duration: 2 }],
    },
  })
  const defenderClass = baseClass({
    id: 'status-defender',
    abilities: [{
      id: 'cleanse-on-atk-down',
      trigger: 'statusApplied',
      conditions: [{ type: 'statusType', operator: '=', value: 'attackDown' }],
      effects: [{ type: 'cleanseDebuffs', abilityTarget: 'self' }],
    }],
  })
  const b = oneVsOne(attackerClass, defenderClass)
  const [a, d] = b.units
  b.resolveAction(a, 'skill1', d)
  check('statusApplied ability can react to Gameplay status type', d.statuses.some(s => s.gameplayType === 'attackDown'), false)
}

// selfDied may still affect living units through a non-self target scope.
{
  const attackerClass = baseClass({ id: 'death-attacker', stats: { hp: 1000, attack: 2000, critRate: 0, critDamage: 3, hitRate: 100 } })
  const defenderClass = baseClass({
    id: 'death-defender',
    abilities: [{
      id: 'death-burst',
      trigger: 'selfDied',
      conditions: [],
      effects: [{ type: 'fixedDamage', value: 40, hits: 1, abilityTarget: 'allEnemies' }],
    }],
  })
  const b = oneVsOne(attackerClass, defenderClass)
  const [a, d] = b.units
  b.resolveAction(a, 'attack', d)
  check('selfDied ability can hit enemies after owner dies', [d.alive, a.hp], [false, 960])
}

// Round Start fires at the beginning of Round 1.
{
  const cls = baseClass({
    abilities: [{
      id: 'round-start-buff',
      trigger: 'roundStart',
      conditions: [{ type: 'round', operator: '=', value: 1 }],
      effects: [{ type: 'attackUp', value: 15, duration: 1, abilityTarget: 'self' }],
    }],
  })
  const b = oneVsOne(cls)
  check('roundStart fires for Round 1 during battle initialization', [b.gameplayRound, Math.round(b.effAtk(b.units[0]))], [1, 115])
}

// Round End effects are created after the old round countdown and survive into the next round.
{
  const cls = baseClass({
    abilities: [{
      id: 'round-end-buff',
      trigger: 'roundEnd',
      conditions: [{ type: 'round', operator: '=', value: 1 }],
      effects: [{ type: 'attackUp', value: 20, duration: 1, abilityTarget: 'self' }],
    }],
  })
  const b = oneVsOne(cls)
  const a = b.nextActor()
  b.endTurn(a)
  const e = b.nextActor()
  b.endTurn(e)
  b.nextActor() // finish Round 1 and enter Round 2
  const me = b.units[0]
  check('Round End duration=1 effect survives into following round', [b.gameplayRound, b.effAtk(me), me.statuses.find(s => s.gameplayType === 'attackUp')?.turns], [2, 120, 1])

  b.endTurn(me)
  const enemy = b.nextActor()
  b.endTurn(enemy)
  b.nextActor() // finish Round 2 and enter Round 3
  check('Round End effect expires after its following round when condition no longer matches', [b.gameplayRound, b.effAtk(me)], [3, 100])
}

// everyNRounds fires only at the configured completed-round interval.
{
  const cls = baseClass({
    abilities: [{
      id: 'every-two-rounds',
      trigger: 'everyNRounds',
      triggerValue: 2,
      conditions: [],
      effects: [{ type: 'fixedDamage', value: 30, hits: 1, abilityTarget: 'allEnemies' }],
    }],
  })
  const b = oneVsOne(cls)
  const enemy = b.units[1]

  let a = b.nextActor(); b.endTurn(a)
  let e = b.nextActor(); b.endTurn(e)
  b.nextActor()
  check('everyNRounds does not fire after Round 1 when N=2', enemy.hp, 1000)

  b.endTurn(b.units[0])
  e = b.nextActor(); b.endTurn(e)
  b.nextActor()
  check('everyNRounds fires after Round 2 when N=2', enemy.hp, 970)
}

// beforeDamaged sees the incoming damage and may alter the target before HP is deducted.
{
  const attackerClass = baseClass({ id: 'before-attacker' })
  const defenderClass = baseClass({
    id: 'before-defender',
    abilities: [{
      id: 'pre-hit-heal',
      trigger: 'beforeDamaged',
      conditions: [{ type: 'receivedDamage', operator: '>=', value: 100 }],
      effects: [{ type: 'heal', value: 20, duration: 1, abilityTarget: 'self' }],
    }],
  })
  const b = oneVsOne(attackerClass, defenderClass)
  const [a, d] = b.units
  d.hp = 500
  b.resolveAction(a, 'attack', d)
  check('beforeDamaged ability resolves before HP deduction', d.hp, 600)
}

// hpChanged can react after damage; recursion guard prevents self-trigger loops from a healing response.
{
  const attackerClass = baseClass({ id: 'hp-attacker' })
  const defenderClass = baseClass({
    id: 'hp-defender',
    abilities: [{
      id: 'low-hp-heal',
      trigger: 'hpChanged',
      conditions: [{ type: 'selfHpPercent', operator: '<=', value: 80 }],
      effects: [{ type: 'heal', value: 10, duration: 1, abilityTarget: 'self' }],
    }],
  })
  const b = oneVsOne(attackerClass, defenderClass)
  const [a, d] = b.units
  d.hp = 850
  b.resolveAction(a, 'attack', d)
  check('hpChanged ability can heal once without recursive loop', d.hp, 850)
}

// allyDied and enemyDied are dispatched from the viewpoint of each living ability owner.
{
  const killerClass = baseClass({
    id: 'killer',
    stats: { hp: 1000, attack: 2000, critRate: 0, critDamage: 3, hitRate: 100 },
    abilities: [{
      id: 'enemy-down-buff',
      trigger: 'enemyDied',
      conditions: [],
      effects: [{ type: 'attackUp', value: 25, duration: 1, abilityTarget: 'self' }],
    }],
  })
  const allyWatcher = baseClass({
    id: 'ally-watcher',
    abilities: [{
      id: 'ally-down-buff',
      trigger: 'allyDied',
      conditions: [],
      effects: [{ type: 'attackUp', value: 30, duration: 1, abilityTarget: 'self' }],
    }],
  })
  const victimClass = baseClass({ id: 'victim' })
  const enemyMateClass = baseClass({ id: 'enemy-mate' })
  const b = new B.Battle([
    [setup('killer', killerClass, 0), setup('watcher', allyWatcher, 1)],
    [setup('victim', victimClass, 0), setup('enemy-mate', enemyMateClass, 1)],
  ], 321)
  const killer = b.units.find(u => u.rangerId === 'killer')
  const victim = b.units.find(u => u.rangerId === 'victim')
  const watcher = b.units.find(u => u.rangerId === 'watcher')

  // First kill an enemy: killer's enemyDied passive should trigger.
  b.resolveAction(killer, 'attack', victim)
  check('enemyDied triggers for a living unit when the opposing unit dies', b.effAtk(killer), 2500)

  // Then directly defeat the watcher's ally to exercise allyDied from the surviving watcher's perspective.
  const enemyMate = b.units.find(u => u.rangerId === 'enemy-mate')
  const killerHp = killer.hp
  enemyMate.atk = 5000
  b.resolveAction(enemyMate, 'attack', killer)
  check('allyDied triggers for a surviving teammate', [killer.alive, b.effAtk(watcher), killerHp > killer.hp], [false, 130, true])
}

// Taunt constrains the real Gameplay target pool, not only the clickable UI targets.
{
  const attackerClass = baseClass({
    id: 'taunt-attacker',
    skill: {
      target: { side: 'enemy', count: 'all', selector: 'random' },
      effects: [{ type: 'damage', value: 100, hits: 1 }],
    },
  })
  const defenderClass = baseClass({ id: 'taunt-defender' })
  const b = new B.Battle([
    [setup('attacker', attackerClass, 0)],
    [setup('taunter', defenderClass, 0), setup('other', defenderClass, 1)],
  ], 777)
  const attacker = b.units.find(u => u.rangerId === 'attacker')
  const taunter = b.units.find(u => u.rangerId === 'taunter')
  const other = b.units.find(u => u.rangerId === 'other')
  taunter.statuses.push({
    type: 'taunt',
    pct: 0,
    turns: 2,
    appliedTurn: 0,
    gameplayType: 'taunt',
    gameplayValue: 0,
  })
  b.resolveAction(attacker, 'skill1', taunter)
  check('Taunt restricts all-target Gameplay attack resolution to the taunter', [taunter.hp, other.hp], [900, 1000])
}

for (const file of tempFiles) await rm(file, { force: true })

console.log(`\nGameplay V1: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
