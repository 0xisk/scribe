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

import { createSignal } from 'solid-js'

export interface CommentPrefix {
  token: string
  description?: string
  color?: string
  emoji?: string
}

export type CommentPrefixPreset = 'team' | 'conventional'

export const teamPreset: Array<CommentPrefix> = [
  {
    token: 'nit:',
    description: 'Non-blocking stylistic suggestion',
    color: 'var(--fgColor-muted)',
    emoji: '⚪',
  },
  {
    token: 'non-blocking:',
    description: 'Feedback that should not block the merge',
    color: 'var(--fgColor-attention, #9a6700)',
    emoji: '🟡',
  },
  {
    token: 'followup:',
    description: 'Track as a follow-up, not required for this PR',
    color: 'var(--fgColor-accent, #0969da)',
    emoji: '🔵',
  },
  {
    token: 'question:',
    description: 'Clarifying question for the author',
    color: 'var(--fgColor-accent, #0969da)',
    // Append VS-15 (U+FE0E) to force text presentation so CSS color applies.
    emoji: '❔︎',
  },
  {
    token: 'blocking:',
    description: 'Must be addressed before merging',
    color: 'var(--fgColor-danger, #cf222e)',
    emoji: '🔴',
  },
]

export const conventionalPreset: Array<CommentPrefix> = [
  { token: 'praise:', description: 'Highlight something positive', emoji: '🟢' },
  { token: 'nitpick:', description: 'Trivial preference-based request', emoji: '⚪' },
  { token: 'suggestion:', description: 'Propose a specific improvement', emoji: '🔵' },
  { token: 'issue:', description: 'A problem that needs to be addressed', emoji: '🔴' },
  { token: 'todo:', description: 'Small, trivial, required change', emoji: '🟡' },
  { token: 'question:', description: 'Ask the author for clarification', emoji: '❔︎' },
  { token: 'thought:', description: 'An idea that arose during review', emoji: '💭' },
  { token: 'chore:', description: 'Simple process task', emoji: '🧹' },
  { token: 'note:', description: 'A non-actionable observation', emoji: '📝' },
  { token: 'typo:', description: 'Small typographical mistake', emoji: '🔤' },
  { token: 'polish:', description: 'Purely quality-of-code improvement', emoji: '✨' },
  { token: 'quibble:', description: 'Trivial note, easy to dismiss', emoji: '⚪' },
]

export const prefixPresets: Record<
  CommentPrefixPreset,
  { label: string; description: string; prefixes: Array<CommentPrefix> }
> = {
  team: {
    label: 'Team convention',
    description: 'nit, non-blocking, followup, question, blocking',
    prefixes: teamPreset,
  },
  conventional: {
    label: 'Conventional Comments',
    description: 'conventionalcomments.org',
    prefixes: conventionalPreset,
  },
}

const STORAGE_KEY = 'commentPrefixes'
const STORAGE_AREA = 'sync'

function getStorageArea(): chrome.storage.StorageArea | null {
  if (typeof chrome === 'undefined' || !chrome.storage) return null
  return chrome.storage[STORAGE_AREA] ?? chrome.storage.local ?? null
}

const [prefixes, setPrefixesInternal] = createSignal<Array<CommentPrefix>>(
  teamPreset,
  { equals: false },
)

const prefixSubscribers = new Set<() => void>()

function notifyPrefixSubscribers() {
  for (const fn of prefixSubscribers) {
    try {
      fn()
    } catch {
      // ignore subscriber errors
    }
  }
}

export function subscribeToPrefixes(fn: () => void): () => void {
  prefixSubscribers.add(fn)
  return () => {
    prefixSubscribers.delete(fn)
  }
}

let loaded = false

