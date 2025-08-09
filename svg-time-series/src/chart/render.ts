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

interface AxisState {
  tree?: SegmentTree<IMinMax>;
  transform: ViewportTransform;
  scale: ScaleLinear<number, number>;
  axis?: MyAxis;
  gAxis?: Selection<SVGGElement, unknown, HTMLElement, unknown>;
}

interface AxisSet {
  x: AxisData;
  y: AxisData[];
}

interface Dimensions {
  width: number;
  height: number;
}

export interface Series {
  axisIdx: number;
  tree?: SegmentTree<IMinMax>;
  transform: ViewportTransform;
  scale: ScaleLinear<number, number>;
  view?: SVGGElement;
  path?: SVGPathElement;
  axis?: MyAxis;
  gAxis?: Selection<SVGGElement, unknown, HTMLElement, unknown>;
  line: Line<number[]>;
}

export function buildSeries(
  data: ChartData,
  transforms: ViewportTransform[],
  scales: ScaleSet,
  paths: PathSet,
  hasSf: boolean,
  axes?: AxisSet,
): Series[] {
  const pathNodes = paths.path.nodes() as SVGPathElement[];
  const views = paths.nodes;
  const series: Series[] = [];
  for (let i = 0; i < data.seriesCount; i++) {
    if (!pathNodes[i] || !views[i]) {
      continue;
    }
    const axisIdx = data.seriesAxes[i] ?? 0;
    const tree = axisIdx === 0 ? data.treeAxis0 : data.treeAxis1;
    const transform = transforms[axisIdx] ?? transforms[0];
    const scale = scales.y[axisIdx] ?? scales.y[0];
    const axisData = axes?.y?.[axisIdx] ?? axes?.y?.[0];
    const line = i === 0 ? lineNy : lineSf;
    series.push({
      axisIdx,
      tree,
      transform,
      scale,
      view: views[i],
      path: pathNodes[i],
      axis: axisData?.axis,
      gAxis: axisData?.g,
      line,
    });
  }

  return series;
}

export interface RenderState {
  scales: ScaleSet;
  axes: { x: AxisData; y: AxisState[] };
  paths: PathSet;
  transforms: ViewportTransform[];
  bScreenXVisible: AR1Basis;
  dimensions: Dimensions;
  dualYAxis: boolean;
  series: Series[];
  refresh: (data: ChartData) => void;
}

function updateYScales(axes: AxisState[], bIndex: AR1Basis, data: ChartData) {
  for (const a of axes) {
    if (a.tree) {
      const dp = data.updateScaleY(bIndex, a.tree);
      a.transform.onReferenceViewWindowResize(dp);
      a.scale.domain(dp.y().toArr());
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
  const series = buildSeries(data, transformsInner, scales, paths, hasSf);

  const axesState: AxisState[] = [
    {
      tree: data.treeAxis0,
      transform: transformsInner[0],
      scale: scales.y[0],
    },
  ];

  if (axisCount > 1 && data.treeAxis1 && transformsInner[1] && scales.y[1]) {
    axesState.push({
      tree: data.treeAxis1,
      transform: transformsInner[1],
      scale: scales.y[1],
    });
  }

  updateYScales(axesState, data.bIndexFull, data);

  const axes = setupAxes(svg, scales, width, height, hasSf, dualYAxis);

  axesState.forEach((a, i) => {
    const axisData = axes.y[i] ?? axes.y[0];
    a.axis = axisData.axis;
    a.gAxis = axisData.g;
  });

  series.forEach((s) => {
    const axis = axesState[s.axisIdx] ?? axesState[0];
    s.axis = axis.axis;
    s.gAxis = axis.gAxis;
    s.tree = axis.tree;
    s.transform = axis.transform;
    s.scale = axis.scale;
  });

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
    axes: { x: axes.x, y: axesState },
    paths,
    transforms: transformsInner,
    bScreenXVisible,
    dimensions,
    dualYAxis,
    series,
    refresh(this: RenderState, data: ChartData) {
      const bIndexVisible = this.transforms[0].fromScreenToModelBasisX(
        this.bScreenXVisible,
      );
      updateScaleX(this.scales.x, bIndexVisible, data);

      const axes = this.axes.y;
      if (axes[0]) axes[0].tree = data.treeAxis0;
      if (axes[1]) axes[1].tree = data.treeAxis1;

      updateYScales(axes, bIndexVisible, data);

      for (const s of this.series) {
        const axis = axes[s.axisIdx] ?? axes[0];
        s.tree = axis.tree;
        s.transform = axis.transform;
        s.scale = axis.scale;
        if (s.view) {
          updateNode(s.view, axis.transform.matrix);
        }
      }

      for (const a of axes) {
        if (a.axis && a.gAxis) {
          a.axis.axisUp(a.gAxis);
        }
      }
      this.axes.x.axis.axisUp(this.axes.x.g);
    },
  };

  return state;
}
