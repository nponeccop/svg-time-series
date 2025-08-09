import { Selection } from "d3-selection";
import { scaleTime, type ScaleTime, type ScaleLinear } from "d3-scale";
import type { Line } from "d3-shape";

import { MyAxis, Orientation } from "../axis.ts";
import { updateNode } from "../utils/domNodeTransform.ts";
import { AR1Basis, DirectProductBasis, bPlaceholder } from "../math/affine.ts";
import type { ChartData } from "./data.ts";
import { AxisManager, type AxisState } from "./axisManager.ts";
import {
  createDimensions,
  updateScaleX,
  initSeriesNode,
  createLine,
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
  xScale: ScaleTime<number, number>,
  axes: AxisState[],
  width: number,
  height: number,
): AxisDataX {
  const xAxis = new MyAxis(Orientation.Bottom, xScale)
    .ticks(4)
    .setTickSize(height)
    .setTickPadding(8 - height);

  xAxis.setScale(xScale);
  const gX = svg.append("g").attr("class", "axis").call(xAxis.axis.bind(xAxis));

  axes.forEach((a, i) => {
    const orientation = i === 0 ? Orientation.Right : Orientation.Left;
    a.g = svg
      .append("g")
      .attr("class", "axis")
      .call(
        (a.axis = createYAxis(orientation, a.scale, width)).axis.bind(a.axis),
      );
  });

  return { axis: xAxis, g: gX, scale: xScale };
}

interface AxisData {
  axis: MyAxis;
  g: Selection<SVGGElement, unknown, HTMLElement, unknown>;
}

interface AxisDataX extends AxisData {
  scale: ScaleTime<number, number>;
}

interface Axes {
  x: AxisDataX;
  y: AxisState[];
}

interface Dimensions {
  width: number;
  height: number;
}

export interface Series {
  axisIdx: number;
  view?: SVGGElement;
  path?: SVGPathElement;
  line: Line<number[]>;
}

export interface RenderState {
  axes: Axes;
  bScreenXVisible: AR1Basis;
  dimensions: Dimensions;
  series: Series[];
  refresh: (data: ChartData) => void;
}

export function setupRender(
  svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>,
  data: ChartData,
  dualYAxis: boolean,
): RenderState {
  const seriesCount = data.seriesCount;

  const bScreenVisibleDp = createDimensions(svg);
  const bScreenXVisible = bScreenVisibleDp.x();
  const width = bScreenXVisible.getRange();
  const height = bScreenVisibleDp.y().getRange();
  const axisCount = dualYAxis && data.seriesAxes.includes(1) ? 2 : 1;

  const [xRange, yRange] = bScreenVisibleDp.toArr();
  const xScale: ScaleTime<number, number> = scaleTime().range(xRange);
  updateScaleX(xScale, data.bIndexFull, data);

  const axisManager = new AxisManager(yRange as [number, number]);
  const axesY = axisManager.create(axisCount, data);
  axisManager.updateScales(data.bIndexFull, data);

  const xAxisData = setupAxes(svg, xScale, axesY, width, height);

  const refDp = DirectProductBasis.fromProjections(
    data.bIndexFull,
    bPlaceholder,
  );
  for (const a of axesY) {
    a.transform.onViewPortResize(bScreenVisibleDp);
    a.transform.onReferenceViewWindowResize(refDp);
  }

  const series: Series[] = [];
  for (let i = 0; i < seriesCount; i++) {
    const { view, path } = initSeriesNode(svg);
    const axisIdx = data.seriesAxes[i] ?? 0;
    series.push({ axisIdx, view, path, line: createLine(i) });
  }

  const axes: Axes = { x: xAxisData, y: axesY };
  const dimensions: Dimensions = { width, height };

  const state: RenderState = {
    axes,
    bScreenXVisible,
    dimensions,
    series,
    refresh(this: RenderState, data: ChartData) {
      const bIndexVisible = this.axes.y[0].transform.fromScreenToModelBasisX(
        this.bScreenXVisible,
      );
      updateScaleX(this.axes.x.scale, bIndexVisible, data);

      axisManager.updateScales(bIndexVisible, data);

      for (const s of this.series) {
        if (s.view) {
          const t =
            this.axes.y[s.axisIdx]?.transform ?? this.axes.y[0].transform;
          updateNode(s.view, t.matrix);
        }
      }
      for (const a of this.axes.y) {
        if (a.axis && a.g) {
          a.axis.axisUp(a.g);
        }
      }
      this.axes.x.axis.axisUp(this.axes.x.g);
    },
  };

  return state;
}
