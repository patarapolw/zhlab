import fs from 'fs'
import readline from 'readline'

import { google } from 'googleapis'
import shortid from 'shortid'

export class GSheets {
  constructor (
    public spreadsheetId: string,
    public opts: {
      scopes: string[]
      tokenPath: string
      credPath: string
    } = {
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets'
      ],
      tokenPath: 'secrets/token.json',
      credPath: 'secrets/gsheets.json'
    }
  ) {}

  async updateSheets (opts: {
    sheet: string
    data: Record<string, any>[]
  }) {
    const auth = await this.authorize(JSON.parse(fs.readFileSync(this.opts.credPath, 'utf8')))
    const sheets = google.sheets({ version: 'v4', auth })

    const topRow = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${opts.sheet}!1:1`
    })
    const kToI = new Map<string, number>()
    const validTopRow = topRow.data.values || []
    let iPlus = 0

    if (validTopRow.length > 0) {
      validTopRow[0].map((k, i) => { kToI.set(k, i) })
      iPlus = validTopRow[0].length
    }

    if (!kToI.get('id')) {
      kToI.set('id', iPlus)
      iPlus++
    }

    const rowMap = new Map<string, string[]>()

    opts.data.map((d) => {
      const row: string[] = []
      d.id = d.id || shortid.generate()

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
      spreadsheetId: this.spreadsheetId,
      range: `${opts.sheet}!A:A`
    })
    const validLeftCol = (leftCol.data.values || []).slice(1)

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
        spreadsheetId: this.spreadsheetId,
        range: `${opts.sheet}!${validLeftCol.length + 2}:${validLeftCol.length + 2}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: Array(appendSize).fill([''])
        }
      })
    }

    const updateResult = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
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

  private async authorize (cred: any) {
    const { client_secret, client_id, redirect_uris } = cred.installed
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0])

    if (fs.existsSync(this.opts.tokenPath)) {
      oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(this.opts.tokenPath, 'utf8')))
      return oAuth2Client
    }

    return this.getNewToken<typeof oAuth2Client>(oAuth2Client)
  }

  private async getNewToken<T = any> (oAuth2Client: any): Promise<T> {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.opts.scopes
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
    fs.writeFileSync(this.opts.tokenPath, JSON.stringify(token))
    console.log('Token stored to', this.opts.tokenPath)

    return oAuth2Client
  }
}

export async function readlineAsync (question: string) {
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

export function * chunk<T> (arr: T[], n: number) {
  for (let i = 0; i < arr.length; i += n) {
    yield arr.slice(i, i + n)
  }
}
