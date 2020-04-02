import fs from 'fs'

import axios from 'axios'
import yaml from 'js-yaml'
import bSqlite3 from 'better-sqlite3'
import hbs from 'handlebars'

;(async () => {
  const db = bSqlite3('zh.db')
  const lvs: Record<string, string[]> = yaml.safeLoad(fs.readFileSync('hsk.yaml', 'utf8'))
  const ambi: Record<string, Record<string, any>> = yaml.safeLoad(fs.readFileSync('hsk-ambiguous.yaml', 'utf8'))
  const { template, speakJs } = yaml.safeLoad(fs.readFileSync('template.yaml', 'utf8'))

  const cards: any[] = [{
    key: 'speak-js',
    markdown: speakJs
  }]

  Object.entries(lvs).map(([lv, vs]) => {
    vs.map((v) => {
      const simplified = v
      let traditional = ''
      let pinyin = ''
      let english = ''

      if (!ambi[lv][v]) {
        const r0 = db.prepare(/*sql*/`
          SELECT
            traditional, pinyin, english
          FROM vocab
          WHERE simplified = ?
        `).get(v)

        traditional = r0.traditional || ''
        pinyin = r0.pinyin
        english = r0.english
      } else {
        traditional = ambi[lv][v].traditional || ''
        pinyin = ambi[lv][v].pinyin
        english = ambi[lv][v].english
      }

      const ss = db.prepare(/*sql*/`
        SELECT
          chinese, english
        FROM sentence
        WHERE chinese LIKE ?
        LIMIT 10
      `).all(`%${simplified}%`)

      cards.push(
        {
          key: `hsk-${simplified}-data`,
          tag: ['HSK'],
          data: {
            traditional: traditional.replace(/[- \n]/g, '').split('').join(' | '),
            pinyin,
            english,
            sentence: ss.map((s) => `- ${s.chinese}\n` + `    - ${s.english}`).join('\n')
          }
        },
        {
          deck: hbs.compile('zh/hsk/{{template}}/{{levelRange}}/{{level}}')({
            levelRange: [' 1-10', '11-20', '21-30', '31-40', '41-50', '51-60'][Math.floor((parseInt(lv) - 1) / 10)],
            level: lv.padStart(2, ' '),
            template: '1. Simplified-English'
          }),
          tag: ['HSK'],
          ref: ['speak-js', `hsk-${simplified}-data`],
          markdown: hbs.compile(template)({
            front: `# ${simplified}`,
            back: [
              `{{hsk-${simplified}-data.data.traditional}}`,
              `{{hsk-${simplified}-data.data.pinyin}}`,
              `{{hsk-${simplified}-data.data.english}}`,
              `{{hsk-${simplified}-data.data.sentence}}`
            ].filter((el) => el).join('\n\n---\n\n')
          })
        },
        {
          deck: hbs.compile('zh/hsk/{{template}}/{{levelRange}}/{{level}}')({
            levelRange: [' 1-10', '11-20', '21-30', '31-40', '41-50', '51-60'][Math.floor((parseInt(lv) - 1) / 10)],
            level: lv.padStart(2, ' '),
            template: '2. English-Chinese'
          }),
          tag: ['HSK'],
          ref: ['speak-js', `hsk-${simplified}-data`],
          markdown: hbs.compile(template)({
            front: `{{hsk-${simplified}-data.data.english}}`,
            back: [
              `# ${simplified}`,
              `{{hsk-${simplified}-data.data.traditional}}`,
              `{{hsk-${simplified}-data.data.pinyin}}`,
              `{{hsk-${simplified}-data.data.sentence}}`
            ].filter((el) => el).join('\n\n---\n\n')
          })
        },
        ...(traditional ? [
          {
            deck: hbs.compile('zh/hsk/{{template}}/{{levelRange}}/{{level}}')({
              levelRange: [' 1-10', '11-20', '21-30', '31-40', '41-50', '51-60'][Math.floor((parseInt(lv) - 1) / 10)],
              level: lv.padStart(2, ' '),
              template: '3. Traditional-Chinese'
            }),
            tag: ['HSK'],
            ref: ['speak-js', `hsk-${simplified}-data`],
            markdown: hbs.compile(template)({
              front: `# {{hsk-${simplified}-data.data.traditional}}`,
              back: [
                `# ${simplified}`,
                `{{hsk-${simplified}-data.data.pinyin}}`,
                `{{hsk-${simplified}-data.data.english}}`,
                `{{hsk-${simplified}-data.data.sentence}}`
              ].filter((el) => el).join('\n\n---\n\n')
            })
          }
        ] : [])
      )
    })
  })

  db.close()

  while (cards.length > 0) {
    const entries = cards.splice(0, 100)
    console.log(entries.map(el => el.deck).filter((el, i, arr) => arr.indexOf(el) === i))
    try {
      await axios.put('http://localhost:24000/api/edit/multi', {
        entries
      })
    } catch (e) {
      console.error(e)
    }
  }
})()
