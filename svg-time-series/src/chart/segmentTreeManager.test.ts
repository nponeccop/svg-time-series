import { describe, it, expect } from "vitest";
import {
  buildNySegmentTree,
  buildSfSegmentTree,
  rebuildSegmentTrees,
} from "./segmentTreeManager.ts";

const buildNy = (i: number, arr: ReadonlyArray<[number, number?]>) => ({
  min: arr[i][0],
  max: arr[i][0],
});

const buildSf = (i: number, arr: ReadonlyArray<[number, number?]>) => ({
  min: arr[i][1]!,
  max: arr[i][1]!,
});

describe("segmentTreeManager", () => {
  const data: Array<[number, number?]> = [
    [10, 20],
    [30, 40],
    [50, 60],
  ];

  it("builds Ny segment tree", () => {
    const tree = buildNySegmentTree(data, buildNy);
    expect(tree.query(0, 2)).toEqual({ min: 10, max: 50 });
  });

  it("builds Sf segment tree", () => {
    const tree = buildSfSegmentTree(data, buildSf)!;
    expect(tree.query(0, 2)).toEqual({ min: 20, max: 60 });
  });

  it("rebuilds both segment trees", () => {
    const { treeNy, treeSf } = rebuildSegmentTrees(data, buildNy, buildSf);
    expect(treeNy.query(0, 2)).toEqual({ min: 10, max: 50 });
    expect(treeSf!.query(0, 2)).toEqual({ min: 20, max: 60 });
  });

  it("handles missing Sf builder", () => {
    const { treeNy, treeSf } = rebuildSegmentTrees(data, buildNy);
    expect(treeNy.query(0, 2)).toEqual({ min: 10, max: 50 });
    expect(treeSf).toBeUndefined();
  });
});
