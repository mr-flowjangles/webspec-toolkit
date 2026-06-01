/**
 * Floating recorder overlay (v1.7.8 — docs/11 piece 2).
 *
 * While a recording is in flight, the content script injects a small,
 * page-level panel so the human never has to leave the page or hunt for the
 * extension icon. It shows a live event feed (one line per captured event)
 * and a Stop button. Default anchor is top-right; the header is a drag handle.
 *
 * Design constraints:
 *   - **No framework.** The content script has no React; the overlay is plain
 *     DOM so we don't pull a bundle into every http(s) page.
 *   - **Style isolation via Shadow DOM.** The host attaches an open shadow
 *     root so the page's CSS can't bleed into the overlay and vice-versa. The
 *     host carries `data-webspec-overlay-host` so the recorder's capture
 *     handlers can ignore the overlay's own clicks/drags (shadow events
 *     retarget to the host — see `index.ts`).
 *   - **Stop funnels through the existing flow.** The Stop button doesn't stop
 *     the recorder directly; it invokes the `onStop` callback the content
 *     script supplies, which messages the side panel to run its normal
 *     stop→review flow. The overlay is torn down when the resulting
 *     `recorder:stop` reaches the content script, so one teardown path serves
 *     both the side panel's own Stop button and this one.
 */
import type { RecordedEvent } from '@webspec/core/browser';

/** Attribute marking the overlay host so capture handlers can skip it. */
export const OVERLAY_HOST_ATTR = 'data-webspec-overlay-host';

/**
 * Render one captured event as a single human-readable feed line. Pure — no
 * DOM, no globals — so it's unit-testable in isolation. The leading `▸` glyph
 * makes the feed scan like a step list.
 */
export function describeEvent(event: RecordedEvent): string {
  switch (event.kind) {
    case 'click': {
      const label = event.targetText?.trim() || selectorLabel(event.selector);
      return `▸ click ${quote(label)}`;
    }
    case 'input': {
      const value = event.sensitive ? '•••' : event.value;
      return `▸ fill ${selectorLabel(event.selector)} ${quote(value)}`;
    }
    case 'change': {
      // checkbox/radio changes carry 'true'/'false' and no options; selects
      // carry the chosen value plus the option set.
      if (event.options === undefined && (event.value === 'true' || event.value === 'false')) {
        return `▸ ${event.value === 'true' ? 'check' : 'uncheck'} ${selectorLabel(event.selector)}`;
      }
      return `▸ select ${selectorLabel(event.selector)} ${quote(event.value)}`;
    }
    case 'submit':
      return `▸ submit ${selectorLabel(event.selector)}`;
    case 'keydown':
      return `▸ press ${event.key}`;
    case 'navigate':
      return `▸ navigate ${pathOf(event.url)}`;
    case 'assertObserved':
      return `▸ observe`;
  }
}

/** Short, readable label for a hardened selector: prefer the `preferred` form. */
function selectorLabel(selector: { preferred: string }): string {
  return selector.preferred;
}

