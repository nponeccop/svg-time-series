/**
 * Idiomatic D3 entry point for `svg-time-series`.
 *
 * The class exported from `draw.ts` is the low-level engine: it owns the SVG,
 * expects a C-style `IDataSource`, requires a legend controller and reports
 * events through an object called `interaction`. This module puts a thin,
 * D3-shaped facade on top of that engine:
 *
 * ```ts
 * const chart = timeSeriesChart<Row>()
 *   .x((d) => d.date)
 *   .series([
 *     { key: "ny", y: (d) => d.ny, stroke: "steelblue" },
 *     { key: "sf", y: (d) => d.sf, axis: 1, stroke: "orange" },
 *   ])
 *   .on("hover", (event) => console.log(event.points))
 *   .on("zoom", (event) => console.log(event.transform));
 *
 * select("#chart").select("svg").datum(rows).call(chart);
 * ```
 *
 * The facade is deliberately additive: it is implemented on top of
 * `TimeSeriesChart`, so existing code keeps working while consumers adopt D3
 * conventions (configuration closures, chainable accessors, dispatch handlers,
 * data-bound DOM) incrementally. See `docs/proposals/idiomatic-d3.md` for the
 * migration plan that removes the remaining impedance mismatches.
 */
import { dispatch as d3dispatch } from "d3-dispatch";
import type { BaseType, Selection } from "d3-selection";
import { pointer } from "d3-selection";
import type { D3ZoomEvent, ZoomTransform } from "d3-zoom";

import { TimeSeriesChart } from "./draw.ts";
import type { IDataSource } from "./chart/data.ts";
import type { ILegendController, LegendContext } from "./chart/legend.ts";
import { drawProc } from "./utils/drawProc.ts";

export type { ZoomTransform };

/** Y-axis index: `0` is the right axis, `1` is the left axis. */
export type SeriesAxis = 0 | 1;

/** Time accessor, called with the datum and its index, like D3's `ValueFn`. */
export type TimeAccessor<Datum> = (
  datum: Datum,
  index: number,
) => Date | number;

/** Value accessor, called with the datum and its index, like D3's `ValueFn`. */
export type ValueAccessor<Datum> = (datum: Datum, index: number) => number;

/**
 * Description of one data series: identity plus accessors. Mirrors the role of
 * the `x`/`y` accessors of a `d3-shape` line generator.
 */
export interface SeriesSpec<Datum> {
  /**
   * Stable identifier, written to the `data-series` attribute of the series
   * path so styles survive series being added or reordered (unlike the
   * `:nth-child` selectors used by the sample CSS).
   */
  readonly key: string;
  /** Value accessor for this series. */
  readonly y: ValueAccessor<Datum>;
  /** Y-axis this series belongs to. Defaults to the right axis (`0`). */
  readonly axis?: SeriesAxis;
  /** Optional stroke applied to the series path. */
  readonly stroke?: string;
}

/** Event names emitted by the chart, matching `d3-dispatch` typenames. */
export const chartEventNames = [
  "render",
  "zoom",
  "brush",
  "hover",
  "leave",
] as const;

export type ChartEventName = (typeof chartEventNames)[number];

interface ChartEventBase<Datum> {
  /** The chart component that emitted the event. */
  readonly target: TimeSeriesChartComponent<Datum>;
}

/** Emitted after the chart (re)built its DOM for the current data. */
export type RenderChartEvent<Datum> = ChartEventBase<Datum> & {
  readonly type: "render";
};

/** Emitted for every zoom/pan, shaped like `d3-zoom`'s event. */
export type ZoomChartEvent<Datum> = ChartEventBase<Datum> & {
  readonly type: "zoom";
  readonly transform: ZoomTransform;
  readonly sourceEvent: Event | null;
};

/** Emitted when a brush selection completed. */
export type BrushChartEvent<Datum> = ChartEventBase<Datum> & {
  readonly type: "brush";
  /** Selected time window in epoch milliseconds, `null` when collapsed. */
  readonly window: readonly [number, number] | null;
};

/** One series value at the hovered index, in model and pixel space. */
export interface HoverPoint<Datum> {
  readonly series: SeriesSpec<Datum>;
  /** Index of the datum within the current data window. */
  readonly index: number;
  /** The value itself; `NaN` for gaps (consumers usually hide the marker). */
  readonly value: number;
  /** Pixel coordinates inside the SVG, ready to place a marker. */
  readonly x: number;
  readonly y: number;
}

