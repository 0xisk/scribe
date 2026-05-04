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

import {
  defineCommands,
  defineNodeSpec,
  insertNode,
  union,
} from 'prosekit/core'
import { DOMParser, DOMSerializer } from 'prosemirror-model'
import { pmNode } from '@prosemirror-processor/unist'
import { markdownFromUnistNode } from 'prosemirror-transformer-markdown/unified'
import type { Html, Parent, Root } from 'mdast'
import type { DetailsNode } from './remarkDetails'

export { remarkDetails } from './remarkDetails'

export function defineDetailsMarkdown() {
  return union(
    defineCommands({
      insertDetails: () => {
        return (state, dispatch, view) => {
          const summary = pmNode(
            state.schema.nodes.detailsSummary,
            [state.schema.text('Summary')],
            null,
          )!

          const node = pmNode(
            state.schema.nodes.details,
            [summary, state.schema.nodes.paragraph.createAndFill(null)!],
            { open: true },
            {
              mode: 'fill',
            },
          )

          if (!node) {
            return false
          }

          const command = insertNode({
            node,
          })(state, dispatch, view)

          return command
        }
      },
    }),
    defineNodeSpec({
      name: 'details',
      content: 'detailsSummary block+',
      marks: '',
      group: 'block',
      isolating: true,
      unistName: 'details',
      code: true,
      defining: true,
      __fromUnist: (node, parent, context) => {
        const detailsNode = node as DetailsNode
        const [summary, ...body] = detailsNode.children as Array<any>

        const pmSummary = context.handle(
          summary,
          detailsNode as Parent,
        ) as unknown as Array<any> | any | null
        const pmSummaryNodes =
          pmSummary == null
            ? []
            : Array.isArray(pmSummary)
              ? pmSummary
              : [pmSummary]

        const pmBody: Array<any> = []
        for (const child of body) {
          if (child?.type === 'html') {
            // Single-node (legacy) shape: body is one html mdast node carrying
            // the inner HTML string. Parse it via the DOM.
            const dom = new window.DOMParser().parseFromString(
              (child as Html).value,
              'text/html',
            )
            const parsed = DOMParser.fromSchema(context.schema).parse(dom)
            parsed.content.forEach((c: any) => pmBody.push(c))
          } else {
            const result = context.handle(child, detailsNode as Parent)
            if (result == null) continue
            if (Array.isArray(result)) pmBody.push(...result)
            else pmBody.push(result)
          }
        }

        return pmNode(
          context.schema.nodes.details,
          [...pmSummaryNodes, ...pmBody],
          {},
          { mode: 'fill' },
        )
      },
      __toUnist: (node, parent, context) => {
        // Emit a single html mdast node whose value contains `<details>` and
        // `</details>` separated by blank lines from the body — preserving the
        // multi-block shape on disk. The body is serialized to markdown text
        // (not HTML) by routing each PM body child through the registered PM →
        // mdast handlers, then stringifying the resulting mdast root.
        //
        // Why one node rather than three (opener, body, closer): the
        // PM → mdast framework's `handleAll` doesn't fully unwrap arrays
        // returned from a node handler — a multi-node return ends up nested as
        // a single child slot in the parent's children list, which mdast-util-
        // to-markdown then can't serialize. Wrapping into one html block side-
        // steps that limitation and still re-parses correctly: the html block
        // ends at the first blank line, the body is parsed as markdown, and
        // remarkDetails rejoins the range on input.
        let summaryHtml = 'Details'
        const bodyMdast: Array<any> = []
        node.forEach((child: any, _: number, idx: number) => {
          if (idx === 0 && child.type.name === 'detailsSummary') {
            const serialized = DOMSerializer.fromSchema(
              context.schema,
            ).serializeNode(child) as HTMLElement
            summaryHtml = serialized.innerHTML
            return
          }
          const result = (context as any).handle(child, node)
          if (result == null) return
          if (Array.isArray(result)) bodyMdast.push(...result)
          else bodyMdast.push(result)
        })

        const bodyMarkdown = bodyMdast.length
          ? markdownFromUnistNode({
              type: 'root',
              children: bodyMdast as Root['children'],
            } as Root).trimEnd()
          : ''

        return {
          type: 'html',
          value: bodyMarkdown
            ? `<details>\n<summary>${summaryHtml}</summary>\n\n${bodyMarkdown}\n\n</details>`
            : `<details>\n<summary>${summaryHtml}</summary>\n\n</details>`,
        }
      },
      attrs: {
        open: {
          default: true,
        },
      },
      parseDOM: [
        {
          tag: 'details',
          getAttrs(dom) {
            return {
              open: (dom as HTMLDetailsElement).getAttribute('open'),
            }
          },
        },
      ],
      toDOM(node) {
        const { open } = node.attrs
        const attrs = {} as Record<string, any>
        if (open) {
          attrs.open = true
        }

        return ['details', attrs, 0]
      },
    }),
    defineNodeSpec({
      name: 'detailsSummary',
      content: 'inline*',
      group: 'block detailsGroup',
      parseDOM: [{ tag: 'summary' }],
      unistName: 'detailsSummary',
      __toUnist: (pmNode, parent, context) => {
        const serializedNode = DOMSerializer.fromSchema(
          context.schema,
        ).serializeNode(pmNode)
        return {
          type: 'html',
          value: (serializedNode as HTMLElement).innerHTML,
        }
      },
      __fromUnist: (_node, parent, context) => {
        const node = _node as Html
        const domNode = new window.DOMParser().parseFromString(
          node.value,
          'text/html',
        )

        return DOMParser.fromSchema(context.schema).parse(domNode, {
          topNode: context.schema.nodes.detailsSummary.create(),
        })
      },
      toDOM() {
        return ['summary', 0]
      },
    }),
  )
}
