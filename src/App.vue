<script setup>
import { computed, reactive, ref } from 'vue'
import { compareDocuments } from './lib/compare'
import { readDocxFile } from './lib/docx'

const leftInput = ref(null)
const rightInput = ref(null)
const activeFilter = ref('changed')
const loading = ref(false)
const errorMessage = ref('')
const comparison = ref(null)

const documents = reactive({
  left: null,
  right: null,
})

const filters = [
  { label: '仅差异', value: 'changed' },
  { label: '全部', value: 'all' },
  { label: '新增', value: 'added' },
  { label: '删除', value: 'removed' },
  { label: '修改', value: 'modified' },
]

const jumpTargets = new Map()

const canCompare = computed(() => documents.left && documents.right && !loading.value)
const hasResult = computed(() => Boolean(comparison.value))

const visibleRows = computed(() => {
  if (!comparison.value) {
    return []
  }

  if (activeFilter.value === 'all') {
    return comparison.value.rows
  }

  if (activeFilter.value === 'changed') {
    return comparison.value.rows.filter((row) => row.status !== 'equal')
  }

  return comparison.value.rows.filter((row) => row.status === activeFilter.value)
})

const changeList = computed(() =>
  visibleRows.value
    .filter((row) => row.status !== 'equal')
    .map((row) => ({
      id: row.id,
      status: row.status,
      leftLine: row.left.line,
      rightLine: row.right.line,
      preview:
        row.right.rawText ||
        row.left.rawText ||
        '空内容',
    })),
)

