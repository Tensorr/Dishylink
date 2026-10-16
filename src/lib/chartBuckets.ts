// Per-pixel bucketing for TelemetryChart, kept pure so it can be tested without
// a browser.
//
// Bucket boundaries sit on fixed instants of the clock (multiples of the bucket
// span since the epoch), not on offsets from the window's left edge. The window
// slides every second; boundaries measured from its edge slid with it, so every
// tick regrouped every sample, each bucket's mean changed, and the lines — and
// the y-axis fitted to them — jumped on every update with no new data at all.
// Anchored to the clock, a sample stays in the same bucket for as long as it is
// on screen: only the newest bucket (still filling) and the oldest (aging out)
// can change between ticks.

import type { TelemetrySample } from "@core/telemetry";
import type { ChartSeries } from "../components/shared/TelemetryChart";

export interface BucketPoint {
  timestampMs: number;
  values: (number | null)[];
  /** No samples at all between the previous bucket and this one. */
  hasGapBefore: boolean;
}

/** Roughly one bucket per two pixels of plot, never fewer than this many. */
const MIN_BUCKETS = 30;

/**
 * Bucket span for a window drawn across `plotWidth` pixels. Depends only on the
 * window and the width — never on how many samples happen to be in view, or a
 * sparse window would change the span (and regroup everything) with each
 * arrival. Whole seconds, so boundaries repeat exactly from tick to tick.
 */
export function bucketSpanFor(windowSpanMs: number, plotWidth: number): number {
  const bucketCount = Math.max(Math.floor(plotWidth / 2), MIN_BUCKETS);
  return Math.max(Math.ceil(windowSpanMs / bucketCount / 1000), 1) * 1000;
}

export function bucketSamples(
  samples: TelemetrySample[],
  series: ChartSeries[],
  windowStartMs: number,
  windowEndMs: number,
  plotWidth: number,
  minGapMs: number,
): { buckets: BucketPoint[]; bucketSpanMs: number } {
  // Half-open [start, end): with a frozen end, samples past the boundary would
  // otherwise land in the last bucket and creep its mean every second, defeating
  // the freeze. On the live clock nothing is newer than now, so this excludes
  // only a sample landing exactly on it — no effect on those charts.
  const visibleSamples = samples.filter(
    (sample) => sample.timestampMs >= windowStartMs && sample.timestampMs < windowEndMs,
  );
  if (visibleSamples.length === 0) return { buckets: [], bucketSpanMs: 0 };

  const bucketSpanMs = bucketSpanFor(windowEndMs - windowStartMs, plotWidth);
  const grouped = new Map<number, TelemetrySample[]>();
  for (const sample of visibleSamples) {
    const bucketKey = Math.floor(sample.timestampMs / bucketSpanMs);
    const members = grouped.get(bucketKey);
    if (members) members.push(sample);
    else grouped.set(bucketKey, [sample]);
  }

  const populated: BucketPoint[] = [...grouped.entries()]
    .sort(([keyA], [keyB]) => keyA - keyB)
    .map(([bucketKey, members]) => ({
      // The edge buckets straddle the window's ends; keep their points on the
      // plot rather than half a bucket into the margin.
      timestampMs: Math.min(Math.max((bucketKey + 0.5) * bucketSpanMs, windowStartMs), windowEndMs),
      values: series.map((chartSeries) => {
        const seriesValues = members
          .map(chartSeries.getValue)
          .filter((value): value is number => value !== null && Number.isFinite(value));
        if (seriesValues.length === 0) return null;
        if (chartSeries.bucketReduce === "max") return Math.max(...seriesValues);
        if (chartSeries.bucketReduce === "min") return Math.min(...seriesValues);
        return seriesValues.reduce((sum, value) => sum + value, 0) / seriesValues.length;
      }),
      hasGapBefore: false,
    }));

  // Empty buckets are never created, so a hole shows up as two neighbours
  // further apart than one bucket. Anything wider than that — and wider than a
  // dropped sample or two — is time we never measured.
  const gapThresholdMs = Math.max(bucketSpanMs * 1.5, minGapMs);
  for (let index = 1; index < populated.length; index++) {
    populated[index].hasGapBefore =
      populated[index].timestampMs - populated[index - 1].timestampMs > gapThresholdMs;
  }
  return { buckets: populated, bucketSpanMs };
}
