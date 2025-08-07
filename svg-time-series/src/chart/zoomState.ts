import { Selection } from "d3-selection";
import {
  zoom as d3zoom,
  D3ZoomEvent,
  ZoomBehavior,
  ZoomTransform,
  zoomIdentity,
} from "d3-zoom";
import { drawProc } from "../utils/drawProc.ts";
import type { RenderState } from "./ChartRenderer.ts";

export class ZoomState {
  public zoomBehavior: ZoomBehavior<SVGRectElement, unknown>;
  private currentPanZoomTransformState: ZoomTransform | null = null;
  private scheduleRefresh: () => void;
  private cancelRefresh: () => void;

  constructor(
    private zoomArea: Selection<SVGRectElement, unknown, HTMLElement, unknown>,
    private state: RenderState,
    private refreshChart: () => void,
    private zoomCallback: (
      event: D3ZoomEvent<SVGRectElement, unknown>,
    ) => void = () => {},
  ) {
    this.zoomBehavior = d3zoom<SVGRectElement, unknown>()
      .scaleExtent([1, 40])
      .translateExtent([
        [0, 0],
        [state.dimensions.width, state.dimensions.height],
      ])
      .on("zoom", (event: D3ZoomEvent<SVGRectElement, unknown>) => {
        this.zoom(event);
      });

    this.zoomArea.call(this.zoomBehavior);

    const { wrapped, cancel } = drawProc(() => {
      if (this.currentPanZoomTransformState != null) {
        this.zoomBehavior.transform(
          this.zoomArea,
          this.currentPanZoomTransformState,
        );
      } else {
        this.refreshChart();
      }
    });
    this.scheduleRefresh = wrapped;
    this.cancelRefresh = cancel;
  }

  public zoom = (event: D3ZoomEvent<SVGRectElement, unknown>) => {
    this.currentPanZoomTransformState = event.transform;
    this.state.transforms.ny.onZoomPan(event.transform);
    this.state.transforms.sf?.onZoomPan(event.transform);
    if (event.sourceEvent) {
      this.scheduleRefresh();
    }
    if (!event.sourceEvent) {
      this.refreshChart();
    }
    this.zoomCallback(event);
  };

  public refresh = () => {
    this.scheduleRefresh();
  };

  public updateExtents = (dimensions: { width: number; height: number }) => {
    this.state.dimensions.width = dimensions.width;
    this.state.dimensions.height = dimensions.height;
    this.zoomBehavior.scaleExtent([1, 40]).translateExtent([
      [0, 0],
      [dimensions.width, dimensions.height],
    ]);
  };

  public reset = () => {
    this.zoomBehavior.transform(this.zoomArea, zoomIdentity);
  };

  public destroy = () => {
    this.cancelRefresh();
    this.zoomArea.on(".zoom", null);
    this.zoomBehavior.on("zoom", null);
  };
}

export type { D3ZoomEvent };
