/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { select } from "d3-selection";

import { AR1Basis, DirectProductBasis } from "../math/affine.ts";
import { TimeSeriesChart, IDataSource } from "../draw.ts";
import * as render from "./render.ts";

vi.mock("../utils/domNodeTransform.ts", () => ({ updateNode: vi.fn() }));

class Matrix {
  constructor(
    public a = 1,
    public b = 0,
    public c = 0,
    public d = 1,
    public e = 0,
    public f = 0,
  ) {}
  multiply(m: Matrix) {
    return new Matrix(
      this.a * m.a + this.c * m.b,
      this.b * m.a + this.d * m.b,
      this.a * m.c + this.c * m.d,
      this.b * m.c + this.d * m.d,
      this.a * m.e + this.c * m.f + this.e,
      this.b * m.e + this.d * m.f + this.f,
    );
  }
  translate(tx: number, ty: number) {
    return this.multiply(new Matrix(1, 0, 0, 1, tx, ty));
  }
  scale(sx: number, sy: number) {
    return this.multiply(new Matrix(sx, 0, 0, sy, 0, 0));
  }
  inverse() {
    const det = this.a * this.d - this.b * this.c;
    return new Matrix(
      this.d / det,
      -this.b / det,
      -this.c / det,
      this.a / det,
      (this.c * this.f - this.d * this.e) / det,
      (this.b * this.e - this.a * this.f) / det,
    );
  }
}

class Point {
  constructor(
    public x = 0,
    public y = 0,
  ) {}
  matrixTransform(m: Matrix) {
    return new Point(
      this.x * m.a + this.y * m.c + m.e,
      this.x * m.b + this.y * m.d + m.f,
    );
  }
}

function createSvg(width: number, height: number) {
  const div = document.createElement("div");
  Object.defineProperty(div, "clientWidth", {
    value: width,
    configurable: true,
  });
  Object.defineProperty(div, "clientHeight", {
    value: height,
    configurable: true,
  });
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  div.appendChild(svgEl);
  return select(svgEl);
}

const legendFactory = () => ({
  highlightIndex: vi.fn(),
  refresh: vi.fn(),
  clearHighlight: vi.fn(),
  destroy: vi.fn(),
});

describe("TimeSeriesChart.resize", () => {
  beforeAll(() => {
    (globalThis as any).DOMMatrix = Matrix;
    (globalThis as any).DOMPoint = Point;
  });

  it("updates transform and refreshes chart", () => {
    vi.useFakeTimers();
    const svg = createSvg(100, 50);
    const source: IDataSource = {
      startTime: 0,
      timeStep: 1,
      length: 2,
      seriesCount: 1,
      getSeries: (i) => [1, 2][i],
    };
    const chart = new TimeSeriesChart(svg as any, source, legendFactory, false);
    vi.runAllTimers();

    const refreshSpy = vi.spyOn(render, "refreshChart");
    const nySpy = vi.spyOn(
      (chart as any).state.transforms.ny,
      "onViewPortResize",
    );

    refreshSpy.mockClear();
    nySpy.mockClear();

    chart.resize({ width: 200, height: 80 });

    expect((chart as any).state.transforms.bScreenXVisible.toArr()).toEqual([
      0, 200,
    ]);
    const expected = DirectProductBasis.fromProjections(
      new AR1Basis(0, 200),
      new AR1Basis(80, 0),
    ).toArr();
    expect(nySpy).toHaveBeenCalledTimes(2);
    expect((nySpy.mock.calls[0][0] as DirectProductBasis).toArr()).toEqual(
      expected,
    );
    expect((nySpy.mock.calls[1][0] as DirectProductBasis).toArr()).toEqual(
      expected,
    );
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("updates secondary transform when present", () => {
    vi.useFakeTimers();
    const svg = createSvg(100, 50);
    const source: IDataSource = {
      startTime: 0,
      timeStep: 1,
      length: 2,
      seriesCount: 2,
      getSeries: (i, s) => (s === 0 ? [1, 2][i] : [10, 20][i]),
    };
    const chart = new TimeSeriesChart(svg as any, source, legendFactory, true);
    vi.runAllTimers();

    const nySpy = vi.spyOn(
      (chart as any).state.transforms.ny,
      "onViewPortResize",
    );
    const sfSpy = vi.spyOn(
      (chart as any).state.transforms.sf,
      "onViewPortResize",
    );

    nySpy.mockClear();
    sfSpy.mockClear();

    chart.resize({ width: 150, height: 70 });

    const expected = DirectProductBasis.fromProjections(
      new AR1Basis(0, 150),
      new AR1Basis(70, 0),
    ).toArr();
    expect(nySpy).toHaveBeenCalledTimes(1);
    expect(sfSpy).toHaveBeenCalledTimes(1);
    expect((nySpy.mock.calls[0][0] as DirectProductBasis).toArr()).toEqual(
      expected,
    );
    expect((sfSpy.mock.calls[0][0] as DirectProductBasis).toArr()).toEqual(
      expected,
    );

    vi.useRealTimers();
  });
});
