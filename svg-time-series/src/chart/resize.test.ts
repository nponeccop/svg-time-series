/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const transformInstances: any[] = [];
vi.mock("../ViewportTransform.ts", () => ({
  ViewportTransform: class {
    matrix = {};
    constructor() {
      transformInstances.push(this);
    }
    onZoomPan = vi.fn();
    fromScreenToModelX = vi.fn((x: number) => x);
    fromScreenToModelBasisX = vi.fn((b: any) => b);
    onViewPortResize = vi.fn();
    onReferenceViewWindowResize = vi.fn();
  },
}));

const axisInstances: any[] = [];
vi.mock("../axis.ts", () => ({
  Orientation: { Bottom: 0, Right: 1, Left: 2 },
  MyAxis: class {
    axisUpCalls = 0;
    constructor() {
      axisInstances.push(this);
    }
    setScale = vi.fn(() => this);
    axis = vi.fn();
    axisUp = vi.fn(() => {
      this.axisUpCalls++;
    });
    ticks = vi.fn(() => this);
    setTickSize = vi.fn(() => this);
    setTickPadding = vi.fn(() => this);
  },
}));

vi.mock("./render/utils.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./render/utils.ts")>();
  return { ...actual, renderPaths: vi.fn() };
});

vi.mock("../utils/domNodeTransform.ts", () => ({ updateNode: vi.fn() }));
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

import { select } from "d3-selection";
import { TimeSeriesChart, IDataSource } from "../draw.ts";
import { renderPaths } from "./render/utils.ts";
import { updateNode } from "../utils/domNodeTransform.ts";

class DummyLegendController {
  refresh = vi.fn();
  onHover = vi.fn();
  destroy = vi.fn();
  highlightIndex = vi.fn();
  clearHighlight = vi.fn();
}

function createChart() {
  const parent = document.createElement("div");
  Object.defineProperty(parent, "clientWidth", {
    value: 100,
    configurable: true,
  });
  Object.defineProperty(parent, "clientHeight", {
    value: 50,
    configurable: true,
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  parent.appendChild(svg);
  const source: IDataSource = {
    startTime: 0,
    timeStep: 1,
    length: 3,
    seriesCount: 2,
    getSeries: (i, s) => (s === 0 ? [1, 2, 3][i] : [10, 20, 30][i]),
  };
  return new TimeSeriesChart(
    select(svg) as any,
    source,
    () => new DummyLegendController(),
    true,
    () => {},
    () => {},
  );
}

const renderPathsMock = vi.mocked(renderPaths);

beforeEach(() => {
  transformInstances.length = 0;
  axisInstances.length = 0;
  renderPathsMock.mockClear();
  vi.mocked(updateNode).mockClear();
});

describe("resize", () => {
  it("updates transforms, scales, axes and paths", () => {
    const chart = createChart();
    const state = (chart as any).state;
    const ny = transformInstances[0];
    const sf = transformInstances[1];
    const xAxis = axisInstances[0];
    const yAxis = axisInstances[1];
    const yRight = axisInstances[2];

    const renderBefore = renderPathsMock.mock.calls.length;
    const nyCalls = ny.onViewPortResize.mock.calls.length;
    const sfCalls = sf.onViewPortResize.mock.calls.length;
    const xAxisCalls = xAxis.axisUpCalls;
    const yAxisCalls = yAxis.axisUpCalls;
    const yRightCalls = yRight.axisUpCalls;

    chart.resize({ width: 200, height: 100 });

    expect(ny.onViewPortResize.mock.calls.length).toBe(nyCalls + 1);
    expect(sf.onViewPortResize.mock.calls.length).toBe(sfCalls + 1);
    const arg = ny.onViewPortResize.mock.calls.at(-1)![0];
    expect(arg.toArr()).toEqual([
      [0, 200],
      [100, 0],
    ]);

    expect(state.scales.x.range()).toEqual([0, 200]);
    expect(state.scales.yNy.range()).toEqual([100, 0]);
    expect(state.scales.ySf!.range()).toEqual([100, 0]);

    expect(xAxis.axisUpCalls).toBeGreaterThan(xAxisCalls);
    expect(yAxis.axisUpCalls).toBeGreaterThan(yAxisCalls);
    expect(yRight.axisUpCalls).toBeGreaterThan(yRightCalls);

    expect(renderPathsMock.mock.calls.length).toBe(renderBefore + 1);
    expect(vi.mocked(updateNode).mock.calls.length).toBeGreaterThan(0);
  });
});
