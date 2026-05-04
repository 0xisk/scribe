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

import type { ContentFixHandler } from './content-fix-handler'

// Tags whose `<` we'll un-escape. Restricted to the GitHub-allowed HTML
// subset so we don't accidentally heal `\<arbitrary-tag>` text the user
// genuinely meant as literal characters.
const HTML_TAG_NAMES = [
  'details',
  'summary',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'kbd',
  'sub',
  'sup',
  'br',
  'p',
  'blockquote',
  'code',
  'pre',
  'div',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
  'small',
  'a',
  'img',
].join('|')

// Match one or more leading backslashes followed by an HTML opening or
// closing tag (with optional attrs). The replacement keeps just the tag —
// dropping every leading backslash, including the doubled / tripled chains
// produced by repeated round-trips.
const ESCAPED_TAG_RE = new RegExp(
  `\\\\+(<\\/?(?:${HTML_TAG_NAMES})\\b[^<>\\n]*>)`,
  'gi',
)

// Strips backslash escapes from HTML-like tags so that legacy content saved
// before the multi-block `<details>` fix (where `<details>` text leaked into
// `unknownBlock` and got escaped on save as `\<details>`) is recognised as an
// html block on the next parse. Each save cycle could add another backslash;
// the `+` quantifier collapses any chain of them in one pass.
export const fixHtmlTagEscaping: ContentFixHandler = (content) => {
  return content.replace(ESCAPED_TAG_RE, '$1')
}
