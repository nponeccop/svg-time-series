import { IMinMax, SegmentTree } from "../segmentTree.ts";

export function buildNySegmentTree(
  data: ReadonlyArray<[number, number?]>,
  buildTuple: (
    index: number,
    elements: ReadonlyArray<[number, number?]>,
  ) => IMinMax,
): SegmentTree<[number, number?]> {
  return new SegmentTree(data, data.length, buildTuple);
}

export function buildSfSegmentTree(
  data: ReadonlyArray<[number, number?]>,
  buildTuple?: (
    index: number,
    elements: ReadonlyArray<[number, number?]>,
  ) => IMinMax,
): SegmentTree<[number, number?]> | undefined {
  return buildTuple
    ? new SegmentTree(data, data.length, buildTuple)
    : undefined;
}

export function rebuildSegmentTrees(
  data: ReadonlyArray<[number, number?]>,
  buildSegmentTreeTupleNy: (
    index: number,
    elements: ReadonlyArray<[number, number?]>,
  ) => IMinMax,
  buildSegmentTreeTupleSf?: (
    index: number,
    elements: ReadonlyArray<[number, number?]>,
  ) => IMinMax,
): {
  treeNy: SegmentTree<[number, number?]>;
  treeSf?: SegmentTree<[number, number?]>;
} {
  return {
    treeNy: buildNySegmentTree(data, buildSegmentTreeTupleNy),
    treeSf: buildSfSegmentTree(data, buildSegmentTreeTupleSf),
  };
}
