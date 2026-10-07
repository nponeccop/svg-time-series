/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import type { Selection } from "d3-selection";
import { select } from "d3-selection";

import { polyfillDom } from "../../src/setupDom.ts";
import { timeSeriesChart } from "../../src/timeSeriesChart.ts";
import type {
  ChartEvent,
  HoverChartEvent,
  HoverPoint,
  SeriesSpec,
} from "../../src/timeSeriesChart.ts";

await polyfillDom();

interface Row {
  date: Date;
  ny: number;
  sf: number;
}

const rows: Row[] = [
  { date: new Date(0), ny: 0, sf: 3 },
  { date: new Date(1000), ny: 1, sf: 2 },
  { date: new Date(2000), ny: 2, sf: 1 },
  { date: new Date(3000), ny: 3, sf: NaN },
];

function createChartDiv(width = 200, height = 100) {
  const div = document.createElement("div");
  Object.defineProperty(div, "clientWidth", { value: width });
  Object.defineProperty(div, "clientHeight", { value: height });
  const svgElement = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  // d3-zoom reads the element's own size in jsdom, where SVG geometry
  // attributes are not implemented.
  Object.defineProperty(svgElement, "width", {
    value: { baseVal: { value: width } },
  });
  Object.defineProperty(svgElement, "height", {
    value: { baseVal: { value: height } },
  });
  div.appendChild(svgElement);
  document.body.appendChild(div);
  return {
    div,
    svgElement,
    svg: select(svgElement),
  };
}

/** An SVG selection whose Datum type is `readonly Row[]`, with no datum bound. */
function datumlessSvg(): Selection<
  SVGSVGElement,
  readonly Row[],
  null,
  undefined
> {
  const { svg } = createChartDiv();
  return svg as unknown as Selection<
    SVGSVGElement,
    readonly Row[],
    null,
    undefined
  >;
}

const twoSeries: SeriesSpec<Row>[] = [
  { key: "ny", y: (d) => d.ny, stroke: "green" },
  { key: "sf", y: (d) => d.sf, axis: 1, stroke: "orange" },
];

function expectNoThrow(fn: () => void): void {
  expect(fn).not.toThrow();
}

