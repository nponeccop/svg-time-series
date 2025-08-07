import { Selection, select } from "d3-selection";
import { drawProc } from "../svg-time-series/src/utils/drawProc.ts";
import { updateNode } from "../svg-time-series/src/utils/domNodeTransform.ts";
import type { ChartData } from "../svg-time-series/src/chart/data.ts";
import type { RenderState } from "../svg-time-series/src/chart/render.ts";
import type { ILegendController } from "../svg-time-series/src/chart/legend.ts";

export class LegendController implements ILegendController {
  private legendTime: Selection<HTMLElement, unknown, HTMLElement, unknown>;
  private legendGreen: Selection<HTMLElement, unknown, HTMLElement, unknown>;
  private legendBlue: Selection<HTMLElement, unknown, HTMLElement, unknown>;

  private readonly dotRadius = 3;
  private highlightedGreenDot: SVGCircleElement;
  private highlightedBlueDot: SVGCircleElement | null;

  private identityMatrix = document
    .createElementNS("http://www.w3.org/2000/svg", "svg")
    .createSVGMatrix();

  private highlightedDataIdx = 0;
  private scheduleRefresh: () => void;
  private cancelRefresh: () => void;

  constructor(
    legend: Selection<HTMLElement, unknown, HTMLElement, unknown>,
    private state: RenderState,
    private data: ChartData,
    private formatTime: (timestamp: number) => string = (timestamp) =>
      new Date(timestamp).toLocaleString(),
  ) {
    this.legendTime = legend.select(".chart-legend__time");
    this.legendGreen = legend.select(".chart-legend__green_value");
    this.legendBlue = legend.select(".chart-legend__blue_value");

    const viewNy = state.paths.viewSeriesA;
    const viewSf = state.paths.viewSeriesB;
    const svg = viewNy.ownerSVGElement!;
    const makeDot = () =>
      select(svg)
        .append("circle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", this.dotRadius)
        .node() as SVGCircleElement;
    this.highlightedGreenDot = makeDot();
    this.highlightedBlueDot = viewSf ? makeDot() : null;

    const { wrapped, cancel } = drawProc(() => {
      this.update();
    });
    this.scheduleRefresh = wrapped;
    this.cancelRefresh = cancel;
  }

  public onHover = (idx: number) => {
    this.highlightedDataIdx = Math.min(Math.max(idx, 0), this.data.length - 1);
    this.scheduleRefresh();
  };

  public refresh = () => {
    this.scheduleRefresh();
  };

  private update() {
    const {
      seriesA: ny,
      seriesB: sf,
      timestamp,
    } = this.data.getPoint(this.highlightedDataIdx);
    this.legendTime.text(this.formatTime(timestamp));

    const fixNaN = <T>(n: number, valueForNaN: T): number | T =>
      isNaN(n) ? valueForNaN : n;
    const screenX = this.state.scales.x(timestamp);
    const yNy = this.state.scales.ySeriesA;
    const ySf = this.state.scales.ySeriesB ?? yNy;
    const updateDot = (
      val: number,
      legendSel: Selection<HTMLElement, unknown, HTMLElement, unknown>,
      node: SVGGraphicsElement | null,
      yScale: (n: number) => number,
    ) => {
      legendSel.text(fixNaN(val, " "));
      if (node) {
        const y = yScale(fixNaN(val, 0) as number);
        const ySafe = isNaN(y) ? 0 : y;
        updateNode(node, this.identityMatrix.translate(screenX, ySafe));
      }
    };

    updateDot(ny, this.legendGreen, this.highlightedGreenDot, yNy);
    if (this.highlightedBlueDot) {
      updateDot(sf as number, this.legendBlue, this.highlightedBlueDot, ySf);
    }
  }

  public destroy = () => {
    this.cancelRefresh();
    this.highlightedGreenDot.remove();
    this.highlightedBlueDot?.remove();
  };
}
