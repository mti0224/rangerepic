// Guards the transition from asset-based prototype rosters to authored classes.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const output = path.resolve('node_modules/.tmp-player-roster.mjs')
try {
  await build({ entryPoints: ['src/play/playerRoster.ts'], bundle: true, format: 'esm', platform: 'node', outfile: output, logLevel: 'silent' })
  const { buildPlayerRoster, groupPlayerCharacters, cleanFormation, placeClass, emptyTeam } = await import(pathToFileURL(output))
  const read = async file => JSON.parse(await readFile(file, 'utf8'))
  const brown = await read('data/game/characters/brown.json')
  const cony = await read('data/game/characters/cony.json')
  const cls = await read('data/game/classes/brown_test.json')
  const base = await read(`public/rangers/${cls.assetVariantId}/ranger.json`)
  const alt = { ...cls, id: 'brown_second', stats: { ...cls.stats, attack: 321 } }
  const catalog = { characters: [brown, cony], classes: [cls, alt, { ...cls, id: 'orphan', characterId: 'missing' }, { ...cls, id: 'missing_asset', assetVariantId: 'missing' }] }
  const assets = [{ id: cls.assetVariantId, approved: true }, { id: 'u123-cony', approved: true }]
  const configs = new Map([[cls.assetVariantId, base], ['u123-cony', base]])
  const rows = buildPlayerRoster(catalog, assets, configs)
  assert.deepEqual(rows.map(r => r.playId), [cls.id, alt.id], 'asset-only, orphan and missing-asset rows stay hidden')
  assert.equal(groupPlayerCharacters(rows).length, 1, 'two classes on one asset remain one character')
  assert.equal(rows[1].config.stats.atk, 321, 'each class retains its own combat data')
  assert.equal(rows[0].config.stats.def, 0, 'legacy defense is neutralized')
  assert.equal(buildPlayerRoster({ ...catalog, classes: [] }, assets, configs).length, 0, 'empty catalog never falls back to legacy assets')
  assert.equal(buildPlayerRoster(catalog, assets.map(a => ({ ...a, approved: false })), configs).length, 0, 'unapproved assets stay hidden')
  assert.equal(buildPlayerRoster(catalog, assets, new Map()).length, 0, 'missing configs cannot produce playable rows')
  const migrated = cleanFormation([{ 'front-0': cls.assetVariantId, 'front-1': alt.id, 'back-0': 'u123-cony', 'sup-0': cls.id }, { 'back-0': cls.id }], rows)
  assert.equal(migrated[0]['front-0'], cls.id, 'old asset save migrates to authored class')
  assert.equal(migrated[0]['front-1'], null, 'duplicate character in saved team removed')
  assert.equal(migrated[0]['back-0'], null, 'retired asset removed')
  assert.equal(migrated[0]['sup-0'], undefined, 'retired reserve slots removed')
  assert.equal(migrated[1]['back-0'], cls.id, 'mirror match on opposite team remains valid')
  const moved = placeClass(migrated, rows, 0, 'back-1', alt.id)
  assert.equal(moved[0]['front-0'], null, 'switching class and slot moves the character')
  assert.equal(moved[0]['back-1'], alt.id)
  assert.equal(moved[1]['back-0'], cls.id, 'other side unchanged')
  assert.deepEqual(cleanFormation(null, rows), [emptyTeam(), emptyTeam()])
  assert.deepEqual(cleanFormation(['bad', 123], rows), [emptyTeam(), emptyTeam()])
  console.log('✓ Player roster: authored classes, grouping, shared assets, migration, duplicate prevention and empty catalogs')
} finally { await rm(output, { force: true }) }
