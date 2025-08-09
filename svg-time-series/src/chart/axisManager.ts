import { scaleLinear, type ScaleLinear } from "d3-scale";
import { Selection } from "d3-selection";
import { SegmentTree } from "segment-tree-rmq";

import type { ChartData, IMinMax } from "./data.ts";
import { ViewportTransform } from "../ViewportTransform.ts";
import { AR1Basis, DirectProductBasis } from "../math/affine.ts";
import type { MyAxis } from "../axis.ts";

interface DomainInfo {
  min: number;
  max: number;
  transform: ViewportTransform;
  scale: ScaleLinear<number, number>;
}

function buildMinMax(fst: Readonly<IMinMax>, snd: Readonly<IMinMax>): IMinMax {
  return {
    min: Math.min(fst.min, snd.min),
    max: Math.max(fst.max, snd.max),
  } as const;
}

const minMaxIdentity: IMinMax = { min: Infinity, max: -Infinity };

export function buildAxisTree(
  data: ChartData,
  axis: number,
): SegmentTree<IMinMax> {
  const idxs = data.seriesByAxis[axis] ?? [];
  const arr = data.data.map((row) => {
    let min = Infinity;
    let max = -Infinity;
    for (const j of idxs) {
      const val = row[j];
      if (Number.isFinite(val)) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
    return min !== Infinity ? ({ min, max } as IMinMax) : minMaxIdentity;
  });
  return new SegmentTree(arr, buildMinMax, minMaxIdentity);
}

export interface AxisState {
  transform: ViewportTransform;
  scale: ScaleLinear<number, number>;
  tree: SegmentTree<IMinMax>;
  axis?: MyAxis;
  g?: Selection<SVGGElement, unknown, HTMLElement, unknown>;
}

export class AxisManager {
  readonly axes: AxisState[] = [];
  constructor(
    private readonly yRange: readonly [number, number],
    private data: ChartData,
  ) {}

  create(treeCount: number): AxisState[] {
    this.axes.length = 0;
    for (let i = 0; i < treeCount; i++) {
      this.axes.push({
        transform: new ViewportTransform(),
        scale: scaleLinear<number, number>().range(this.yRange),
        tree: buildAxisTree(this.data, i),
      });
    }
    return this.axes;
  }

  updateScales(bIndexVisible: AR1Basis, data: ChartData): void {
    this.data = data;
    const domains: DomainInfo[] = this.axes.map((a) => ({
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
      const tree = buildAxisTree(data, i);
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
