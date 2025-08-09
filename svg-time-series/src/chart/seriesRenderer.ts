import { Selection } from "d3-selection";
import { line, type Line } from "d3-shape";

export interface Series {
  axisIdx: number;
  view?: SVGGElement;
  path?: SVGPathElement;
  line: Line<number[]>;
}

interface SeriesNode {
  view: SVGGElement;
  path: SVGPathElement;
}

export class SeriesRenderer {
  private series: Series[] = [];

  public init(
    svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>,
    seriesCount: number,
    seriesAxes: readonly number[],
  ): Series[] {
    this.series = [];
    for (let i = 0; i < seriesCount; i++) {
      const { view, path } = this.initSeriesNode(svg);
      const axisIdx = seriesAxes[i] ?? 0;
      this.series.push({ axisIdx, view, path, line: this.createLine(i) });
    }
    return this.series;
  }

  public draw(dataArr: number[][]) {
    for (const s of this.series) {
      if (s.path) {
        s.path.setAttribute("d", s.line(dataArr) ?? "");
      }
    }
  }

  private createLine(seriesIdx: number): Line<number[]> {
    return line<number[]>()
      .defined((d) => !(isNaN(d[seriesIdx]) || d[seriesIdx] == null))
      .x((_, i) => i)
      .y((d) => d[seriesIdx] as number);
  }

  private initSeriesNode(
    svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>,
  ): SeriesNode {
    const view = svg.append("g").attr("class", "view");
    const path = view.append<SVGPathElement>("path").node() as SVGPathElement;
    return { view: view.node() as SVGGElement, path };
  }

  public getSeries(): Series[] {
    return this.series;
  }
}
