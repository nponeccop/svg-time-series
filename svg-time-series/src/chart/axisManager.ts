import { Selection } from "d3-selection";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import { SegmentTree } from "segment-tree-rmq";
import { AR1Basis, DirectProductBasis } from "../math/affine.ts";
import { ViewportTransform } from "../ViewportTransform.ts";
import type { ChartData, IMinMax } from "./data.ts";
import { MyAxis } from "../axis.ts";

interface DomainState {
  min: number;
  max: number;
  transform: ViewportTransform;
  scale: ScaleLinear<number, number>;
}

export interface AxisState {
  transform: ViewportTransform;
  scale: ScaleLinear<number, number>;
  tree: SegmentTree<IMinMax>;
  axis?: MyAxis;
  g?: Selection<SVGGElement, unknown, HTMLElement, unknown>;
}

const minMaxIdentity: IMinMax = { min: Infinity, max: -Infinity };

function buildMinMax(fst: Readonly<IMinMax>, snd: Readonly<IMinMax>): IMinMax {
  return { min: Math.min(fst.min, snd.min), max: Math.max(fst.max, snd.max) };
}

export class AxisManager {
  public axes: AxisState[] = [];

  constructor(private readonly yRange: readonly [number, number]) {}

  private buildAxisMinMax(
    data: ChartData,
    axis: number,
  ): Array<IMinMax | undefined> {
    const idxs = data.seriesByAxis[axis] ?? [];
    return data.data.map((row) => {
      let min = Infinity;
      let max = -Infinity;
      for (const j of idxs) {
        const val = row[j];
        if (Number.isFinite(val)) {
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
      return min !== Infinity ? ({ min, max } as IMinMax) : undefined;
    });
  }

  private buildAxisTree(data: ChartData, axis: number): SegmentTree<IMinMax> {
    const arr = Array.from(
      this.buildAxisMinMax(data, axis),
      (v) => v ?? minMaxIdentity,
    );
    return new SegmentTree(arr, buildMinMax, minMaxIdentity);
  }

  create(treeCount: number, data: ChartData): AxisState[] {
    this.axes = Array.from({ length: treeCount }, (_, i) => ({
      transform: new ViewportTransform(),
      scale: scaleLinear<number, number>().range(
        this.yRange as [number, number],
      ),
      tree: this.buildAxisTree(data, i),
    }));
    return this.axes;
  }

  updateScales(bIndexVisible: AR1Basis, data: ChartData): void {
    const domains: DomainState[] = this.axes.map((a) => ({
      min: Infinity,
      max: -Infinity,
      transform: a.transform,
      scale: a.scale,
    }));

    const axisIndices: number[] = [];
    for (const idx of data.seriesAxes) {
      if (!axisIndices.includes(idx)) {
        axisIndices.push(idx);
      }
    }

    for (const i of axisIndices) {
      const tree = this.buildAxisTree(data, i);
      if (i < this.axes.length) {
        this.axes[i].tree = tree;
      }
      const targetIdx = i < this.axes.length ? i : this.axes.length - 1;
      const dp = data.updateScaleY(bIndexVisible, tree);
      const [min, max] = dp.y().toArr();
      const domain = domains[targetIdx];
      domain.min = Math.min(domain.min, min);
      domain.max = Math.max(domain.max, max);
    }

    for (const { min, max, transform, scale } of domains) {
      const b = new AR1Basis(min, max);
      const dp = DirectProductBasis.fromProjections(data.bIndexFull, b);
      transform.onReferenceViewWindowResize(dp);
      scale.domain([min, max]);
    }
  }
}