function ensureLoaded() {
  if (loaded) return
  loaded = true
  const area = getStorageArea()
  if (!area) return
  try {
    area.get(STORAGE_KEY, (items) => {
      const stored = items?.[STORAGE_KEY]
      if (Array.isArray(stored)) {
        const normalized = stored
          .filter(
            (item): item is CommentPrefix =>
              !!item && typeof item.token === 'string' && item.token.length > 0,
          )
          .map((item) => ({
            token: item.token,
            description: item.description,
            color: item.color,
            emoji: item.emoji,
          }))
        if (normalized.length > 0) {
          setPrefixesInternal(normalized)
          notifyPrefixSubscribers()
        }
      }
    })
  } catch {
    // no-op in non-extension environments
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== STORAGE_AREA) return
      const change = changes[STORAGE_KEY]
      if (!change) return
      const next = change.newValue
      if (Array.isArray(next)) {
        setPrefixesInternal(next as Array<CommentPrefix>)
        notifyPrefixSubscribers()
      }
    })
  }
}

ensureLoaded()

export function getPrefixes() {
  return prefixes()
}

export function setPrefixes(next: Array<CommentPrefix>) {
  setPrefixesInternal(next)
  notifyPrefixSubscribers()
  const area = getStorageArea()
  if (!area) return
  try {
    area.set({ [STORAGE_KEY]: next })
  } catch {
    // no-op
  }
}

export function addPrefix(prefix: CommentPrefix) {
  const current = prefixes()
  if (current.some((p) => p.token === prefix.token)) return
  setPrefixes([...current, prefix])
}

export function removePrefix(token: string) {
  setPrefixes(prefixes().filter((p) => p.token !== token))
}

export function updatePrefix(
  originalToken: string,
  next: CommentPrefix,
) {
  setPrefixes(
    prefixes().map((p) => (p.token === originalToken ? next : p)),
  )
}

export function movePrefix(token: string, delta: number) {
  const current = prefixes().slice()
  const idx = current.findIndex((p) => p.token === token)
  if (idx < 0) return
  const target = idx + delta
  if (target < 0 || target >= current.length) return
  const [item] = current.splice(idx, 1)
  current.splice(target, 0, item)
  setPrefixes(current)
}

export function applyPreset(preset: CommentPrefixPreset, mode: 'replace' | 'merge' = 'replace') {
  const incoming = prefixPresets[preset].prefixes
  if (mode === 'replace') {
    setPrefixes(incoming.map((p) => ({ ...p })))
    return
  }
  const current = prefixes()
  const existing = new Set(current.map((p) => p.token))
  const merged = [...current]
  for (const item of incoming) {
    if (!existing.has(item.token)) merged.push({ ...item })
  }
  setPrefixes(merged)
}

export { prefixes }

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Matches 1+ non-letter, non-digit, non-space characters (emojis / punctuation)
// followed by whitespace. Used as an optional leading segment before a token.
const EMOJI_PREFIX = '(?:[^\\p{L}\\p{N}\\s]+\\s+)?'

export interface ExistingPrefixMatch {
  prefix: CommentPrefix
  fullLength: number
  tokenStart: number
  tokenLength: number
}

export function findExistingPrefixMatch(
  text: string,
  configured: Array<CommentPrefix> = prefixes(),
): ExistingPrefixMatch | null {
  for (const prefix of configured) {
    if (!prefix.token) continue
    const re = new RegExp(
      `^(${EMOJI_PREFIX})(${escapeRegExp(prefix.token)})\\s*`,
      'u',
    )
    const m = text.match(re)
    if (m) {
      const lead = m[1] ?? ''
      const tok = m[2] ?? ''
      return {
        prefix,
        fullLength: m[0].length,
        tokenStart: lead.length,
        tokenLength: tok.length,
      }
    }
  }
  return null
}

export function findPrefixByToken(token: string): CommentPrefix | undefined {
  return prefixes().find((p) => p.token === token)
}

export interface DocLike {
  descendants(fn: (node: DocLikeNode) => boolean | void): void
}
interface DocLikeNode {
  readonly isTextblock: boolean
  readonly textContent: string
}

// True if any textblock (paragraph, heading, etc.) in the doc starts with a
// configured prefix. Used to decide whether to show the "no prefix yet" warning
// — once the user has tagged any line, the warning goes away.
export function docHasAnyPrefix(doc: DocLike): boolean {
  let found = false
  doc.descendants((node) => {
    if (found) return false
    if (node.isTextblock) {
      if (findExistingPrefixMatch(node.textContent)) {
        found = true
      }
      return false
    }
    return true
  })
  return found
}
