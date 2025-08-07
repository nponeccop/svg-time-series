import { Selection } from "d3-selection";
import { line } from "d3-shape";
import { ScaleLinear, ScaleTime, scaleLinear, scaleTime } from "d3-scale";
import { AR1Basis, DirectProductBasis } from "../../math/affine.ts";
import { SegmentTree } from "segment-tree-rmq";
import { ViewportTransform } from "../../ViewportTransform.ts";
import type { IMinMax } from "../data.ts";
import type { ChartData } from "../data.ts";
import type { RenderState } from "../render.ts";

const lineSeriesA = line<[number, number?]>()
  .defined((d) => !(isNaN(d[0]!) || d[0] == null))
  .x((_, i) => i)
  .y((d) => d[0]!);

const lineSeriesB = line<[number, number?]>()
  .defined((d) => !(isNaN(d[1]!) || d[1] == null))
  .x((_, i) => i)
  .y((d) => d[1]!);

const lineGenerators = {
  seriesA: lineSeriesA,
  seriesB: lineSeriesB,
} as const;

export function createDimensions(
  svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>,
) {
  const node: SVGSVGElement = svg.node() as SVGSVGElement;
  const div: HTMLElement = node.parentNode as HTMLElement;

  const width = div.clientWidth;
  const height = div.clientHeight;

  svg.attr("width", width);
  svg.attr("height", height);

  const bScreenXVisible = new AR1Basis(0, width);
  const bScreenYVisible = new AR1Basis(height, 0);

  return { width, height, bScreenXVisible, bScreenYVisible };
}

export interface ScaleSet {
  x: ScaleTime<number, number>;
  ySeriesA: ScaleLinear<number, number>;
  ySeriesB?: ScaleLinear<number, number>;
}

export function createScales(
  bScreenXVisible: AR1Basis,
  bScreenYVisible: AR1Basis,
  dualAxis: boolean,
): ScaleSet {
  const x: ScaleTime<number, number> = scaleTime().range(
    bScreenXVisible.toArr(),
  );
  const ySeriesA: ScaleLinear<number, number> = scaleLinear().range(
    bScreenYVisible.toArr(),
  );
  let ySeriesB: ScaleLinear<number, number> | undefined;
  if (dualAxis) {
    ySeriesB = scaleLinear().range(bScreenYVisible.toArr());
  }
  return { x, ySeriesA, ySeriesB };
}

export function updateScaleX(
  x: ScaleTime<number, number>,
  bIndexVisible: AR1Basis,
  data: ChartData,
) {
  const bTimeVisible = bIndexVisible.transformWith(data.idxToTime);
  x.domain(bTimeVisible.toArr());
}

export function updateScaleY(
  bIndexVisible: AR1Basis,
  tree: SegmentTree<IMinMax>,
  pathTransform: ViewportTransform,
  yScale: ScaleLinear<number, number>,
  data: ChartData,
) {
  const bTemperatureVisible = data.bTemperatureVisible(bIndexVisible, tree);
  pathTransform.onReferenceViewWindowResize(
    DirectProductBasis.fromProjections(data.bIndexFull, bTemperatureVisible),
  );
  yScale.domain(bTemperatureVisible.toArr());
}

export interface PathSet {
  path: Selection<SVGPathElement, number, SVGGElement, unknown>;
  viewSeriesA: SVGGElement;
  viewSeriesB?: SVGGElement;
}

export interface TransformPair {
  seriesA: ViewportTransform;
  seriesB?: ViewportTransform;
}

export function initPaths(
  svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>,
  hasSeriesB: boolean,
): PathSet {
  const views = svg
    .selectAll("g")
    .data(hasSeriesB ? [0, 1] : [0])
    .enter()
    .append("g")
    .attr("class", "view");
  const nodes = views.nodes() as SVGGElement[];
  const viewSeriesA = nodes[0];
  const viewSeriesB = hasSeriesB ? nodes[1] : undefined;
  const path = views.append("path");
  return { path, viewSeriesA, viewSeriesB };
}

export function renderPaths(
  state: RenderState,
  dataArr: Array<[number, number?]>,
) {
  const paths = state.paths.path.nodes() as SVGPathElement[];
  const pathMap: Record<
    keyof typeof lineGenerators,
    SVGPathElement | undefined
  > = {
    seriesA: paths[0],
    seriesB: paths[1],
  };

  for (const [seriesKey, generator] of Object.entries(lineGenerators)) {
    const path = pathMap[seriesKey as keyof typeof lineGenerators];
    if (path) {
      path.setAttribute("d", generator(dataArr) ?? "");
    }
  }
}
