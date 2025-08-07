import {
  AR1,
  AR1Basis,
  DirectProductBasis,
  betweenTBasesAR1,
  bUnit,
} from "../math/affine.ts";
import { SegmentTree } from "segment-tree-rmq";

export interface IMinMax {
  readonly min: number;
  readonly max: number;
}

function buildMinMax(fst: Readonly<IMinMax>, snd: Readonly<IMinMax>): IMinMax {
  return {
    min: Math.min(fst.min, snd.min),
    max: Math.max(fst.max, snd.max),
  } as const;
}

const minMaxIdentity: IMinMax = {
  min: Infinity,
  max: -Infinity,
};

export interface IDataSource {
  readonly startTime: number;
  readonly timeStep: number;
  readonly length: number;
  readonly seriesCount: number;
  getSeries(index: number, seriesIdx: number): number;
}

export class ChartData {
  public data: Array<[number, number?]>;
  public primaryTree!: SegmentTree<IMinMax>;
  public secondaryTree?: SegmentTree<IMinMax>;
  public idxToTime: AR1;
  private idxShift: AR1;
  public bIndexFull: AR1Basis;
  private hasSeriesB: boolean;

  /**
   * Creates a new ChartData instance.
   * @param source Data source; must contain at least one point.
   * @throws if the source has length 0.
   */
  constructor(source: IDataSource) {
    if (source.length === 0) {
      throw new Error("ChartData requires a non-empty data array");
    }
    this.hasSeriesB = source.seriesCount > 1
    if (source.seriesCount !== 1 && source.seriesCount !== 2) {
      throw new Error(
        `ChartData supports 1 or 2 series, but received ${source.seriesCount}`,
      );
    }
    this.hasSf = source.seriesCount > 1;
    this.data = new Array(source.length);
    for (let i = 0; i < source.length; i++) {
      const seriesA = source.getSeries(i, 0);
      const seriesB = this.hasSeriesB ? source.getSeries(i, 1) : undefined;
      this.data[i] = [seriesA, seriesB];
    }
    this.idxToTime = betweenTBasesAR1(
      bUnit,
      new AR1Basis(source.startTime, source.startTime + source.timeStep),
    );
    this.idxShift = betweenTBasesAR1(new AR1Basis(-1, 0), bUnit);
    // bIndexFull represents the full range of data indices and remains constant
    // since append() maintains a sliding window of fixed length
    this.bIndexFull = new AR1Basis(0, this.data.length - 1);
    this.rebuildSegmentTrees();
  }

  append(seriesA: number, seriesB?: number): void {
    if (!this.hasSeriesB && seriesB !== undefined) {
      console.warn(
        "ChartData: seriesB parameter provided but data source has only one series. seriesB value will be ignored.",
      );
    } else if (this.hasSf && sf === undefined) {
      console.warn(
        "ChartData: sf parameter missing but data source has two series. Using NaN as fallback.",
      );
      sf = NaN;
    }
    this.data.push([seriesA, this.hasSeriesB ? seriesB : undefined]);
    this.data.shift();
    this.idxToTime = this.idxShift.composeWith(this.idxToTime);
    this.rebuildSegmentTrees();
  }

  get length(): number {
    return this.data.length;
  }

  getPoint(idx: number): {
    seriesA: number;
    seriesB?: number;
    timestamp: number;
  } {
    const clamped = this.clampIndex(Math.round(idx));
    const [seriesA, seriesB] = this.data[clamped];
    return {
      seriesA,
      seriesB,
      timestamp: this.idxToTime.applyToPoint(clamped),
    };
  }

  private clampIndex(idx: number): number {
    return Math.min(Math.max(idx, 0), this.data.length - 1);
  }

  private rebuildSegmentTrees(): void {
    const seriesAData: IMinMax[] = new Array(this.data.length);
    for (let i = 0; i < this.data.length; i++) {
      const val = this.data[i][0];
      const minVal = isNaN(val) ? Infinity : val;
      const maxVal = isNaN(val) ? -Infinity : val;
      seriesAData[i] = { min: minVal, max: maxVal } as IMinMax;
    }
    this.primaryTree = new SegmentTree(
      seriesAData,
      buildMinMax,
      minMaxIdentity,
    );

    if (this.hasSeriesB) {
      const seriesBData: IMinMax[] = new Array(this.data.length);
      for (let i = 0; i < this.data.length; i++) {
        const val = this.data[i][1]!;
        const minVal = isNaN(val) ? Infinity : val;
        const maxVal = isNaN(val) ? -Infinity : val;
        seriesBData[i] = { min: minVal, max: maxVal } as IMinMax;
      }
      this.secondaryTree = new SegmentTree(
        seriesBData,
        buildMinMax,
        minMaxIdentity,
      );
    } else {
      this.secondaryTree = undefined;
    }
  }

  bTemperatureVisible(
    bIndexVisible: AR1Basis,
    tree: SegmentTree<IMinMax>,
  ): AR1Basis {
    const [minIdxX, maxIdxX] = bIndexVisible.toArr();
    let startIdx = Math.floor(minIdxX);
    let endIdx = Math.ceil(maxIdxX);
    startIdx = this.clampIndex(startIdx);
    endIdx = this.clampIndex(endIdx);
    if (startIdx > endIdx) {
      [startIdx, endIdx] = [endIdx, startIdx];
    }
    const { min, max } = tree.query(startIdx, endIdx);
    return new AR1Basis(min, max);
  }

  combinedTemperatureDp(bIndexVisible: AR1Basis): {
    combined: AR1Basis;
    dp: DirectProductBasis;
  } {
    if (!this.secondaryTree) {
      throw new Error("Second series data is unavailable");
    }
    const bSeriesA = this.bTemperatureVisible(bIndexVisible, this.primaryTree);
    const bSeriesB = this.bTemperatureVisible(
      bIndexVisible,
      this.secondaryTree,
    );
    const [seriesAMin, seriesAMax] = bSeriesA.toArr();
    const [seriesBMin, seriesBMax] = bSeriesB.toArr();
    const combined = new AR1Basis(
      Math.min(seriesAMin, seriesBMin),
      Math.max(seriesAMax, seriesBMax),
    );
    const dp = DirectProductBasis.fromProjections(this.bIndexFull, combined);
    return { combined, dp };
  }
}