/** Emitted when the pointer moved over a datum. */
export type HoverChartEvent<Datum> = ChartEventBase<Datum> & {
  readonly type: "hover";
  readonly index: number;
  readonly date: Date | undefined;
  /** The user's datum, when it can be correlated with the window index. */
  readonly datum: Datum | undefined;
  readonly points: readonly HoverPoint<Datum>[];
};

/** Emitted when the pointer left the chart. */
export type LeaveChartEvent<Datum> = ChartEventBase<Datum> & {
  readonly type: "leave";
};

export type ChartEvent<Datum> =
  | RenderChartEvent<Datum>
  | ZoomChartEvent<Datum>
  | BrushChartEvent<Datum>
  | HoverChartEvent<Datum>
  | LeaveChartEvent<Datum>;

export type ChartListener<Datum> = (event: ChartEvent<Datum>) => void;

/** Listener of one specific event, as documented for each event type. */
export type ChartListenerFor<Datum, K extends ChartEventName> = (
  event: Extract<ChartEvent<Datum>, { type: K }>,
) => void;

/**
 * A reusable D3 chart: a function of a selection, configured with chainable
 * getter/setters, callable with `selection.call(chart)`.
 */
export interface TimeSeriesChartComponent<Datum> {
  /**
   * Render the chart into the given SVG selection. Data come from
   * `chart.data(...)` or from the selection's bound datum, in that order of
   * precedence. Calling the component again renders in place, reusing the SVG.
   */
  <
    G extends BaseType,
    D extends Datum[] | readonly Datum[],
    P extends BaseType,
    PData,
  >(
    selection: Selection<G, D, P, PData>,
  ): void;

  data(): readonly Datum[] | undefined;
  data(data: readonly Datum[]): this;

  x(): TimeAccessor<Datum>;
  x(accessor: TimeAccessor<Datum>): this;

  series(): readonly SeriesSpec<Datum>[];
  series(series: readonly SeriesSpec<Datum>[]): this;

  scaleExtent(): readonly [number, number];
  scaleExtent(extent: readonly [number, number]): this;

  brush(): boolean;
  brush(enabled: boolean): this;

  on<K extends ChartEventName>(
    type: K | `${K}.${string}`,
    listener: ChartListenerFor<Datum, K>,
  ): this;
  off(type: ChartEventName | `${ChartEventName}.${string}`): this;

  /** Move the hover highlight to a pixel coordinate, as `mousemove` does. */
  hover(x: number): void;
  zoomToTimeWindow(start: Date | number, end: Date | number): boolean;
  resetZoom(): void;
  getZoomTransform(): ZoomTransform | undefined;
  /** Remove listeners and DOM nodes created by the chart. */
  dispose(): void;
}

