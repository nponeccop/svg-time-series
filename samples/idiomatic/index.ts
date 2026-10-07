import { csv } from "d3-fetch";
import type { BaseType, Selection } from "d3-selection";
import { select } from "d3-selection";

import type { HoverChartEvent, HoverPoint, SeriesSpec } from "svg-time-series";
import { timeSeriesChart } from "svg-time-series";

import { measure } from "../measure.ts";

/**
 * Same dataset as `demos/demo1.html`, but consumed through the idiomatic
 * facade: the chart is configured with accessors, driven by the selection's
 * datum and reports hover/zoom/brush through `d3-dispatch`. Everything else on
 * this page is ordinary D3: `select`, `data`, `join`.
 */
interface Row {
  date: Date;
  ny: number;
  sf: number;
}

interface CsvRow {
  NY: string;
  SF: string;
}

const days = 86400000;
const captions: Record<string, string> = {
  ny: "New York",
  sf: "San Francisco",
};

const seriesSpecs: SeriesSpec<Row>[] = [
  { key: "ny", y: (d) => d.ny, stroke: "var(--ny)" },
  { key: "sf", y: (d) => d.sf, axis: 1, stroke: "var(--sf)" },
];

async function loadRows(): Promise<Row[]> {
  const rows = (await csv("../demos/ny-vs-sf.csv")) as unknown as CsvRow[];
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return rows.map(({ NY, SF }, index) => ({
    date: new Date(startOfDay.getTime() + index * days),
    ny: parseFloat(NY.split(";")[0]!),
    sf: parseFloat(SF.split(";")[0]!),
  }));
}

type SvgSelection = Selection<BaseType, unknown, HTMLElement, unknown>;
type LegendSelection = Selection<HTMLElement, unknown, HTMLElement, unknown>;

/** A plain D3 join driven by the chart's `hover`/`leave` events. */
function drawHoverMarkers(
  svg: SvgSelection,
  event: HoverChartEvent<Row> | null,
): void {
  svg
    .selectAll<SVGCircleElement, HoverPoint<Row>>("circle.hover-dot")
    .data(event ? event.points : [], (point) => point.series.key)
    .join("circle")
    .attr("class", "hover-dot")
    .attr("data-series", (point) => point.series.key)
    .attr("fill", (point) => point.series.stroke ?? null)
    .attr("r", 3)
    .attr("cx", (point) => point.x)
    .attr("cy", (point) => point.y)
    .style("display", (point) => (Number.isNaN(point.value) ? "none" : null));
}

/** The legend is a stock D3 join as well; no chart-specific controller. */
function drawLegend(
  legend: LegendSelection,
  event: HoverChartEvent<Row> | null,
): void {
  const row = legend
    .selectAll<HTMLElement, SeriesSpec<Row>>(".legend-row")
    .data(seriesSpecs, (spec) => spec.key)
    .join((enter) => {
      const enterRow = enter.append("div").attr("class", "legend-row");
      enterRow
        .append("span")
        .attr("class", "legend-row__swatch")
        .style("background", (spec) => spec.stroke ?? null);
      enterRow
        .append("span")
        .attr("class", "legend-row__caption")
        .text((spec) => `${captions[spec.key] ?? spec.key}:`);
      enterRow.append("span").attr("class", "legend-row__value");
      return enterRow;
    });
  row.select<HTMLElement>(".legend-row__value").text((spec) => {
    const value = event?.points[seriesSpecs.indexOf(spec)]?.value;
    return value === undefined || Number.isNaN(value) ? "–" : value.toFixed(1);
  });
}

async function main(): Promise<void> {
  const rows = await loadRows();
  const svg = select("svg");
  const legend = select<HTMLElement, unknown>(".chart-legend");
  const legendTime = select<HTMLElement, unknown>(".chart-legend__time");

  const chart = timeSeriesChart<Row>()
    .x((d) => d.date)
    .series(seriesSpecs)
    .scaleExtent([1, 80])
    .on("hover", (event) => {
      drawHoverMarkers(svg, event);
      drawLegend(legend, event);
      legendTime.text(event.date ? event.date.toLocaleDateString() : "—");
    })
    .on("leave", () => {
      drawHoverMarkers(svg, null);
      drawLegend(legend, null);
      legendTime.text("");
    })
    .on("zoom", (event) => {
      select("#zoom-level").text(`k = ${event.transform.k.toFixed(2)}`);
    })
    .on("brush", (event) => {
      select("#brush-window").text(
        event.window
          ? `brushed ${new Date(event.window[0]).toLocaleDateString()} – ${new Date(event.window[1]).toLocaleDateString()}`
          : "",
      );
    });

  // The data lives in the DOM, exactly like any other D3 chart.
  svg.datum(rows).call(chart);

  select("#reset-zoom").on("click", () => {
    chart.resetZoom();
  });
  select("#zoom-to-quarter").on("click", () => {
    const last = rows[Math.floor(rows.length / 4)] ?? rows[rows.length - 1]!;
    chart.zoomToTimeWindow(rows[0]!.date, last.date);
  });
  select<HTMLButtonElement, unknown>("#toggle-brush").on(
    "click",
    function (this: HTMLButtonElement) {
      const enabled = !chart.brush();
      chart.brush(enabled);
      select(this).text(enabled ? "Disable brush" : "Toggle brush");
    },
  );

  measure(3, ({ fps }) => {
    select("#fps").text(`${fps.toFixed(1)} FPS`);
  });
}

void main().catch((error: unknown) => {
  document.body.append(
    `Failed to start the demo: ${error instanceof Error ? error.message : String(error)}`,
  );
  throw error;
});
