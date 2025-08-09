/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { select, Selection } from "d3-selection";
import { scaleLinear, scaleTime } from "d3-scale";
import { AR1Basis } from "../math/affine.ts";
import { AxisManager } from "./axisManager.ts";

class Matrix {
  constructor(
    public a = 1,
    public b = 0,
    public c = 0,
    public d = 1,
    public e = 0,
    public f = 0,
  ) {}
  multiply() {
    return this;
  }
  translate() {
    return this;
  }
  scale() {
    return this;
  }
  inverse() {
    return this;
  }
}
class Point {
  constructor(
    public x = 0,
    public y = 0,
  ) {}
  matrixTransform() {
    return this;
  }
}
(globalThis as any).DOMMatrix = Matrix;
(globalThis as any).DOMPoint = Point;

import { ChartData, IDataSource } from "./data.ts";
import type { ViewportTransform } from "../ViewportTransform.ts";
import { vi } from "vitest";
import {
  createDimensions,
  updateScaleX,
  initSeriesNode,
} from "./render/utils.ts";

describe("createDimensions", () => {
  it("sets width and height and returns screen basis", () => {
    const width = 400;
    const height = 300;
    const div = document.createElement("div");
    Object.defineProperty(div, "clientWidth", { value: width });
    Object.defineProperty(div, "clientHeight", { value: height });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    div.appendChild(svg);
    const selection = select(svg) as unknown as Selection<
      SVGSVGElement,
      unknown,
      HTMLElement,
      unknown
    >;
    const dp = createDimensions(selection);

    expect(svg.getAttribute("width")).toBe(String(width));
    expect(svg.getAttribute("height")).toBe(String(height));
    expect(dp.x().toArr()).toEqual([0, width]);
    expect(dp.y().toArr()).toEqual([height, 0]);
  });
});

describe("updateScaleX", () => {
  const makeSource = (data: number[][]): IDataSource => ({
    startTime: 0,
    timeStep: 1,
    length: data.length,
    seriesCount: 1,
    seriesAxes: [0],
    getSeries: (i) => data[i][0],
  });

  it("adjusts domain based on visible index range", () => {
    const cd = new ChartData(makeSource([[0], [1], [2]]));
    const x = scaleTime().range([0, 100]);
    updateScaleX(x, new AR1Basis(0, 2), cd);
    const [d0, d1] = x.domain();
    expect(d0.getTime()).toBe(0);
    expect(d1.getTime()).toBe(2);
  });
});

describe("updateScaleY", () => {
  const makeSource = (data: number[][]): IDataSource => ({
    startTime: 0,
    timeStep: 1,
    length: data.length,
    seriesCount: 1,
    seriesAxes: [0],
    getSeries: (i) => data[i][0],
  });

  it("sets domain from visible data bounds", () => {
    const cd = new ChartData(makeSource([[10], [20], [40]]));
    const y = scaleLinear().range([100, 0]);
    const vt = {
      onReferenceViewWindowResize: vi.fn(),
    } as unknown as ViewportTransform;
    const am = new AxisManager([100, 0]);
    am.create(1, cd);
    const tree = am.axes[0].tree;
    const dp = cd.updateScaleY(new AR1Basis(0, 2), tree);
    vt.onReferenceViewWindowResize(dp);
    y.domain(dp.y().toArr());
    expect(y.domain()).toEqual([10, 40]);
    expect(vt.onReferenceViewWindowResize).toHaveBeenCalledWith(dp);
  });
});

describe("initSeriesNode", () => {
  it("creates a view and path", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const selection = select(svg) as unknown as Selection<
      SVGSVGElement,
      unknown,
      HTMLElement,
      unknown
    >;
    const { view, path } = initSeriesNode(selection);
    expect(view.tagName).toBe("g");
    expect(path.tagName).toBe("path");
    expect(svg.querySelectorAll("g.view")).toHaveLength(1);
    expect(svg.querySelectorAll("path")).toHaveLength(1);
  });
});
