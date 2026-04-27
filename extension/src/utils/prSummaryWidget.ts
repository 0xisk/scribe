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

/**
 * PR summary widget — inline card injected near the PR header that counts
 * how many *unresolved* comments carry each configured prefix, and lets the
 * reader click a chip to filter the page down to one tag at a time.
 *
 * Only runs on PR-ish paths. Only counts unresolved threads. The `blocking:`
 * chip is styled as a prominent red badge so urgent issues jump out at the
 * top of the page.
 */

const WIDGET_ID = 'scribe-pr-summary-widget'
const STYLE_ID = 'scribe-pr-summary-styles'
const COMMENT_CONTAINER_SELECTOR =
  '.js-timeline-item, .review-thread-component, .timeline-comment-group, [data-testid="review-thread"]'
const COMMENT_ANCESTOR_SELECTOR = [
  '.comment-body',
  '.js-comment-body',
  '.markdown-body',
  '[data-testid="comment-viewer"]',
].join(',')
const EDITOR_EXCLUSION_SELECTOR =
  '[contenteditable="true"], [data-editor-wrapper], [data-github-better-comment-wrapper]'

// Selectors that GitHub uses to mark resolved review threads or conversations.
// We skip these when counting — tags on resolved threads are historical noise.
const RESOLVED_MARKER_SELECTOR = [
  '.is-resolved',
  '[data-resolved="true"]',
  '[aria-label*="Resolved conversation" i]',
].join(',')

// Anchor candidates for inline injection. We prefer placing the widget at the
// top of the conversation timeline (above the PR description), so it sits in
// the main body column right where readers look first. If those aren't
// present (e.g. Files Changed tab), fall back to injecting right after the
// header so the widget still appears on the page.
const TIMELINE_ANCHOR_SELECTORS = [
  '.js-discussion',
  '.pull-discussion-timeline',
  '[data-testid="issue-viewer-comments-container"]',
]
const HEADER_ANCHOR_SELECTORS = [
  '.gh-header-show',
  '.gh-header',
  '[data-component="PH_markdown"]',
  '[data-testid="issue-viewer-metadata-container"]',
  '.js-issue-sticky-header',
]

// Tokens that mean "must fix before merge" — gets the emphatic red treatment.
// Anchored at the start and explicitly excludes `non-blocking:` and friends.
function isBlockingLike(token: string): boolean {
  const normalized = token.toLowerCase().trim()
  if (/^non[-_ ]?block/.test(normalized)) return false
  return /^block/.test(normalized) || /^must[-_ ]?fix/.test(normalized)
}

function isPrPath(path: string): boolean {
  return /^\/[^/]+\/[^/]+\/pull\/\d+(?:\/files|\/commits|\/conversation)?$/.test(
    path,
  )
}

function isInResolvedThread(el: Element): boolean {
  return !!el.closest(RESOLVED_MARKER_SELECTOR)
}

interface PrefixCounts {
  prefix: CommentPrefix
  count: number
}

