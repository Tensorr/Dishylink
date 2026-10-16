// How often the live dashboard refreshes: the dish status and history polls,
// and the clock the charts and live readings redraw against. An app-local
// choice, so it lives in localStorage beside the toolbar style, behind the same
// tiny external store so the settings tab and the hooks that poll stay in step.
//
// Slowing it costs freshness, not data. Every history poll returns the dish's
// whole 900-sample (15-minute) ring, so the charts keep 1-second resolution at
// any of these rates — only the leading edge arrives in larger steps. The
// recorder's own polling is separate and unaffected.

import { useSyncExternalStore } from "react";

export const LIVE_UPDATE_INTERVALS_MS = [1_000, 2_000, 5_000, 10_000] as const;

export type LiveUpdateIntervalMs = (typeof LIVE_UPDATE_INTERVALS_MS)[number];

/** The dish's own sample clock, and the rate the app has always run at. */
export const DEFAULT_LIVE_UPDATE_INTERVAL_MS: LiveUpdateIntervalMs = 1_000;

const STORAGE_KEY = "dishylink-live-update-interval-ms";

const listeners = new Set<() => void>();

function isLiveUpdateInterval(value: number): value is LiveUpdateIntervalMs {
  return (LIVE_UPDATE_INTERVALS_MS as readonly number[]).includes(value);
}

/** The stored choice, or the default for an untouched install or a value this
 *  version doesn't offer. */
export function readLiveUpdateInterval(): LiveUpdateIntervalMs {
  if (typeof localStorage === "undefined") return DEFAULT_LIVE_UPDATE_INTERVAL_MS;
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return isLiveUpdateInterval(stored) ? stored : DEFAULT_LIVE_UPDATE_INTERVAL_MS;
}

export function setLiveUpdateInterval(intervalMs: LiveUpdateIntervalMs): void {
  localStorage.setItem(STORAGE_KEY, String(intervalMs));
  for (const listener of listeners) listener();
}

export function subscribeToLiveUpdateInterval(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLiveUpdateInterval(): LiveUpdateIntervalMs {
  return useSyncExternalStore(subscribeToLiveUpdateInterval, readLiveUpdateInterval);
}
