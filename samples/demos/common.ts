import { csv } from "d3-request";
import { ValueFn, select, selectAll, pointer } from "d3-selection";
import { D3ZoomEvent } from "d3-zoom";

import {
  TimeSeriesChart,
  type IDataSource,
  type ChartOptions,
} from "svg-time-series";
import { LegendController } from "../LegendController.ts";
import { measure } from "../measure.ts";

export function drawCharts(
  data: [number, number][],
  seriesAxes: number[] = [0, 0],
) {
  const charts: TimeSeriesChart[] = [];

  const onZoom = (event: D3ZoomEvent<SVGRectElement, unknown>) =>
    charts.forEach((c) => c.interaction.zoom(event));
  const onMouseMove: (this: Element, event: MouseEvent) => void = function (
    this: Element,
    event: MouseEvent,
  ) {
    const [x] = pointer(event, this);
    charts.forEach((c) => c.interaction.onHover(x));
  };

  const onSelectChart: ValueFn<HTMLElement, unknown, void> = function () {
    const svg = select(this).select<SVGSVGElement>("svg");
    const legend = select(this).select<HTMLElement>(".chart-legend");
    const source: IDataSource = {
      length: data.length,
      getSeries: (i, seriesIdx) => data[i][seriesIdx],
    };
    const options: ChartOptions = {
      startTime: Date.now(),
      timeStep: 86400000,
      seriesCount: 2,
      seriesAxes,
    };
    const legendController = new LegendController(legend);
    const chart = new TimeSeriesChart(
      svg,
      source,
      options,
      legendController,
      onZoom,
      onMouseMove,
    );
    charts.push(chart);
  };

  selectAll(".chart").each(onSelectChart);

  let j = 0;
  setInterval(function () {
    const newData = data[j % data.length];
    charts.forEach((c) => c.updateChartWithNewData(newData[0], newData[1]));
    j++;
  }, 5000);
  measure(3, ({ fps }) => {
    document.getElementById("fps").textContent = fps.toFixed(2);
  });
}

export function onCsv(f: (csv: [number, number][]) => void): void {
  csv("./ny-vs-sf.csv")
    .row((d: { NY: string; SF: string }) => [
      parseFloat(d.NY.split(";")[0]),
      parseFloat(d.SF.split(";")[0]),
    ])
    .get((error: null, data: [number, number][]) => {
      if (error != null) {
        alert("Data can't be downloaded or parsed");
        return;
      }
      f(data);
    });
}

interface Resize {
  interval: number;
  request: (() => void) | null;
  timer: ReturnType<typeof setTimeout> | null;
  eval: (() => void) | null;
}

const resize: Resize = { interval: 60, request: null, timer: null, eval: null };

export function loadAndDraw(seriesAxes: number[] = [0, 0]) {
  onCsv((data: [number, number][]) => {
    drawCharts(data, seriesAxes);

    resize.request = function () {
      if (resize.timer) clearTimeout(resize.timer);
      resize.timer = setTimeout(resize.eval, resize.interval);
    };
    resize.eval = function () {
      selectAll("svg").remove();
      selectAll(".chart-drawing")
        .append("svg")
        .append("g")
        .attr("class", "view");
      drawCharts(data, seriesAxes);
    };
  });
}
