const MAX_FILE_SIZE = 15 * 1024 * 1024

function normalizeAnswerLetter(value) {
  const cleaned = String(value ?? '').trim()
  if (!cleaned) return ''

  const match = cleaned.match(/^(?:option|choice)?\s*([A-D])(?:[.)])?(?:\s|$)/i)
  return match ? match[1].toUpperCase() : ''
}

function collectAnswerKeyEntries(text) {
  const entries = []
  const matches = text.matchAll(/(\d{1,3})\s*(?:[.):-]|\s)\s*([A-D])\b/gi)

  for (const match of matches) {
    entries.push({
      number: Number(match[1]),
      letter: match[2].toUpperCase(),
    })
  }

  return entries
}

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
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    const document = await loadingTask.promise
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
      if (typeof loadingTask.destroy === 'function') {
        await loadingTask.destroy()
      }
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
    if (/^(?:answer\s*key|answers)\s*:??\s*(.*)$/i.test(line)) {
      readingAnswerKey = true
      const trailingText = line.replace(/^(?:answer\s*key|answers)\s*:??\s*/i, '').trim()
      for (const item of collectAnswerKeyEntries(trailingText)) {
        answerKey.set(item.number, item.letter)
      }
      continue
    }

    const keyEntries = collectAnswerKeyEntries(line)
    if (readingAnswerKey && keyEntries.length) {
      for (const item of keyEntries) {
        answerKey.set(item.number, item.letter)
      }
      continue
    }

    if (readingAnswerKey && !/^\d/.test(line) && !/[A-D]\s*[.):-]/i.test(line)) {
      readingAnswerKey = false
    }
  }

  const blocks = []
  let current = null
  let inAnswerKey = false

  for (const line of lines) {
    if (/^(?:answer\s*key|answers)\s*:??\s*(.*)$/i.test(line)) {
      inAnswerKey = true
      continue
    }

    if (inAnswerKey) {
      if (collectAnswerKeyEntries(line).length || /^\d{1,3}\s*[.):-]?\s*[A-D]\s*$/i.test(line)) {
        continue
      }
      inAnswerKey = false
    }

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

    const answerMatch = line.match(/(?:^|\s)(?:correct\s+)?answer(?:\s+key)?(?:\s+is)?\s*[:.-]?\s*([A-D])(?:[.)])?/i)
    if (answerMatch) {
      current.answerLetter = normalizeAnswerLetter(answerMatch[1])
      current.answerText = answerMatch[1]
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
