# svg-time-series

A small library for rendering high-performance SVG time series charts with D3. It exports a single class, `TimeSeriesChart`, which handles drawing, zooming and hover interactions.

## Installation

```sh
npm install svg-time-series
```

## Importing

```ts
import { TimeSeriesChart } from "svg-time-series";
```

## Basic usage

```ts
import { select } from "d3-selection";
import { TimeSeriesChart, ArrayDataSource } from "svg-time-series";

const svg = select("#chart").append("svg").append("g").attr("class", "view");
const legend = select("#legend");

// example data: [value1, value2]
const data: [number, number][] = [
  [10, 12],
  [11, 13],
];

// Create a datasource with start time and timestep
const ds = new ArrayDataSource(Date.now(), 1000, data);

const chart = new TimeSeriesChart(
  svg,
  legend,
  ds,
  () => {},
  () => {},
  (ts) => new Date(ts).toISOString(),
);
```

The last parameter allows customizing how timestamps appear in the legend. If
omitted, `TimeSeriesChart` uses `toLocaleString`.

## Demos

To explore complete examples with zooming and real-time updates, run the demos in [`samples`](../samples).

```sh
cd samples
npx vite
```

Then open `demo1.html` or `demo2.html` in your browser for interactive charts.
