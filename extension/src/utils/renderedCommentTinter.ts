/*
 * Copyright 2026 0xisk (Scribe fork)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  getPrefixes,
  subscribeToPrefixes,
} from '@scribe/core/core/custom/comment-prefix/comment-prefix-config'
import type { CommentPrefix } from '@scribe/core/core/custom/comment-prefix/comment-prefix-config'

const TINTED_ATTR = 'data-scribe-prefix-tinted'
const EMOJI_TINTED_ATTR = 'data-scribe-emoji-tinted'

// Ancestor selector covering the main rendered-comment surfaces on GitHub:
// - classic issue/PR/discussion comment bodies
// - inline PR review comments
// - rendered previews
const COMMENT_ANCESTOR_SELECTOR = [
  '.comment-body',
  '.js-comment-body',
  '.markdown-body',
  '[data-testid="comment-viewer"]',
].join(',')

// CRITICAL: never mutate the Scribe editor's own DOM. It wears the same
// `.markdown-body` class as rendered comments, but touching a live ProseMirror
// contenteditable breaks its position mapping and wedges cursor navigation.
const EDITOR_EXCLUSION_SELECTOR = [
  '[contenteditable="true"]',
  '[data-editor-wrapper]',
  '[data-github-better-comment-wrapper]',
].join(',')

function isInsideCommentBody(el: Element): boolean {
  if (el.closest(EDITOR_EXCLUSION_SELECTOR)) return false
  return el.closest(COMMENT_ANCESTOR_SELECTOR) !== null
}

function buildTokenIndex(): Map<string, CommentPrefix> {
  const byToken = new Map<string, CommentPrefix>()
  for (const prefix of getPrefixes()) {
    if (!prefix.token || !prefix.color) continue
    byToken.set(prefix.token, prefix)
  }
  return byToken
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Try to color the leading emoji text that sits just before a matched <strong>.
// We look for the configured emoji (with or without the VS-15 selector) at the
// end of the preceding text node, split it off, and wrap it in a colored span.
function tintLeadingEmoji(strong: Element, prefix: CommentPrefix) {
  if (!prefix.emoji || !prefix.color) return
  const prev = strong.previousSibling
  if (!prev || prev.nodeType !== Node.TEXT_NODE) return
  const text = prev.textContent ?? ''
  if (!text) return

  const emojiBase = prefix.emoji.replace(/︎$/u, '')
  const escaped = escapeRegExp(emojiBase)
  // Match the emoji (VS-15 optional) at the end, followed by optional spaces.
  const regex = new RegExp(`(${escaped}\\uFE0E?)(\\s*)$`, 'u')
  const match = text.match(regex)
  if (!match || match.index === undefined) return

  const before = text.slice(0, match.index)
  const emojiPart = match[1]
  const trailing = match[2] ?? ''

  const span = document.createElement('span')
  span.setAttribute(EMOJI_TINTED_ATTR, prefix.token)
  // Preserve the emoji as stored. Don't force VS-15 — color-emoji glyphs like
  // 🔴/🟡 ignore CSS color anyway, and appending VS-15 to them renders as an
  // ugly trailing mark. Only emojis configured with VS-15 (e.g. ❔︎) get tinted.
  span.textContent = emojiPart
  ;(span as HTMLElement).style.color = prefix.color

  const parent = strong.parentNode
  if (!parent) return
  ;(prev as Text).data = before
  if (trailing) {
    parent.insertBefore(document.createTextNode(trailing), strong)
  }
  parent.insertBefore(span, strong.previousSibling ?? strong)
}

function tintMatchingStrongs(root: ParentNode, index: Map<string, CommentPrefix>) {
  if (index.size === 0) return
  const strongs = root.querySelectorAll('strong')
  for (const el of strongs) {
    if (!isInsideCommentBody(el)) continue
    const text = el.textContent?.trim() ?? ''
    if (!text) continue
    const prefix = index.get(text)
    if (!prefix?.color) continue
    // Idempotent: don't overwrite on every observer tick.
    if (el.getAttribute(TINTED_ATTR) === prefix.token) continue
    el.setAttribute(TINTED_ATTR, prefix.token)
    ;(el as HTMLElement).style.color = prefix.color
    tintLeadingEmoji(el, prefix)
  }
}

function clearTints(root: ParentNode) {
  const tinted = root.querySelectorAll(`[${TINTED_ATTR}]`)
  for (const el of tinted) {
    el.removeAttribute(TINTED_ATTR)
    ;(el as HTMLElement).style.removeProperty('color')
  }
  // Unwrap any emoji spans we injected.
  const emojiSpans = root.querySelectorAll(`span[${EMOJI_TINTED_ATTR}]`)
  for (const span of emojiSpans) {
    const parent = span.parentNode
    if (!parent) continue
    const textNode = document.createTextNode(span.textContent ?? '')
    parent.replaceChild(textNode, span)
  }
}

let observer: MutationObserver | null = null
let unsubscribe: (() => void) | null = null
let scanScheduled = false
let isSelfMutating = false

function scheduleScan() {
  if (scanScheduled) return
  scanScheduled = true
  requestAnimationFrame(() => {
    scanScheduled = false
    const index = buildTokenIndex()
    if (index.size === 0) return
    isSelfMutating = true
    try {
      tintMatchingStrongs(document, index)
    } finally {
      isSelfMutating = false
    }
  })
}

function anyMutationLooksInteresting(mutations: Array<MutationRecord>): boolean {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length === 0) continue
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue
      const el = node as Element
      // Never schedule work for mutations inside the Scribe editor itself.
      if (el.closest?.(EDITOR_EXCLUSION_SELECTOR)) continue
      // Cheap pre-filter: skip mutations that can't contain a comment body.
      if (
        el.matches?.(COMMENT_ANCESTOR_SELECTOR) ||
        el.querySelector?.(COMMENT_ANCESTOR_SELECTOR) ||
        el.closest?.(COMMENT_ANCESTOR_SELECTOR)
      ) {
        return true
      }
    }
  }
  return false
}

export function startRenderedCommentTinter() {
  if (observer) return // already running

  scheduleScan()

  observer = new MutationObserver((mutations) => {
    // Ignore mutations caused by our own tint/unwrap operations.
    if (isSelfMutating) return
    if (!anyMutationLooksInteresting(mutations)) return
    scheduleScan()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  unsubscribe = subscribeToPrefixes(() => {
    isSelfMutating = true
    try {
      clearTints(document)
    } finally {
      isSelfMutating = false
    }
    scheduleScan()
  })
}

export function stopRenderedCommentTinter() {
  observer?.disconnect()
  observer = null
  unsubscribe?.()
  unsubscribe = null
  isSelfMutating = true
  try {
    clearTints(document)
  } finally {
    isSelfMutating = false
  }
}
