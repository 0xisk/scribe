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

import { defineCommands, union } from 'prosekit/core'
import { Fragment } from 'prosekit/pm/model'
import { defineCommentPrefixDecoration } from './comment-prefix-decoration'
import {
  findExistingPrefixMatch,
  findPrefixByToken,
} from './comment-prefix-config'
import type { Node as PMNode } from 'prosekit/pm/model'
import type { EditorState, Transaction } from 'prosekit/pm/state'

function getFirstParagraph(
  doc: PMNode,
): { node: PMNode; start: number } | null {
  let result: { node: PMNode; start: number } | null = null
  doc.descendants((node, pos) => {
    if (result) return false
    if (node.type.name === 'paragraph') {
      result = { node, start: pos }
      return false
    }
    return true
  })
  return result
}

// The "current" textblock is the one containing the cursor. Falls back to the
// first paragraph in the doc if the selection isn't inside a textblock.
function getTargetParagraph(
  state: EditorState,
): { node: PMNode; start: number } | null {
  const { $from } = state.selection
  if ($from.parent.isTextblock) {
    return { node: $from.parent, start: $from.start() - 1 }
  }
  return getFirstParagraph(state.doc)
}

export function insertPrefixTransaction(
  state: EditorState,
  token: string,
): Transaction | null {
  if (!token) return null
  const prefix = findPrefixByToken(token)
  const target = getTargetParagraph(state)
  if (!target) return null

  const tr = state.tr
  const paragraphStart = target.start + 1
  const text = target.node.textContent
  const existing = findExistingPrefixMatch(text)

  const boldType = state.schema.marks.bold
  const boldMarks = boldType ? [boldType.create()] : undefined
  const nodes: Array<ReturnType<typeof state.schema.text>> = []
  if (prefix?.emoji) {
    nodes.push(state.schema.text(`${prefix.emoji} `))
  }
  nodes.push(state.schema.text(token, boldMarks))
  nodes.push(state.schema.text(' '))
  const fragment = Fragment.fromArray(nodes)

  if (existing) {
    tr.replaceWith(paragraphStart, paragraphStart + existing.fullLength, fragment)
  } else {
    tr.insert(paragraphStart, fragment)
  }
  return tr
}

function defineCommentPrefixCommands() {
  return defineCommands({
    insertCommentPrefix: (token: string) => {
      return (state, dispatch) => {
        const tr = insertPrefixTransaction(state, token)
        if (!tr) return false
        if (dispatch) dispatch(tr.scrollIntoView())
        return true
      }
    },
    removeCommentPrefix: () => {
      return (state, dispatch) => {
        const target = getTargetParagraph(state)
        if (!target) return false
        const paragraphStart = target.start + 1
        const text = target.node.textContent
        const existing = findExistingPrefixMatch(text)
        if (!existing) return false
        if (dispatch) {
          const tr = state.tr.delete(
            paragraphStart,
            paragraphStart + existing.fullLength,
          )
          dispatch(tr.scrollIntoView())
        }
        return true
      }
    },
  })
}

export function defineCommentPrefix() {
  return union(defineCommentPrefixCommands(), defineCommentPrefixDecoration())
}
