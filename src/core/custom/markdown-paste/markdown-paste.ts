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
import { Fragment, Slice } from 'prosekit/pm/model'
import { useContext } from 'solid-js'
import { convertUnistToProsemirror } from 'prosemirror-transformer-markdown/prosemirror'
import { EditorRootContext } from '../../../editor/editor'
import { unistNodeFromMarkdown } from '../../../editor/utils/unistNodeFromMarkdown'
import { fixRawContent } from '../../../editor/utils/setContent'
import { unknownNodeHandler } from '../unknown-node/unknown-node-handler'

// Pasted plain text is parsed as markdown so that, e.g., pasting
// "# Title\n**bold**" produces a heading and bold inline rather than literal
// characters. Without this, the only way to get a paste rendered correctly is
// to toggle the extension off/on, which re-runs the markdown parser on the
// textarea value during remount.
//
// Skips:
//  - inside a code block: code should be inserted verbatim
//  - clipboards carrying text/html: defer to default rich-paste path so
//    upstream handlers (link, issue-reference, image) still see the slice
export function defineMarkdownPaste() {
  const context = useContext(EditorRootContext)!

  return definePlugin(
    new Plugin({
      key: new PluginKey('markdownPaste'),
      props: {
        handlePaste: (view, event, _slice) => {
          const $from = view.state.selection.$from
          for (let depth = $from.depth; depth >= 0; depth--) {
            if ($from.node(depth).type.name === 'codeBlock') return false
          }

          const clipboardData = event.clipboardData
          if (!clipboardData) return false
          if (clipboardData.getData('text/html')) return false

          const text = clipboardData.getData('text/plain')
          if (!text) return false

          const fixed = fixRawContent(text)
          const unistNode = unistNodeFromMarkdown(fixed, {
            owner: context.owner() ?? '',
            repository: context.repository() ?? '',
            suggestedChangesConfig: context.suggestedChangesConfig(),
          })
          const pmNode = convertUnistToProsemirror(
            unistNode,
            view.state.schema,
            unknownNodeHandler(fixed),
          )
          if (pmNode.content.size === 0) return false

          // openStart/openEnd = 1 lets the slice's first/last block merge with
          // the paragraph at the cursor, which is what users expect when
          // pasting inline markdown ("**bold**") mid-line.
          const newSlice = new Slice(Fragment.from(pmNode.content), 1, 1)
          view.dispatch(view.state.tr.replaceSelection(newSlice).scrollIntoView())
          return true
        },
      },
    }),
  )
}
