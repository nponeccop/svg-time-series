import { BaseType, Selection } from "d3-selection";

import { SegmentTree } from "segment-tree-rmq";
import type {
  IMinMax,
  TimePoint,
} from "../../../svg-time-series/src/chart/data.ts";
import { animateBench, animateCosDown } from "../bench.ts";
import { ViewWindowTransform } from "../../ViewWindowTransform.ts";

function buildSegmentTreeTuple(index: number, elements: TimePoint[]): IMinMax {
  const ny = elements[index].ny;
  const sf = elements[index].sf!;
  const nyMinValue = isNaN(ny) ? Infinity : ny;
  const nyMaxValue = isNaN(ny) ? -Infinity : ny;
  const sfMinValue = isNaN(sf) ? Infinity : sf;
  const sfMaxValue = isNaN(sf) ? -Infinity : sf;
  return {
    min: Math.min(nyMinValue, sfMinValue),
    max: Math.max(nyMaxValue, sfMaxValue),
  };
}

function buildMinMax(a: IMinMax, b: IMinMax): IMinMax {
  return { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) };
}

const minMaxIdentity: IMinMax = { min: Infinity, max: -Infinity };

function createSegmentTree(
  elements: TimePoint[],
  size: number,
): SegmentTree<IMinMax> {
  const data: IMinMax[] = new Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = buildSegmentTreeTuple(i, elements);
  }
  return new SegmentTree(data, buildMinMax, minMaxIdentity);
}

export class TimeSeriesChart {
  constructor(
    svg: Selection<BaseType, {}, HTMLElement, any>,
    data: TimePoint[],
  ) {
    const node: SVGSVGElement = svg.node() as SVGSVGElement;
    const div: HTMLElement = node.parentNode as HTMLElement;
    const viewNode: SVGGElement = svg.select("g").node() as SVGGElement;

    const dataLength = data.length;
    const tree = createSegmentTree(data, dataLength);

    const t = new ViewWindowTransform(viewNode.transform.baseVal);
    t.setViewPort(div.clientWidth, div.clientHeight);

    animateBench((elapsed: number) => {
      const minX = animateCosDown(dataLength / 2, 0, elapsed);
      const maxX = minX + dataLength / 2;
      const { min, max } = tree.query(minX, maxX);
      t.setViewWindow(minX, maxX, min, max);
    });
  }
}
