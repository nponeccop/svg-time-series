import { Selection } from "d3-selection";
import type { ScaleLinear } from "d3-scale";
import type { Line } from "d3-shape";

import { MyAxis, Orientation } from "../axis.ts";
import { ViewportTransform } from "../ViewportTransform.ts";
import { updateNode } from "../utils/domNodeTransform.ts";
import { AR1Basis, DirectProductBasis, bPlaceholder } from "../math/affine.ts";
import type { ChartData, IMinMax } from "./data.ts";
import type { SegmentTree } from "segment-tree-rmq";
import {
  createDimensions,
  createScales,
  updateScaleX,
  initPaths,
  lineNy,
  lineSf,
  type ScaleSet,
  type PathSet,
} from "./render/utils.ts";

function createYAxis(
  orientation: Orientation,
  scale: ScaleLinear<number, number>,
  width: number,
): MyAxis {
  const axis = new MyAxis(orientation, scale)
    .ticks(4, "s")
    .setTickSize(width)
    .setTickPadding(2 - width);

  axis.setScale(scale);
  return axis;
}

function setupAxes(
  svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>,
  scales: ScaleSet,
  width: number,
  height: number,
  hasSf: boolean,
  dualYAxis: boolean,
): AxisSet {
  const xAxis = new MyAxis(Orientation.Bottom, scales.x)
    .ticks(4)
    .setTickSize(height)
    .setTickPadding(8 - height);

  xAxis.setScale(scales.x);
  const gX = svg.append("g").attr("class", "axis").call(xAxis.axis.bind(xAxis));

  const yRight = createYAxis(Orientation.Right, scales.y[0], width);
  const gYRight = svg
    .append("g")
    .attr("class", "axis")
    .call(yRight.axis.bind(yRight));

  const yAxes: AxisData[] = [{ axis: yRight, g: gYRight }];

  if (hasSf && dualYAxis && scales.y[1]) {
    const yLeft = createYAxis(Orientation.Left, scales.y[1], width);
    const gYLeft = svg
      .append("g")
      .attr("class", "axis")
      .call(yLeft.axis.bind(yLeft));

    yAxes.push({ axis: yLeft, g: gYLeft });
  }

  return { x: { axis: xAxis, g: gX }, y: yAxes };
}

interface AxisData {
  axis: MyAxis;
  g: Selection<SVGGElement, unknown, HTMLElement, unknown>;
}

interface AxisSet {
  x: AxisData;
  y: AxisData[];
}

interface Dimensions {
  width: number;
  height: number;
}

export interface AxisState {
  tree?: SegmentTree<IMinMax>;
  scale: ScaleLinear<number, number>;
  axis: MyAxis;
  gAxis: Selection<SVGGElement, unknown, HTMLElement, unknown>;
  transform: ViewportTransform;
}

export interface Series {
  view?: SVGGElement;
  path?: SVGPathElement;
  line: Line<number[]>;
  axisIdx: number;
}

export function buildSeries(data: ChartData, paths: PathSet): Series[] {
  const pathNodes = paths.path.nodes() as SVGPathElement[];
  const views = paths.nodes;
  const series: Series[] = [];
  for (let i = 0; i < data.seriesCount; i++) {
    const axisIdx = data.seriesAxes[i];
    const path = pathNodes[i];
    const view = views[i];
    if (path && view) {
      series.push({
        view,
        path,
        line: axisIdx === 1 ? lineSf : lineNy,
        axisIdx,
      });
    }
  }
  return series;
}

export interface RenderState {
  scales: ScaleSet;
  axes: AxisSet;
  paths: PathSet;
  transforms: ViewportTransform[];
  axisStates: AxisState[];
  bScreenXVisible: AR1Basis;
  dimensions: Dimensions;
  dualYAxis: boolean;
  series: Series[];
  refresh: (data: ChartData) => void;
}

function updateYScales(axes: AxisState[], bIndex: AR1Basis, data: ChartData) {
  if (axes.length > 1 && axes[0].scale === axes[1].scale && data.treeAxis1) {
    const { combined, dp } = data.combinedAxisDp(bIndex);
    for (const a of axes) {
      a.transform.onReferenceViewWindowResize(dp);
      a.scale.domain(combined.toArr());
    }
  } else {
    for (const a of axes) {
      if (a.tree) {
        const dp = data.updateScaleY(bIndex, a.tree);
        a.transform.onReferenceViewWindowResize(dp);
        a.scale.domain(dp.y().toArr());
      }
    }
  }
}

export function setupRender(
  svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>,
  data: ChartData,
  dualYAxis: boolean,
): RenderState {
  const hasSf = data.treeAxis1 != null;

  const seriesCount = data.seriesCount;

  const bScreenVisibleDp = createDimensions(svg);
  const bScreenXVisible = bScreenVisibleDp.x();
  const bScreenYVisible = bScreenVisibleDp.y();
  const width = bScreenXVisible.getRange();
  const height = bScreenYVisible.getRange();
  const paths = initPaths(svg, seriesCount);
  const axisCount = hasSf && dualYAxis ? 2 : 1;
  const scales = createScales(bScreenVisibleDp, axisCount);
  const transformsInner = Array.from(
    { length: axisCount },
    () => new ViewportTransform(),
  );

  updateScaleX(scales.x, data.bIndexFull, data);
  const axes = setupAxes(svg, scales, width, height, hasSf, dualYAxis);

  const axisStates: AxisState[] = [
    {
      tree: data.treeAxis0,
      scale: scales.y[0],
      axis: axes.y[0].axis,
      gAxis: axes.y[0].g,
      transform: transformsInner[0],
    },
  ];

  if (hasSf && data.treeAxis1) {
    const idx = axisCount > 1 ? 1 : 0;
    axisStates[1] = {
      tree: data.treeAxis1,
      scale: scales.y[idx],
      axis: axes.y[idx].axis,
      gAxis: axes.y[idx].g,
      transform: transformsInner[idx],
    };
  }

  const series = buildSeries(data, paths);

  updateYScales(axisStates, data.bIndexFull, data);

  const refDp = DirectProductBasis.fromProjections(
    data.bIndexFull,
    bPlaceholder,
  );
  for (const t of transformsInner) {
    t.onViewPortResize(bScreenVisibleDp);
    t.onReferenceViewWindowResize(refDp);
  }

  const dimensions: Dimensions = { width, height };

  const state: RenderState = {
    scales,
    axes,
    paths,
    transforms: transformsInner,
    axisStates,
    bScreenXVisible,
    dimensions,
    dualYAxis,
    series,
    refresh(this: RenderState, data: ChartData) {
      const bIndexVisible =
        this.axisStates[0].transform.fromScreenToModelBasisX(
          this.bScreenXVisible,
        );
      updateScaleX(this.scales.x, bIndexVisible, data);

      this.axisStates[0].tree = data.treeAxis0;
      if (this.axisStates[1]) {
        this.axisStates[1].tree = data.treeAxis1;
      }

      updateYScales(this.axisStates, bIndexVisible, data);

      for (const s of this.series) {
        if (s.view) {
          const axis = this.axisStates[s.axisIdx] ?? this.axisStates[0];
          updateNode(s.view, axis.transform.matrix);
        }
      }
      for (const a of this.axisStates) {
        a.axis.axisUp(a.gAxis);
      }
      this.axes.x.axis.axisUp(this.axes.x.g);
    },
  };

  return state;
}
