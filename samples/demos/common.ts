import { csv } from "d3-request";
import { ValueFn, select, selectAll, pointer } from "d3-selection";
import { D3ZoomEvent } from "d3-zoom";

import { TimeSeriesChart, ArrayDataSource } from "svg-time-series";
import { measure } from "../measure.ts";

export function drawCharts(data: [number, number][]) {
  const charts: TimeSeriesChart[] = [];

  const onZoom = (event: D3ZoomEvent<Element, unknown>) =>
    charts.forEach((c) => c.zoom(event));
  const onMouseMove = (event: MouseEvent) => {
    const [x, _] = pointer(event, event.target);
    charts.forEach((c) => c.onHover(x));
  };

  const onSelectChart: ValueFn<HTMLElement, unknown, void> = function (
    _datum,
    _index,
    _groups,
  ) {
    const svg = select(this).select("svg");
    const legend = select(this).select(".chart-legend");
    const chart = new TimeSeriesChart(
      svg,
      legend,
      new ArrayDataSource(
        Date.now(),
        86400000,
        data.map((_) => _),
      ),
      onZoom,
      onMouseMove,
    );
    charts.push(chart);
  };

  selectAll(".chart").each(onSelectChart);

  let j = 0;
  setInterval(function () {
    const newData = data[j % data.length];
    charts.forEach((c) => c.updateChartWithNewData(newData));
    j++;
  }, 5000);
  measure(3, (fps) => {
    document.getElementById("fps").textContent = fps;
  });
}

export function onCsv(f: (csv: [number, number][]) => void): void {
  csv("ny-vs-sf.csv")
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

export function loadAndDraw() {
  onCsv((data: [number, number][]) => {
    drawCharts(data);

    resize.request = function () {
      resize.timer && clearTimeout(resize.timer);
      resize.timer = setTimeout(resize.eval, resize.interval);
    };
    resize.eval = function () {
      selectAll("svg").remove();
      selectAll(".chart-drawing")
        .append("svg")
        .append("g")
        .attr("class", "view");
      drawCharts(data);
    };
  });
}
