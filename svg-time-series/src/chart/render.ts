import type { Selection } from "d3-selection";
import { scaleTime } from "d3-scale";
import type { ScaleTime, ScaleLinear } from "d3-scale";
import type { Line } from "d3-shape";

import { MyAxis, Orientation } from "../axis.ts";
import { updateNode } from "../utils/domNodeTransform.ts";
import type { AR1 } from "../math/affine.ts";
import { AR1Basis, DirectProductBasis, bPlaceholder } from "../math/affine.ts";

import { ViewportTransform } from "../ViewportTransform.ts";
import { AxisManager } from "./axisManager.ts";
import type { AxisModel, AxisRenderState } from "./axisManager.ts";
import type { ChartData } from "./data.ts";
import { createDimensions } from "./render/utils.ts";
import { SeriesRenderer } from "./seriesRenderer.ts";
import { createSeries } from "./series.ts";
import type { ZoomState } from "./zoomState.ts";

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

interface AxisData {
  axis: MyAxis;
  g?: Selection<SVGGElement, unknown, HTMLElement, unknown> | undefined;
}

interface AxisDataX extends AxisData {
  scale: ScaleTime<number, number>;
}

interface Axes {
  x: AxisDataX;
  y: AxisModel[];
}

interface Dimensions {
  width: number;
  height: number;
}

export interface Series {
  axisIdx: number;
  view: SVGGElement;
  path: SVGPathElement;
  line: Line<number[]>;
}

export interface RenderState {
  axisManager: AxisManager;
  axes: Axes;
  axisRenders: AxisRenderState[];
  xTransform: ViewportTransform;
  dimensions: Dimensions;
  series: Series[];
  seriesRenderer: SeriesRenderer;
  refresh: (data: ChartData) => void;
  resize: (dimensions: Dimensions, zoomState: ZoomState) => void;
  destroy: () => void;
}

export function refreshRenderState(state: RenderState, data: ChartData): void {
  const referenceBasis = DirectProductBasis.fromProjections(
    data.bIndexFull,
    bPlaceholder,
  );
  state.xTransform.onReferenceViewWindowResize(referenceBasis);
  const [d0, d1] = state.axes.x.scale.domain();
  const t0 = d0 instanceof Date ? d0.getTime() : Number(d0);
  const t1 = d1 instanceof Date ? d1.getTime() : Number(d1);
  const i0 = data.timeToIndex(t0);
  const i1 = data.timeToIndex(t1);
  const transform: AR1 | ((i: number) => number) = data.indexToTime() as
    | AR1
    | ((i: number) => number);
  const toTime =
    typeof transform === "function"
      ? (i: number) => transform(i)
      : (i: number) => transform.applyToPoint(i);
  state.axes.x.scale.domain([toTime(i0), toTime(i1)]);

  state.axisManager.setData(data);
  state.axisManager.updateScales();

  for (const s of state.series) {
    const t = state.axes.y[s.axisIdx]!.transform;
    updateNode(s.view, t.matrix);
  }
  state.axisRenders.forEach((r) => {
    r.axis.axisUp(r.g);
  });
  state.axes.x.axis.axisUp(state.axes.x.g!);
}

function destroyRenderState(state: RenderState): void {
  for (const s of state.series) {
    s.path.remove();
    s.view.remove();
  }
  state.series.length = 0;

  const axisX = state.axes.x;
  if (axisX.g) {
    axisX.g.remove();
    axisX.g = undefined;
  }

  for (const r of state.axisRenders) {
    r.g.remove();
  }
  state.axisRenders.length = 0;
  state.axes.y.length = 0;
}

function resizeRenderState(
  state: RenderState,
  dimensions: Dimensions,
  zoomState: ZoomState,
): void {
  const { width, height } = dimensions;
  const bScreenXVisible = new AR1Basis(0, width);
  const bScreenYVisible = new AR1Basis(height, 0);
  const bScreenVisible = DirectProductBasis.fromProjections(
    bScreenXVisible,
    bScreenYVisible,
  );

  state.axes.x.scale.range([0, width]);

  zoomState.updateExtents(dimensions);

  state.xTransform.onViewPortResize(bScreenVisible);
  for (const a of state.axes.y) {
    a.transform.onViewPortResize(bScreenVisible);
    a.scale.range([height, 0]);
  }
}

export function setupRender(
  svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>,
  data: ChartData,
): RenderState {
  const screenBasis = createDimensions(svg);
  const width = screenBasis.x().getRange();
  const height = screenBasis.y().getRange();
  const maxAxisIdx = data.seriesAxes.reduce(
    (max, idx) => Math.max(max, idx),
    0,
  );
  const axisCount = maxAxisIdx + 1;

  const [xRange, yRange] = screenBasis.toArr() as [
    [number, number],
    [number, number],
  ];
  const xScale: ScaleTime<number, number> = scaleTime().range(xRange);

  const axisManager = new AxisManager(axisCount, data);
  axisManager.setXAxis(xScale);
  const yAxes = axisManager.axes;
  for (const a of yAxes) {
    a.scale.range(yRange);
  }
  const [iStart, iEnd] = data.bIndexFull.toArr();
  const idxToTime: AR1 | ((i: number) => number) = data.indexToTime() as
    | AR1
    | ((i: number) => number);
  const toTimeFull =
    typeof idxToTime === "function"
      ? (i: number) => idxToTime(i)
      : (i: number) => idxToTime.applyToPoint(i);
  xScale.domain([toTimeFull(iStart), toTimeFull(iEnd)]);
  axisManager.updateScales();

  const referenceBasis = DirectProductBasis.fromProjections(
    data.bIndexFull,
    bPlaceholder,
  );
  for (const a of yAxes) {
    a.transform.onViewPortResize(screenBasis);
    a.transform.onReferenceViewWindowResize(referenceBasis);
  }
  const xTransform = new ViewportTransform();
  xTransform.onViewPortResize(screenBasis);
  xTransform.onReferenceViewWindowResize(referenceBasis);

  const series = createSeries(svg, data.seriesAxes);
  const seriesRenderer = new SeriesRenderer();
  seriesRenderer.series = series;
  const xAxis = new MyAxis(Orientation.Bottom, xScale)
    .ticks(4)
    .setTickSize(height)
    .setTickPadding(8 - height);
  xAxis.setScale(xScale);
  const xAxisGroup = svg.append("g").attr("class", "axis");
  xAxisGroup.call(xAxis.axis.bind(xAxis));

  // Build render state for each Y axis separately from the model.
  const axisRenders: AxisRenderState[] = yAxes.map((a, i) => {
    const orientation = i === 0 ? Orientation.Right : Orientation.Left;
    const axis = createYAxis(orientation, a.scale, width);
    const g = svg.append("g").attr("class", "axis");
    g.call(axis.axis.bind(axis));
    return { axis, g };
  });

  const axes: Axes = {
    x: { axis: xAxis, g: xAxisGroup, scale: xScale },
    y: yAxes,
  };
  const dimensions: Dimensions = { width, height };

  const state = {
    axisManager,
    axes,
    axisRenders,
    xTransform,
    dimensions,
    series,
    seriesRenderer,
  } as RenderState;
  state.refresh = refreshRenderState.bind(null, state);
  state.resize = resizeRenderState.bind(null, state);
  state.destroy = destroyRenderState.bind(null, state);

  return state;
}
