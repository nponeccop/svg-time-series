/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { select, type Selection } from "d3-selection";
import { zoomIdentity } from "d3-zoom";

import { ChartData } from "../src/chart/data.ts";
import { setupRender } from "../src/chart/render.ts";
import { polyfillDom } from "../src/setupDom.ts";

vi.mock("../src/utils/domNodeTransform.ts", () => ({
  updateNode: vi.fn(),
}));

await polyfillDom();

function createData() {
  const dataRows = [[1], [2], [3]];
  return new ChartData({
    startTime: 0,
    timeStep: 1,
    length: dataRows.length,
    seriesAxes: [0],
    getSeries: (i, j) => dataRows[i]![j]!,
  });
}

describe("RenderState.refresh", () => {
  it("avoids recomputing transform for constant data", () => {
    const data = createData();
    const div = document.createElement("div");
    Object.defineProperty(div, "clientWidth", { value: 100 });
    Object.defineProperty(div, "clientHeight", { value: 50 });
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    div.appendChild(svgEl);

    const state = setupRender(
      select(svgEl) as unknown as Selection<
        SVGSVGElement,
        unknown,
        HTMLElement,
        unknown
      >,
      data,
    );

    const spy = vi.spyOn(state.xTransform, "onReferenceViewWindowResize");

    state.refresh(data, zoomIdentity);
    state.refresh(data, zoomIdentity);

    expect(spy).not.toHaveBeenCalled();

    state.destroy();
  });
});
