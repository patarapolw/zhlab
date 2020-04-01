import fs from 'fs'

import yaml from 'js-yaml'
import bSqlite3 from 'better-sqlite3'

const db = bSqlite3('zh.db')
const lv: Record<string, string[]> = yaml.safeLoad(fs.readFileSync('hsk.yaml', 'utf8'))
const toBeConsidered: Record<string, Record<string, any>> = {}

Object.entries(lv).map(([k, vs]) => {
  toBeConsidered[k] = {}

  vs.map((v) => {
    const r = db.prepare(/*sql*/`
      SELECT
        simplified, traditional, pinyin, english
      FROM vocab
      WHERE simplified = ?
    `).all(v)

    if (r.length > 1) {
      toBeConsidered[k][v] = {
        simplified: joinIfNotDistinct(r.map((el) => el.simplified)),
        traditional: joinIfNotDistinct(r.map((el) => el.traditional)),
        pinyin: joinIfNotDistinct(r.map((el) => el.pinyin)),
        english: joinIfNotDistinct(r.map((el) => el.english))
      }
    } else if (r.length === 0) {
      toBeConsidered[k][v] = {}
    }
  })
})

db.close()

fs.writeFileSync('out/hsk-ambiguous.yaml', yaml.safeDump(toBeConsidered, {
  sortKeys: true
}))

function joinIfNotDistinct<T> (arr: T[]) {
  const r = arr.filter((a) => a).filter((a, i, r0) => r0.indexOf(a) === i)
  if (r.length > 1) {
    return r.map((a) => `- ${a}`).join('\n')
  }

  return `${r[0] || ''}`
}
