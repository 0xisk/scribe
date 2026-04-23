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

import { definePlugin } from 'prosekit/core'
import { Plugin, PluginKey } from 'prosekit/pm/state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import {
  findExistingPrefixMatch,
  subscribeToPrefixes,
} from './comment-prefix-config'
import type { Node as PMNode } from 'prosekit/pm/model'
import type { EditorState } from 'prosekit/pm/state'

const key = new PluginKey('commentPrefixDecoration')

function findFirstParagraph(
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

function buildDecorations(state: EditorState): DecorationSet {
  const first = findFirstParagraph(state.doc)
  if (!first) return DecorationSet.empty

  const text = first.node.textContent
  const match = findExistingPrefixMatch(text)
  if (!match) return DecorationSet.empty

  const paragraphStart = first.start + 1
  const tokenFrom = paragraphStart + match.tokenStart
  const tokenTo = tokenFrom + match.tokenLength

  const color = match.prefix.color
  const tokenStyle = color ? `color: ${color}; font-weight: 600;` : 'font-weight: 600;'

  const decorations: Array<Decoration> = [
    Decoration.inline(tokenFrom, tokenTo, {
      class: 'scribe-prefix-token',
      style: tokenStyle,
    }),
  ]

  return DecorationSet.create(state.doc, decorations)
}

function commentPrefixDecorationPlugin() {
  return new Plugin({
    key,
    state: {
      init(_config, state) {
        return buildDecorations(state)
      },
      apply(tr, oldSet, _oldState, newState) {
        // Rebuild on any doc change; cheap because scope is first paragraph only.
        if (tr.docChanged) return buildDecorations(newState)
        // Also rebuild when asked by config-change meta (see plugin view below).
        if (tr.getMeta(key) === 'rebuild') return buildDecorations(newState)
        return oldSet
      },
    },
    props: {
      decorations(state) {
        return key.getState(state)
      },
    },
    view(view) {
      const unsubscribe = subscribeToPrefixes(() => {
        view.dispatch(view.state.tr.setMeta(key, 'rebuild'))
      })
      return {
        destroy() {
          unsubscribe()
        },
      }
    },
  })
}

export function defineCommentPrefixDecoration() {
  return definePlugin(commentPrefixDecorationPlugin())
}
