import type { Selection } from "d3-selection";
import { brush } from "d3-brush";
import type { BrushBehavior, D3BrushEvent } from "d3-brush";
import type { D3ZoomEvent } from "d3-zoom";
import { zoomIdentity } from "d3-zoom";

import { ChartData } from "./chart/data.ts";
import type { IDataSource } from "./chart/data.ts";
import { setupRender } from "./chart/render.ts";
import type { RenderState } from "./chart/render.ts";
import type { ILegendController, LegendContext } from "./chart/legend.ts";
import { ZoomState } from "./chart/zoomState.ts";
import type { IZoomStateOptions } from "./chart/zoomState.ts";

export type { IMinMax, IDataSource } from "./chart/data.ts";
export type { ILegendController } from "./chart/legend.ts";
export type { IZoomStateOptions } from "./chart/zoomState.ts";

export interface IPublicInteraction {
  zoom: (event: D3ZoomEvent<SVGRectElement, unknown>) => void;
  onHover: (x: number) => void;
  resetZoom: () => void;
  setScaleExtent: (extent: [number, number]) => void;
  enableBrush: () => void;
  disableBrush: () => void;
  getSelectedTimeWindow: () => [number, number] | null;
}

export class TimeSeriesChart {
  private svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
  private data: ChartData;
  private state: RenderState;
  private zoomArea: Selection<SVGRectElement, unknown, HTMLElement, unknown>;
  private zoomState: ZoomState;
  private legendController: ILegendController;
  private brushLayer: Selection<SVGGElement, unknown, HTMLElement, unknown>;
  private brushBehavior: BrushBehavior<unknown>;
  private selectedTimeWindow: [number, number] | null = null;

  constructor(
    svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>,
    data: IDataSource,
    legendController: ILegendController,
    zoomHandler: (
      event: D3ZoomEvent<SVGRectElement, unknown>,
    ) => void = () => {},
    mouseMoveHandler: (event: MouseEvent) => void = () => {},
    zoomOptions?: IZoomStateOptions,
  ) {
    this.svg = svg;
    this.data = new ChartData(data);

    this.state = setupRender(svg, this.data);

    this.zoomArea = svg
      .append("rect")
      .attr("class", "zoom")
      .attr("width", this.state.dimensions.width)
      .attr("height", this.state.dimensions.height);

    this.legendController = legendController;

    const context: LegendContext = {
      getPoint: (idx) => this.data.getPoint(idx),
      length: this.data.length,
      series: this.state.series.map((s) => ({
        path: s.path,
        transform: this.state.axes.y[s.axisIdx]!.transform,
      })),
    };
    this.legendController.init(context);

    this.zoomArea.on("mousemove", mouseMoveHandler).on("mouseleave", () => {
      this.legendController.clearHighlight();
    });

    this.zoomState = new ZoomState(
      this.zoomArea,
      this.state,
      () => {
        this.state.refresh(this.data);
      },
      (event) => {
        zoomHandler(event);
        this.legendController.refresh();
      },
      zoomOptions,
    );

    this.brushLayer = svg
      .append("g")
      .attr("class", "brush")
      .style("display", "none");
    this.brushBehavior = brush()
      .extent([
        [0, 0],
        [this.state.dimensions.width, this.state.dimensions.height],
      ])
      .on("end", this.onBrushEnd);
    this.brushLayer.call(this.brushBehavior);

    this.refreshAll();
    this.onHover(this.state.dimensions.width - 1);
  }

  public get interaction(): IPublicInteraction {
    return {
      zoom: this.zoom,
      onHover: this.onHover,
      resetZoom: this.resetZoom,
      setScaleExtent: this.setScaleExtent,
      enableBrush: this.enableBrush,
      disableBrush: this.disableBrush,
      getSelectedTimeWindow: this.getSelectedTimeWindow,
    };
  }

  public updateChartWithNewData(...values: number[]): void {
    this.data.append(...values);
    this.refreshAll();
  }

  public dispose() {
    this.zoomState.destroy();
    this.zoomArea.on("mousemove", null).on("mouseleave", null);
    this.state.destroy();
    this.zoomArea.remove();
    this.brushLayer.on(".brush", null).remove();
    this.legendController.destroy();
  }

  public zoom = (event: D3ZoomEvent<SVGRectElement, unknown>) => {
    this.zoomState.zoom(event);
  };

  public resetZoom = () => {
    this.zoomState.reset();
  };

  public setScaleExtent = (extent: [number, number]) => {
    this.zoomState.setScaleExtent(extent);
  };

  public enableBrush = () => {
    this.brushLayer.style("display", null);
  };

  public disableBrush = () => {
    this.brushLayer.style("display", "none");
    this.brushLayer.call(
      this.brushBehavior.move.bind(this.brushBehavior),
      null,
    );
  };

  public getSelectedTimeWindow = () => this.selectedTimeWindow;

  public resize = (dimensions: { width: number; height: number }) => {
    const { width, height } = dimensions;
    this.svg.attr("width", width).attr("height", height);
    this.state.resize(dimensions, this.zoomState);
    this.state.refresh(this.data);
    this.brushBehavior.extent([
      [0, 0],
      [width, height],
    ]);
    this.brushLayer.call(this.brushBehavior);
    this.refreshAll();
  };

  public onHover = (x: number) => {
    let idx = Math.round(this.state.xTransform.fromScreenToModelX(x));
    idx = this.data.clampIndex(idx);
    this.legendController.highlightIndex(idx);
  };

  private onBrushEnd = (event: D3BrushEvent<unknown>) => {
    if (!event.selection) {
      return;
    }
    const [[x0], [x1]] = event.selection as [
      [number, number],
      [number, number],
    ];
    if (x0 === x1) {
      this.brushLayer.call(
        this.brushBehavior.move.bind(this.brushBehavior),
        null,
      );
      return;
    }
    let idx0 = this.data.clampIndex(
      this.state.xTransform.fromScreenToModelX(x0),
    );
    let idx1 = this.data.clampIndex(
      this.state.xTransform.fromScreenToModelX(x1),
    );
    if (idx0 === idx1) {
      this.brushLayer.call(
        this.brushBehavior.move.bind(this.brushBehavior),
        null,
      );
      return;
    }
    if (idx0 > idx1) {
      [idx0, idx1] = [idx1, idx0];
    }
    const sx0 = this.state.xTransform.toScreenFromModelX(idx0);
    const sx1 = this.state.xTransform.toScreenFromModelX(idx1);
    const k = this.state.dimensions.width / (sx1 - sx0);
    const tx = -sx0 * k;
    this.zoomState.zoomBehavior.transform(
      this.zoomArea,
      zoomIdentity.translate(tx, 0).scale(k),
    );
    const tTransform = this.data.indexToTime();
    let t0 = tTransform.applyToPoint(idx0);
    let t1 = tTransform.applyToPoint(idx1);
    if (t0 > t1) {
      [t0, t1] = [t1, t0];
    }
    this.selectedTimeWindow = [t0, t1];
    this.brushLayer.call(
      this.brushBehavior.move.bind(this.brushBehavior),
      null,
    );
  };

  private refreshAll(): void {
    this.state.seriesRenderer.draw(this.data.data);
    this.zoomState.refresh();
    this.legendController.refresh();
  }
}