/** Advance one animation frame: the engine batches rendering with rAF. */
function frame(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

describe("timeSeriesChart component", () => {
  it("renders through selection.call and data-binds the series paths", () => {
    const { svgElement, svg } = createChartDiv();
    const chart = timeSeriesChart<Row>()
      .x((d) => d.date)
      .series(twoSeries);

    expectNoThrow(() => {
      svg.datum(rows).call(chart);
    });

    const paths = select(svgElement).selectAll<SVGPathElement, SeriesSpec<Row>>(
      "g.view > path",
    );
    expect(paths.size()).toBe(2);
    expect(paths.data().map((spec) => spec.key)).toEqual(["ny", "sf"]);
    expect(paths.attr("d")).not.toBe("");
    // The DOM carries the user's series metadata, so CSS and D3 code can use it.
    expect(
      Array.from(svgElement.querySelectorAll("g.view > path")).map((path) =>
        path.getAttribute("data-series"),
      ),
    ).toEqual(["ny", "sf"]);
    expect(
      select(svgElement)
        .selectAll<SVGPathElement, SeriesSpec<Row>>("g.view > path")
        .filter((spec) => spec.key === "sf")
        .attr("stroke"),
    ).toBe("orange");
    expect(svgElement.querySelectorAll("g.axis").length).toBe(3);
  });

  it("is idempotent: calling the component again reuses the same SVG", () => {
    const { svgElement, svg } = createChartDiv();
    const chart = timeSeriesChart<Row>()
      .x((d) => d.date)
      .series(twoSeries);

    svg.datum(rows).call(chart);
    svg.datum(rows).call(chart);

    expect(svgElement.querySelectorAll("g.view").length).toBe(2);
    expect(svgElement.querySelectorAll("rect.zoom-overlay").length).toBe(1);
    expect(svgElement.querySelectorAll("g.brush-layer").length).toBe(1);
    expect(svgElement.querySelectorAll("g.axis").length).toBe(3);
  });

  it("accepts data from the chart configuration as well as the selection", () => {
    const svg = datumlessSvg();
    const chart = timeSeriesChart<Row>()
      .x((d) => d.date)
      .series(twoSeries)
      .data(rows);

    // No datum bound: the component falls back to its own data.
    expectNoThrow(() => {
      svg.call(chart);
    });
    expect(svg.node()!.querySelectorAll("g.view").length).toBe(2);
  });

  it("exposes chainable getter/setters like any D3 component", () => {
    const chart = timeSeriesChart<Row>();
    expect(chart.scaleExtent()).toEqual([1, 40]);
    expect(chart.brush()).toBe(false);
    expect(chart.x()).toBeTypeOf("function");
    expect(chart.data()).toBeUndefined();

    const accessor = (d: Row) => d.date;
    expect(chart.x(accessor)).toBe(chart);
    expect(chart.x()).toBe(accessor);
    expect(chart.series(twoSeries)).toBe(chart);
    expect(chart.series()).toBe(twoSeries);
    expect(chart.scaleExtent([1, 10])).toBe(chart);
    expect(chart.scaleExtent()).toEqual([1, 10]);
    expect(chart.brush(true)).toBe(chart);
    expect(chart.brush()).toBe(true);
  });

  it("dispatches hovered points with pixel coordinates", async () => {
    const { svg } = createChartDiv();
    const events: ChartEvent<Row>[] = [];
    const points: HoverPoint<Row>[] = [];
    const chart = timeSeriesChart<Row>()
      .x((d) => d.date)
      .series(twoSeries)
      // The listener parameter is narrowed to the hover event.
      .on("hover", (event) => {
        points.push(...event.points);
        events.push(event);
      });

    svg.datum(rows).call(chart);
    // The engine reports the data point nearest to the given pixel.
    chart.hover(67.5);
    await frame();

    const hover = events.at(-1) as HoverChartEvent<Row>;
    expect(hover.type).toBe("hover");
    expect(hover.points.length).toBe(2);
    expect(points.slice(-2).map((point) => point.series.key)).toEqual([
      "ny",
      "sf",
    ]);
    expect(hover.index).toBe(1);
    expect(hover.date).toEqual(new Date(1000));
    expect(hover.datum).toBe(rows[1]);
    expect(hover.points.map((point) => point.value)).toEqual([1, 2]);
    // Markers snap to the data point: index 1 of 4 spans a 200px axis.
    expect(hover.points[0]!.x).toBeCloseTo(200 / 3, 5);
    expect(hover.points[1]!.x).toBeCloseTo(200 / 3, 5);
    // ny spans 0..3 (right axis), sf spans 1..3 (left axis): 100px tall.
    expect(hover.points[0]!.y).toBeCloseTo(100 - (100 * 1) / 3, 5);
    expect(hover.points[1]!.y).toBeCloseTo(50, 5);
  });

  it("re-emits hover after zooming so markers can follow the data", async () => {
    const { svg } = createChartDiv();
    const events: HoverChartEvent<Row>[] = [];
    const chart = timeSeriesChart<Row>()
      .x((d) => d.date)
      .series(twoSeries)
      .on("hover", (event) => events.push(event));

    svg.datum(rows).call(chart);
    chart.hover(150);
    await frame();
    const before = events.at(-1)!;

    chart.zoomToTimeWindow(rows[0]!.date, rows[1]!.date);
    await frame();
    await frame();

    const after = events.at(-1)!;
    expect(after.index).toBe(before.index);
    expect(after.points[0]!.x).not.toBeCloseTo(before.points[0]!.x, 3);
  });

  it("dispatches leave when the pointer leaves the chart", async () => {
    const { svg, svgElement } = createChartDiv();
    const events: ChartEvent<Row>[] = [];
    const chart = timeSeriesChart<Row>()
      .x((d) => d.date)
      .series(twoSeries)
      .on("hover", (event) => events.push(event))
      .on("leave", (event) => events.push(event));

    svg.datum(rows).call(chart);
    await frame();
    expect(events.some((event) => event.type === "hover")).toBe(true);

    select(svgElement).select("rect.zoom-overlay").dispatch("mouseleave");
    expect(events.at(-1)?.type).toBe("leave");
  });

  it("supports namespaced listeners like d3-dispatch", () => {
    const { svg } = createChartDiv();
    const first = vi.fn();
    const second = vi.fn();
    const chart = timeSeriesChart<Row>()
      .x((d) => d.date)
      .series(twoSeries)
      .on("render.one", first)
      .on("render.two", second);

    svg.datum(rows).call(chart);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    chart.off("render.one");
    svg.datum(rows).call(chart);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("removes its nodes on dispose", () => {
    const { svg, svgElement } = createChartDiv();
    const chart = timeSeriesChart<Row>()
      .x((d) => d.date)
      .series(twoSeries);

    svg.datum(rows).call(chart);
    chart.dispose();

    expect(svgElement.querySelectorAll("g.view").length).toBe(0);
    expect(svgElement.querySelectorAll("rect.zoom-overlay").length).toBe(0);
    expect(chart.getZoomTransform()).toBeUndefined();
  });

  it("rejects selections that do not contain an <svg> element", () => {
    const chart = timeSeriesChart<Row>()
      .x((d) => d.date)
      .series(twoSeries);
    const div = select(document.createElement("div")).datum(rows);

    expect(() => {
      div.call(chart);
    }).toThrow(/expects a selection containing an <svg> element/);
  });

  it("reports the missing pieces with actionable errors", () => {
    const withoutSeries = timeSeriesChart<Row>().x((d) => d.date);
    const withoutData = timeSeriesChart<Row>().series(twoSeries);
    const irregular = timeSeriesChart<Row>()
      .x((d, i) => (i === 2 ? new Date(5000) : d.date))
      .series(twoSeries);

    expect(() => {
      createChartDiv().svg.datum(rows).call(withoutSeries);
    }).toThrow(/at least one series/);
    expect(() => {
      datumlessSvg().call(withoutData);
    }).toThrow(/has no data/);
    expect(() => {
      createChartDiv().svg.datum(rows).call(irregular);
    }).toThrow(/evenly spaced/);
  });

  it("accepts a read-only data array", () => {
    const readonlyRows: readonly Row[] = rows;
    const chart = timeSeriesChart<Row>()
      .x((d) => d.date)
      .series(twoSeries);
    const svg = createChartDiv().svg;

    expectNoThrow(() => {
      svg.datum(readonlyRows).call(chart);
    });
    expect(chart.data()).toBeUndefined();
    expect(chart.data(readonlyRows)).toBe(chart);
    expect(chart.data()).toBe(readonlyRows);
  });
});
