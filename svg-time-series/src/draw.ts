import { Selection } from "d3-selection";
import { D3ZoomEvent } from "d3-zoom";

import {
  TimeSeriesModel,
  IMinMax,
  IDataSource,
} from "./chart/TimeSeriesModel.ts";
import { ChartRenderer, type RenderState } from "./chart/ChartRenderer.ts";
import {
  InteractionController,
  type IPublicInteraction,
} from "./chart/InteractionController.ts";
import type { ILegendController } from "./chart/legend.ts";

export type { IMinMax, IDataSource } from "./chart/TimeSeriesModel.ts";
export type { ILegendController } from "./chart/legend.ts";

export class TimeSeriesChart {
  private model: TimeSeriesModel;
  private renderer: ChartRenderer;
  private interactions: InteractionController;

  constructor(
    svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>,
    source: IDataSource,
    legendFactory: (
      state: RenderState,
      model: TimeSeriesModel,
    ) => ILegendController,
    dualYAxis = false,
    zoomHandler: (
      event: D3ZoomEvent<SVGRectElement, unknown>,
    ) => void = () => {},
    mouseMoveHandler: (event: MouseEvent) => void = () => {},
  ) {
    this.model = new TimeSeriesModel(source);
    this.renderer = new ChartRenderer(svg, this.model, dualYAxis);
    this.interactions = new InteractionController(
      svg,
      this.renderer,
      this.model,
      legendFactory,
      zoomHandler,
      mouseMoveHandler,
    );

    this.renderer.draw(this.model);
    this.interactions.onHover(this.renderer.state.dimensions.width - 1);
  }

  public get interaction(): IPublicInteraction {
    return {
      zoom: this.zoom,
      onHover: this.onHover,
      resetZoom: this.resetZoom,
    };
  }

  public append(ny: number, sf?: number) {
    this.model.append(ny, sf);
    this.renderer.draw(this.model);
    this.interactions.refresh();
  }

  public dispose() {
    this.interactions.dispose();
  }

  public zoom = (event: D3ZoomEvent<SVGRectElement, unknown>) => {
    this.interactions.zoom(event);
  };

  public resetZoom = () => {
    this.interactions.resetZoom();
  };

  public resize = (dimensions: { width: number; height: number }) => {
    this.interactions.resize(dimensions);
  };

  public onHover = (x: number) => {
    this.interactions.onHover(x);
  };
}
