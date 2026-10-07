/**
 * Render the idiomatic-API demo chart head-less, without a browser.
 *
 *   node scripts/render-idiomatic-chart.mjs out.svg [out.png]
 *
 * The SVG output has no extra dependencies. The PNG output additionally needs
 * `@resvg/resvg-js` on the module path, e.g.
 *
 *   npm i --prefix /tmp/resvg @resvg/resvg-js
 *   NODE_PATH=/tmp/resvg/node_modules node scripts/render-idiomatic-chart.mjs chart.svg chart.png
 *
 * It is a smoke test for the D3 facade: it exercises the same configuration as
 * `samples/idiomatic/index.ts` (accessors, two Y axes, hover markers) and fails
 * loudly if the chart stops producing paths, axes or hover events.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromRoot = createRequire(path.join(root, "package.json"));

const { JSDOM } = requireFromRoot("jsdom");
const { select } = requireFromRoot("d3-selection");
const { timeSeriesChart } = await import(
  path.join(root, "svg-time-series/dist/draw.js")
);

const width = 1200;
const height = 500;

// ---------------------------------------------------------------- DOM setup
const dom = new JSDOM("<body><div id='chart'></div></body>", {
  pretendToBeVisual: true,
  contentType: "text/html",
});
const { window } = dom;
globalThis.window = globalThis; // for geometry-polyfill, as setupDom.ts does
await import(requireFromRoot.resolve("geometry-polyfill"));
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.SVGSVGElement = window.SVGSVGElement;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const container = window.document.getElementById("chart");
Object.defineProperty(container, "clientWidth", { value: width });
Object.defineProperty(container, "clientHeight", { value: height });
const svgElement = window.document.createElementNS(
  "http://www.w3.org/2000/svg",
  "svg",
);
// d3-zoom reads the element's own size; jsdom does not implement it.
Object.defineProperty(svgElement, "width", {
  value: { baseVal: { value: width } },
});
Object.defineProperty(svgElement, "height", {
  value: { baseVal: { value: height } },
});
container.appendChild(svgElement);

// ------------------------------------------------------------------- data
const csv = readFileSync(
  path.join(root, "samples/demos/ny-vs-sf.csv"),
  "utf8",
).trim();
const [headerLine, ...lines] = csv.split(/\r?\n/);
const columns = headerLine.split(",");
const startOfDay = new Date(2024, 0, 1).getTime();
const data = lines.map((line, index) => {
  const cells = line.split(",");
  return {
    date: new Date(startOfDay + index * 86400000),
    ny: Number.parseFloat(cells[columns.indexOf("NY")].split(";")[0]),
    sf: Number.parseFloat(cells[columns.indexOf("SF")].split(";")[0]),
  };
});

// --------------------------------------------------------- the chart itself
const hoverEvents = [];
const chart = timeSeriesChart()
  .x((d) => d.date)
  .series([
    { key: "ny", y: (d) => d.ny, stroke: "#88cc5b" },
    { key: "sf", y: (d) => d.sf, axis: 1, stroke: "#604dc4" },
  ])
  .scaleExtent([1, 80])
  .on("hover", (event) => hoverEvents.push(event));

const svg = select(svgElement).datum(data);
svg.call(chart);

const frame = () =>
  new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      resolve();
    });
  });
await frame();
await frame();

// Same legend/marker code as the browser demo: a plain d3 join.
const lastHover = hoverEvents.at(-1);
svg
  .selectAll("circle.hover-dot")
  .data(lastHover?.points ?? [], (point) => point.series.key)
  .join("circle")
  .attr("class", "hover-dot")
  .attr("r", 5)
  .attr("fill", (point) => point.series.stroke)
  .attr("stroke", "white")
  .attr("cx", (point) => point.x)
  .attr("cy", (point) => point.y);

svg
  .append("rect")
  .attr("x", 0)
  .attr("y", 0)
  .attr("width", width)
  .attr("height", height)
  .attr("fill", "white")
  .lower();
svg.insert("style", ":first-child").text(`
  .view, .axis, .zoom-overlay { fill: none; }
  .axis line { stroke-opacity: 0.3; stroke: #a6a6a6; }
  .tick text { fill: #454545; font-family: sans-serif; font-size: 11px; }
  .zoom-overlay { fill: none; }
`);

// ------------------------------------------------------------------- output
// XMLSerializer keeps the SVG namespace, which standalone SVG files (and XML
// parsers such as resvg) require; innerHTML would drop it.
const markup = new window.XMLSerializer().serializeToString(svgElement);

const svgOut = path.resolve(process.argv[2] ?? "idiomatic-chart.svg");
mkdirSync(path.dirname(svgOut), { recursive: true });
writeFileSync(svgOut, markup);
console.log(`wrote ${svgOut}`);

const pngOut = process.argv[3];
if (pngOut) {
  const resolved = require.resolve("@resvg/resvg-js");
  const { Resvg } = await import(pathToFileURL(resolved).href);
  const resvg = new Resvg(markup, {
    background: "white",
    fitTo: { mode: "width", value: width },
  });
  writeFileSync(path.resolve(pngOut), resvg.render().asPng());
  console.log(`wrote ${pngOut}`);
}

const paths = svgElement.querySelectorAll("g.view > path");
const ticks = svgElement.querySelectorAll(".tick");
console.log(
  `series paths: ${String(paths.length)}, axis groups: ${String(
    svgElement.querySelectorAll("g.axis").length,
  )}, ticks: ${String(ticks.length)}, hover events: ${String(hoverEvents.length)}`,
);

if (paths.length !== 2 || ticks.length === 0 || hoverEvents.length === 0) {
  throw new Error("idiomatic chart smoke test failed");
}
