import { csv } from "d3-request";
import type { ValueFn } from "d3-selection";
import { select, selectAll, pointer } from "d3-selection";
import type { D3ZoomEvent } from "d3-zoom";
import { zoomIdentity } from "d3-zoom";

import type { IDataSource } from "svg-time-series";
import { TimeSeriesChart } from "svg-time-series";
import { LegendController } from "../LegendController.ts";
import { measure } from "../measure.ts";

export function drawCharts(
  data: [number, number][],
  seriesAxes: number[] = [0, 0],
): TimeSeriesChart[] {
  const charts: TimeSeriesChart[] = [];

  const onZoom = (
    sourceChart: TimeSeriesChart,
    event: D3ZoomEvent<SVGRectElement, unknown>,
  ) => {
    if (!event.sourceEvent) return;
    charts.forEach((c) => {
      if (c !== sourceChart) {
        c.interaction.zoom({
          ...event,
          sourceEvent: null,
          transform: zoomIdentity
            .translate(event.transform.x, event.transform.y)
            .scale(event.transform.k),
        });
      }
    });
  };
  const onMouseMove: (this: Element, event: MouseEvent) => void = function (
    this: Element,
    event: MouseEvent,
  ) {
    const [x] = pointer(event, this);
    charts.forEach((c) => {
      c.interaction.onHover(x);
    });
  };

  const onSelectChart: ValueFn<HTMLElement, unknown, void> = function () {
    const svg = select(this).select<SVGSVGElement>("svg");
    const legend = select(this).select<HTMLElement>(".chart-legend");
    const source: IDataSource = {
      startTime: Date.now(),
      timeStep: 86400000,
      length: data.length,
      seriesAxes,
      getSeries: (i, seriesIdx) => data[i][seriesIdx],
    };
    const legendController = new LegendController(legend);
    const chart = new TimeSeriesChart(
      svg,
      source,
      legendController,
      (event: D3ZoomEvent<SVGRectElement, unknown>) => {
        onZoom(chart, event);
      },
      onMouseMove,
    );
    charts.push(chart);
  };

  selectAll(".chart").each(onSelectChart);
  measure(3, ({ fps }) => {
    document.getElementById("fps").textContent = fps.toFixed(2);
  });

  return charts;
}

export function onCsv(): Promise<[number, number][]> {
  return new Promise((resolve, reject) => {
    csv("./ny-vs-sf.csv")
      .row((d: { NY: string; SF: string }) => [
        parseFloat(d.NY.split(";")[0]),
        parseFloat(d.SF.split(";")[0]),
      ])
      .get((error: Error | null, data: [number, number][]) => {
        if (error != null) {
          reject(error);
          return;
        }
        resolve(data);
      });
  });
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let resizeObservers: ResizeObserver[] = [];

export async function loadAndDraw(
  seriesAxes: number[] = [0, 0],
): Promise<TimeSeriesChart[]> {
  const data = await onCsv();
  const charts = drawCharts(data, seriesAxes);

  if (intervalId) {
    clearInterval(intervalId);
  }
  let j = 0;
  intervalId = setInterval(function () {
    const newData = data[j % data.length];
    charts.forEach((c) => {
      c.updateChartWithNewData([newData[0], newData[1]]);
    });
    j++;
  }, 5000);

  resizeObservers.forEach((o) => {
    o.disconnect();
  });
  resizeObservers = [];
  const containers = selectAll(".chart-drawing").nodes() as HTMLElement[];
  containers.forEach((el, i) => {
    const chart = charts[i]!;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0]!.contentRect;
      chart.interaction.resize({ width, height });
    });
    observer.observe(el);
    resizeObservers.push(observer);
  });

  return charts;
}

export async function initDemo(
  seriesAxes: number[],
): Promise<TimeSeriesChart[] | undefined> {
  try {
    const charts = await loadAndDraw(seriesAxes);
    charts.forEach((c) => {
      c.interaction.onHover(0);
    });
    const resetButton = document.getElementById("reset-zoom");
    resetButton?.addEventListener("click", () => {
      charts.forEach((c) => {
        c.interaction.resetZoom();
      });
    });

    const brushButton = document.getElementById("toggle-brush");
    if (brushButton) {
      let brushEnabled = false;
      brushButton.addEventListener("click", () => {
        brushEnabled = !brushEnabled;
        charts.forEach((c) => {
          if (brushEnabled) {
            c.interaction.enableBrush();
          } else {
            c.interaction.disableBrush();
          }
        });
        brushButton.textContent = brushEnabled
          ? "Disable Brush"
          : "Enable Brush";
      });
    }

    let disposed = false;
    const disposeAll = () => {
      if (!disposed) {
        disposed = true;
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        resizeObservers.forEach((o) => {
          o.disconnect();
        });
        resizeObservers = [];
      }
    };
    charts.forEach((c) => {
      const originalDispose = c.interaction.dispose;
      c.interaction.dispose = () => {
        disposeAll();
        originalDispose();
      };
    });

    return charts;
  } catch {
    alert("Data can't be downloaded or parsed");
    return undefined;
  }
}
