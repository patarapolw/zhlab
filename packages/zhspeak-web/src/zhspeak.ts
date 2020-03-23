const input = document.getElementById('input') as HTMLTextAreaElement
const output = document.getElementById('output') as HTMLDivElement

input.addEventListener('input', () => {
  output.innerText = input.value
})

window.addEventListener('keydown', (ev) => {
  if (ev.key === 's') {
    const s = window.getSelection()!.toString()
    if (s) {
      speak(s)
    }
  }
})

function speak (s: string) {
  const u = new SpeechSynthesisUtterance(s)
  u.lang = 'zh-CN'
  u.rate = 0.8
  speechSynthesis.speak(u)
}