/** Reduce a full URL to its path (+ hash) for a compact feed line. */
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.hash}` || url;
  } catch {
    return url;
  }
}

function quote(text: string): string {
  const trimmed = text.length > 40 ? `${text.slice(0, 39)}…` : text;
  return `"${trimmed}"`;
}

// ---------------------------------------------------------------------------
// DOM lifecycle
// ---------------------------------------------------------------------------

interface OverlayHandles {
  host: HTMLElement;
  feed: HTMLElement;
  count: HTMLElement;
  onPointerMove: (ev: PointerEvent) => void;
  onPointerUp: (ev: PointerEvent) => void;
}

let handles: OverlayHandles | null = null;

const STYLE = `
:host { all: initial; }
.panel {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 280px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: #1b1f24;
  color: #e6e6e6;
  font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border: 1px solid #3a3f46;
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.4);
  z-index: 2147483647;
  pointer-events: auto;
  overflow: hidden;
}
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #24292f;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid #3a3f46;
}
.header.dragging { cursor: grabbing; }
.dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: #e5534b;
  box-shadow: 0 0 0 0 rgba(229,83,75,0.6);
  animation: pulse 1.4s ease-out infinite;
  flex: 0 0 auto;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(229,83,75,0.6); }
  100% { box-shadow: 0 0 0 7px rgba(229,83,75,0); }
}
.title { font-weight: 600; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 6px 10px;
  margin: 0;
  list-style: none;
}
.feed li {
  padding: 2px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #c9d1d9;
}
.feed li:last-child { color: #fff; }
.empty { color: #8b949e; font-style: italic; }
.footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid #3a3f46;
}
.count { flex: 1 1 auto; color: #8b949e; }
.stop {
  appearance: none;
  border: none;
  border-radius: 5px;
  background: #e5534b;
  color: #fff;
  font: inherit;
  font-weight: 600;
  padding: 5px 12px;
  cursor: pointer;
}
.stop:hover { background: #c9433c; }
`;

/**
 * Inject the overlay into the current document. Idempotent: a second call
 * tears the previous instance down first, so a bootstrap-resume after a page
 * reload can call it unconditionally.
 */
export function mountRecorderOverlay(opts: { name: string; onStop: () => void }): void {
  unmountRecorderOverlay();

  const host = document.createElement('div');
  host.setAttribute(OVERLAY_HOST_ATTR, '');
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLE;
  shadow.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'panel';

  const header = document.createElement('div');
  header.className = 'header';
  const dot = document.createElement('span');
  dot.className = 'dot';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = `Recording: ${opts.name}`;
  header.append(dot, title);

  const feed = document.createElement('ul');
  feed.className = 'feed';
  const empty = document.createElement('li');
  empty.className = 'empty';
  empty.textContent = 'Interact with the page…';
  feed.appendChild(empty);

  const footer = document.createElement('div');
  footer.className = 'footer';
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = '0 events';
  const stop = document.createElement('button');
  stop.className = 'stop';
  stop.type = 'button';
  stop.textContent = '■ Stop';
  stop.addEventListener('click', (ev) => {
    ev.stopPropagation();
    opts.onStop();
  });
  footer.append(count, stop);

  panel.append(header, feed, footer);
  shadow.appendChild(panel);
  document.documentElement.appendChild(host);

  // Dragging: translate the host by pointer delta. We track the panel's own
  // top/left so the drag is absolute, not cumulative-jittery.
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseLeft = 0;
  let baseTop = 0;

  header.addEventListener('pointerdown', (ev: PointerEvent) => {
    dragging = true;
    header.classList.add('dragging');
    const rect = panel.getBoundingClientRect();
    baseLeft = rect.left;
    baseTop = rect.top;
    startX = ev.clientX;
    startY = ev.clientY;
    // Pin to left/top so further moves are deterministic regardless of the
    // initial right-anchor.
    panel.style.left = `${baseLeft}px`;
    panel.style.top = `${baseTop}px`;
    panel.style.right = 'auto';
    header.setPointerCapture(ev.pointerId);
  });

  const onPointerMove = (ev: PointerEvent): void => {
    if (!dragging) return;
    panel.style.left = `${baseLeft + (ev.clientX - startX)}px`;
    panel.style.top = `${baseTop + (ev.clientY - startY)}px`;
  };
  const onPointerUp = (): void => {
    if (!dragging) return;
    dragging = false;
    header.classList.remove('dragging');
  };
  header.addEventListener('pointermove', onPointerMove);
  header.addEventListener('pointerup', onPointerUp);

  handles = { host, feed, count, onPointerMove, onPointerUp };
}

/**
 * Re-render the feed from the current event buffer. Re-rendering from scratch
 * (rather than appending) keeps the overlay correct through the recorder's
 * coalescing (input runs collapse to one event) and dedup (a focusing click
 * is popped when typing follows) — the buffer is the single source of truth.
 */
export function syncRecorderOverlay(events: RecordedEvent[]): void {
  if (handles === null) return;
  const { feed, count } = handles;
  feed.replaceChildren();
  if (events.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Interact with the page…';
    feed.appendChild(empty);
  } else {
    for (const event of events) {
      const li = document.createElement('li');
      li.textContent = describeEvent(event);
      feed.appendChild(li);
    }
    feed.scrollTop = feed.scrollHeight;
  }
  count.textContent = `${events.length} event${events.length === 1 ? '' : 's'}`;
}

/** Remove the overlay if present. Safe to call when nothing is mounted. */
export function unmountRecorderOverlay(): void {
  if (handles === null) return;
  handles.host.remove();
  handles = null;
}

/** Test-only: is an overlay currently mounted? */
export function isOverlayMounted(): boolean {
  return handles !== null;
}