interface Instance<Datum> {
  readonly chart: TimeSeriesChart;
  readonly svg: Selection<
    BaseType,
    Datum[] | readonly Datum[],
    BaseType,
    unknown
  >;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function assertSvgElement(node: BaseType | null): void {
  const element = node as Element | null;
  if (
    element === null ||
    element.namespaceURI !== SVG_NAMESPACE ||
    element.localName.toLowerCase() !== "svg"
  ) {
    throw new Error(
      "timeSeriesChart expects a selection containing an <svg> element",
    );
  }
}

const defaultX: TimeAccessor<unknown> = (_datum, index) => index;
const defaultScaleExtent: readonly [number, number] = [1, 40];
const STEP_EPSILON = 1e-6;

function describeDatum(datum: unknown): string {
  if (typeof datum === "object" && datum !== null) {
    try {
      return JSON.stringify(datum);
    } catch {
      return Object.prototype.toString.call(datum);
    }
  }
  return String(datum);
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? +value : value;
}

/**
 * The renderer draws with index arithmetic and a rasterizer-side matrix, so the
 * X domain must be sampled uniformly. That is the only structural constraint of
 * the interface; report it eagerly instead of producing a subtly skewed chart.
 */
function uniformTimeStep<Datum>(
  data: readonly Datum[],
  x: TimeAccessor<Datum>,
): { startTime: number; timeStep: number } {
  if (data.length < 2) {
    throw new Error(
      "timeSeriesChart requires at least two data points (the time step is derived from them)",
    );
  }
  const startTime = toMillis(x(data[0]!, 0));
  if (!Number.isFinite(startTime)) {
    throw new Error(
      `timeSeriesChart x accessor returned a non-finite time for datum 0: ${describeDatum(data[0])}`,
    );
  }
  const timeStep = toMillis(x(data[1]!, 1)) - startTime;
  if (!Number.isFinite(timeStep) || timeStep <= 0) {
    throw new Error(
      "timeSeriesChart requires strictly increasing x values; datum 1 is not after datum 0",
    );
  }
  for (let i = 2; i < data.length; i++) {
    const previous = toMillis(x(data[i - 1]!, i - 1));
    const current = toMillis(x(data[i]!, i));
    if (!Number.isFinite(current) || current <= previous) {
      throw new Error(
        `timeSeriesChart requires strictly increasing x values; datum ${String(i)} is not after datum ${String(i - 1)}`,
      );
    }
    if (
      Math.abs(current - previous - timeStep) >
      STEP_EPSILON * Math.abs(timeStep)
    ) {
      throw new Error(
        `timeSeriesChart requires evenly spaced x values (the renderer indexes data by a fixed time step); ` +
          `datum ${String(i)} is ${String(current - previous)}ms after datum ${String(i - 1)}, expected ${String(timeStep)}ms`,
      );
    }
  }
  return { startTime, timeStep };
}

/**
 * Bridges the engine's `ILegendController` callback interface to the component's
 * `hover`/`leave` dispatch. Consumers never see this interface.
 */
class HoverDispatcher implements ILegendController {
  private context: LegendContext | null = null;
  private index: number | null = null;
  private readonly schedule: () => void;
  private readonly cancel: () => void;

  constructor(private readonly emit: (index: number | null) => void) {
    const { wrapped, cancel } = drawProc(() => {
      this.flush();
    });
    this.schedule = wrapped;
    this.cancel = cancel;
  }

  public init(context: LegendContext): void {
    this.context = context;
  }

  public highlightIndex(index: number): void {
    this.index = index;
    this.flush();
  }

  /** Coalesces the mousemove firehose to at most one event per frame. */
  public highlightIndexRaf(index: number): void {
    this.index = index;
    this.schedule();
  }

  /** Called by the engine on zoom/pan so markers follow the data. */
  public refresh(): void {
    this.flush();
  }

  public clearHighlight(): void {
    this.index = null;
    this.emit(null);
  }

  public destroy(): void {
    this.cancel();
    this.context = null;
    this.index = null;
  }

