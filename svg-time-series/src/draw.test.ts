/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Selection } from "d3-selection";
import { select } from "d3-selection";

vi.mock("./utils/domNodeTransform.ts", () => ({ updateNode: vi.fn() }));
vi.mock("./chart/zoomState.ts", () => {
  return {
    ZoomState: vi.fn().mockImplementation(() => ({
      refresh: vi.fn(),
      destroy: vi.fn(),
      setScaleExtent: vi.fn(),
      zoom: vi.fn(),
      reset: vi.fn(),
      updateExtents: vi.fn(),
      zoomBehavior: { transform: vi.fn() },
    })),
  };
});

import { TimeSeriesChart } from "./draw.ts";
import type { IDataSource } from "./draw.ts";
import "./setupDom.ts";

function createLegend() {
  return {
    init: vi.fn(),
    highlightIndex: vi.fn(),
    refresh: vi.fn(),
    clearHighlight: vi.fn(),
    destroy: vi.fn(),
  };
}

function createChart(options?: {
  legend?: ReturnType<typeof createLegend>;
  mouseMoveHandler?: (event: MouseEvent) => void;
}) {
  const legend = options?.legend ?? createLegend();
  const mouseMoveHandler = options?.mouseMoveHandler ?? vi.fn();

  const div = document.createElement("div");
  Object.defineProperty(div, "clientWidth", { value: 100 });
  Object.defineProperty(div, "clientHeight", { value: 50 });
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  div.appendChild(svgEl);

  const dataRows = [[1], [2], [3]];
  const source: IDataSource = {
    startTime: 0,
    timeStep: 1,
    length: dataRows.length,
    seriesCount: 1,
    seriesAxes: [0],
    getSeries: (i, seriesIdx) => dataRows[i]![seriesIdx]!,
  };

  const chart = new TimeSeriesChart(
    select(svgEl) as unknown as Selection<
      SVGSVGElement,
      unknown,
      HTMLElement,
      unknown
    >,
    source,
    legend,
    undefined,
    mouseMoveHandler,
  );

  return { chart, svgEl, legend, mouseMoveHandler };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TimeSeriesChart", () => {
  it("appends data and redraws on update", () => {
    const { chart } = createChart();
    const internal = chart as unknown as {
      data: { append: ReturnType<typeof vi.fn>; data: number[][] };
      state: { seriesRenderer: { draw: ReturnType<typeof vi.fn> } };
    };
    const appendSpy = vi.spyOn(internal.data, "append");
    const drawSpy = vi.spyOn(internal.state.seriesRenderer, "draw");

    appendSpy.mockClear();
    drawSpy.mockClear();

    chart.updateChartWithNewData(10);

    expect(appendSpy).toHaveBeenCalledWith(10);
    expect(drawSpy).toHaveBeenCalledWith(internal.data.data);
  });

  it("resizes svg and refreshes render state", () => {
    const { chart, svgEl, legend } = createChart();
    const internal = chart as unknown as {
      state: {
        resize: ReturnType<typeof vi.fn>;
        refresh: ReturnType<typeof vi.fn>;
        seriesRenderer: { draw: ReturnType<typeof vi.fn> };
      };
      zoomState: {
        refresh: ReturnType<typeof vi.fn>;
        setScaleExtent: ReturnType<typeof vi.fn>;
      };
    };
    const zoomInstance = internal.zoomState;
    const resizeSpy = vi.spyOn(internal.state, "resize");
    const refreshSpy = vi.spyOn(internal.state, "refresh");
    const drawSpy = vi.spyOn(internal.state.seriesRenderer, "draw");
    const zoomRefreshSpy = vi.spyOn(zoomInstance, "refresh");
    const legendRefreshSpy = vi.spyOn(legend, "refresh");

    resizeSpy.mockClear();
    refreshSpy.mockClear();
    drawSpy.mockClear();
    zoomRefreshSpy.mockClear();
    legendRefreshSpy.mockClear();

    chart.resize({ width: 200, height: 150 });

    expect(svgEl.getAttribute("width")).toBe("200");
    expect(svgEl.getAttribute("height")).toBe("150");
    expect(resizeSpy).toHaveBeenCalledWith(
      { width: 200, height: 150 },
      zoomInstance,
    );
    expect(refreshSpy).toHaveBeenCalled();
    expect(drawSpy).toHaveBeenCalled();
    expect(zoomRefreshSpy).toHaveBeenCalled();
    expect(legendRefreshSpy).toHaveBeenCalled();
  });

  it("clamps hover index and forwards to legend", () => {
    const legend = createLegend();
    const { chart } = createChart({ legend });
    const internal = chart as unknown as {
      state: { xTransform: { fromScreenToModelX: ReturnType<typeof vi.fn> } };
      data: { length: number };
    };
    vi.spyOn(internal.state.xTransform, "fromScreenToModelX").mockReturnValue(
      10,
    );

    chart.onHover(5);

    expect(legend.highlightIndex).toHaveBeenCalledWith(
      internal.data.length - 1,
    );
  });

  it("forwards scale extent to zoom state", () => {
    const { chart } = createChart();
    const internal = chart as unknown as {
      zoomState: { setScaleExtent: ReturnType<typeof vi.fn> };
    };

    chart.setScaleExtent([1, 3]);

    expect(internal.zoomState.setScaleExtent).toHaveBeenCalledWith([1, 3]);
  });

  it("removes listeners and destroys legend on dispose", () => {
    const legend = createLegend();
    const mouseMove = vi.fn();
    const { chart } = createChart({ legend, mouseMoveHandler: mouseMove });
    const internal = chart as unknown as {
      zoomArea: Selection<SVGRectElement, unknown, HTMLElement, unknown>;
    };
    const rectNode = internal.zoomArea.node()!;

    rectNode.dispatchEvent(new MouseEvent("mousemove"));
    expect(mouseMove).toHaveBeenCalled();

    mouseMove.mockClear();
    chart.dispose();
    rectNode.dispatchEvent(new MouseEvent("mousemove"));

    expect(mouseMove).not.toHaveBeenCalled();
    expect(legend.destroy).toHaveBeenCalled();
  });

  it("enables and disables brush layer", () => {
    const { chart } = createChart();
    const internal = chart as unknown as {
      brushLayer: Selection<SVGGElement, unknown, HTMLElement, unknown>;
    };
    chart.enableBrush();
    expect(internal.brushLayer.style("display")).not.toBe("none");
    chart.disableBrush();
    expect(internal.brushLayer.style("display")).toBe("none");
  });

  it("records selection and clears brush", () => {
    const { chart } = createChart();
    chart.enableBrush();
    const internal = chart as unknown as {
      brushLayer: Selection<SVGGElement, unknown, HTMLElement, unknown>;
      brushBehavior: { move: ReturnType<typeof vi.fn> };
      zoomState: { zoomBehavior: { transform: ReturnType<typeof vi.fn> } };
      state: { dimensions: { width: number; height: number } };
    };
    const moveSpy = vi.spyOn(internal.brushBehavior, "move");
    const { width, height } = internal.state.dimensions;
    internal.brushLayer.call(internal.brushBehavior.move, [
      [0, 0],
      [width / 2, height],
    ]);
    expect(internal.zoomState.zoomBehavior.transform).toHaveBeenCalled();
    expect(moveSpy).toHaveBeenLastCalledWith(internal.brushLayer, null);
    expect(chart.getSelectedTimeWindow()).toEqual([0, 1]);
  });
});
