import { diffArrays, diffChars, diffWordsWithSpace } from 'diff'

function containsCjk(text) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text)
}

function tokenizeInlineDiff(leftText, rightText) {
  const useCharDiff =
    containsCjk(leftText) ||
    containsCjk(rightText) ||
    (!leftText.includes(' ') && !rightText.includes(' '))

  const parts = useCharDiff
    ? diffChars(leftText, rightText)
    : diffWordsWithSpace(leftText, rightText)

  const left = []
  const right = []

  for (const part of parts) {
    const segment = {
      text: part.value,
      status: part.added ? 'added' : part.removed ? 'removed' : 'same',
    }

    if (!part.added) {
      left.push(segment)
    }

    if (!part.removed) {
      right.push(segment)
    }
  }

  return { left, right }
}

function summarizeRows(rows) {
  const changed = rows.filter((row) => row.status !== 'equal')

  return {
    totalRows: rows.length,
    changedRows: changed.length,
    additions: rows.filter((row) => row.status === 'added').length,
    deletions: rows.filter((row) => row.status === 'removed').length,
    modifications: rows.filter((row) => row.status === 'modified').length,
  }
}

function comparePair(leftBlock, rightBlock, rowNumber) {
  if (leftBlock && rightBlock) {
    if (leftBlock.compareText === rightBlock.compareText) {
      return {
        id: `row-${rowNumber}`,
        rowNumber,
        status: 'equal',
        left: {
          line: leftBlock.order,
          type: leftBlock.type,
          spans: [{ text: leftBlock.text, status: 'same' }],
          rawText: leftBlock.text,
        },
        right: {
          line: rightBlock.order,
          type: rightBlock.type,
          spans: [{ text: rightBlock.text, status: 'same' }],
          rawText: rightBlock.text,
        },
      }
    }

    const inline = tokenizeInlineDiff(leftBlock.text, rightBlock.text)

    return {
      id: `row-${rowNumber}`,
      rowNumber,
      status: 'modified',
      left: {
        line: leftBlock.order,
        type: leftBlock.type,
        spans: inline.left,
        rawText: leftBlock.text,
      },
      right: {
        line: rightBlock.order,
        type: rightBlock.type,
        spans: inline.right,
        rawText: rightBlock.text,
      },
    }
  }

  if (leftBlock) {
    return {
      id: `row-${rowNumber}`,
      rowNumber,
      status: 'removed',
      left: {
        line: leftBlock.order,
        type: leftBlock.type,
        spans: [{ text: leftBlock.text, status: 'removed' }],
        rawText: leftBlock.text,
      },
      right: {
        line: null,
        type: null,
        spans: [],
        rawText: '',
      },
    }
  }

  return {
    id: `row-${rowNumber}`,
    rowNumber,
    status: 'added',
    left: {
      line: null,
      type: null,
      spans: [],
      rawText: '',
    },
    right: {
      line: rightBlock.order,
      type: rightBlock.type,
      spans: [{ text: rightBlock.text, status: 'added' }],
      rawText: rightBlock.text,
    },
  }
}

export function compareDocuments(leftDoc, rightDoc) {
  const leftKeys = leftDoc.blocks.map((block) => block.compareText)
  const rightKeys = rightDoc.blocks.map((block) => block.compareText)
  const parts = diffArrays(leftKeys, rightKeys)

  const rows = []
  let leftIndex = 0
  let rightIndex = 0
  let rowNumber = 1

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]

    if (!part.added && !part.removed) {
      for (let offset = 0; offset < part.value.length; offset += 1) {
        rows.push(
          comparePair(
            leftDoc.blocks[leftIndex + offset],
            rightDoc.blocks[rightIndex + offset],
            rowNumber,
          ),
        )
        rowNumber += 1
      }

      leftIndex += part.value.length
      rightIndex += part.value.length
      continue
    }

    if (part.removed && parts[i + 1]?.added) {
      const removedCount = part.value.length
      const addedCount = parts[i + 1].value.length
      const pairedCount = Math.max(removedCount, addedCount)

      for (let offset = 0; offset < pairedCount; offset += 1) {
        rows.push(
          comparePair(
            leftDoc.blocks[leftIndex + offset],
            rightDoc.blocks[rightIndex + offset],
            rowNumber,
          ),
        )
        rowNumber += 1
      }

      leftIndex += removedCount
      rightIndex += addedCount
      i += 1
      continue
    }

    if (part.removed) {
      for (let offset = 0; offset < part.value.length; offset += 1) {
        rows.push(comparePair(leftDoc.blocks[leftIndex + offset], null, rowNumber))
        rowNumber += 1
      }

      leftIndex += part.value.length
      continue
    }

    if (part.added) {
      for (let offset = 0; offset < part.value.length; offset += 1) {
        rows.push(comparePair(null, rightDoc.blocks[rightIndex + offset], rowNumber))
        rowNumber += 1
      }

      rightIndex += part.value.length
    }
  }

  return {
    rows,
    summary: summarizeRows(rows),
  }
}
