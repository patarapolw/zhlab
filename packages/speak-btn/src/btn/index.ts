const elButton = document.querySelector('#speakButton') as HTMLAnchorElement
const elImg = document.querySelector('#speakButton img') as HTMLImageElement

elButton.style.height = innerHeight + 'px'
elImg.style.height = (innerHeight * 0.8) + 'px'

elButton.style.width = innerWidth + 'px'
elImg.style.width = (innerWidth * 0.8) + 'px'

elButton.addEventListener('click', () => {
  const u = new URL(location.href)
  const q = u.searchParams.get('q')
  const lang = u.searchParams.get('lang') || 'zh'

  if (q) {
    speak(q, lang)
  }
})

function speak (s: string, lang: string) {
  const rate = 1

  const allVoices = speechSynthesis.getVoices()
  let vs = allVoices.filter((v) => v.lang === lang)
  if (vs.length === 0) {
    const m1 = lang.substr(0, 2)
    const m2 = lang.substr(3, 2)
    const r1 = new RegExp(`^${m1}[-_]${m2}`, "i")

    vs = allVoices.filter((v) => r1.test(v.lang))
    if (vs.length === 0) {
      const r2 = new RegExp(`^${m1}`, "i")
      vs = allVoices.filter((v) => r2.test(v.lang))
    }
  }

  if (vs.length > 0) {
    const u = new SpeechSynthesisUtterance(s)
    u.lang = vs[0].lang
    u.rate = rate
    speechSynthesis.speak(u)
  }
}
