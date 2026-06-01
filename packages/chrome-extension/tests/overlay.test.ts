// @vitest-environment happy-dom

/**
 * Tests for the floating recorder overlay (v1.7.8 — docs/11 piece 2).
 *
 * Two layers:
 *   - `describeEvent` — the pure feed-line formatter, one assertion per kind.
 *   - mount / sync / unmount — DOM lifecycle against happy-dom (Shadow DOM
 *     supported), including the Stop-button callback wiring.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecordedEvent, HardenedSelector } from '@webspec/core/browser';
import {
  describeEvent,
  mountRecorderOverlay,
  syncRecorderOverlay,
  unmountRecorderOverlay,
  isOverlayMounted,
  OVERLAY_HOST_ATTR,
} from '../src/content-script/overlay.js';

function sel(preferred: string): HardenedSelector {
  return { strategy: 'css', preferred, fallbacks: [] } as unknown as HardenedSelector;
}

afterEach(() => {
  unmountRecorderOverlay();
  document.documentElement.querySelector(`[${OVERLAY_HOST_ATTR}]`)?.remove();
});

describe('describeEvent', () => {
  it('formats a click using targetText when present', () => {
    const ev: RecordedEvent = { t: 0, kind: 'click', selector: sel('button#add'), targetText: 'Add Lead' };
    expect(describeEvent(ev)).toBe('▸ click "Add Lead"');
  });

  it('falls back to the selector when a click has no text', () => {
    const ev: RecordedEvent = { t: 0, kind: 'click', selector: sel('button#add') };
    expect(describeEvent(ev)).toBe('▸ click "button#add"');
  });

  it('formats a fill with its value', () => {
    const ev: RecordedEvent = { t: 0, kind: 'input', selector: sel('#name'), value: 'Acme', sensitive: false };
    expect(describeEvent(ev)).toBe('▸ fill #name "Acme"');
  });

  it('masks a sensitive fill', () => {
    const ev: RecordedEvent = { t: 0, kind: 'input', selector: sel('#pw'), value: 'hunter2', sensitive: true };
    expect(describeEvent(ev)).toBe('▸ fill #pw "•••"');
  });

  it('formats a checkbox change as check / uncheck', () => {
    const checked: RecordedEvent = { t: 0, kind: 'change', selector: sel('#agree'), value: 'true' };
    const unchecked: RecordedEvent = { t: 0, kind: 'change', selector: sel('#agree'), value: 'false' };
    expect(describeEvent(checked)).toBe('▸ check #agree');
    expect(describeEvent(unchecked)).toBe('▸ uncheck #agree');
  });

  it('formats a select change with its chosen value', () => {
    const ev: RecordedEvent = {
      t: 0,
      kind: 'change',
      selector: sel('#state'),
      value: 'NY',
      options: [{ value: 'NY', label: 'New York' }],
    };
    expect(describeEvent(ev)).toBe('▸ select #state "NY"');
  });

  it('formats submit, keydown, and navigate', () => {
    expect(describeEvent({ t: 0, kind: 'submit', selector: sel('form') })).toBe('▸ submit form');
    expect(describeEvent({ t: 0, kind: 'keydown', key: 'Enter' })).toBe('▸ press Enter');
    expect(
      describeEvent({ t: 0, kind: 'navigate', url: 'https://app.test/lead/42#tab', reason: 'navigate' }),
    ).toBe('▸ navigate /lead/42#tab');
  });

  it('truncates long values', () => {
    const long = 'x'.repeat(60);
    const ev: RecordedEvent = { t: 0, kind: 'input', selector: sel('#bio'), value: long, sensitive: false };
    expect(describeEvent(ev)).toBe(`▸ fill #bio "${'x'.repeat(39)}…"`);
  });
});

describe('mount / sync / unmount', () => {
  it('mounts a shadow-hosted panel with a working Stop button', () => {
    const onStop = vi.fn();
    mountRecorderOverlay({ name: 'create lead', onStop });

    expect(isOverlayMounted()).toBe(true);
    const host = document.documentElement.querySelector(`[${OVERLAY_HOST_ATTR}]`);
    expect(host).not.toBeNull();
    const shadow = (host as HTMLElement).shadowRoot;
    expect(shadow).not.toBeNull();

    const title = shadow!.querySelector('.title');
    expect(title?.textContent).toContain('create lead');

    const stop = shadow!.querySelector('button.stop') as HTMLButtonElement;
    expect(stop).not.toBeNull();
    stop.click();
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('is idempotent — a second mount replaces the first', () => {
    mountRecorderOverlay({ name: 'a', onStop: vi.fn() });
    mountRecorderOverlay({ name: 'b', onStop: vi.fn() });
    expect(document.documentElement.querySelectorAll(`[${OVERLAY_HOST_ATTR}]`)).toHaveLength(1);
  });

  it('renders one feed line per event and tracks the count', () => {
    mountRecorderOverlay({ name: 't', onStop: vi.fn() });
    const shadow = document.documentElement.querySelector(`[${OVERLAY_HOST_ATTR}]`)!.shadowRoot!;

    // Empty state before any events.
    expect(shadow.querySelector('.empty')).not.toBeNull();

    const events: RecordedEvent[] = [
      { t: 0, kind: 'click', selector: sel('#a'), targetText: 'A' },
      { t: 1, kind: 'input', selector: sel('#b'), value: 'hi', sensitive: false },
    ];
    syncRecorderOverlay(events);
    expect(shadow.querySelectorAll('.feed li')).toHaveLength(2);
    expect(shadow.querySelector('.count')?.textContent).toBe('2 events');

    // Re-sync with a shorter buffer (mirrors the recorder's coalesce/pop dedup).
    syncRecorderOverlay(events.slice(0, 1));
    expect(shadow.querySelectorAll('.feed li')).toHaveLength(1);
    expect(shadow.querySelector('.count')?.textContent).toBe('1 event');
  });

  it('sync is a no-op when nothing is mounted', () => {
    expect(() => syncRecorderOverlay([{ t: 0, kind: 'submit', selector: sel('form') }])).not.toThrow();
  });

  it('unmount removes the host and tolerates a double call', () => {
    mountRecorderOverlay({ name: 't', onStop: vi.fn() });
    unmountRecorderOverlay();
    expect(isOverlayMounted()).toBe(false);
    expect(document.documentElement.querySelector(`[${OVERLAY_HOST_ATTR}]`)).toBeNull();
    expect(() => unmountRecorderOverlay()).not.toThrow();
  });
});
