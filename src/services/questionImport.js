const MAX_FILE_SIZE = 15 * 1024 * 1024

export async function extractDocumentText(file) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('The file is larger than the 15 MB import limit.')
  }

  const extension = file.name.split('.').pop()?.toLowerCase()
  const buffer = await file.arrayBuffer()

  if (extension === 'pdf') {
    const [pdfjsLib, workerModule] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ])
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default
    const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
    const pages = []

    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        const lines = []
        let line = ''
        let lineY = null
        const flushLine = () => {
          if (line.trim()) lines.push(line.trim())
          line = ''
          lineY = null
        }

        for (const item of content.items) {
          if (!('str' in item) || !item.str.trim()) continue
          const itemY = item.transform?.[5] ?? null
          if (line && itemY !== null && lineY !== null && Math.abs(itemY - lineY) > 2) {
            flushLine()
          }
          if (!line) lineY = itemY
          line = `${line}${line ? ' ' : ''}${item.str.trim()}`
          if (item.hasEOL) flushLine()
        }
        flushLine()
        pages.push(lines.join('\n'))
      }
    } finally {
      await document.destroy()
    }

    return pages.join('\n')
  }

  if (extension === 'docx') {
    const { unzipSync } = await import('fflate')
    const archive = unzipSync(new Uint8Array(buffer))
    const documentXml = archive['word/document.xml']
    if (!documentXml) throw new Error('This Word file does not contain a readable document body.')

    const xml = new DOMParser().parseFromString(new TextDecoder().decode(documentXml), 'application/xml')
    if (xml.getElementsByTagName('parsererror').length) {
      throw new Error('Could not read the Word document contents.')
    }

    const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    return Array.from(xml.getElementsByTagNameNS(wordNamespace, 'p'))
      .map((paragraph) => Array.from(paragraph.getElementsByTagNameNS(wordNamespace, 't'))
        .map((textNode) => textNode.textContent ?? '')
        .join(''))
      .join('\n')
  }

  throw new Error('Choose a PDF or Word .docx file. Older .doc files are not supported.')
}

export function parseQuestions(text) {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const answerKey = new Map()
  let readingAnswerKey = false

  for (const line of lines) {
    if (/^(?:answer\s*key|answers)\s*:?\s*$/i.test(line)) {
      readingAnswerKey = true
      continue
    }

    const keyMatch = line.match(/^(\d{1,3})\s*[.)-:]?\s*([A-D])\s*$/i)
    if (readingAnswerKey && keyMatch) {
      answerKey.set(Number(keyMatch[1]), keyMatch[2].toUpperCase())
      continue
    }

    if (readingAnswerKey && !/^\d/.test(line)) readingAnswerKey = false
  }

  const blocks = []
  let current = null
  let inAnswerKey = false

  for (const line of lines) {
    if (/^(?:answer\s*key|answers)\s*:?\s*$/i.test(line)) {
      inAnswerKey = true
      continue
    }

    if (inAnswerKey && /^\d{1,3}\s*[.)-:]?\s*[A-D]\s*$/i.test(line)) continue
    if (inAnswerKey) inAnswerKey = false

    const questionMatch = line.match(/^(?:(?:question|q)\s*)?(\d{1,3})\s*[.):]\s*(.*)$/i)
    if (questionMatch) {
      if (current) blocks.push(current)
      current = {
        number: Number(questionMatch[1]),
        text: questionMatch[2],
        options: [],
        answerLetter: '',
        answerText: '',
      }
      continue
    }

    if (!current) continue

    const answerMatch = line.match(/^(?:correct\s+)?answer\s*[:-]\s*(.+)$/i)
    if (answerMatch) {
      const answer = answerMatch[1].trim()
      const letterMatch = answer.match(/^([A-D])(?:[.)])?(?:\s|$)/i)
      current.answerLetter = letterMatch ? letterMatch[1].toUpperCase() : ''
      current.answerText = answer
      continue
    }

    const optionMatch = line.match(/^([A-D])\s*[).:-]\s*(.*)$/i)
    if (optionMatch) {
      current.options.push({
        letter: optionMatch[1].toUpperCase(),
        text: optionMatch[2].trim(),
      })
      continue
    }

    if (current.options.length) {
      const lastOption = current.options[current.options.length - 1]
      lastOption.text = `${lastOption.text} ${line}`.trim()
    } else {
      current.text = `${current.text} ${line}`.trim()
    }
  }

  if (current) blocks.push(current)

  const questions = blocks
    .filter((block) => block.text.trim() && block.options.length >= 2)
    .map((block, index) => {
      const options = block.options.map((option) => option.text).filter(Boolean)
      const answerLetter = block.answerLetter || answerKey.get(block.number) || ''
      const answerOption = block.options.find((option) => option.letter === answerLetter)
      const answerByText = block.answerText
        ? options.find((option) => option.toLowerCase() === block.answerText.toLowerCase())
        : ''

      return {
        id: `q-import-${Date.now()}-${index}`,
        text: block.text.trim(),
        options,
        answer: answerOption?.text ?? answerByText ?? '',
      }
    })

  return {
    questions,
    detected: blocks.length,
    skipped: blocks.length - questions.length,
  }
}
