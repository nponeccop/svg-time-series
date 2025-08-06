import { BaseType, Selection, select } from "d3-selection";
import { drawProc } from "../utils/drawProc.ts";
import { fixNaN, updateDot } from "./legendHelpers.ts";
import type { ChartData } from "./data.ts";
import type { RenderState } from "./render.ts";

export class LegendController {
  private legendTime: Selection<BaseType, unknown, HTMLElement, unknown>;
  private legendGreen: Selection<BaseType, unknown, HTMLElement, unknown>;
  private legendBlue: Selection<BaseType, unknown, HTMLElement, unknown>;

  private readonly dotRadius = 3;
  private highlightedGreenDot: SVGCircleElement;
  private highlightedBlueDot: SVGCircleElement | null;

  private identityMatrix = document
    .createElementNS("http://www.w3.org/2000/svg", "svg")
    .createSVGMatrix();

  private highlightedDataIdx = 0;
  private scheduleRefresh: () => void;

  constructor(
    legend: Selection<BaseType, unknown, HTMLElement, unknown>,
    private state: RenderState,
    private data: ChartData,
    private formatTime: (timestamp: number) => string = (timestamp) =>
      new Date(timestamp).toLocaleString(),
  ) {
    this.legendTime = legend.select(".chart-legend__time");
    this.legendGreen = legend.select(".chart-legend__green_value");
    this.legendBlue = legend.select(".chart-legend__blue_value");

    const makeDot = (view: SVGGElement) =>
      select(view)
        .append("circle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", 1)
        .node() as SVGCircleElement;
    this.highlightedGreenDot = makeDot(state.paths.viewNy);
    this.highlightedBlueDot = state.paths.viewSf
      ? makeDot(state.paths.viewSf)
      : null;

    this.scheduleRefresh = drawProc(() => {
      this.update();
    });
  }

  public onHover = (idx: number) => {
    this.highlightedDataIdx = Math.min(
      Math.max(idx, 0),
      this.data.data.length - 1,
    );
    this.scheduleRefresh();
  };

  public refresh = () => {
    this.scheduleRefresh();
  };

  private update() {
    const [greenData, blueData] =
      this.data.data[Math.round(this.highlightedDataIdx)];
    const timestamp = this.data.idxToTime.applyToPoint(this.highlightedDataIdx);
    this.legendTime.text(this.formatTime(timestamp));

    const dotScaleMatrixNy = this.state.transforms.ny.dotScaleMatrix(
      this.dotRadius,
    );
    const dotScaleMatrixSf = this.state.transforms.sf?.dotScaleMatrix(
      this.dotRadius,
    );

    const greenText = fixNaN(greenData, " ");
    const greenVal = fixNaN(greenData, 0);
    this.legendGreen.text(String(greenText));
    updateDot(
      greenVal as number,
      this.highlightedDataIdx,
      this.highlightedGreenDot,
      dotScaleMatrixNy,
      this.identityMatrix,
    );

    if (this.state.transforms.sf) {
      const blueText = fixNaN(blueData as number, " ");
      const blueVal = fixNaN(blueData as number, 0);
      this.legendBlue.text(String(blueText));
      updateDot(
        blueVal,
        this.highlightedDataIdx,
        this.highlightedBlueDot,
        dotScaleMatrixSf,
        this.identityMatrix,
      );
    }
  }

  public destroy = () => {
    this.highlightedGreenDot.remove();
    this.highlightedBlueDot?.remove();
  };
}
