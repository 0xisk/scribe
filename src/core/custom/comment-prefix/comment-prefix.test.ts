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

import { describe, expect, test } from 'vitest'
import { createTestEditor } from 'prosekit/core/test'
import { createRoot, getOwner } from 'solid-js'
import { TextSelection } from 'prosekit/pm/state'
import { defineExtension } from '../../editor/extension'
import { EditorRootContext } from '../../../editor/editor'
import { MockUploaderNativeHandler } from '../../../../extension/stories/mock-uploader'
import {
  docHasAnyPrefix,
  setPrefixes,
  teamPreset,
} from './comment-prefix-config'
import type { CommentPrefix } from './comment-prefix-config'

const plainPreset: Array<CommentPrefix> = [
  { token: 'nit:' },
  { token: 'non-blocking:' },
  { token: 'followup:' },
  { token: 'question:' },
  { token: 'blocking:' },
]
import type { Node as PMNode } from 'prosekit/pm/model'
import type { EditorRootContextProps } from '../../../editor/editor'

function runInContext<T>(fn: () => T): T {
  let result!: T
  createRoot((dispose) => {
    const owner = getOwner()!
    const context: Partial<EditorRootContextProps> = {
      uploadHandler: new MockUploaderNativeHandler(),
      currentUsername: () => null,
      owner: () => null,
      repository: () => null,
      hovercardSubjectTag: () => null,
      data: (() => ({
        references: [],
        savedReplies: [],
        emojis: [],
        mentions: [],
      })) as EditorRootContextProps['data'],
      suggestedChangesConfig: () => undefined,
    }
    owner.context = {
      ...owner.context,
      [EditorRootContext.id]: context,
    }
    result = fn()
    dispose()
  })
  return result
}

function makeEditor() {
  return runInContext(() => {
    const editor = createTestEditor({ extension: defineExtension() })
    editor.mount(document.createElement('div'))
    return editor
  })
}

function getFirstParagraphText(editor: ReturnType<typeof makeEditor>) {
  const doc = editor.state.doc
  let text: string | null = null
  doc.descendants((node) => {
    if (text !== null) return false
    if (node.type.name === 'paragraph') {
      text = node.textContent
      return false
    }
    return true
  })
  return text ?? ''
}

function getFirstParagraph(editor: ReturnType<typeof makeEditor>) {
  const doc = editor.state.doc
  let found: PMNode | null = null
  doc.descendants((node) => {
    if (found) return false
    if (node.type.name === 'paragraph') {
      found = node
      return false
    }
    return true
  })
  return found as PMNode | null
}

