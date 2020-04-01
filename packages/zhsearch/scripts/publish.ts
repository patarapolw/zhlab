import fs from 'fs'

import axios from 'axios'
import yaml from 'js-yaml'
import bSqlite3 from 'better-sqlite3'
import hbs from 'handlebars'

;(async () => {
  const db = bSqlite3('zh.db')
  const lvs: Record<string, string[]> = yaml.safeLoad(fs.readFileSync('hsk.yaml', 'utf8'))
  const ambi: Record<string, Record<string, any>> = yaml.safeLoad(fs.readFileSync('hsk-ambiguous.yaml', 'utf8'))
  const { template } = yaml.safeLoad(fs.readFileSync('template.yaml', 'utf8'))

  const cards: any[] = []

  Object.entries(lvs).map(([lv, vs], i) => {
    if (!i) return

    vs.map((v) => {
      const simp = v
      let trad = v
      let pinyin = ''
      let english = ''

      if (!ambi[lv][v]) {
        const r0 = db.prepare(/*sql*/`
          SELECT
            traditional, pinyin, english
          FROM vocab
          WHERE simplified = ?
        `).get(v)

        trad = r0.traditional || trad
        pinyin = r0.pinyin
        english = r0.english
      } else {
        trad = ambi[lv][v].traditional || ''
        pinyin = ambi[lv][v].pinyin
        english = ambi[lv][v].english
      }

      const ss = db.prepare(/*sql*/`
        SELECT
          chinese, english
        FROM sentence
        WHERE chinese LIKE ?
        LIMIT 10
      `).all(`%${simp}%`)

      cards.push(
        {
          deck: hbs.compile('zh/HSK/{{template}}/{{levelRange}}/{{level}}')({
            levelRange: [' 1-10', '11-20', '21-30', '31-40', '41-50', '51-60'][Math.floor((parseInt(lv) - 1) / 10)],
            level: lv.padStart(2, ' '),
            template: 'SE'
          }),
          tag: ['HSK'],
          ref: ['speak-js'],
          markdown: hbs.compile(template)({
            front: `# ${simp}`,
            back: [
              trad,
              pinyin,
              english,
              ss.map((s) => `- ${s.chinese}\n` + `  - ${s.english}`).join('\n')
            ].filter((el) => el).join('\n\n')
          })
        },
        {
          deck: hbs.compile('zh/HSK/{{template}}/{{levelRange}}/{{level}}')({
            levelRange: [' 1-10', '11-20', '21-30', '31-40', '41-50', '51-60'][Math.floor((parseInt(lv) - 1) / 10)],
            level: lv.padStart(2, ' '),
            template: 'SE'
          }),
          tag: ['HSK'],
          ref: ['speak-js'],
          markdown: hbs.compile(template)({
            front: pinyin,
            back: [
              `# ${simp}`,
              trad,
              english,
              ss.map((s) => `- ${s.chinese}\n` + `  - ${s.english}`).join('\n')
            ].filter((el) => el).join('\n\n')
          })
        },
        {
          deck: hbs.compile('zh/HSK/{{template}}/{{levelRange}}/{{level}}')({
            levelRange: [' 1-10', '11-20', '21-30', '31-40', '41-50', '51-60'][Math.floor((parseInt(lv) - 1) / 10)],
            level: lv.padStart(2, ' '),
            template: 'EC'
          }),
          tag: ['HSK'],
          ref: ['speak-js'],
          markdown: hbs.compile(template)({
            front: english,
            back: [
              `# ${simp}`,
              trad,
              pinyin,
              english,
              ss.map((s) => `- ${s.chinese}\n` + `  - ${s.english}`).join('\n')
            ].filter((el) => el).join('\n\n')
          })
        },
        ...(trad ? [
          {
            deck: hbs.compile('zh/HSK/{{template}}/{{levelRange}}/{{level}}')({
              levelRange: [' 1-10', '11-20', '21-30', '31-40', '41-50', '51-60'][Math.floor((parseInt(lv) - 1) / 10)],
              level: lv.padStart(2, ' '),
              template: 'TE'
            }),
            tag: ['HSK'],
            ref: ['speak-js'],
            markdown: hbs.compile(template)({
              front: trad.startsWith('-') ? trad.replace(/-/g, '#') : `# ${trad}`,
              back: [
                `# ${simp}`,
                pinyin,
                english,
                ss.map((s) => `- ${s.chinese}\n` + `  - ${s.english}`).join('\n')
              ].filter((el) => el).join('\n\n')
            })
          }
        ] : [])
      )
    })
  })

  db.close()

  while (cards.length > 0) {
    const entries = cards.splice(0, 100)
    console.log(entries.map(el => el.deck))
    await axios.put('http://localhost:24000/api/edit/multi', {
      entries
    })
  }
})()
