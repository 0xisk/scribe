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

import {
  clearRepoOverride,
  setRepoOverride,
} from '@scribe/core/core/custom/comment-prefix/comment-prefix-config'
import type { CommentPrefix } from '@scribe/core/core/custom/comment-prefix/comment-prefix-config'

/**
 * Team-shared prefix config via a `.scribe.json` committed at the repo root.
 *
 * Example `.scribe.json`:
 *
 * {
 *   "prefixes": [
 *     { "token": "blocking:", "description": "Must fix", "color": "#cf222e", "emoji": "🔴" },
 *     { "token": "nitpick:",   "description": "Stylistic", "color": "#6e7781", "emoji": "⚪" }
 *   ]
 * }
 */

interface ScribeRepoConfig {
  prefixes: Array<CommentPrefix>
}

const CACHE_KEY_PREFIX = 'scribeRepoConfig:'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const CONFIG_FILE = '.scribe.json'

interface CacheEntry {
  fetchedAt: number
  config: ScribeRepoConfig | null // null = known-absent (404'd)
}

function cacheKey(owner: string, repo: string): string {
  return `${CACHE_KEY_PREFIX}${owner}/${repo}`
}

function getLocalStorage(): chrome.storage.StorageArea | null {
  if (typeof chrome === 'undefined' || !chrome.storage) return null
  return chrome.storage.local ?? null
}

async function readCache(owner: string, repo: string): Promise<CacheEntry | null> {
  const area = getLocalStorage()
  if (!area) return null
  return new Promise((resolve) => {
    try {
      area.get(cacheKey(owner, repo), (items) => {
        const entry = items?.[cacheKey(owner, repo)] as CacheEntry | undefined
        resolve(entry ?? null)
      })
    } catch {
      resolve(null)
    }
  })
}

async function writeCache(
  owner: string,
  repo: string,
  entry: CacheEntry,
): Promise<void> {
  const area = getLocalStorage()
  if (!area) return
  try {
    area.set({ [cacheKey(owner, repo)]: entry })
  } catch {
    // no-op
  }
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS
}

function isValidPrefix(value: unknown): value is CommentPrefix {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.token === 'string' && v.token.length > 0
}

function parseConfig(raw: string): ScribeRepoConfig | null {
  try {
    const parsed = JSON.parse(raw) as { prefixes?: Array<unknown> }
    if (!parsed || !Array.isArray(parsed.prefixes)) return null
    const prefixes = parsed.prefixes.filter(isValidPrefix).map((p) => ({
      token: p.token,
      description: typeof p.description === 'string' ? p.description : undefined,
      color: typeof p.color === 'string' ? p.color : undefined,
      emoji: typeof p.emoji === 'string' ? p.emoji : undefined,
    }))
    if (prefixes.length === 0) return null
    return { prefixes }
  } catch {
    return null
  }
}

async function fetchRepoConfig(
  owner: string,
  repo: string,
): Promise<ScribeRepoConfig | null> {
  // `HEAD` on raw.githubusercontent.com resolves to the repo's default branch.
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/HEAD/${CONFIG_FILE}`
  try {
    const response = await fetch(url, { credentials: 'omit' })
    if (!response.ok) return null
    const text = await response.text()
    return parseConfig(text)
  } catch {
    return null
  }
}

let activeRepo: { owner: string; repo: string } | null = null

export async function setActiveRepo(
  owner: string | null,
  repo: string | null,
): Promise<void> {
  if (!owner || !repo) {
    activeRepo = null
    clearRepoOverride()
    return
  }

  // Skip if the active repo hasn't changed.
  if (activeRepo?.owner === owner && activeRepo.repo === repo) return
  activeRepo = { owner, repo }

  // Serve from cache if fresh, otherwise fetch.
  const cached = await readCache(owner, repo)
  if (cached && isFresh(cached)) {
    applyOverride(cached.config, owner, repo)
    return
  }

  // Optimistically apply the cached stale config while refreshing in the
  // background — avoids a flash of personal config on every nav.
  if (cached) applyOverride(cached.config, owner, repo)

  const config = await fetchRepoConfig(owner, repo)
  // Only apply if the user hasn't navigated away while we fetched.
  if (activeRepo?.owner !== owner || activeRepo.repo !== repo) return
  await writeCache(owner, repo, { fetchedAt: Date.now(), config })
  applyOverride(config, owner, repo)
}

function applyOverride(
  config: ScribeRepoConfig | null,
  owner: string,
  repo: string,
) {
  if (!config) {
    clearRepoOverride()
    return
  }
  setRepoOverride({
    prefixes: config.prefixes,
    source: {
      owner,
      repo,
      url: `https://github.com/${owner}/${repo}/blob/HEAD/${CONFIG_FILE}`,
    },
  })
}
