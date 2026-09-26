import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { validateEnemy, validateStage } from './adventure-schema.mjs'

const root = path.resolve(process.cwd())
const enemiesDir = path.join(root, 'data', 'game', 'enemies')
const stagesDir = path.join(root, 'data', 'game', 'stages')

async function docs(dir) {
  const names = (await fs.readdir(dir)).filter(name => name.endsWith('.json')).sort()
  return Promise.all(names.map(async name => JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'))))
}

const enemies = await docs(enemiesDir)
const stages = await docs(stagesDir)
assert.ok(enemies.length > 0, 'expected at least one enemy fixture')
assert.ok(stages.length > 0, 'expected at least one stage fixture')

for (const enemy of enemies) {
  assert.deepEqual(validateEnemy(enemy, enemy.id), [], 'invalid enemy ' + enemy.id)
  assert.ok(enemy.normalAttack, enemy.id + ' must have normalAttack')
  assert.ok(Array.isArray(enemy.abilities), enemy.id + ' abilities must be an array')
}

const enemyIds = new Set(enemies.map(enemy => enemy.id))
for (const stage of stages) {
  assert.deepEqual(validateStage(stage, stage.id), [], 'invalid stage ' + stage.id)
  assert.ok(stage.waves.length > 0, stage.id + ' must have waves')
  for (const wave of stage.waves) {
    assert.ok(wave.enemies.length > 0, stage.id + '/' + wave.id + ' must not be empty')
    for (const row of wave.enemies) assert.ok(enemyIds.has(row.enemyId), 'unknown enemy ' + row.enemyId)
  }
}

const sample = enemies.find(enemy => enemy.id === 'training_croc')
assert.ok(sample, 'training_croc fixture missing')
assert.equal(sample.skill, null, 'enemy skill must be optional')
assert.equal(sample.normalAttack.effects?.[0]?.type, 'attackDown', 'enemy normal attack extra effects must be preserved')

const multi = stages.find(stage => stage.id === 'training_1')
assert.equal(multi?.waves.length, 2, 'training stage must exercise multi-wave data')
assert.equal(multi?.waves[0].enemies.length, 1)
assert.equal(multi?.waves[1].enemies.length, 2)

console.log('Adventure data tests passed:', enemies.length, 'enemies,', stages.length, 'stages')
