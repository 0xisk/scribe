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

import { For, Show, createSignal } from 'solid-js'
import LucideTrash from 'lucide-solid/icons/trash-2'
import LucideArrowUp from 'lucide-solid/icons/arrow-up'
import LucideArrowDown from 'lucide-solid/icons/arrow-down'
import LucidePlus from 'lucide-solid/icons/plus'
import {
  addPrefix,
  applyPreset,
  movePrefix,
  prefixes,
  prefixPresets,
  removePrefix,
  updatePrefix,
} from '../../custom/comment-prefix/comment-prefix-config'
import styles from './prefix-settings.module.css'
import type { CommentPrefixPreset } from '../../custom/comment-prefix/comment-prefix-config'

export function PrefixSettings() {
  const [newToken, setNewToken] = createSignal('')
  const [newDescription, setNewDescription] = createSignal('')
  const [newEmoji, setNewEmoji] = createSignal('')

  const handleAdd = () => {
    const token = newToken().trim()
    if (!token) return
    addPrefix({
      token,
      description: newDescription().trim() || undefined,
      emoji: newEmoji().trim() || undefined,
    })
    setNewToken('')
    setNewDescription('')
    setNewEmoji('')
  }

  const handlePreset = (preset: CommentPrefixPreset) => {
    applyPreset(preset, 'replace')
  }

  return (
    <div class={styles.container}>
      <div>
        <h4 class={styles.heading}>Comment prefixes</h4>
        <p class={styles.caption}>
          Classify review comments by inserting a prefix like{' '}
          <code>nit:</code> at the start. Access from the toolbar or type{' '}
          <code>/prefix</code> in the editor.
        </p>
      </div>

      <div class={styles.presetRow}>
        <span class={styles.presetLabel}>Load preset:</span>
        <For each={Object.entries(prefixPresets)}>
          {([key, info]) => (
            <button
              type="button"
              class={'btn btn-sm'}
              onClick={() => handlePreset(key as CommentPrefixPreset)}
              title={info.description}
            >
              {info.label}
            </button>
          )}
        </For>
      </div>

      <div class={styles.list}>
        <Show
          when={prefixes().length > 0}
          fallback={
            <div class={styles.empty}>
              No prefixes configured. Add one below or load a preset.
            </div>
          }
        >
          <For each={prefixes()}>
            {(prefix, index) => (
              <PrefixRow
                token={prefix.token}
                description={prefix.description ?? ''}
                color={prefix.color}
                emoji={prefix.emoji}
                isFirst={index() === 0}
                isLast={index() === prefixes().length - 1}
              />
            )}
          </For>
        </Show>
      </div>

      <div class={styles.addRow}>
        <input
          type="text"
          class={`FormControl FormControl-input ${styles.emojiInput}`}
          placeholder="🙂"
          value={newEmoji()}
          onInput={(e) => setNewEmoji(e.currentTarget.value)}
          title="Emoji (optional)"
        />
        <input
          type="text"
          class={'FormControl FormControl-input'}
          placeholder="Token (e.g. nit:)"
          value={newToken()}
          onInput={(e) => setNewToken(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
        />
        <input
          type="text"
          class={'FormControl FormControl-input'}
          placeholder="Description (optional)"
          value={newDescription()}
          onInput={(e) => setNewDescription(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
        />
        <button
          type="button"
          class={'btn btn-sm btn-primary'}
          onClick={handleAdd}
          disabled={!newToken().trim()}
        >
          <LucidePlus size={14} /> Add
        </button>
      </div>
    </div>
  )
}

interface PrefixRowProps {
  token: string
  description: string
  isFirst: boolean
  isLast: boolean
}

interface PrefixRowPropsExtended extends PrefixRowProps {
  color?: string
  emoji?: string
}

function PrefixRow(props: PrefixRowPropsExtended) {
  const [tokenDraft, setTokenDraft] = createSignal(props.token)
  const [descDraft, setDescDraft] = createSignal(props.description)
  const [colorDraft, setColorDraft] = createSignal(props.color ?? '')
  const [emojiDraft, setEmojiDraft] = createSignal(props.emoji ?? '')

  const commit = () => {
    const nextToken = tokenDraft().trim()
    if (!nextToken) {
      setTokenDraft(props.token)
      return
    }
    if (
      nextToken === props.token &&
      descDraft() === props.description &&
      colorDraft() === (props.color ?? '') &&
      emojiDraft() === (props.emoji ?? '')
    ) {
      return
    }
    updatePrefix(props.token, {
      token: nextToken,
      description: descDraft().trim() || undefined,
      color: colorDraft().trim() || undefined,
      emoji: emojiDraft().trim() || undefined,
    })
  }

  const pickerValue = () => {
    const raw = colorDraft().trim()
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw
    return '#cf222e'
  }

  return (
    <div class={styles.row}>
      <input
        type="text"
        class={`FormControl FormControl-input ${styles.emojiInput}`}
        value={emojiDraft()}
        onInput={(e) => setEmojiDraft(e.currentTarget.value)}
        onBlur={commit}
        placeholder="🙂"
        title="Emoji rendered before the prefix in the published comment"
      />
      <input
        type="color"
        class={styles.colorPicker}
        value={pickerValue()}
        onInput={(e) => setColorDraft(e.currentTarget.value)}
        onChange={commit}
        title="Editor-only color (not rendered in GitHub)"
      />
      <input
        type="text"
        class={`FormControl FormControl-input ${styles.tokenInput}`}
        value={tokenDraft()}
        onInput={(e) => setTokenDraft(e.currentTarget.value)}
        onBlur={commit}
        style={colorDraft() ? { color: colorDraft() } : undefined}
      />
      <input
        type="text"
        class={'FormControl FormControl-input'}
        value={descDraft()}
        onInput={(e) => setDescDraft(e.currentTarget.value)}
        onBlur={commit}
        placeholder="Description"
      />
      <button
        type="button"
        class={'btn-octicon'}
        onClick={() => movePrefix(props.token, -1)}
        disabled={props.isFirst}
        title="Move up"
      >
        <LucideArrowUp size={14} />
      </button>
      <button
        type="button"
        class={'btn-octicon'}
        onClick={() => movePrefix(props.token, 1)}
        disabled={props.isLast}
        title="Move down"
      >
        <LucideArrowDown size={14} />
      </button>
      <button
        type="button"
        class={'btn-octicon btn-octicon-danger'}
        onClick={() => removePrefix(props.token)}
        title="Remove"
      >
        <LucideTrash size={14} />
      </button>
    </div>
  )
}
