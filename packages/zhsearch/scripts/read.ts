import fs from 'fs'

import yaml from 'js-yaml'
import bSqlite3 from 'better-sqlite3'
import axios from 'axios'
import cheerio from 'cheerio'

;(async () => {
  const db = bSqlite3('zh.db')
  const lvs: Record<string, string[]> = yaml.safeLoad(fs.readFileSync('hsk.yaml', 'utf8'))
  const ambi: Record<string, Record<string, any>> = yaml.safeLoad(fs.readFileSync('hsk-ambiguous.yaml', 'utf8'))

  const promises = [] as Promise<any>[]

  Object.entries(lvs).map(([lv, vs]) => {
    vs.map((v) => {
      const simp = v
      let trad = v

      if (!ambi[lv][v]) {
        const r0 = db.prepare(/*sql*/`
        SELECT
          traditional
        FROM vocab
        WHERE simplified = ?
      `).get(v)

        trad = r0.traditional || trad
      }

      const r = db.prepare(/*sql*/`
        SELECT
          chinese
        FROM sentence
        WHERE (chinese LIKE ? OR chinese LIKE ?)
        LIMIT 10
      `).all(`%${simp}%`, `%${trad[0]}%`)

      if (r.length <= 5) {
        promises.push((async () => {
          await new Promise((resolve) => setTimeout(resolve, promises.length * 1000))

          const r0 = await axios.get('http://www.jukuu.com/search.php', {
            params: {
              q: simp
            },
            validateStatus: () => true,
            transformResponse: (data) => data
          })
          console.log(`Downloading: ${v}`)

          const $ = cheerio.load(r0.data)
          const cs = $('tr.c').toArray().map((el) => $(el).text())
          const es = $('tr.e').toArray().map((el) => $(el).text())

          if (cs.length === 0) {
            console.log(`${v} not available.`)
            console.log(r0.status)
            console.log()
          }

          cs.map((c, i) => {
            db.prepare(/*sql*/`
              INSERT INTO sentence (chinese, english)
              VALUES (?, ?)
              ON CONFLICT DO NOTHING
            `).run(c, es[i])
          })
        })())
      }
    })
  })

  await Promise.all(promises)

  db.close()
})().catch(console.error)
