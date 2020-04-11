const elInput = document.querySelector('[name=q]') as HTMLTextAreaElement
const elLang = document.querySelector('[name=lang]') as HTMLInputElement
const elOutput = document.getElementById('speakIframe') as HTMLIFrameElement
const elCode = document.querySelector('code[lang=html]') as HTMLElement

const u = new URL(location.href)
const uSrc = new URL(elOutput.src, location.origin)
const q = u.searchParams.get('q') || ''
const lang = u.searchParams.get('lang') || ''

elInput.value = q
uSrc.searchParams.set('q', q)

elLang.value = elLang.value || lang
uSrc.searchParams.set('lang', lang)

elOutput.src = uSrc.href

if (q) {
  document.getElementById('example')!.style.display = 'block'

  const uMin = new URL('https://speak-btn.now.sh/btn')
  uMin.searchParams.set('q', q)
  if (lang) {
    uMin.searchParams.set('lang', lang)
  }

  elCode.innerHTML = `
&lt;iframe src="${uMin.href}"
  style="width: 20px; height: 20px;"
  frameborder="0" allowtransparency="true"></iframe>
`
}