describe('insertCommentPrefix', () => {
  test('inserts prefix at start of empty paragraph', () => {
    setPrefixes(plainPreset)
    const editor = makeEditor()
    editor.setContent('')
    editor.commands.insertCommentPrefix('nit:')
    expect(getFirstParagraphText(editor)).toBe('nit: ')
  })

  test('inserts prefix before existing text', () => {
    setPrefixes(plainPreset)
    const editor = makeEditor()
    editor.setContent('looks good to me')
    editor.commands.insertCommentPrefix('followup:')
    expect(getFirstParagraphText(editor)).toBe('followup: looks good to me')
  })

  test('replaces existing prefix rather than stacking', () => {
    setPrefixes(plainPreset)
    const editor = makeEditor()
    editor.setContent('looks good to me')
    editor.commands.insertCommentPrefix('nit:')
    editor.commands.insertCommentPrefix('blocking:')
    expect(getFirstParagraphText(editor)).toBe('blocking: looks good to me')
  })

  test('normalizes whitespace after existing prefix when replacing', () => {
    setPrefixes(plainPreset)
    const editor = makeEditor()
    editor.setContent('nit:    double-space here')
    editor.commands.insertCommentPrefix('question:')
    expect(getFirstParagraphText(editor)).toBe('question: double-space here')
  })

  test('removeCommentPrefix strips configured prefix', () => {
    setPrefixes(plainPreset)
    const editor = makeEditor()
    editor.setContent('followup: check back next week')
    editor.commands.removeCommentPrefix()
    expect(getFirstParagraphText(editor)).toBe('check back next week')
  })

  test('removeCommentPrefix is a no-op when no prefix present', () => {
    setPrefixes(plainPreset)
    const editor = makeEditor()
    editor.setContent('just a normal comment')
    const ok = editor.commands.removeCommentPrefix.canExec()
    expect(ok).toBe(false)
    expect(getFirstParagraphText(editor)).toBe('just a normal comment')
  })

  test('inserted token carries the bold mark; trailing space does not', () => {
    setPrefixes(plainPreset)
    const editor = makeEditor()
    editor.setContent('looks good to me')
    editor.commands.insertCommentPrefix('nit:')

    const para = getFirstParagraph(editor)!
    const bold = editor.schema.marks.bold
    const firstChild = para.firstChild!
    const secondChild = para.child(1)

    expect(firstChild.text).toBe('nit:')
    expect(bold.isInSet(firstChild.marks)).toBeTruthy()

    expect(secondChild.text?.startsWith(' ')).toBe(true)
    expect(bold.isInSet(secondChild.marks)).toBeFalsy()
  })

  test('serializes as **token** in markdown output', () => {
    setPrefixes(plainPreset)
    const editor = makeEditor()
    editor.setContent('looks good to me')
    editor.commands.insertCommentPrefix('nit:')

    const json = editor.getDocJSON() as {
      content: Array<{
        content: Array<{ text: string; marks?: Array<{ type: string }> }>
      }>
    }
    const firstPara = json.content[0].content
    expect(firstPara[0].text).toBe('nit:')
    expect(firstPara[0].marks?.map((m) => m.type)).toContain('bold')
  })

  test('prepends configured emoji before the bold token', () => {
    setPrefixes(teamPreset)
    const editor = makeEditor()
    editor.setContent('bad code')
    editor.commands.insertCommentPrefix('blocking:')

    const json = editor.getDocJSON() as {
      content: Array<{
        content: Array<{ text: string; marks?: Array<{ type: string }> }>
      }>
    }
    const firstPara = json.content[0].content
    // 🔴 followed by space, then bold "blocking:", then " bad code"
    expect(firstPara[0].text).toBe('🔴 ')
    expect(firstPara[0].marks).toBeUndefined()
    expect(firstPara[1].text).toBe('blocking:')
    expect(firstPara[1].marks?.map((m) => m.type)).toContain('bold')
  })

  test('replaces emoji + token cleanly when switching prefix', () => {
    setPrefixes(teamPreset)
    const editor = makeEditor()
    editor.setContent('code here')
    editor.commands.insertCommentPrefix('blocking:')
    editor.commands.insertCommentPrefix('nit:')
    expect(getFirstParagraphText(editor)).toBe('⚪ nit: code here')
  })

  test('detects existing plain prefix even when emoji is now configured', () => {
    setPrefixes(teamPreset)
    const editor = makeEditor()
    // plain "nit: ..." typed manually, no emoji
    editor.setContent('nit: old style comment')
    editor.commands.insertCommentPrefix('blocking:')
    // should REPLACE the plain nit:, not stack
    expect(getFirstParagraphText(editor)).toBe('🔴 blocking: old style comment')
  })

  test('inserts into the paragraph containing the cursor, not the first one', () => {
    setPrefixes(plainPreset)
    const editor = makeEditor()
    const schema = editor.schema
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'nit: first line' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'second line' }],
        },
      ],
    })
    editor.setContent(doc)

    // Move cursor to somewhere inside the second paragraph.
    const docNode = editor.state.doc
    const target = docNode.resolve(docNode.content.size - 3)
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.near(target)),
    )

    editor.commands.insertCommentPrefix('blocking:')

    const paragraphs: Array<string> = []
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'paragraph') {
        paragraphs.push(n.textContent)
        return false
      }
      return true
    })
    expect(paragraphs[0]).toBe('nit: first line') // untouched
    expect(paragraphs[1]).toBe('blocking: second line') // inserted on current line
  })

  test('docHasAnyPrefix detects tags in any paragraph', () => {
    setPrefixes(plainPreset)
    const editor = makeEditor()
    const schema = editor.schema

    editor.setContent('just a normal comment')
    expect(docHasAnyPrefix(editor.state.doc)).toBe(false)

    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'intro text' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'blocking: actual problem' }],
        },
      ],
    })
    editor.setContent(doc)
    expect(docHasAnyPrefix(editor.state.doc)).toBe(true)
  })
})
