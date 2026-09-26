import { inflateRawSync } from 'node:zlib'

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50

function findEocd(buf) {
  const start = Math.max(0, buf.length - 0xFFFF - 22)
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD) return i
  }
  return -1
}

function safePngName(name) {
  const base = name.replace(/\\/g, '/').split('/').pop() || ''
  if (!/^[a-z0-9][a-z0-9_.-]*\.png$/i.test(base)) return null
  return base
}

export function extractPngsFromZip(input, options = {}) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  const maxFiles = Math.max(1, Number(options.maxFiles || 500))
  const maxTotalBytes = Math.max(1024, Number(options.maxTotalBytes || 20 * 1024 * 1024))
  const eocd = findEocd(buf)
  if (eocd < 0) throw new Error('invalid zip: EOCD not found')

  const totalEntries = buf.readUInt16LE(eocd + 10)
  const centralOffset = buf.readUInt32LE(eocd + 16)
  let pos = centralOffset
  let totalBytes = 0
  const files = []

  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== CENTRAL) throw new Error('invalid zip: central directory')
    const method = buf.readUInt16LE(pos + 10)
    const compressedSize = buf.readUInt32LE(pos + 20)
    const uncompressedSize = buf.readUInt32LE(pos + 24)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const localOffset = buf.readUInt32LE(pos + 42)
    const rawName = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8')
    pos += 46 + nameLen + extraLen + commentLen

    const name = safePngName(rawName)
    if (!name) continue
    if (files.length >= maxFiles) throw new Error('zip contains too many PNG files')
    if (uncompressedSize > 2 * 1024 * 1024) throw new Error('PNG too large: ' + name)
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL) throw new Error('invalid zip local header: ' + name)
    const localNameLen = buf.readUInt16LE(localOffset + 26)
    const localExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const dataEnd = dataStart + compressedSize
    if (dataEnd > buf.length) throw new Error('invalid zip data: ' + name)
    const compressed = buf.subarray(dataStart, dataEnd)
    let data
    if (method === 0) data = Buffer.from(compressed)
    else if (method === 8) data = inflateRawSync(compressed)
    else throw new Error('unsupported zip compression method ' + method + ': ' + name)
    if (data.length !== uncompressedSize) throw new Error('zip size mismatch: ' + name)
    if (data.length < 8 || data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4E || data[3] !== 0x47) {
      throw new Error('not a PNG: ' + name)
    }
    totalBytes += data.length
    if (totalBytes > maxTotalBytes) throw new Error('zip extracted size is too large')
    files.push({ name, data })
  }

  return files
}
