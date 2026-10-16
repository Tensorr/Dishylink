// The chart re-renders every second as its window slides. Bucket boundaries
// measured from the window's left edge slid with it, regrouping every sample on
// every tick: spiky throughput averaged with different neighbours each second,
// so the lines — and the y-axis fitted to them — jumped with no new data.

import { describe, expect, test } from "vitest";
import { bucketSamples, bucketSpanFor } from "./chartBuckets";
import { THROUGHPUT_SERIES } from "./statDetails";
import type { TelemetrySample } from "@core/telemetry";

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0, 437);
const WINDOW_MS = 15 * 60_000;
const PLOT_WIDTH = 800;

/** One sample per second ending `endMs`, with a throughput spike every 7s. */
function spikySamples(endMs: number, count: number): TelemetrySample[] {
  return Array.from({ length: count }, (_, index) => ({
    timestampMs: endMs - (count - 1 - index) * 1000,
    latencyMs: 40,
    dropRate: 0,
    downlinkBps: index % 7 === 0 ? 180e6 : 5e6 + (index % 3) * 1e6,
    uplinkBps: index % 11 === 0 ? 20e6 : 1e6,
    powerW: 30,
    routerLatencyMs: null,
    routerPingSuccessPercent: null,
  }));
}

function bucketsAt(samples: TelemetrySample[], nowMs: number) {
  return bucketSamples(samples, THROUGHPUT_SERIES, nowMs - WINDOW_MS, nowMs, PLOT_WIDTH, 30_000);
}

describe("bucketSamples", () => {
  test("a tick with no new data leaves every interior bucket unchanged", () => {
    const samples = spikySamples(NOW - 500, 3600);
    const before = bucketsAt(samples, NOW).buckets;
    const after = bucketsAt(samples, NOW + 1000).buckets;

    const valuesByTime = new Map(before.map((bucket) => [bucket.timestampMs, bucket.values]));
    // Skip the edge buckets: the oldest is aging out and the newest is filling.
    const interior = after.slice(1, -1);
    expect(interior.length).toBeGreaterThan(200);
    for (const bucket of interior) {
      expect(valuesByTime.get(bucket.timestampMs)).toEqual(bucket.values);
    }
  });

  test("the bucket span does not depend on how many samples are in view", () => {
    const sparse = bucketsAt(spikySamples(NOW - 500, 40), NOW).bucketSpanMs;
    const dense = bucketsAt(spikySamples(NOW - 500, 900), NOW).bucketSpanMs;
    expect(sparse).toBe(dense);
    expect(dense).toBe(bucketSpanFor(WINDOW_MS, PLOT_WIDTH));
  });

  test("bucket spans are whole seconds, so boundaries repeat tick to tick", () => {
    for (const minutes of [15, 60, 360]) {
      for (const width of [300, 777, 1200]) {
        expect(bucketSpanFor(minutes * 60_000, width) % 1000).toBe(0);
      }
    }
  });

  test("points stay inside the window", () => {
    const { buckets } = bucketsAt(spikySamples(NOW - 1, 900), NOW);
    expect(buckets[0].timestampMs).toBeGreaterThanOrEqual(NOW - WINDOW_MS);
    expect(buckets[buckets.length - 1].timestampMs).toBeLessThanOrEqual(NOW);
  });

  test("still marks a recording gap", () => {
    const samples = [...spikySamples(NOW - 10 * 60_000, 120), ...spikySamples(NOW - 500, 120)];
    const { buckets } = bucketsAt(samples, NOW);
    expect(buckets.filter((bucket) => bucket.hasGapBefore)).toHaveLength(1);
  });
});
