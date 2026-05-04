/*
 * Copyright 2025 Riccardo Perra
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

import type { Processor } from 'unified'
import type { Html, Parent, Root, RootContent } from 'mdast'

export const detailsNodeType = 'details'
export const detailsSummary = 'detailsSummary'
export const detailsContent = 'detailsContent'

// First child is always the summary. The rest are mdast block nodes — for
// multi-block details (blank lines between <details> and </details>) these
// are real mdast blocks (paragraph, list, blockquote, …); for single-node
// details (`<details><summary>…</summary>…</details>` on one line) the rest
// is a single `html` node carrying the inner HTML, which __fromUnist parses
// via the DOM. The published shape stays narrowed to DetailsContent for
// backwards compatibility with the dist; runtime children are looser.
export interface DetailsNode extends Parent {
  type: typeof detailsNodeType
  children: [DetailsSummary, ...Array<DetailsContent>]
}

export interface DetailsSummary {
  type: typeof detailsSummary
  value: string
}

export interface DetailsContent {
  type: typeof detailsContent
  value: string
}

declare module 'mdast' {
  interface RootContentMap {
    details: DetailsNode
    detailsSummary: DetailsSummary
    detailsContent: DetailsContent
  }
}

declare module 'unist' {
  interface RootContentMap {
    details: typeof detailsNodeType
    detailsSummary: typeof detailsSummary
    detailsContent: typeof detailsContent
  }
}

const SUMMARY_RE = /<summary\b[^>]*>([\s\S]*?)<\/summary>/i
const DETAILS_OPEN_RE = /<details\b/gi
const DETAILS_CLOSE_RE = /<\/details>/gi

function countMatches(value: string, re: RegExp): number {
  return value.match(re)?.length ?? 0
}

// Single-node form: `<details>…<summary>…</summary>…body…</details>` all in one
// html block (no blank lines inside). Body stays as a raw html mdast node so
// __fromUnist can DOMParser it.
function buildSingleNodeDetails(value: string): DetailsNode | null {
  const detailsMatch = value.match(/^<details\b[^>]*>([\s\S]*)<\/details>$/i)
  if (!detailsMatch) return null

  const insideDetails = detailsMatch[1].trim()
  const summaryMatch = insideDetails.match(SUMMARY_RE)
  const summaryValue = summaryMatch ? summaryMatch[1].trim() : null
  const restContent = summaryMatch
    ? insideDetails.replace(summaryMatch[0], '').trim()
    : insideDetails

  const children = [
    { type: 'detailsSummary', value: summaryValue ?? 'Details' },
  ] as Array<unknown>
  if (restContent) {
    children.push({ type: 'html', value: restContent } as Html)
  }
  return { type: 'details', children: children as DetailsNode['children'] }
}

// Walk a parent's children list, replacing any `<details>…</details>` range
// with a single `details` node. Handles three layouts:
//   1. self-contained: opener + closer in the same html node
//   2. multi-block:   `<details>` opener as one html node, real mdast blocks
//                     between, `</details>` closer as another html node
//   3. nested:        details inside details — recurse into the new node's
//                     body
function transformParent(parent: Parent) {
  let i = 0
  while (i < parent.children.length) {
    const child = parent.children[i] as RootContent

    if (child.type === 'html' && DETAILS_OPEN_RE.test((child as Html).value)) {
      // RegExp.test() with /g advances lastIndex; reset by re-creating the regex
      // on each test would be safer, but countMatches uses .match which is
      // independent — restart counts here.
      const opener = child as Html
      const opens = countMatches(opener.value, DETAILS_OPEN_RE)
      const closes = countMatches(opener.value, DETAILS_CLOSE_RE)

      if (opens > 0 && opens === closes) {
        const single = buildSingleNodeDetails(opener.value)
        if (single) {
          parent.children.splice(i, 1, single)
          transformParent(single)
          i += 1
          continue
        }
      }

      // Multi-block: walk forward, balance opens/closes across html siblings,
      // splice when depth returns to zero.
      let depth = opens - closes
      let endIdx = -1
      for (let j = i + 1; j < parent.children.length; j++) {
        const sib = parent.children[j]
        if (sib.type !== 'html') continue
        const sv = (sib as Html).value
        depth += countMatches(sv, DETAILS_OPEN_RE)
        depth -= countMatches(sv, DETAILS_CLOSE_RE)
        if (depth <= 0) {
          endIdx = j
          break
        }
      }

      if (endIdx === -1) {
        // Unbalanced — leave the AST alone rather than corrupt it.
        i += 1
        continue
      }

      const bodySiblings = parent.children.slice(
        i + 1,
        endIdx,
      ) as Array<RootContent>

      // Pull the summary either from the opener html or from a body html node
      // that contains <summary>…</summary> on its own.
      let summaryValue: string | null = null
      const openerSummaryMatch = opener.value.match(SUMMARY_RE)
      if (openerSummaryMatch) {
        summaryValue = openerSummaryMatch[1].trim()
      } else {
        for (let k = 0; k < bodySiblings.length; k++) {
          const candidate = bodySiblings[k]
          if (candidate.type !== 'html') continue
          const m = (candidate as Html).value.match(SUMMARY_RE)
          if (m) {
            summaryValue = m[1].trim()
            bodySiblings.splice(k, 1)
            break
          }
        }
      }

      const detailsNode: DetailsNode = {
        type: 'details',
        children: [
          { type: 'detailsSummary', value: summaryValue ?? 'Details' },
          ...bodySiblings,
        ] as DetailsNode['children'],
      }

      parent.children.splice(i, endIdx - i + 1, detailsNode)
      transformParent(detailsNode)
      i += 1
      continue
    }

    if ('children' in (child as object)) {
      transformParent(child as Parent)
    }
    i += 1
  }
}

export function remarkDetails(this: Processor) {
  return (root: Root) => {
    transformParent(root)
  }
}
