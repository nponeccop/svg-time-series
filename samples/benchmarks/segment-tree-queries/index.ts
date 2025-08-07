import { select, selectAll } from "d3-selection";
import { line } from "d3-shape";

import { measure, measureOnce, onCsv } from "../bench.ts";
import { TimeSeriesChart } from "./draw.ts";
import type { TimePoint } from "svg-time-series";

onCsv((data: TimePoint[]) => {
  const filteredData = data.filter((_, i) => i % 10 == 0);
  const path = selectAll("g.view")
    .selectAll("path")
    .data([0, 1])
    .enter()
    .append("path")
    .attr("d", (cityIdx: number) =>
      line<TimePoint>()
        .defined((d) => !isNaN(cityIdx === 0 ? d.ny : d.sf!))
        .x((_, i) => i * 10)
        .y((d) => (cityIdx === 0 ? d.ny : d.sf!))
        .call(null, filteredData),
    );

  selectAll("svg").each(function () {
    return new TimeSeriesChart(select(this), data);
  });

  measure(3, ({ fps }) => {
    document.getElementById("fps").textContent = fps.toFixed(2);
  });

  measureOnce(60, ({ fps }) => {
    alert(`${window.innerWidth}x${window.innerHeight} FPS = ${fps.toFixed(2)}`);
  });
});
