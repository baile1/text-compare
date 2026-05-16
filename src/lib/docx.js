import JSZip from 'jszip'

function normalizeWhitespace(text) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function collapseForCompare(text) {
  return normalizeWhitespace(text).replace(/\s+/g, ' ')
}

function walkChildren(node, visitor) {
  for (const child of node.childNodes) {
    visitor(child)
  }
}

function readRuns(node) {
  let text = ''

  walkChildren(node, (child) => {
    if (child.nodeType !== Node.ELEMENT_NODE) {
      return
    }

    switch (child.localName) {
      case 't':
        text += child.textContent ?? ''
        break
      case 'tab':
        text += '\t'
        break
      case 'br':
      case 'cr':
        text += '\n'
        break
      case 'noBreakHyphen':
      case 'softHyphen':
        text += '-'
        break
      default:
        text += readRuns(child)
        break
    }
  })

  return text
}

function getElements(node, localName) {
  return Array.from(node.childNodes).filter(
    (child) => child.nodeType === Node.ELEMENT_NODE && child.localName === localName,
  )
}

function extractParagraph(node) {
  const rawText = readRuns(node)
  const text = normalizeWhitespace(rawText)

  return {
    type: 'paragraph',
    text,
    compareText: collapseForCompare(rawText),
  }
}

function extractTable(node) {
  const rows = getElements(node, 'tr')
    .map((row) =>
      getElements(row, 'tc')
        .map((cell) => {
          const cellParagraphs = getElements(cell, 'p')
            .map((paragraph) => extractParagraph(paragraph).text)
            .filter(Boolean)

          return cellParagraphs.join(' / ')
        })
        .join(' | '),
    )
    .filter(Boolean)

  const text = rows.join('\n')

  return {
    type: 'table',
    text,
    compareText: collapseForCompare(text),
  }
}

function parseDocumentXml(xmlText) {
  const parser = new DOMParser()
  const xml = parser.parseFromString(xmlText, 'application/xml')
  const parseError = xml.querySelector('parsererror')

  if (parseError) {
    throw new Error('无法解析 DOCX 内部 XML。')
  }

  const body = Array.from(xml.documentElement.childNodes).find(
    (node) => node.nodeType === Node.ELEMENT_NODE && node.localName === 'body',
  )

  if (!body) {
    throw new Error('DOCX 文档缺少正文内容。')
  }

  const blocks = []

  for (const child of body.childNodes) {
    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue
    }

    if (child.localName === 'p') {
      const paragraph = extractParagraph(child)
      if (paragraph.text) {
        blocks.push(paragraph)
      }
    }

    if (child.localName === 'tbl') {
      const table = extractTable(child)
      if (table.text) {
        blocks.push(table)
      }
    }
  }

  return blocks.map((block, index) => ({
    ...block,
    id: `${block.type}-${index + 1}`,
    order: index + 1,
  }))
}

export async function readDocxFile(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const documentXmlFile = zip.file('word/document.xml')

  if (!documentXmlFile) {
    throw new Error('未找到 word/document.xml，请确认文件是有效的 DOCX。')
  }

  const xmlText = await documentXmlFile.async('string')
  const blocks = parseDocumentXml(xmlText)

  if (!blocks.length) {
    throw new Error('没有提取到可对比的正文内容。')
  }

  return {
    name: file.name,
    size: file.size,
    blocks,
  }
}
