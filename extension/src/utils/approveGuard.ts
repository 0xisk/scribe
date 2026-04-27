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

import { getPrefixes } from '@scribe/core/core/custom/comment-prefix/comment-prefix-config'

/**
 * Intercepts the "Submit review" action on a PR when the user has chosen
 * "Approve" but the review form contains pending comments tagged as blocking
 * (or any prefix whose token matches `/blocking/i` — a pragmatic heuristic
 * that catches both the default `blocking:` and team-specific variants like
 * `must-fix:` if the user aliases them).
 *
 * Uses capture-phase click listener on the submit button. If the guard fires,
 * the event is stopped unless the user confirms a native browser confirm().
 * We deliberately keep this narrow — only the one submit-review button, only
 * the Approve state — to avoid breaking GitHub's normal comment flow.
 */

// Matches GitHub's submit-review button across both legacy and newer UIs.
// Legacy: <button name="pull_request_review[event]" value="approve">
// newer:  <button data-testid="submit-review-button"> + radio for approve
const SUBMIT_BUTTON_SELECTORS = [
  'button[name="pull_request_review[event]"]',
  'button[data-testid="submit-review-button"]',
  'button[data-testid="pr-review-submit-button"]',
]

function isPrPath(path: string): boolean {
  return /^\/[^/]+\/[^/]+\/pull\/\d+(?:\/files|\/commits|\/conversation)?$/.test(
    path,
  )
}

function looksLikeBlockingToken(token: string): boolean {
  if (!token) return false
  // Anchored at the start so `non-blocking:` doesn't get treated as blocking.
  const normalized = token.toLowerCase().trim()
  if (/^non[-_ ]?block/.test(normalized)) return false
  return /^block/.test(normalized) || /^must[-_ ]?fix/.test(normalized)
}

function blockingTokens(): Array<string> {
  return getPrefixes()
    .map((p) => p.token)
    .filter(looksLikeBlockingToken)
}

/**
 * Walks the review form looking for pending comment bodies. Pending comments
 * live inside `.js-resolvable-timeline-thread-form`, `.is-pending`, or any
 * form marked for the pending-review state. Returns the count of pending
 * bodies whose bold tokens are blocking-ish.
 */
function countPendingBlockingComments(): number {
  const tokens = blockingTokens()
  if (tokens.length === 0) return 0
  const containers = document.querySelectorAll(
    '.is-pending, [data-is-pending="true"], .js-resolvable-timeline-thread-form .comment-body',
  )
  let count = 0
  for (const container of containers) {
    const strongs = container.querySelectorAll('strong')
    for (const strong of strongs) {
      const text = strong.textContent?.trim() ?? ''
      if (tokens.includes(text)) {
        count += 1
        break // one match per comment body is enough
      }
    }
  }
  return count
}

function isApproveSelected(form: Element | null): boolean {
  const root = form ?? document
  // Radio-button UIs
  const radio = root.querySelector<HTMLInputElement>(
    'input[type="radio"][value="approve"]:checked',
  )
  if (radio) return true
  // Legacy button with name+value (no radio)
  const nativeButton = (document.activeElement as HTMLElement | null) ?? null
  if (
    nativeButton?.tagName === 'BUTTON' &&
    nativeButton.getAttribute('name') === 'pull_request_review[event]' &&
    nativeButton.getAttribute('value') === 'approve'
  ) {
    return true
  }
  return false
}

function handleSubmitClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return
  // Find the closest submit button matching any of our selectors.
  const button = target.closest(SUBMIT_BUTTON_SELECTORS.join(','))
  if (!button) return
  if (!isPrPath(window.location.pathname)) return

  const form = button.closest('form')
  if (!isApproveSelected(form)) return

  const count = countPendingBlockingComments()
  if (count === 0) return

  const plural = count === 1 ? 'comment' : 'comments'
  const message = `You're about to Approve this PR, but your review has ${count} blocking ${plural}.\n\nApprove anyway?`
  const ok = window.confirm(message)
  if (!ok) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }
}

let installed = false

export function startApproveGuard() {
  if (installed) return
  installed = true
  // Capture phase: fires before the form's own listeners.
  document.addEventListener('click', handleSubmitClick, { capture: true })
}

export function stopApproveGuard() {
  if (!installed) return
  installed = false
  document.removeEventListener('click', handleSubmitClick, { capture: true })
}
