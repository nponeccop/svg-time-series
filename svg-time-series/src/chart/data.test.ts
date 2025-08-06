import { describe, it, expect } from "vitest";
import {
  ChartData,
  ArrayDataSource,
  ConcatUint8ArrayDataSource,
} from "./data.ts";
import { AR1Basis } from "../math/affine.ts";

describe("ChartData", () => {
  it("throws if constructed with empty data", () => {
    const ds = new ArrayDataSource(0, 1, []);
    expect(() => new ChartData(ds)).toThrow(/non-empty data array/);
  });

  it("updates data and time mapping on append", () => {
    const cd = new ChartData(
      new ArrayDataSource(0, 1, [
        [0, 0],
        [1, 1],
      ]),
    );
    expect(cd.toArray()).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(cd.idxToTime.applyToPoint(0)).toBe(0);

    cd.append([2, 2]);

    expect(cd.toArray()).toEqual([
      [1, 1],
      [2, 2],
    ]);
    // appending shifts the index-to-time mapping one step backward
    expect(cd.idxToTime.applyToPoint(0)).toBe(-1);
    expect(cd.idxToTime.applyToPoint(1)).toBe(0);
  });

  it("reflects latest window after multiple appends", () => {
    const cd = new ChartData(
      new ArrayDataSource(0, 1, [
        [0, 0],
        [1, 1],
      ]),
    );

    cd.append([2, 2]);
    cd.append([3, 3]);
    cd.append([4, 4]);

    expect(cd.toArray()).toEqual([
      [3, 3],
      [4, 4],
    ]);
    expect(cd.idxToTime.applyToPoint(0)).toBe(-3);
    expect(cd.idxToTime.applyToPoint(1)).toBe(-2);
    expect(cd.treeNy.query(0, 1)).toEqual({ min: 3, max: 4 });
    expect(cd.treeSf!.query(0, 1)).toEqual({ min: 3, max: 4 });
  });

  it("computes visible temperature bounds", () => {
    const cd = new ChartData(
      new ArrayDataSource(0, 1, [
        [10, 20],
        [30, 40],
        [50, 60],
      ]),
    );
    const range = new AR1Basis(0, 2);
    expect(cd.bTemperatureVisible(range, cd.treeNy).toArr()).toEqual([10, 50]);
    expect(cd.bTemperatureVisible(range, cd.treeSf!).toArr()).toEqual([20, 60]);
  });

  it("floors and ceils fractional bounds when computing temperature visibility", () => {
    const cd = new ChartData(
      new ArrayDataSource(0, 1, [
        [10, 20],
        [30, 40],
        [50, 60],
      ]),
    );

    const fractionalRange = new AR1Basis(0.49, 1.49);
    expect(cd.bTemperatureVisible(fractionalRange, cd.treeNy).toArr()).toEqual([
      10, 50,
    ]);
    expect(cd.bTemperatureVisible(fractionalRange, cd.treeSf!).toArr()).toEqual(
      [20, 60],
    );
  });

  it("handles fractional bounds in the middle of the dataset", () => {
    const cd = new ChartData(
      new ArrayDataSource(0, 1, [
        [10, 20],
        [30, 40],
        [50, 60],
      ]),
    );

    const fractionalRange = new AR1Basis(1.1, 1.7);
    expect(cd.bTemperatureVisible(fractionalRange, cd.treeNy).toArr()).toEqual([
      30, 50,
    ]);
    expect(cd.bTemperatureVisible(fractionalRange, cd.treeSf!).toArr()).toEqual(
      [40, 60],
    );
  });

  it("clamps bounds that extend past the data range", () => {
    const cd = new ChartData(
      new ArrayDataSource(0, 1, [
        [10, 20],
        [30, 40],
        [50, 60],
      ]),
    );

    const outOfRange = new AR1Basis(-0.5, 3.5);
    expect(() => cd.bTemperatureVisible(outOfRange, cd.treeNy)).not.toThrow();
    expect(() => cd.bTemperatureVisible(outOfRange, cd.treeSf!)).not.toThrow();
    expect(cd.bTemperatureVisible(outOfRange, cd.treeNy).toArr()).toEqual([
      10, 50,
    ]);
    expect(cd.bTemperatureVisible(outOfRange, cd.treeSf!).toArr()).toEqual([
      20, 60,
    ]);
  });

  it("clamps bounds completely to the left of the data range", () => {
    const cd = new ChartData(
      new ArrayDataSource(0, 1, [
        [10, 20],
        [30, 40],
        [50, 60],
      ]),
    );

    const leftRange = new AR1Basis(-5, -1);
    expect(() => cd.bTemperatureVisible(leftRange, cd.treeNy)).not.toThrow();
    expect(() => cd.bTemperatureVisible(leftRange, cd.treeSf!)).not.toThrow();
    expect(cd.bTemperatureVisible(leftRange, cd.treeNy).toArr()).toEqual([
      10, 10,
    ]);
    expect(cd.bTemperatureVisible(leftRange, cd.treeSf!).toArr()).toEqual([
      20, 20,
    ]);
  });

  it("clamps bounds completely to the right of the data range", () => {
    const cd = new ChartData(
      new ArrayDataSource(0, 1, [
        [10, 20],
        [30, 40],
        [50, 60],
      ]),
    );

    const rightRange = new AR1Basis(5, 10);
    expect(() => cd.bTemperatureVisible(rightRange, cd.treeNy)).not.toThrow();
    expect(() => cd.bTemperatureVisible(rightRange, cd.treeSf!)).not.toThrow();
    expect(cd.bTemperatureVisible(rightRange, cd.treeNy).toArr()).toEqual([
      50, 50,
    ]);
    expect(cd.bTemperatureVisible(rightRange, cd.treeSf!).toArr()).toEqual([
      60, 60,
    ]);
  });

  describe("single-axis", () => {
    it("handles data without second series", () => {
      const cd = new ChartData(new ArrayDataSource(0, 1, [[0], [1]]));
      expect(cd.treeSf).toBeUndefined();
      expect(cd.toArray()).toEqual([[0], [1]]);
      cd.append([2]);
      expect(cd.toArray()).toEqual([[1], [2]]);
      expect(cd.treeNy.query(0, 1)).toEqual({ min: 1, max: 2 });
    });
  });

  it("supports concatenated typed array datasource", () => {
    const raw = new Uint8Array([10, 20, 30, 40, 50, 60]);
    const cd = new ChartData(new ConcatUint8ArrayDataSource(0, 1, raw));
    expect(cd.toArray()).toEqual([
      [10, 40],
      [20, 50],
      [30, 60],
    ]);
    cd.append([70, 80]);
    expect(cd.toArray()).toEqual([
      [20, 50],
      [30, 60],
      [70, 80],
    ]);
  });
});
