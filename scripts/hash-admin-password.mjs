import crypto from 'node:crypto'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const rl = readline.createInterface({ input, output })
const password = process.argv[2] || await rl.question('管理員密碼：')
rl.close()

if (!password) {
  console.error('密碼不可為空')
  process.exit(1)
}

const salt = crypto.randomBytes(16)
const key = crypto.scryptSync(password, salt, 32)
console.log('scrypt$' + salt.toString('hex') + '$' + key.toString('hex'))
