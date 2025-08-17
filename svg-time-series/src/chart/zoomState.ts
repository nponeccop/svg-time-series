import type { Selection } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, zoomTransform } from "d3-zoom";
import type { D3ZoomEvent, ZoomBehavior, ZoomTransform } from "d3-zoom";
import { ZoomScheduler, sameTransform } from "./zoomScheduler.ts";
import type { RenderState } from "./render.ts";

export { sameTransform };

export const constrainTranslation = (
  current: ZoomTransform,
  width: number,
  height: number,
): ZoomTransform => {
  /**
   * The zoom transform's translation can place the rendered data in three
   * distinct states for each axis:
   * 1. **Beyond the left/top** – translation is positive, revealing empty
   *    space before the data. We clamp back to `0`.
   * 2. **Beyond the right/bottom** – translation is more negative than the
   *    scaled bounds allow. We clamp to the minimum permitted value
   *    (`width - width * k` or `height - height * k`).
   * 3. **Fully inside** – the content lies within the bounds. When the scaled
   *    content is smaller than the viewport (`k < 1`), we center it by splitting
   *    the empty space evenly on both sides.
   */

  const k = current.k;

  const minX = width - width * k;
  let x: number;
  if (k < 1) {
    x = minX / 2; // Content smaller than viewport - center horizontally
  } else if (current.x > 0) {
    x = 0; // Beyond the left edge
  } else if (current.x < minX) {
    x = minX; // Beyond the right edge
  } else {
    x = current.x; // Fully inside
  }

  const minY = height - height * k;
  let y: number;
  if (k < 1) {
    y = minY / 2; // Content smaller than viewport - center vertically
  } else if (current.y > 0) {
    y = 0; // Beyond the top edge
  } else if (current.y < minY) {
    y = minY; // Beyond the bottom edge
  } else {
    y = current.y; // Fully inside
  }

  if (x !== current.x || y !== current.y) {
    // Translate by the delta required to reach the clamped position. The
    // `translate` method scales the supplied deltas by `k`, so we divide by `k`
    // to achieve the desired pixel shift.
    return current.translate((x - current.x) / k, (y - current.y) / k);
  }

  return current;
};

export interface IZoomStateOptions {
  scaleExtent: [number, number];
}

export class ZoomState {
  public zoomBehavior: ZoomBehavior<SVGRectElement, unknown>;
  private zoomScheduler: ZoomScheduler;
  private scaleExtent: [number, number];

  public static validateScaleExtent(extent: unknown): [number, number] {
    const error = () =>
      new Error(
        `scaleExtent must be two finite, positive numbers where extent[0] < extent[1]. Received: ${Array.isArray(extent) ? `[${extent.join(",")}]` : String(extent)}`,
      );

    if (!Array.isArray(extent) || extent.length !== 2) {
      throw error();
    }

    const [min, max] = extent as [unknown, unknown];

    if (
      typeof min !== "number" ||
      typeof max !== "number" ||
      !Number.isFinite(min) ||
      !Number.isFinite(max)
    ) {
      throw error();
    }

    if (min <= 0 || max <= 0) {
      throw error();
    }

    if (min >= max) {
      throw error();
    }

    return [min, max];
  }

  constructor(
    private zoomArea: Selection<SVGRectElement, unknown, HTMLElement, unknown>,
    private state: RenderState,
    private refreshChart: () => void,
    private zoomCallback: (
      event: D3ZoomEvent<SVGRectElement, unknown>,
    ) => void = () => {},
    options: IZoomStateOptions = { scaleExtent: [1, 40] },
  ) {
    this.scaleExtent = ZoomState.validateScaleExtent(options.scaleExtent);
    this.zoomBehavior = d3zoom<SVGRectElement, unknown>()
      .scaleExtent(this.scaleExtent)
      .translateExtent([
        [0, 0],
        [state.dimensions.width, state.dimensions.height],
      ])
      .on("zoom", (event: D3ZoomEvent<SVGRectElement, unknown>) => {
        this.zoom(event);
      });

    this.zoomArea.call(this.zoomBehavior);

    this.zoomScheduler = new ZoomScheduler((t: ZoomTransform) => {
      this.zoomBehavior.transform(this.zoomArea, t);
    }, this.refreshChart);
  }

  public zoom = (event: D3ZoomEvent<SVGRectElement, unknown>) => {
    this.state.applyZoomTransform(event.transform);
    this.zoomScheduler.zoom(event.transform, event.sourceEvent, event, (e) => {
      this.zoomCallback(e as D3ZoomEvent<SVGRectElement, unknown>);
    });
  };

  public refresh = () => {
    this.zoomScheduler.refresh();
  };

  public setScaleExtent = (extent: [number, number]) => {
    this.scaleExtent = ZoomState.validateScaleExtent(extent);
    this.zoomBehavior.scaleExtent(this.scaleExtent);
    const current = zoomTransform(this.zoomArea.node()!);
    const [min, max] = this.scaleExtent;
    const clampedK = Math.max(min, Math.min(max, current.k));
    if (clampedK !== current.k) {
      this.zoomBehavior.scaleTo(this.zoomArea, clampedK);
    }
  };

  public updateExtents = (dimensions: { width: number; height: number }) => {
    this.state.setDimensions(dimensions);
    this.zoomArea
      .attr("width", dimensions.width)
      .attr("height", dimensions.height);
    this.zoomBehavior.scaleExtent(this.scaleExtent).translateExtent([
      [0, 0],
      [dimensions.width, dimensions.height],
    ]);
    const current = zoomTransform(this.zoomArea.node()!);
    const constrained = constrainTranslation(
      current,
      dimensions.width,
      dimensions.height,
    );
    if (constrained !== current) {
      this.zoomBehavior.transform(this.zoomArea, constrained);
    }
  };

  public reset = () => {
    this.zoomBehavior.transform(this.zoomArea, zoomIdentity);
  };

  public destroy = () => {
    this.zoomScheduler.destroy();
    this.zoomArea.on(".zoom", null);
    this.zoomBehavior.on("zoom", null);
  };
}

export type { D3ZoomEvent };
