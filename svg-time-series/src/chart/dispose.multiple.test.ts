/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Selection } from "d3-selection";
import { select } from "d3-selection";
vi.mock("../utils/domNodeTransform.ts", () => ({
  updateNode: () => {},
}));

import { TimeSeriesChart } from "../draw.ts";
import type { IDataSource } from "../draw.ts";
import type { ILegendController } from "./legend.ts";
import "../setupDom.ts";

function createSvg(): Selection<SVGSVGElement, unknown, HTMLElement, unknown> {
  const parent = document.createElement("div");
  Object.defineProperty(parent, "clientWidth", { value: 10 });
  Object.defineProperty(parent, "clientHeight", { value: 10 });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  parent.appendChild(svg);
  return select(svg) as unknown as Selection<
    SVGSVGElement,
    unknown,
    HTMLElement,
    unknown
  >;
}

class DummyLegendController implements ILegendController {
  init() {}
  highlightIndex() {}
  refresh() {}
  clearHighlight() {}
  destroy() {}
}

interface InternalState {
  series: unknown[];
  seriesRenderer: { series: unknown[] };
  axes: { x: { axis: unknown; g: unknown }; y: unknown[] };
  axisManager: { axes: unknown[] };
}

function createSource(): IDataSource {
  return {
    startTime: 0,
    timeStep: 1,
    length: 2,
    seriesCount: 1,
    seriesAxes: [0],
    getSeries: (i) => [1, 2][i]!,
  };
}

describe("TimeSeriesChart dispose", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("handles multiple create/dispose cycles without leftover state", () => {
    const svg = createSvg();
    const source = createSource();

    for (let i = 0; i < 2; i++) {
      const chart = new TimeSeriesChart(
        svg,
        source,
        new DummyLegendController(),
      );
      vi.runAllTimers();
      const state = (chart as unknown as { state: InternalState }).state;
      expect(svg.selectAll("path").nodes().length).toBeGreaterThan(0);
      expect(state.series.length).toBe(1);
      expect(state.seriesRenderer.series.length).toBe(1);
      expect(state.axisManager.axes.length).toBe(1);
      chart.dispose();
      vi.runAllTimers();
      expect(svg.selectAll("path").nodes().length).toBe(0);
      expect(state.series.length).toBe(0);
      expect(state.seriesRenderer.series.length).toBe(0);
      expect(state.axes.x.axis).toBeNull();
      expect(state.axes.x.g).toBeNull();
      expect(state.axisManager.axes.length).toBe(0);
    }
  });
});
