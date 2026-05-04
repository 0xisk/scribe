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
import { fixHtmlTagEscaping } from './fix-html-tag-escaping'

describe('fixHtmlTagEscaping', () => {
  test('strips a single backslash before details/summary/strong tags', () => {
    const input = `\\<details>\n\\<summary>\\<strong>TODO\\</strong>\\</summary>\n\nbody\n\n\\</details>`
    expect(fixHtmlTagEscaping(input)).toBe(
      `<details>\n<summary><strong>TODO</strong></summary>\n\nbody\n\n</details>`,
    )
  })

  test('collapses chains of backslashes from repeated round-trips', () => {
    // `\\\</strong>` in the source — the closing tag has been re-escaped
    // multiple times across saves. Should reduce to a single `</strong>`.
    const input = `\\<summary>\\<strong>TODO\\\\\\</strong>\\</summary>`
    expect(fixHtmlTagEscaping(input)).toBe(
      `<summary><strong>TODO</strong></summary>`,
    )
  })

  test('leaves unrelated escapes alone', () => {
    // Backslash before a non-tag character (or an unknown tag) must survive.
    const input = `keep \\* this and \\<unknown-tag>`
    expect(fixHtmlTagEscaping(input)).toBe(
      `keep \\* this and \\<unknown-tag>`,
    )
  })

  test('handles tags with attributes', () => {
    const input = `\\<details open>\\<summary class="foo">X\\</summary>\\</details>`
    expect(fixHtmlTagEscaping(input)).toBe(
      `<details open><summary class="foo">X</summary></details>`,
    )
  })
})