function formatFileSize(size) {
  if (!size) {
    return '-'
  }

  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function statusLabel(status) {
  const dict = {
    equal: '一致',
    modified: '修改',
    added: '新增',
    removed: '删除',
  }

  return dict[status] ?? status
}

function setJumpTarget(id, element) {
  if (element) {
    jumpTargets.set(id, element)
  } else {
    jumpTargets.delete(id)
  }
}

function jumpToChange(id) {
  const element = jumpTargets.get(id)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

async function loadSide(side, file) {
  if (!file) {
    return
  }

  errorMessage.value = ''
  loading.value = true

  try {
    const parsed = await readDocxFile(file)
    documents[side] = parsed

    if (documents.left && documents.right) {
      comparison.value = compareDocuments(documents.left, documents.right)
    }
  } catch (error) {
    documents[side] = null
    comparison.value = null
    errorMessage.value =
      error instanceof Error ? error.message : '读取文档时发生未知错误。'
  } finally {
    loading.value = false
  }
}

function onFileChange(side, event) {
  const [file] = event.target.files ?? []
  loadSide(side, file)
}

function onDrop(side, event) {
  event.preventDefault()
  const [file] = event.dataTransfer?.files ?? []
  if (file) {
    loadSide(side, file)
  }
}

function onDragOver(event) {
  event.preventDefault()
}

function openPicker(side) {
  if (side === 'left') {
    leftInput.value?.click()
  } else {
    rightInput.value?.click()
  }
}

function swapSides() {
  if (!documents.left || !documents.right) {
    return
  }

  const currentLeft = documents.left
  documents.left = documents.right
  documents.right = currentLeft
  comparison.value = compareDocuments(documents.left, documents.right)
}

function clearAll() {
  documents.left = null
  documents.right = null
  comparison.value = null
  errorMessage.value = ''

  if (leftInput.value) {
    leftInput.value.value = ''
  }

  if (rightInput.value) {
    rightInput.value.value = ''
  }
}

function exportSummary() {
  if (!comparison.value) {
    return
  }

  const report = {
    generatedAt: new Date().toISOString(),
    leftDocument: documents.left?.name,
    rightDocument: documents.right?.name,
    summary: comparison.value.summary,
    changes: comparison.value.rows
      .filter((row) => row.status !== 'equal')
      .map((row) => ({
        row: row.rowNumber,
        status: row.status,
        leftLine: row.left.line,
        rightLine: row.right.line,
        leftText: row.left.rawText,
        rightText: row.right.rawText,
      })),
  }

  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = 'docx-diff-report.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

function recomputeComparison() {
  if (documents.left && documents.right) {
    comparison.value = compareDocuments(documents.left, documents.right)
  }
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Vue + Vite</p>
        <h1>DOCX 文档对比工具</h1>
      </div>

      <div class="topbar-actions">
        <button class="ghost-button" type="button" @click="swapSides" :disabled="!canCompare">
          交换左右
        </button>
        <button class="ghost-button" type="button" @click="clearAll">
          清空
        </button>
        <button class="primary-button" type="button" @click="exportSummary" :disabled="!hasResult">
          导出差异摘要
        </button>
      </div>
    </header>

    <main class="workspace">
      <section class="control-strip">
        <article
          class="upload-panel"
          @drop="onDrop('left', $event)"
          @dragover="onDragOver"
        >
          <div class="panel-head">
            <span class="panel-tag panel-tag-left">原始文档</span>
            <span class="file-meta" v-if="documents.left">
              {{ documents.left.name }} · {{ formatFileSize(documents.left.size) }}
            </span>
          </div>

          <button class="upload-zone" type="button" @click="openPicker('left')">
            <span class="upload-title">选择左侧 DOCX</span>
            <span class="upload-note">支持点击上传或拖拽到这里，内容仅在本地浏览器内处理。</span>
          </button>

          <input
            ref="leftInput"
            class="hidden-input"
            type="file"
            accept=".docx"
            @change="onFileChange('left', $event)"
          />
        </article>

        <article
          class="upload-panel"
          @drop="onDrop('right', $event)"
          @dragover="onDragOver"
        >
          <div class="panel-head">
            <span class="panel-tag panel-tag-right">目标文档</span>
            <span class="file-meta" v-if="documents.right">
              {{ documents.right.name }} · {{ formatFileSize(documents.right.size) }}
            </span>
          </div>

          <button class="upload-zone" type="button" @click="openPicker('right')">
            <span class="upload-title">选择右侧 DOCX</span>
            <span class="upload-note">按段落和表格内容做比对，并在左右视图中同步标记差异。</span>
          </button>

          <input
            ref="rightInput"
            class="hidden-input"
            type="file"
            accept=".docx"
            @change="onFileChange('right', $event)"
          />
        </article>
      </section>

      <section class="status-strip">
        <div class="summary-grid" v-if="comparison">
          <article class="metric-card">
            <span class="metric-label">总块数</span>
            <strong>{{ comparison.summary.totalRows }}</strong>
          </article>
          <article class="metric-card">
            <span class="metric-label">差异数</span>
            <strong>{{ comparison.summary.changedRows }}</strong>
          </article>
          <article class="metric-card">
            <span class="metric-label">新增</span>
            <strong>{{ comparison.summary.additions }}</strong>
          </article>
          <article class="metric-card">
            <span class="metric-label">删除</span>
            <strong>{{ comparison.summary.deletions }}</strong>
          </article>
          <article class="metric-card">
            <span class="metric-label">修改</span>
            <strong>{{ comparison.summary.modifications }}</strong>
          </article>
        </div>

        <div class="filter-group">
          <button
            v-for="filter in filters"
            :key="filter.value"
            type="button"
            class="filter-pill"
            :class="{ active: activeFilter === filter.value }"
            @click="activeFilter = filter.value; recomputeComparison()"
          >
            {{ filter.label }}
          </button>
        </div>
      </section>

      <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

      <section class="content-grid" v-if="comparison">
        <aside class="change-sidebar">
          <div class="sidebar-title-row">
            <h2>变更导航</h2>
            <span>{{ changeList.length }} 项</span>
          </div>

          <button
            v-for="item in changeList"
            :key="item.id"
            type="button"
            class="change-link"
            :class="[`change-link-${item.status}`]"
            @click="jumpToChange(item.id)"
          >
            <span class="change-link-title">
              {{ statusLabel(item.status) }}
              <small>
                L{{ item.leftLine ?? '-' }} / R{{ item.rightLine ?? '-' }}
              </small>
            </span>
            <span class="change-link-preview">{{ item.preview }}</span>
          </button>
        </aside>

        <section class="diff-view">
          <div class="diff-head">
            <div class="diff-head-cell">
              <span class="panel-tag panel-tag-left">左侧</span>
              <strong>{{ documents.left?.name }}</strong>
            </div>
            <div class="diff-head-cell center-divider">差异</div>
            <div class="diff-head-cell">
              <span class="panel-tag panel-tag-right">右侧</span>
              <strong>{{ documents.right?.name }}</strong>
            </div>
          </div>

          <div class="diff-body">
            <article
              v-for="row in visibleRows"
              :key="row.id"
              :ref="(element) => setJumpTarget(row.id, element)"
              class="diff-row"
              :class="[`row-${row.status}`]"
            >
              <section class="diff-cell" :class="[`cell-${row.status}`, { empty: !row.left.rawText }]">
                <div class="line-gutter">{{ row.left.line ?? '' }}</div>
                <div class="cell-content">
                  <div class="block-type" v-if="row.left.type">{{ row.left.type }}</div>
                  <p class="cell-text">
                    <template v-if="row.left.spans.length">
                      <span
                        v-for="(segment, index) in row.left.spans"
                        :key="`${row.id}-left-${index}`"
                        class="inline-part"
                        :class="`inline-${segment.status}`"
                      >
                        {{ segment.text }}
                      </span>
                    </template>
                    <span v-else class="placeholder-text">空</span>
                  </p>
                </div>
              </section>

              <div class="center-rail">
                <span class="center-badge" :class="`badge-${row.status}`">
                  {{ statusLabel(row.status) }}
                </span>
              </div>

              <section class="diff-cell" :class="[`cell-${row.status}`, { empty: !row.right.rawText }]">
                <div class="line-gutter">{{ row.right.line ?? '' }}</div>
                <div class="cell-content">
                  <div class="block-type" v-if="row.right.type">{{ row.right.type }}</div>
                  <p class="cell-text">
                    <template v-if="row.right.spans.length">
                      <span
                        v-for="(segment, index) in row.right.spans"
                        :key="`${row.id}-right-${index}`"
                        class="inline-part"
                        :class="`inline-${segment.status}`"
                      >
                        {{ segment.text }}
                      </span>
                    </template>
                    <span v-else class="placeholder-text">空</span>
                  </p>
                </div>
              </section>
            </article>
          </div>
        </section>
      </section>

      <section class="empty-state" v-else>
        <div class="empty-panel">
          <span class="empty-kicker">准备开始</span>
          <h2>上传两个 DOCX 文档后开始对比</h2>
          <p>
            当前实现为纯前端版本：直接在浏览器里解析 `docx`，按段落和表格内容生成并排差异视图，
            适合先搭产品原型和交互界面。
          </p>
        </div>
      </section>
    </main>
  </div>
</template>
