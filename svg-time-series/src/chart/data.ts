import { AR1, AR1Basis, betweenTBasesAR1, bUnit } from "../math/affine.ts";
import { IMinMax, SegmentTree } from "../segmentTree.ts";
import type { IDataSource } from "./datasource.ts";

export type { IMinMax, IDataSource };
export { ArrayDataSource, ConcatUint8ArrayDataSource } from "./datasource.ts";

export class ChartData {
  private data: IDataSource;
  public treeNy!: SegmentTree<[number, number?]>;
  public treeSf?: SegmentTree<[number, number?]>;
  public idxToTime: AR1;
  private idxShift: AR1;
  public bIndexFull: AR1Basis;

  /**
   * Creates a new ChartData instance.
   * @param data Initial dataset; must contain at least one point.
   * @throws if `data` is empty.
   */
  constructor(data: IDataSource) {
    if (data.length === 0) {
      throw new Error("ChartData requires a non-empty data array");
    }
    this.data = data;
    this.idxToTime = betweenTBasesAR1(
      bUnit,
      new AR1Basis(data.startTime, data.startTime + data.timeStep),
    );
    this.idxShift = betweenTBasesAR1(new AR1Basis(1, 2), bUnit);
    this.bIndexFull = new AR1Basis(0, this.data.length - 1);
    this.rebuildSegmentTrees();
  }

  append(newData: [number, number?]): void {
    this.data.append(newData);
    this.idxToTime = this.idxToTime.composeWith(this.idxShift);
    this.bIndexFull = new AR1Basis(0, this.data.length - 1);
    this.rebuildSegmentTrees();
  }

  private rebuildSegmentTrees(): void {
    this.treeNy = new SegmentTree([], this.data.length, (i) => {
      const [ny] = this.data.at(i);
      return { min: ny, max: ny };
    });
    const [, sf0] = this.data.at(0);
    this.treeSf =
      sf0 !== undefined
        ? new SegmentTree([], this.data.length, (i) => {
            const [, sf] = this.data.at(i);
            return { min: sf!, max: sf! };
          })
        : undefined;
  }

  bTemperatureVisible(
    bIndexVisible: AR1Basis,
    tree: SegmentTree<[number, number?]>,
  ): AR1Basis {
    const [minIdxX, maxIdxX] = bIndexVisible.toArr();
    let startIdx = Math.floor(minIdxX);
    let endIdx = Math.ceil(maxIdxX);
    const lastIdx = this.data.length - 1;
    startIdx = Math.min(Math.max(startIdx, 0), lastIdx);
    endIdx = Math.min(Math.max(endIdx, 0), lastIdx);
    if (startIdx > endIdx) {
      [startIdx, endIdx] = [endIdx, startIdx];
    }
    const { min, max } = tree.query(startIdx, endIdx);
    return new AR1Basis(min, max);
  }

  at(index: number): [number, number?] {
    return this.data.at(index);
  }

  get length(): number {
    return this.data.length;
  }

  toArray(): Array<[number, number?]> {
    return this.data.toArray();
  }
}
