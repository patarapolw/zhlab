const input = document.getElementById('input') as HTMLTextAreaElement
const output = document.getElementById('output') as HTMLDivElement

input.addEventListener('input', () => {
  output.innerText = input.value
})
