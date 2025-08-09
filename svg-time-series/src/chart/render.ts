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
  createLine,
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
    const path = pathNodes[i];
    const view = views[i];
    if (!path || !view) continue;
    series.push({
      view,
      path,
      line: createLine(i),
      axisIdx: data.seriesAxes[i] ?? 0,
    });
  }

  return series;
}

export interface RenderState {
  scales: ScaleSet;
  axes: AxisSet;
  paths: PathSet;
  transforms: ViewportTransform[];
  bScreenXVisible: AR1Basis;
  dimensions: Dimensions;
  dualYAxis: boolean;
  series: Series[];
  axisStates: AxisState[];
  refresh: (data: ChartData) => void;
}

function updateYScales(axes: AxisState[], bIndex: AR1Basis, data: ChartData) {
  if (axes.length > 1 && axes[0].scale === axes[1].scale && data.treeAxis1) {
    const { combined, dp } = data.combinedAxisDp(bIndex);
    for (const a of axes) {
      a.transform.onReferenceViewWindowResize(dp);
      a.scale.domain(combined.toArr());
    }
  } else if (axes.length === 1 && data.treeAxis1) {
    const { combined, dp } = data.combinedAxisDp(bIndex);
    const a = axes[0];
    a.transform.onReferenceViewWindowResize(dp);
    a.scale.domain(combined.toArr());
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
  const series = buildSeries(data, paths);
  if (axisCount === 1) {
    series.forEach((s) => (s.axisIdx = 0));
  }

  const axisStates: AxisState[] = Array.from({ length: axisCount }, (_, i) => ({
    tree: data.getTree(i),
    scale: scales.y[i],
    axis: null as unknown as MyAxis,
    gAxis: null as unknown as Selection<
      SVGGElement,
      unknown,
      HTMLElement,
      unknown
    >,
    transform: transformsInner[i],
  }));

  updateYScales(axisStates, data.bIndexFull, data);

  const axes = setupAxes(svg, scales, width, height, hasSf, dualYAxis);

  axisStates.forEach((a, i) => {
    const axisData = axes.y[i] ?? axes.y[0];
    a.axis = axisData.axis;
    a.gAxis = axisData.g;
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
    axes,
    paths,
    transforms: transformsInner,
    bScreenXVisible,
    dimensions,
    dualYAxis,
    series,
    axisStates,
    refresh(this: RenderState, data: ChartData) {
      const bIndexVisible =
        this.axisStates[0].transform.fromScreenToModelBasisX(
          this.bScreenXVisible,
        );
      updateScaleX(this.scales.x, bIndexVisible, data);

      // Update axis trees in case data has changed
      this.axisStates.forEach((a, i) => {
        a.tree = data.getTree(i);
      });

      updateYScales(this.axisStates, bIndexVisible, data);

      for (const s of this.series) {
        const axis = this.axisStates[s.axisIdx];
        if (s.view) {
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