function countPrefixes(): Array<PrefixCounts> {
  const configured = getPrefixes().filter((p) => p.token.length > 0)
  const byToken = new Map<string, number>()
  const strongs = document.querySelectorAll('strong')
  for (const strong of strongs) {
    if (strong.closest(EDITOR_EXCLUSION_SELECTOR)) continue
    if (!strong.closest(COMMENT_ANCESTOR_SELECTOR)) continue
    if (isInResolvedThread(strong)) continue // Skip resolved threads.
    const text = strong.textContent?.trim() ?? ''
    if (!text) continue
    const match = configured.find((p) => p.token === text)
    if (!match) continue
    byToken.set(match.token, (byToken.get(match.token) ?? 0) + 1)
  }
  return configured
    .map((prefix) => ({ prefix, count: byToken.get(prefix.token) ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => {
      // Blocking first. Other ordering follows the config.
      const aBlock = isBlockingLike(a.prefix.token) ? 0 : 1
      const bBlock = isBlockingLike(b.prefix.token) ? 0 : 1
      return aBlock - bBlock
    })
}

// Resolve a color string (possibly `var(--…)`) to an rgb() string so
// `color-mix()` can always consume it — CSS variables that don't resolve at
// the widget's scope leave color-mix empty and the chip stays uncolored.
const colorCache = new Map<string, string>()
function resolveColor(color: string): string {
  const cached = colorCache.get(color)
  if (cached) return cached
  const probe = document.createElement('span')
  probe.style.color = color
  probe.style.position = 'fixed'
  probe.style.top = '-9999px'
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color || color
  probe.remove()
  colorCache.set(color, resolved)
  return resolved
}

// --- Filtering --------------------------------------------------------------

let activeFilter: string | null = null

function markCommentsForFilter(filterToken: string | null) {
  // Tag every candidate comment container with a data attribute based on
  // whether it contains a matching strong. CSS handles the visual dimming.
  const containers = document.querySelectorAll(COMMENT_CONTAINER_SELECTOR)
  for (const container of containers) {
    if (container.closest(EDITOR_EXCLUSION_SELECTOR)) continue
    if (!filterToken) {
      ;(container as HTMLElement).removeAttribute('data-scribe-filter-hide')
      continue
    }
    const strongs = container.querySelectorAll('strong')
    let hasMatch = false
    for (const strong of strongs) {
      if (strong.textContent?.trim() === filterToken) {
        hasMatch = true
        break
      }
    }
    if (hasMatch) {
      ;(container as HTMLElement).removeAttribute('data-scribe-filter-hide')
    } else {
      ;(container as HTMLElement).setAttribute('data-scribe-filter-hide', '')
    }
  }
}

function setActiveFilter(token: string | null) {
  activeFilter = token
  markCommentsForFilter(token)
  render() // re-render to show which chip is pressed
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${WIDGET_ID} {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 16px;
      padding: 10px 14px;
      background: var(--bgColor-muted, var(--color-canvas-subtle, #f6f8fa));
      border: 1px solid var(--borderColor-muted, var(--color-border-muted, #d1d9e0b3));
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      color: var(--fgColor-default, #1f2328);
      flex-wrap: wrap;
    }
    #${WIDGET_ID} .scribe-widget-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 11px;
      color: var(--fgColor-muted, #59636e);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-right: 4px;
    }
    #${WIDGET_ID} .scribe-widget-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    #${WIDGET_ID} .scribe-widget-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bgColor-default, #fff);
      border: 1px solid var(--borderColor-default, #d0d7de);
      border-radius: 999px;
      padding: 3px 10px;
      font-family: inherit;
      font-size: 12px;
      color: var(--fgColor-default, #1f2328);
    }
    /* blocking: solid red highlight — the "must look at me" chip. */
    #${WIDGET_ID} .scribe-widget-chip.scribe-widget-chip-blocking {
      background: #cf222e;
      color: #fff;
      border-color: #a40e26;
      font-weight: 600;
    }
    #${WIDGET_ID} .scribe-widget-chip.scribe-widget-chip-blocking .scribe-widget-count {
      background: rgba(255, 255, 255, 0.18);
      color: #fff;
    }
    #${WIDGET_ID} .scribe-widget-emoji {
      font-size: 14px;
      line-height: 1;
    }
    #${WIDGET_ID} .scribe-widget-token {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-weight: 600;
    }
    #${WIDGET_ID} .scribe-widget-count {
      background: var(--bgColor-neutral-muted, #f6f8fa);
      border-radius: 10px;
      padding: 0 6px;
      font-variant-numeric: tabular-nums;
      font-size: 11px;
      color: var(--fgColor-muted, #59636e);
      min-width: 18px;
      text-align: center;
    }
    [data-scribe-filter-hide] {
      opacity: 0.25 !important;
      transition: opacity 120ms;
    }
    [data-scribe-filter-hide]:hover {
      opacity: 0.6 !important;
    }
  `
  document.head.appendChild(style)
}

function findTimelineAnchor(): Element | null {
  for (const selector of TIMELINE_ANCHOR_SELECTORS) {
    const el = document.querySelector(selector)
    if (el) return el
  }
  return null
}

function findHeaderAnchor(): Element | null {
  for (const selector of HEADER_ANCHOR_SELECTORS) {
    const el = document.querySelector(selector)
    if (el) return el
  }
  return null
}

function mountWidget(widget: HTMLElement) {
  // Preferred: top of the conversation timeline — above the PR description,
  // in the main body column.
  const timeline = findTimelineAnchor()
  if (timeline) {
    timeline.insertAdjacentElement('afterbegin', widget)
    return
  }
  // Secondary: right under the PR header (e.g. Files Changed tab where the
  // timeline DOM isn't present).
  const header = findHeaderAnchor()
  if (header) {
    header.insertAdjacentElement('afterend', widget)
    return
  }
  // Last resort: floating in the bottom-right so the user still sees it.
  widget.style.position = 'fixed'
  widget.style.bottom = '16px'
  widget.style.right = '16px'
  widget.style.zIndex = '2147483000'
  widget.style.maxWidth = '320px'
  document.body.appendChild(widget)
}

function render() {
  const counts = countPrefixes()
  const existing = document.getElementById(WIDGET_ID)

  if (counts.length === 0) {
    if (existing) existing.remove()
    return
  }

  ensureStyles()

  const widget = existing ?? document.createElement('div')
  if (!existing) {
    widget.id = WIDGET_ID
    mountWidget(widget)
  }

  widget.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'scribe-widget-header'
  header.textContent = 'Scribe tags'
  widget.appendChild(header)

  const chipList = document.createElement('div')
  chipList.className = 'scribe-widget-chips'
  for (const { prefix, count } of counts) {
    // Non-interactive — this is a summary, not a filter UI.
    const chip = document.createElement('span')
    chip.className = 'scribe-widget-chip'
    const blocking = isBlockingLike(prefix.token)
    if (blocking) chip.classList.add('scribe-widget-chip-blocking')
    // Tint every chip with its configured color — border, token text, and a
    // subtle background fill. Resolve CSS-var colors to rgb first so
    // `color-mix()` works for every prefix, not just the ones with explicit
    // hex fallbacks in the config.
    if (prefix.color && !blocking) {
      const resolved = resolveColor(prefix.color)
      chip.style.borderColor = resolved
      chip.style.background = `color-mix(in srgb, ${resolved} 14%, transparent)`
    }
    if (prefix.emoji) {
      const emoji = document.createElement('span')
      emoji.className = 'scribe-widget-emoji'
      emoji.textContent = prefix.emoji
      chip.appendChild(emoji)
    }
    const token = document.createElement('span')
    token.className = 'scribe-widget-token'
    if (prefix.color && !blocking) token.style.color = resolveColor(prefix.color)
    token.textContent = prefix.token
    chip.appendChild(token)
    const countEl = document.createElement('span')
    countEl.className = 'scribe-widget-count'
    countEl.textContent = String(count)
    chip.appendChild(countEl)
    chipList.appendChild(chip)
  }
  widget.appendChild(chipList)
}

// --- Lifecycle --------------------------------------------------------------

let observer: MutationObserver | null = null
let unsubscribe: (() => void) | null = null
let scheduled = false

function schedule() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    if (!isPrPath(window.location.pathname)) {
      teardownDom()
      return
    }
    render()
    if (activeFilter) markCommentsForFilter(activeFilter)
  })
}

function teardownDom() {
  document.getElementById(WIDGET_ID)?.remove()
  markCommentsForFilter(null)
  activeFilter = null
}

export function startPrSummaryWidget() {
  if (observer) return

  schedule()

  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes.length || m.removedNodes.length) {
        // Skip mutations that only touch the editor.
        if ((m.target as Element)?.closest?.(EDITOR_EXCLUSION_SELECTOR)) continue
        schedule()
        return
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  // React to prefix config changes (so a new repo-override re-renders chips).
  unsubscribe = subscribeToPrefixes(() => schedule())

  // React to SPA navigation.
  window.addEventListener('popstate', schedule)
  document.addEventListener('turbo:load', schedule as EventListener)
}

export function stopPrSummaryWidget() {
  observer?.disconnect()
  observer = null
  unsubscribe?.()
  unsubscribe = null
  window.removeEventListener('popstate', schedule)
  document.removeEventListener('turbo:load', schedule as EventListener)
  teardownDom()
}
