/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll } from "vitest";
import { AR1Basis } from "../math/affine.ts";
import { AxisManager } from "./axisManager.ts";
import { ChartData, type IDataSource } from "./data.ts";

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

function makeSource(data: number[][], seriesAxes: number[]): IDataSource {
  return {
    startTime: 0,
    timeStep: 1,
    length: data.length,
    seriesCount: data[0]?.length ?? 0,
    seriesAxes,
    getSeries: (i, j) => data[i][j] as number,
  };
}

describe("AxisManager.updateScales", () => {
  it("updates domains for multiple axes", () => {
    const source = makeSource(
      [
        [1, 10],
        [3, 30],
      ],
      [0, 1],
    );
    const data = new ChartData(source);
    const am = new AxisManager([0, 1]);
    am.create(2, data);
    const bIndexVisible = new AR1Basis(0, data.length - 1);
    am.updateScales(bIndexVisible, data);

    expect(am.axes[0].scale.domain()).toEqual([1, 3]);
    expect(am.axes[1].scale.domain()).toEqual([10, 30]);
  });

  it("merges extra axes into the last scale", () => {
    const source = makeSource(
      [
        [0, 10],
        [1, 20],
      ],
      [0, 1],
    );
    const data = new ChartData(source);
    const am = new AxisManager([0, 1]);
    am.create(1, data);
    const bIndexVisible = new AR1Basis(0, data.length - 1);
    am.updateScales(bIndexVisible, data);

    expect(am.axes[0].scale.domain()).toEqual([0, 20]);
  });
});
