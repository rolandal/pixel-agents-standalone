import { useEffect } from 'react'

/**
 * Stack of in-flight team speech bubbles surfaced from the NeuraMD inbox.
 *
 * v1 ships a top-right notification panel rather than character-anchored
 * balloons, so the data path lands without depending on canvas coordinate
 * conversion. Character-anchored rendering is a v1.5 follow-up that can
 * consume the same `bubbles` state without touching the WebSocket protocol.
 *
 * Each bubble auto-dismisses after AUTO_DISMISS_MS to keep the panel
 * uncluttered on busy teams. Click-to-dismiss is supported as an escape
 * hatch.
 */

const AUTO_DISMISS_MS = 8_000
const MAX_VISIBLE = 5
const CONTENT_PREVIEW_MAX = 280

export interface Bubble {
  /** Stable id for React keying — uses the inbox message id. */
  id: string
  /** Slug of the sender (currently informational; v1.5 anchors on character). */
  bubbleOnSlug: string
  /** Display name from NeuraMD. Falls back to bubbleOnSlug if empty. */
  fromTitle: string
  /** Inbox message body. Truncated for display. */
  content: string
  /** ISO timestamp from NeuraMD; surfaced as a tooltip on hover. */
  createdAt: string
}

interface SpeechBubbleStackProps {
  bubbles: Bubble[]
  onDismiss: (id: string) => void
}

function previewContent(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length <= CONTENT_PREVIEW_MAX) return trimmed
  return trimmed.slice(0, CONTENT_PREVIEW_MAX - 1) + '…'
}

interface SingleBubbleProps {
  bubble: Bubble
  onDismiss: (id: string) => void
}

function SingleBubble({ bubble, onDismiss }: SingleBubbleProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(bubble.id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [bubble.id, onDismiss])

  const sender = bubble.fromTitle || bubble.bubbleOnSlug

  return (
    <div
      onClick={() => onDismiss(bubble.id)}
      title={bubble.createdAt}
      style={{
        padding: '8px 10px',
        background: 'var(--pixel-btn-bg, #1f2128)',
        color: 'var(--pixel-text, #e0e0e0)',
        border: '2px solid var(--pixel-border, #3a3d48)',
        borderRadius: 0,
        marginBottom: 6,
        cursor: 'pointer',
        fontSize: 12,
        lineHeight: 1.4,
        boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
        maxWidth: 320,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--pixel-accent, #87b6ff)' }}>
        {sender}
      </div>
      <div>{previewContent(bubble.content)}</div>
    </div>
  )
}

export function SpeechBubbleStack({ bubbles, onDismiss }: SpeechBubbleStackProps) {
  // Render newest-first. Cap to MAX_VISIBLE — older bubbles still in state but
  // not painted, so they auto-dismiss on their own timer without crowding.
  const [visible, hidden] = [
    bubbles.slice(-MAX_VISIBLE).reverse(),
    bubbles.length - MAX_VISIBLE,
  ]

  if (visible.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto',
      }}
    >
      {visible.map((b) => (
        <SingleBubble key={b.id} bubble={b} onDismiss={onDismiss} />
      ))}
      {hidden > 0 && (
        <div style={{ fontSize: 10, color: 'var(--pixel-text-dim, #888)', textAlign: 'right', marginTop: 2 }}>
          +{hidden} more
        </div>
      )}
    </div>
  )
}
