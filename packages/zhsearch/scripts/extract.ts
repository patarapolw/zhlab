import fs from 'fs'

import bSqlite3 from 'better-sqlite3'
import yaml from 'js-yaml'

import { GSheets } from '../src/gsheets'

async function main () {
  const db = bSqlite3('assets/zh.db')
  const vs = yaml.safeLoad(fs.readFileSync('assets/hsk.yaml', 'utf8')) as Record<string, string[]>
  const hs = Array.from(new Set(
    [vs['21'], vs['22']].join('').split('')
  ))
  const seenH = Array.from(new Set(
    Array(22).fill(null).map((_, i) => vs[(i + 1).toString()]).reduce((prev, c) => [...prev, ...c], []).join('').split('')
  ))

  const data = db.prepare(/*sql*/`
  SELECT [entry], sub, sup, [var]
  FROM token
  WHERE [entry] IN (${Array(hs.length).fill('?').join(',')})
  ORDER BY frequency DESC
  `).all(...hs)

  const minify = (k: string, i: number) => {
    data[i][k] = (data[i][k] || '').split('').filter((h: any) => seenH.includes(h)).join('')

    return data[i][k]
  }

  const toStudyH = Array.from(new Set(
    data.map((_, i) => {
      return minify('sub', i) + minify('sup', i) + minify('var', i)
    }).join('').split('')
  ))

  const studyData = db.prepare(/*sql*/`
  SELECT [entry]
  FROM token
  WHERE [entry] IN (${Array(toStudyH.length).fill('?').join(',')})
  ORDER BY frequency DESC
  `).all(...toStudyH)

  const sheets = new GSheets('182JqHvNus04HSky21mybMPYmFFQwF_eFCgq-3M60LC0')

  await sheets.updateSheets({ sheet: 'hanzi', data: studyData })

  db.close()
}

main()
