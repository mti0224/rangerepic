// ====================================================
// plistParser.ts — Apple .plist files (XML or binary bplist00)
// Port จาก lerico_res/plist_parser.js
// ====================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export function parsePlist(buffer: ArrayBuffer): any {
  const bytes = new Uint8Array(buffer)
  // binary plist starts with 'bplist'
  if (bytes[0] === 0x62 && bytes[1] === 0x70 && bytes[2] === 0x6C && bytes[3] === 0x69) {
    return parseBinaryPlist(buffer)
  }
  return parseXMLPlist(new TextDecoder().decode(buffer))
}

// ---- XML plist ----

function parseXMLPlist(text: string): any {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  function walk(node: Element): any {
    switch (node.tagName) {
      case 'plist': return walk(node.firstElementChild!)
      case 'dict': {
        const obj: Record<string, any> = {}
        const ch = [...node.children]
        for (let i = 0; i + 1 < ch.length; i += 2) {
          obj[ch[i].textContent ?? ''] = walk(ch[i + 1])
        }
        return obj
      }
      case 'array':  return [...node.children].map(walk)
      case 'string': return node.textContent
      case 'integer':return parseInt(node.textContent ?? '0', 10)
      case 'real':   return parseFloat(node.textContent ?? '0')
      case 'true':   return true
      case 'false':  return false
      default:       return node.textContent
    }
  }
  return walk(doc.documentElement)
}

// ---- Binary plist ----

function parseBinaryPlist(buffer: ArrayBuffer): any {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const len = buffer.byteLength
  if (len < 40) return null

  // Trailer: last 32 bytes
  const tb = len - 32
  const offsetIntSize = bytes[tb + 6]
  const objectRefSize = bytes[tb + 7]

  function uintBE(off: number, size: number): number {
    let v = 0
    for (let i = 0; i < size; i++) v = v * 256 + bytes[off + i]
    return v
  }

  const numObjects = uintBE(tb + 8, 8)
  const topObject = uintBE(tb + 16, 8)
  const offsetTableOffset = uintBE(tb + 24, 8)

  const offsets = new Array<number>(numObjects)
  for (let i = 0; i < numObjects; i++) {
    offsets[i] = uintBE(offsetTableOffset + i * offsetIntSize, offsetIntSize)
  }

  function readObj(idx: number): any {
    let pos = offsets[idx]
    const marker = bytes[pos++]
    const high = (marker >> 4) & 0xF
    const low = marker & 0xF

    let count = low
    if (low === 0xF) {                  // extended size
      const im = bytes[pos++]
      const bs = 1 << (im & 0xF)
      count = uintBE(pos, bs)
      pos += bs
    }

    switch (high) {
      case 0x0:
        if (low === 8) return false
        if (low === 9) return true
        return null

      case 0x1: {                        // integer
        const bs = 1 << low
        if (bs === 1) return view.getUint8(pos)
        if (bs === 2) return view.getUint16(pos, false)
        if (bs === 4) return view.getInt32(pos, false)
        return uintBE(pos, 8)
      }

      case 0x2:                          // real
        if (low === 2) return view.getFloat32(pos, false)
        if (low === 3) return view.getFloat64(pos, false)
        return 0

      case 0x4:                          // data
        return bytes.slice(pos, pos + count)

      case 0x5: {                        // ASCII string
        let s = ''
        for (let i = 0; i < count; i++) s += String.fromCharCode(bytes[pos + i])
        return s
      }

      case 0x6: {                        // UTF-16BE string
        let s = ''
        for (let i = 0; i < count; i++) s += String.fromCharCode(view.getUint16(pos + i * 2, false))
        return s
      }

      case 0xA: {                        // array
        const arr: any[] = []
        for (let i = 0; i < count; i++) {
          arr.push(readObj(uintBE(pos + i * objectRefSize, objectRefSize)))
        }
        return arr
      }

      case 0xD: {                        // dict
        const d: Record<string, any> = {}
        for (let i = 0; i < count; i++) {
          const k = readObj(uintBE(pos + i * objectRefSize, objectRefSize))
          const v = readObj(uintBE(pos + (count + i) * objectRefSize, objectRefSize))
          d[k] = v
        }
        return d
      }

      default: return null
    }
  }

  return readObj(topObject)
}
