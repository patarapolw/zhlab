import fs from 'fs'
import readline from 'readline'

import { google } from 'googleapis'
import yaml from 'js-yaml'
import bSqlite3 from 'better-sqlite3'
import hbs from 'handlebars'
import { nanoid } from 'nanoid'

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets'
]
const TOKEN_PATH = 'secrets/token.json'
const CRED_PATH = 'secrets/gsheets.json'
const SPREADSHEET_ID = '1n3J-y5DHK5tAKh2NfNojOc6lh66JI9fehkBQ1diomhc'

async function main () {
  const db = bSqlite3('zh.db')
  const lvs: Record<string, string[]> = yaml.safeLoad(fs.readFileSync('hsk.yaml', 'utf8'))
  const ambi: Record<string, Record<string, any>> = yaml.safeLoad(fs.readFileSync('hsk-ambiguous.yaml', 'utf8'))

  const cards: any[] = []
  const notes: any[] = []
  const decks = new Map<string, string>()

  const pushVocab = (v: string, lv: string) => {
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

    notes.push({
      id: `vocab-${simplified}`,
      tag: ['HSK'],
      // simplified,
      traditional,
      pinyin,
      english,
      sentence: ss.map((s) => `- ${s.chinese}${
        `<iframe src="https://speak-btn.now.sh/btn?q=${encodeURIComponent(s.chinese)}&lang=zh"
          style="width: 20px; height: 20px;"
          frameborder="0" allowtransparency="true"></iframe>`.replace(/\s+/g, ' ')
      }\n` + `    - ${s.english}`).join('\n')
    })

    const cardBuilder = (opts: {
      id: string
      template: string
      front: string
      back: string
    }) => {
      const deckName = hbs.compile('hsk/{{template}}/{{levelRange}}/{{level}}')({
        levelRange: [' 1-10', '11-20', '21-30', '31-40', '41-50', '51-60'][Math.floor((parseInt(lv) - 1) / 10)],
        level: lv.padStart(2, ' '),
        template: opts.template
      })
      let deckId = decks.get(deckName)
      if (!deckId) {
        deckId = nanoid()
        decks.set(deckName, deckId)
      }

      cards.push({
        id: opts.id,
        deckId,
        tag: ['HSK'],
        noteId: [`vocab-${simplified}`],
        front: opts.front,
        back: opts.back
      })
    }

    cardBuilder({
      id: `vocab-${simplified}-se`,
      template: '1. Simplified-English',
      front: `# ${simplified}`,
      back: [
        traditional ? `{{vocab-${simplified}.data.traditional}}` : undefined,
        `{{vocab-${simplified}.data.pinyin}}`,
        `{{vocab-${simplified}.data.english}}`,
        `{{{vocab-${simplified}.data.sentence}}}`
      ].filter((el) => el).join('\n\n---\n\n')
    })

    cardBuilder({
      id: `vocab-${simplified}-ec`,
      template: '2. English-Chinese',
      front: `{{vocab-${simplified}.data.english}}`,
      back: [
        `# ${simplified}`,
        traditional ? `{{vocab-${simplified}.data.traditional}}` : undefined,
        `{{vocab-${simplified}.data.pinyin}}`,
        `{{{vocab-${simplified}.data.sentence}}}`
      ].filter((el) => el).join('\n\n---\n\n')
    })

    if (traditional) {
      cardBuilder({
        id: `vocab-${simplified}-te`,
        template: '3. Traditional-Chinese',
        front: `# {{vocab-${simplified}.data.traditional}}`,
        back: [
          `# ${simplified}`,
          `{{zh-${simplified}.data.pinyin}}`,
          `{{zh-${simplified}.data.english}}`,
          `{{{zh-${simplified}.data.sentence}}}`
        ].filter((el) => el).join('\n\n---\n\n')
      })
    }
  }

  Object.entries(lvs).map(([lv, vs]) => {
    console.log(lv)
    vs.map((v) => {
      pushVocab(v, lv)
    })
  })

  const auth = await authorize(JSON.parse(fs.readFileSync(CRED_PATH, 'utf8')))
  const sheets = google.sheets({ version: 'v4', auth })

  const updateSheets = async (opts: {
    sheet: string
    data: Record<string, any>[]
  }) => {
    const topRow = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${opts.sheet}!1:1`
    })
    const kToI = new Map<string, number>()
    topRow.data.values![0].map((k, i) => { kToI.set(k, i) })
    let iPlus = topRow.data.values![0].length

    const rowMap = new Map<string, string[]>()

    opts.data.map((d) => {
      const row: string[] = []

      Object.entries(d).map(([k, v]) => {
        if (Array.isArray(v)) {
          v = v.join('\n')
        }

        let i = kToI.get(k)
        if (typeof i === 'undefined') {
          i = iPlus
          iPlus++

          kToI.set(k, i)
        }

        row[i] = v
      })

      rowMap.set(d.id, row)
    })

    const leftCol = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${opts.sheet}!A:A`
    })
    const validLeftCol = leftCol.data.values!.slice(1)

    const idToJ = new Map<string, number>()
    validLeftCol.map(([id], j) => {
      if (id) {
        idToJ.set(id, j)
      }
    })
    let jPlus = validLeftCol.length

    const header: string[] = []
    Array.from(kToI).map(([k, i]) => { header[i] = k })

    Array.from(rowMap).map(([id]) => {
      let j = idToJ.get(id)
      if (typeof j === 'undefined') {
        j = jPlus
        jPlus++

        idToJ.set(id, j)
      }
    })

    const appendSize = jPlus - validLeftCol.length

    if (appendSize > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${opts.sheet}!${validLeftCol.length + 2}:${validLeftCol.length + 2}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: Array(appendSize).fill([''])
        }
      })
    }

    const updateResult = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        data: [
          {
            range: `${opts.sheet}!1:1`,
            values: [header]
          },
          ...Array.from(rowMap).map(([id, row]) => {
            let j = idToJ.get(id)
            if (typeof j === 'undefined') {
              j = jPlus
              jPlus++

              idToJ.set(id, j)
            }

            j += 2

            return {
              range: `${opts.sheet}!${j}:${j}`,
              values: [row]
            }
          })
        ],
        valueInputOption: 'RAW'
      }
    })

    console.log(updateResult.data.totalUpdatedCells)
  }

  function * chunk<T> (arr: T[], n: number) {
    for (let i = 0; i < arr.length; i += n) {
      yield arr.slice(i, i + n)
    }
  }

  // for (const data of chunk(notes, 100)) {
  //   await updateSheets({
  //     sheet: 'note',
  //     data
  //   })
  // }

  for (const data of chunk(cards, 500)) {
    await updateSheets({
      sheet: 'card',
      data
    })
  }

  await updateSheets({
    sheet: 'deck',
    data: Array.from(decks).map(([name, id]) => ({ id, name }))
  })
}

async function authorize (cred: any) {
  const { client_secret, client_id, redirect_uris } = cred.installed
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0])

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')))
    return oAuth2Client
  }

  return getNewToken<typeof oAuth2Client>(oAuth2Client)
}

async function getNewToken<T = any> (oAuth2Client: any): Promise<T> {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  })

  console.log('Authorize this app by visiting this url:', authUrl)
  const code = await readlineAsync('Enter the code from that page here: ')
  const token = await new Promise((resolve, reject) => {
    oAuth2Client.getToken(code, (err: any, token: any) => {
      err ? reject(err) : resolve(token)
    })
  })
  oAuth2Client.setCredentials(token)
  // Store the token to disk for later program executions
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token))
  console.log('Token stored to', TOKEN_PATH)

  return oAuth2Client
}

async function readlineAsync (question: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

main()
