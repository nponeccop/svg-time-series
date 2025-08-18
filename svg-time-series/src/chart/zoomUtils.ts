import { zoomIdentity, type ZoomTransform } from "d3-zoom";
import type { ChartData } from "./data.ts";
import type { RenderState } from "./render.ts";

export function validateScaleExtent(extent: unknown): [number, number] {
  const error = () =>
    new Error(
      `scaleExtent must be two finite, positive numbers where extent[0] < extent[1]. Received: ${
        Array.isArray(extent) ? `[${extent.join(",")}]` : String(extent)
      }`,
    );

  if (!Array.isArray(extent) || extent.length !== 2) {
    throw error();
  }

  const [min, max] = extent as [unknown, unknown];

  if (
    typeof min !== "number" ||
    typeof max !== "number" ||
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  ) {
    throw error();
  }

  if (min <= 0 || max <= 0) {
    throw error();
  }

  if (min >= max) {
    throw error();
  }

  return [min, max];
}

export function computeZoomTransform(
  data: ChartData,
  state: RenderState,
  start: Date | number,
  end: Date | number,
): { transform: ZoomTransform; timeWindow: [number, number] } | null {
  const startDate = typeof start === "number" ? new Date(start) : start;
  const endDate = typeof end === "number" ? new Date(end) : end;
  let m0 = data.timeToIndex(startDate);
  let m1 = data.timeToIndex(endDate);
  m0 = data.clampIndex(m0);
  m1 = data.clampIndex(m1);
  if (m1 < m0) {
    [m0, m1] = [m1, m0];
  }
  const sx0 = state.axes.x.scale(m0);
  const sx1 = state.axes.x.scale(m1);
  if (m0 === m1 || sx0 === sx1) {
    return null;
  }
  const { width } = state.getDimensions();
  const k = width / (sx1 - sx0);
  const transform = zoomIdentity.scale(k).translate(-sx0, 0);
  const t0 = +data.indexToTime(m0);
  const t1 = +data.indexToTime(m1);
  return { transform, timeWindow: [t0, t1] };
}
