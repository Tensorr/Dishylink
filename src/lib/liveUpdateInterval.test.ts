import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_LIVE_UPDATE_INTERVAL_MS,
  readLiveUpdateInterval,
  setLiveUpdateInterval,
  subscribeToLiveUpdateInterval,
} from "./liveUpdateInterval";

const STORAGE_KEY = "dishylink-live-update-interval-ms";

describe("live update interval", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  test("an untouched install keeps the 1-second default", () => {
    expect(readLiveUpdateInterval()).toBe(DEFAULT_LIVE_UPDATE_INTERVAL_MS);
    expect(DEFAULT_LIVE_UPDATE_INTERVAL_MS).toBe(1_000);
  });

  test("a stored choice is read back and announced", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToLiveUpdateInterval(listener);
    setLiveUpdateInterval(5_000);
    unsubscribe();
    expect(readLiveUpdateInterval()).toBe(5_000);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("a value this version doesn't offer falls back to the default", () => {
    localStorage.setItem(STORAGE_KEY, "250");
    expect(readLiveUpdateInterval()).toBe(DEFAULT_LIVE_UPDATE_INTERVAL_MS);
  });
});
