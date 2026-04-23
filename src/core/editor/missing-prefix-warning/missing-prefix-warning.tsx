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

import { For, Show, createMemo, useContext } from 'solid-js'
import { useEditor } from 'prosekit/solid'
import LucideTriangleAlert from 'lucide-solid/icons/triangle-alert'
import LucideCheckCircle from 'lucide-solid/icons/circle-check'
import clsx from 'clsx'
import {
  docHasAnyPrefix,
  prefixes,
} from '../../custom/comment-prefix/comment-prefix-config'
import { EditorRootContext } from '../../../editor/editor'
import styles from './missing-prefix-warning.module.css'
import type { EditorExtension } from '../extension'

const PULL_REQUEST_PAGE = 1 << 2
const PULL_REQUEST_FILES_PAGE = 1 << 3
const REVIEW_CONTEXT_MASK = PULL_REQUEST_PAGE | PULL_REQUEST_FILES_PAGE

function isReviewContext(flags: number): boolean {
  return (flags & REVIEW_CONTEXT_MASK) !== 0
}

// True when this textarea is a reply inside an existing review thread — those
// don't need their own prefix (the thread's top-level comment already carries
// the classification).
const REPLY_THREAD_ANCESTOR_SELECTOR =
  '.inline-comments, .review-thread, .review-thread-component, [data-testid="review-thread"]'
const RENDERED_COMMENT_SELECTOR =
  '.review-comment, .timeline-comment, .comment-body'

function isReplyTextarea(textarea: HTMLTextAreaElement | null): boolean {
  if (!textarea) return false
  const thread = textarea.closest(REPLY_THREAD_ANCESTOR_SELECTOR)
  if (!thread) return false
  // A reply thread container will already have at least one rendered comment
  // in it; a top-level "new review comment" form sits outside such a container.
  return thread.querySelector(RENDERED_COMMENT_SELECTOR) !== null
}

export function MissingPrefixWarning() {
  const context = useContext(EditorRootContext)
  const editor = useEditor<EditorExtension>({ update: true })

  // Always show the palette when we're in a review context with prefixes
  // configured (and not a reply). The warning-style styling + message toggle
  // based on whether the user has already tagged any line.
  const shouldShow = createMemo(() => {
    if (!context) return false
    if (!isReviewContext(context.pageFlags())) return false
    if (isReplyTextarea(context.textarea())) return false
    if (prefixes().length === 0) return false
    return true
  })

  const anyTagPresent = createMemo(() =>
    docHasAnyPrefix(editor().state.doc),
  )

  const insert = (token: string) => {
    editor().commands.insertCommentPrefix(token)
  }

  return (
    <Show when={shouldShow()}>
      <div
        class={clsx(
          styles.bar,
          anyTagPresent() ? styles.barTagged : styles.barWarning,
        )}
        role="status"
        aria-live="polite"
      >
        <Show
          when={anyTagPresent()}
          fallback={
            <>
              <LucideTriangleAlert size={14} class={styles.icon} />
              <span class={styles.message}>Missing a tag?</span>
            </>
          }
        >
          <LucideCheckCircle size={14} class={styles.icon} />
          <span class={styles.message}>Tagged — add more if you have several notes.</span>
        </Show>
        <div class={styles.actions}>
          <For each={prefixes()}>
            {(prefix) => (
              <button
                type="button"
                class={styles.quickAction}
                style={
                  prefix.color
                    ? {
                        color: prefix.color,
                        'border-color': prefix.color,
                      }
                    : undefined
                }
                onClick={() => insert(prefix.token)}
                title={prefix.description}
              >
                <Show when={prefix.emoji}>
                  <span class={styles.quickActionEmoji} aria-hidden="true">
                    {prefix.emoji}
                  </span>
                </Show>
                {prefix.token}
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}