  private flush(): void {
    if (this.index !== null && this.context !== null) {
      this.emit(this.index);
    }
  }
}

function createChart<Datum>(): TimeSeriesChartComponent<Datum> {
  let data: readonly Datum[] | undefined;
  let xAccessor: TimeAccessor<Datum> = defaultX as TimeAccessor<Datum>;
  let seriesSpecs: readonly SeriesSpec<Datum>[] = [];
  let scaleExtentValue: readonly [number, number] = defaultScaleExtent;
  let brushEnabled = false;
  let instance: Instance<Datum> | null = null;
  let lastSelection: Instance<Datum>["svg"] | null = null;

  const dispatch = d3dispatch<
    TimeSeriesChartComponent<Datum>,
    Record<ChartEventName, [ChartEvent<Datum>]>
  >(...chartEventNames);

  // `d3-dispatch`'s `on` is typed with a distributive conditional that cannot
  // be resolved for a generic typename, so subscriptions go through a plain
  // signature. Payload types stay checked by `ChartListenerFor` in the public
  // interface and by `dispatch.call` at every emit site below.
  interface Subscriptions {
    on(type: string, listener: ChartListener<Datum> | null): void;
  }
  const subscriptions = dispatch as unknown as Subscriptions;

  const render = (): void => {
    dispatch.call("render", component, { type: "render", target: component });
  };

  const build = (
    svg: Instance<Datum>["svg"],
    rows: readonly Datum[],
  ): Instance<Datum> => {
    if (seriesSpecs.length === 0) {
      throw new Error(
        "timeSeriesChart requires at least one series; call .series([{ key, y }])",
      );
    }
    const keys = new Set<string>();
    for (const spec of seriesSpecs) {
      if (keys.has(spec.key)) {
        throw new Error(
          `timeSeriesChart series keys must be unique; received two series with key "${spec.key}"`,
        );
      }
      keys.add(spec.key);
      // The cast keeps the runtime guard for untyped JavaScript callers.
      const axis = spec.axis as number | undefined;
      if (axis !== undefined && axis !== 0 && axis !== 1) {
        throw new Error(
          `timeSeriesChart series "${spec.key}" has axis ${String(axis)}; expected 0 (right) or 1 (left)`,
        );
      }
    }

    const { startTime, timeStep } = uniformTimeStep(rows, xAccessor);

    // Materialise the columns the engine expects: a random-access number grid.
    const columns = seriesSpecs.map((spec) =>
      rows.map((datum, row) => {
        const value = spec.y(datum, row);
        if (!Number.isFinite(value) && !Number.isNaN(value)) {
          throw new Error(
            `timeSeriesChart series "${spec.key}" returned ${String(value)} for datum ${String(row)}; expected a number or NaN: ${describeDatum(datum)}`,
          );
        }
        return value;
      }),
    );
    const source: IDataSource = {
      startTime,
      timeStep,
      length: rows.length,
      seriesAxes: seriesSpecs.map((spec) => spec.axis ?? 0),
      getSeries: (index, seriesIdx) => columns[seriesIdx]![index]!,
    };

    let legendContext: LegendContext | null = null;
    const emitHover = (index: number | null): void => {
      if (index === null) {
        dispatch.call("leave", component, {
          type: "leave",
          target: component,
        });
        return;
      }
      if (legendContext === null) return;
      const point = legendContext.getPoint(index);
      const points = seriesSpecs.flatMap((spec, i) => {
        const info = legendContext?.series[i];
        const value = point.values[i];
        if (!info || value === undefined) return [];
        const m = info.transform.matrix;
        // Pixel position of (index, value), i.e. DOMPoint.matrixTransform,
        // with NaN gaps pinned to the axis instead of the SVG origin.
        const model = Number.isNaN(value) ? 0 : value;
        return [
          {
            series: spec,
            index,
            value,
            x: m.a * index + m.c * model + m.e,
            y: m.b * index + m.d * model + m.f,
          },
        ];
      });
      const { timestamp } = point;
      dispatch.call("hover", component, {
        type: "hover",
        target: component,
        index,
        date: timestamp === undefined ? undefined : new Date(timestamp),
        datum: rows[index],
        points,
      });
    };

    const hover = new HoverDispatcher(emitHover);
    const legendBridge: ILegendController = {
      init: (context) => {
        legendContext = context;
        hover.init(context);
      },
      highlightIndex: (index) => {
        hover.highlightIndex(index);
      },
      highlightIndexRaf: (index) => {
        hover.highlightIndexRaf(index);
      },
      refresh: () => {
        hover.refresh();
      },
      clearHighlight: () => {
        hover.clearHighlight();
      },
      destroy: () => {
        hover.destroy();
      },
    };

    const chart = new TimeSeriesChart(
      svg as unknown as Selection<SVGSVGElement, unknown, HTMLElement, unknown>,
      source,
      legendBridge,
      (event: D3ZoomEvent<SVGRectElement, unknown>) => {
        dispatch.call("zoom", component, {
          type: "zoom",
          target: component,
          transform: event.transform,
          sourceEvent: (event.sourceEvent ?? null) as Event | null,
        });
      },
      function (this: Element, event: MouseEvent) {
        const [pixelX] = pointer(event, this);
        chart.interaction.onHover(pixelX);
      },
      { scaleExtent: [...scaleExtentValue] as [number, number] },
    );

    chart.interaction.on("brushEnd", (payload: unknown) => {
      const window = payload as [number, number] | null;
      dispatch.call("brush", component, {
        type: "brush",
        target: component,
        window: window === null ? null : [window[0], window[1]],
      });
    });
    if (brushEnabled) {
      chart.interaction.enableBrush();
    }

    // Leave the produced DOM data-bound and styleable by key, like any other
    // D3 output: `svg.selectAll("g.view > path").attr("stroke", d => d.stroke)`.
    // The engine binds a per-series record to `g.view`; `select` propagates it
    // to the path. Phase 2 of the proposal replaces that record with the spec.
    svg
      .selectAll<SVGGElement, { seriesIdx: number }>("g.view")
      .select<SVGPathElement>("path")
      .datum((record) => seriesSpecs[record.seriesIdx] ?? seriesSpecs[0]!)
      .attr("data-series", (spec) => spec.key)
      .attr("stroke", (spec) => spec.stroke ?? null);

    return { chart, svg };
  };

  const rebuild = (): void => {
    if (instance === null || lastSelection === null) return;
    instance.chart.interaction.dispose();
    instance = build(lastSelection, data ?? []);
    render();
  };

  const component = function <
    G extends BaseType,
    D extends Datum[] | readonly Datum[],
    P extends BaseType,
    PData,
  >(selection: Selection<G, D, P, PData>): void {
    assertSvgElement(selection.node());
    instance?.chart.interaction.dispose();
    instance = null;

    const bound: unknown = selection.datum();
    const rows =
      data ?? (Array.isArray(bound) ? (bound as readonly Datum[]) : undefined);
    if (rows === undefined) {
      throw new Error(
        "timeSeriesChart has no data; bind it with selection.datum(rows) or call chart.data(rows)",
      );
    }
    if (rows.length === 0) {
      throw new Error("timeSeriesChart requires a non-empty data array");
    }

    const svg = selection as unknown as Instance<Datum>["svg"];
    lastSelection = svg;
    instance = build(svg, rows);
    render();
  } as TimeSeriesChartComponent<Datum>;

  component.data = ((value?: readonly Datum[]) => {
    if (value === undefined) return data;
    data = value;
    rebuild();
    return component;
  }) as TimeSeriesChartComponent<Datum>["data"];

  component.x = ((accessor?: TimeAccessor<Datum>) => {
    if (accessor === undefined) return xAccessor;
    xAccessor = accessor;
    rebuild();
    return component;
  }) as TimeSeriesChartComponent<Datum>["x"];

  component.series = ((specs?: readonly SeriesSpec<Datum>[]) => {
    if (specs === undefined) return seriesSpecs;
    seriesSpecs = specs;
    rebuild();
    return component;
  }) as TimeSeriesChartComponent<Datum>["series"];

  component.scaleExtent = ((extent?: readonly [number, number]) => {
    if (extent === undefined) return scaleExtentValue;
    scaleExtentValue = extent;
    instance?.chart.interaction.setScaleExtent([...extent] as [number, number]);
    return component;
  }) as TimeSeriesChartComponent<Datum>["scaleExtent"];

  component.brush = ((enabled?: boolean) => {
    if (enabled === undefined) return brushEnabled;
    brushEnabled = enabled;
    if (instance) {
      if (brushEnabled) instance.chart.interaction.enableBrush();
      else instance.chart.interaction.disableBrush();
    }
    return component;
  }) as TimeSeriesChartComponent<Datum>["brush"];

  component.on = (<K extends ChartEventName>(
    type: K | `${K}.${string}`,
    listener: ChartListenerFor<Datum, K>,
  ) => {
    subscriptions.on(type, listener as ChartListener<Datum>);
    return component;
  }) as TimeSeriesChartComponent<Datum>["on"];

  component.off = ((type: ChartEventName | `${ChartEventName}.${string}`) => {
    subscriptions.on(type, null);
    return component;
  }) as TimeSeriesChartComponent<Datum>["off"];

  component.hover = (pixelX: number): void => {
    instance?.chart.interaction.onHover(pixelX);
  };

  component.zoomToTimeWindow = (start, end): boolean =>
    instance?.chart.interaction.zoomToTimeWindow(start, end) ?? false;

  component.resetZoom = (): void => {
    instance?.chart.interaction.resetZoom();
  };

  component.getZoomTransform = (): ZoomTransform | undefined =>
    instance?.chart.interaction.getZoomTransform();

  component.dispose = (): void => {
    instance?.chart.interaction.dispose();
    instance = null;
    lastSelection = null;
  };

  return component;
}

/**
 * Create a reusable SVG time series chart.
 *
 * ```ts
 * const chart = timeSeriesChart<Row>().series([{ key: "ny", y: (d) => d.ny }]);
 * select("#chart").select("svg").datum(rows).call(chart);
 * ```
 */
export function timeSeriesChart<Datum>(): TimeSeriesChartComponent<Datum> {
  return createChart<Datum>();
}
