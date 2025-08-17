import { describe, it, expect } from "vitest";
import { SegmentTree } from "segment-tree-rmq";
import { DataWindow } from "./dataWindow.ts";
import { scaleYRange, combinedAxisDomain, type IMinMax } from "./axisData.ts";
import { buildMinMax, minMaxIdentity } from "./minMax.ts";

function treeFromValues(values: number[]): SegmentTree<IMinMax> {
  const arr = values.map((v) => ({ min: v, max: v }));
  return new SegmentTree(arr, buildMinMax, minMaxIdentity);
}

describe("scaleYRange", () => {
  it("computes range for normal data", () => {
    const dw = new DataWindow([[1], [3], [2]], 0, 1);
    const tree = treeFromValues([1, 3, 2]);
    expect(scaleYRange(dw, [0, 2], tree)).toEqual([1, 3]);
  });

  it("expands identical min and max by epsilon", () => {
    const dw = new DataWindow([[5], [5], [5]], 0, 1);
    const tree = treeFromValues([5, 5, 5]);
    expect(scaleYRange(dw, [0, 2], tree)).toEqual([4.5, 5.5]);
  });

  it("returns [0,1] when all values are non-finite", () => {
    const dw = new DataWindow([[0], [0]], 0, 1);
    const arr: IMinMax[] = [minMaxIdentity, minMaxIdentity];
    const tree = new SegmentTree(arr, buildMinMax, minMaxIdentity);
    expect(scaleYRange(dw, [0, 1], tree)).toEqual([0, 1]);
  });
});

describe("combinedAxisDomain", () => {
  it("merges domains from multiple trees", () => {
    const dw = new DataWindow([[0], [0], [0]], 0, 1);
    const arr0: IMinMax[] = [
      { min: 2, max: 5 },
      { min: 4, max: 7 },
      { min: 3, max: 6 },
    ];
    const arr1: IMinMax[] = [
      { min: 5, max: 9 },
      { min: 3, max: 11 },
      { min: 8, max: 10 },
    ];
    const tree0 = new SegmentTree(arr0, buildMinMax, minMaxIdentity);
    const tree1 = new SegmentTree(arr1, buildMinMax, minMaxIdentity);
    const scale = combinedAxisDomain(dw, [0, 2], tree0, tree1);
    expect(scale.domain()).toEqual([2, 11]);
  });
});
