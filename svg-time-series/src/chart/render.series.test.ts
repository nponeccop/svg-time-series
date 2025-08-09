/**
 * @vitest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import { select, type Selection } from "d3-selection";
import { ChartData, type IDataSource } from "./data.ts";
import { buildSeries } from "./render.ts";
import { initPaths, lineNy, lineSf } from "./render/utils.ts";

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

beforeAll(() => {
  (globalThis as any).DOMMatrix = Matrix;
  (globalThis as any).DOMPoint = Point;
});

function createSvg() {
  const dom = new JSDOM(`<div id="c"><svg></svg></div>`, {
    pretendToBeVisual: true,
    contentType: "text/html",
  });
  const div = dom.window.document.getElementById("c") as any;
  Object.defineProperty(div, "clientWidth", { value: 100 });
  Object.defineProperty(div, "clientHeight", { value: 100 });
  return select(div).select("svg");
}

describe("buildSeries", () => {
  it("returns single series", () => {
    const svg = createSvg();
    const source: IDataSource = {
      startTime: 0,
      timeStep: 1,
      length: 3,
      seriesCount: 1,
      seriesAxes: [0],
      getSeries: (i) => [1, 2, 3][i],
    };
    const data = new ChartData(source);
    const paths = initPaths(svg as any, data.seriesCount);
    const series = buildSeries(data, paths);
    const pathNodes = paths.path.nodes() as SVGPathElement[];
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      view: paths.nodes[0],
      path: pathNodes[0],
      line: lineNy,
      axisIdx: 0,
    });
  });

  it("assigns axis index for multiple datasets", () => {
    const svg = createSvg();
    const source: IDataSource = {
      startTime: 0,
      timeStep: 1,
      length: 3,
      seriesCount: 2,
      seriesAxes: [0, 1],
      getSeries: (i, seriesIdx) =>
        seriesIdx === 0 ? [1, 2, 3][i] : [10, 20, 30][i],
    };
    const data = new ChartData(source);
    const paths = initPaths(svg as any, data.seriesCount);
    const series = buildSeries(data, paths);
    const pathNodes = paths.path.nodes() as SVGPathElement[];
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({
      view: paths.nodes[0],
      path: pathNodes[0],
      line: lineNy,
      axisIdx: 0,
    });
    expect(series[1]).toMatchObject({
      view: paths.nodes[1],
      path: pathNodes[1],
      line: lineSf,
      axisIdx: 1,
    });
  });

  it("omits series when path is missing", () => {
    createSvg();
    const source: IDataSource = {
      startTime: 0,
      timeStep: 1,
      length: 3,
      seriesCount: 2,
      seriesAxes: [0, 1],
      getSeries: (i, seriesIdx) =>
        seriesIdx === 0 ? [1, 2, 3][i] : [10, 20, 30][i],
    };
    const data = new ChartData(source);
    const svg2 = select(document.createElement("div")).append(
      "svg",
    ) as unknown as Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
    const singlePaths = initPaths(svg2, 1);
    const series = buildSeries(data, singlePaths);
    expect(series).toHaveLength(1);
  });
});
