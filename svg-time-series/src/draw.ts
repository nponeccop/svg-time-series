import type { Selection } from "d3-selection";
import type { D3ZoomEvent } from "d3-zoom";

import { ChartData } from "./chart/data.ts";
import type { IDataSource } from "./chart/data.ts";
import { setupRender } from "./chart/render.ts";
import type { RenderState } from "./chart/render.ts";
import { AR1Basis, DirectProductBasis } from "./math/affine.ts";
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
}

export class TimeSeriesChart {
  private svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
  private data: ChartData;
  private state: RenderState;
  private zoomArea: Selection<SVGRectElement, unknown, HTMLElement, unknown>;
  private zoomState: ZoomState;
  private legendController: ILegendController;
  private disposed = false;

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

    this.drawNewData();
    this.onHover(this.state.dimensions.width - 1);
  }

  public get interaction(): IPublicInteraction {
    return {
      zoom: this.zoom,
      onHover: this.onHover,
      resetZoom: this.resetZoom,
      setScaleExtent: this.setScaleExtent,
    };
  }

  public updateChartWithNewData(...values: number[]): void {
    if (this.disposed) {
      return;
    }
    this.data.append(...values);
    this.drawNewData();
  }

  public dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.zoomState.destroy();
    this.zoomArea.on("mousemove", null).on("mouseleave", null);
    this.zoomArea.remove();
    this.legendController.destroy();

    for (const s of this.state.series) {
      s.path.remove();
      s.view.remove();
    }
    this.state.series = [];
    this.state.seriesRenderer.series = [];
    const axisX = this.state.axes.x;
    if (axisX.g) {
      axisX.g.remove();
    }
    axisX.g = undefined;
    (axisX as unknown as { axis: null }).axis = null;

    for (const r of this.state.axisRenders) {
      r.g.remove();
    }
    this.state.axisRenders.length = 0;
    this.state.axes.y.length = 0;
    this.state.axisManager.axes = [];
  }

  public zoom = (event: D3ZoomEvent<SVGRectElement, unknown>) => {
    if (this.disposed) {
      return;
    }
    this.zoomState.zoom(event);
  };

  public resetZoom = () => {
    if (this.disposed) {
      return;
    }
    this.zoomState.reset();
  };

  public setScaleExtent = (extent: [number, number]) => {
    if (this.disposed) {
      return;
    }
    this.zoomState.setScaleExtent(extent);
  };

  public resize = (dimensions: { width: number; height: number }) => {
    if (this.disposed) {
      return;
    }
    const { width, height } = dimensions;
    this.svg.attr("width", width).attr("height", height);

    const bScreenXVisible = new AR1Basis(0, width);
    const bScreenYVisible = new AR1Basis(height, 0);
    const bScreenVisible = DirectProductBasis.fromProjections(
      bScreenXVisible,
      bScreenYVisible,
    );

    this.state.axes.x.scale.range([0, width]);
    this.state.screenXBasis = bScreenXVisible;

    this.state.dimensions.width = width;
    this.state.dimensions.height = height;

    this.zoomArea.attr("width", width).attr("height", height);
    this.zoomState.updateExtents({ width, height });

    for (const a of this.state.axes.y) {
      a.transform.onViewPortResize(bScreenVisible);
      a.scale.range([height, 0]);
    }

    this.state.refresh(this.data);
    this.refreshAll();
  };

  public onHover = (x: number) => {
    if (this.disposed) {
      return;
    }
    let idx = this.state.axes.y[0]!.transform.fromScreenToModelX(x);
    idx = this.data.clampIndex(idx);
    this.legendController.highlightIndex(idx);
  };

  private drawNewData = () => {
    this.refreshAll();
  };

  private refreshAll = () => {
    this.state.seriesRenderer.draw(this.data.data);
    this.zoomState.refresh();
    this.legendController.refresh();
  };
}
