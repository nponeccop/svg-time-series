/**
 * @vitest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { select } from "d3-selection";
import { AR1Basis } from "../math/affine.ts";
import { TimeSeriesChart, IDataSource } from "../draw.ts";
import { AxisId } from "./types.ts";
import type { ILegendController, LegendContext } from "./legend.ts";

class Matrix {
  constructor(
    public tx = 0,
    public ty = 0,
  ) {}
  translate(tx: number, ty: number) {
    return new Matrix(this.tx + tx, this.ty + ty);
  }
  scaleNonUniform(_sx: number, _sy: number) {
    return this;
  }
  multiply(_m: Matrix) {
    return this;
  }
}

vi.mock("../utils/domNodeTransform.ts", () => ({
  updateNode: (_node: SVGGraphicsElement, _matrix: Matrix) => {},
}));

let currentDataLength = 0;
vi.mock("../ViewportTransform.ts", () => ({
  ViewportTransform: class {
    onZoomPan = vi.fn();
    fromScreenToModelX = vi.fn((x: number) => x);
    fromScreenToModelBasisX = vi.fn(
      () => new AR1Basis(0, Math.max(currentDataLength - 1, 0)),
    );
    onViewPortResize = vi.fn();
    onReferenceViewWindowResize = vi.fn();
  },
}));

vi.mock("../axis.ts", () => ({
  Orientation: { Bottom: 0, Right: 1 },
  MyAxis: class {
    setScale = vi.fn(() => this);
    axis = vi.fn();
    axisUp = vi.fn();
    ticks = vi.fn(() => this);
    setTickSize = vi.fn(() => this);
    setTickPadding = vi.fn(() => this);
  },
}));

vi.mock("d3-zoom", () => ({
  zoom: () => {
    const behavior: any = () => {};
    behavior.scaleExtent = () => behavior;
    behavior.translateExtent = () => behavior;
    behavior.on = () => behavior;
    behavior.transform = () => {};
    return behavior;
  },
}));

class StubLegendController implements ILegendController {
  init = vi.fn((_: LegendContext) => {});
  highlightIndex = vi.fn();
  refresh = vi.fn();
  clearHighlight = vi.fn();
  destroy = vi.fn();
}

function createChart(data: Array<[number]>) {
  currentDataLength = data.length;
  const parent = document.createElement("div");
  const w = Math.max(currentDataLength - 1, 0);
  Object.defineProperty(parent, "clientWidth", {
    value: w,
    configurable: true,
  });
  Object.defineProperty(parent, "clientHeight", {
    value: 50,
    configurable: true,
  });
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  parent.appendChild(svgEl);

  const source: IDataSource = {
    startTime: 0,
    timeStep: 1,
    length: data.length,
    seriesCount: 1,
    seriesAxes: [AxisId.Primary],
    getSeries: (i) => data[i][0],
  };
  const legendController = new StubLegendController();
  const chart = new TimeSeriesChart(
    select(svgEl) as any,
    source,
    legendController,
    false,
    () => {},
    () => {},
  );

  return { onHover: chart.onHover, legendController };
}

beforeEach(() => {
  vi.useFakeTimers();
  (SVGSVGElement.prototype as any).createSVGMatrix = () => new Matrix();
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
});

describe("TimeSeriesChart hover clamping", () => {
  it("clamps to first point when hovering before chart", () => {
    const { onHover, legendController } = createChart([[10], [20], [30]]);
    vi.runAllTimers();
    legendController.highlightIndex.mockClear();

    onHover(-100);
    vi.runAllTimers();

    expect(legendController.highlightIndex).toHaveBeenCalledWith(0);
  });

  it("clamps to last point when hovering past chart", () => {
    const { onHover, legendController } = createChart([[10], [20], [30]]);
    vi.runAllTimers();
    legendController.highlightIndex.mockClear();

    onHover(100);
    vi.runAllTimers();

    expect(legendController.highlightIndex).toHaveBeenCalledWith(2);
  });
});
