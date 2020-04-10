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
    overwrite: true,
    tag: ['js'],
    markdown: speakJs
  }]

  const lesson = {
    key: 'hsk',
    name: 'HSK',
    description: 'A curated list of vocabularies for HSK Level 1-6, divided into 60 levels.'
  }
  let isLessonCommited = false

  const pushVocab = (v: string, lv?: string) => {
    const simplified = v
    let traditional = ''
    let pinyin = ''
    let english = ''

    if (!(lv && ambi[lv][v])) {
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
      traditional = Array.isArray(traditional) ? traditional.join(' | ') : ''

      pinyin = ambi[lv][v].pinyin
      pinyin = Array.isArray(pinyin) ? pinyin.join(', ') : pinyin

      english = ambi[lv][v].english
      english = Array.isArray(english) ? english.map((el) => `- ${el}`).join('\n') : english
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
        key: `zh-${simplified}`,
        overwrite: true,
        tag: ['HSK'],
        data: {
          traditional,
          pinyin,
          english,
          sentence: ss.map((s) => `- ${s.chinese}\n` + `    - ${s.english}`).join('\n')
        }
      },
      {
        key: `zh-${simplified}-se`,
        overwrite: true,
        lesson: [
          {
            ...(isLessonCommited ? {
              key: lesson.key
            } : (() => {
              isLessonCommited = true
              return lesson
            })()),
            deck: lv ? hbs.compile('hsk/{{template}}/{{levelRange}}/{{level}}')({
              levelRange: [' 1-10', '11-20', '21-30', '31-40', '41-50', '51-60'][Math.floor((parseInt(lv) - 1) / 10)],
              level: lv.padStart(2, ' '),
              template: '1. Simplified-English'
            }) : undefined
          }
        ],
        tag: ['HSK'],
        ref: ['speak-js', `zh-${simplified}`],
        markdown: hbs.compile(template)({
          front: `# ${simplified}`,
          back: [
            traditional ? `{{zh-${simplified}.data.traditional}}` : undefined,
            `{{zh-${simplified}.data.pinyin}}`,
            `{{zh-${simplified}.data.english}}`,
            `{{zh-${simplified}.data.sentence}}`
          ].filter((el) => el).join('\n\n---\n\n')
        })
      },
      {
        key: `zh-${simplified}-ec`,
        overwrite: true,
        lesson: [
          {
            key: lesson.key,
            deck: lv ? hbs.compile('hsk/{{template}}/{{levelRange}}/{{level}}')({
              levelRange: [' 1-10', '11-20', '21-30', '31-40', '41-50', '51-60'][Math.floor((parseInt(lv) - 1) / 10)],
              level: lv.padStart(2, ' '),
              template: '2. English-Chinese'
            }) : undefined
          }
        ],
        tag: ['HSK'],
        ref: ['speak-js', `zh-${simplified}`],
        markdown: hbs.compile(template)({
          front: `{{zh-${simplified}.data.english}}`,
          back: [
            `# ${simplified}`,
            traditional ? `{{zh-${simplified}.data.traditional}}` : undefined,
            `{{zh-${simplified}.data.pinyin}}`,
            `{{zh-${simplified}.data.sentence}}`
          ].filter((el) => el).join('\n\n---\n\n')
        })
      },
      ...(traditional ? [
        {
          key: `zh-${simplified}-te`,
          overwrite: true,
          lesson: [
            {
              key: lesson.key,
              deck: lv ? hbs.compile('hsk/{{template}}/{{levelRange}}/{{level}}')({
                levelRange: [' 1-10', '11-20', '21-30', '31-40', '41-50', '51-60'][Math.floor((parseInt(lv) - 1) / 10)],
                level: lv.padStart(2, ' '),
                template: '3. Traditional-Chinese'
              }) : undefined
            }
          ],
          tag: ['HSK'],
          ref: ['speak-js', `zh-${simplified}`],
          markdown: hbs.compile(template)({
            front: `# {{zh-${simplified}.data.traditional}}`,
            back: [
              `# ${simplified}`,
              `{{zh-${simplified}.data.pinyin}}`,
              `{{zh-${simplified}.data.english}}`,
              `{{zh-${simplified}.data.sentence}}`
            ].filter((el) => el).join('\n\n---\n\n')
          })
        }
      ] : [])
    )
  }

  Object.entries(lvs).map(([lv, vs]) => {
    console.log(lv)
    vs.map((v) => {
      pushVocab(v, lv)
    })
  })

  // Array.from(allVocabs).map((v, i) => {
  //   if (i % 1000 === 0) {
  //     console.log(i, allVocabs.size)
  //   }
  //   pushVocab(v)
  // })

  db.close()

  while (cards.length > 0) {
    const entries = cards.splice(0, 100)
    console.log((entries
      .map(el => el.lesson || [])
      .reduce((prev, c) => [...prev, ...c], []) as any[])
      .map((el) => el.deck)
      .filter((el, i, arr) => arr.indexOf(el) === i)
    )
    await axios.put('http://localhost:24000/api/edit/multi', {
      entries
    })
  }
})()
