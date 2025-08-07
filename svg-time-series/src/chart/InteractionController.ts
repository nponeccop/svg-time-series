import { Selection } from "d3-selection";
import type { D3ZoomEvent } from "d3-zoom";
import type { TimeSeriesModel } from "./TimeSeriesModel.ts";
import { ChartRenderer, type RenderState } from "./ChartRenderer.ts";
import type { ILegendController } from "./legend.ts";
import { ZoomState } from "./zoomState.ts";

export class InteractionController {
  private zoomArea: Selection<SVGRectElement, unknown, HTMLElement, unknown>;
  private zoomState: ZoomState;
  private legendController: ILegendController;

  constructor(
    svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>,
    private renderer: ChartRenderer,
    model: TimeSeriesModel,
    legendFactory: (
      state: RenderState,
      model: TimeSeriesModel,
    ) => ILegendController,
    zoomHandler: (
      event: D3ZoomEvent<SVGRectElement, unknown>,
    ) => void = () => {},
    mouseMoveHandler: (event: MouseEvent) => void = () => {},
  ) {
    this.zoomArea = svg
      .append("rect")
      .attr("class", "zoom")
      .attr("width", this.renderer.state.dimensions.width)
      .attr("height", this.renderer.state.dimensions.height);
    this.zoomArea.on("mousemove", mouseMoveHandler);

    this.legendController = legendFactory(this.renderer.state, model);

    this.zoomState = new ZoomState(
      this.zoomArea,
      this.renderer.state,
      () => this.renderer.refresh(model),
      (event) => {
        zoomHandler(event);
        this.legendController.refresh();
      },
    );
  }

  public zoom = (event: D3ZoomEvent<SVGRectElement, unknown>) => {
    this.zoomState.zoom(event);
  };

  public resetZoom = () => {
    this.zoomState.reset();
  };

  public onHover = (x: number) => {
    const idx = this.renderer.state.transforms.ny.fromScreenToModelX(x);
    this.legendController.onHover(idx);
  };

  public refresh() {
    this.zoomState.refresh();
    this.legendController.refresh();
  }

  public resize(dim: { width: number; height: number }) {
    this.zoomArea.attr("width", dim.width).attr("height", dim.height);
    this.zoomState.updateExtents(dim);
  }

  public dispose() {
    this.zoomState.destroy();
    this.zoomArea.on("mousemove", null);
    this.zoomArea.remove();
    this.legendController.destroy();
  }
}

export interface IPublicInteraction {
  zoom: (event: D3ZoomEvent<SVGRectElement, unknown>) => void;
  onHover: (x: number) => void;
  resetZoom: () => void;
}
