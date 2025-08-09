/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { select, type Selection } from "d3-selection";
import { SeriesRenderer } from "./seriesRenderer.ts";

describe("SeriesRenderer", () => {
  it("skips segments for NaN values", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const renderer = new SeriesRenderer();
    renderer.init(select(svg), 2, [0, 1]);
    const data: Array<[number, number]> = [
      [0, 0],
      [NaN, NaN],
      [2, 2],
    ];

    renderer.draw(data);

    const d = select(svg).selectAll("path").attr("d");
    expect(d).not.toContain("1,");
    expect(d.match(/M/g)?.length).toBe(2);
  });

  it("only updates primary path when hasSf is false", () => {
    const svgSelection = select(document.createElement("div")).append(
      "svg",
    ) as unknown as Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
    const renderer = new SeriesRenderer();
    const [series] = renderer.init(svgSelection, 1, [0]);
    const pathNode = series.path as SVGPathElement;
    const spy = vi.spyOn(pathNode, "setAttribute");

    renderer.draw([[0], [1]]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(pathNode.getAttribute("d")).not.toBe("");
    expect(
      (svgSelection.node() as SVGSVGElement).querySelectorAll("path").length,
    ).toBe(1);

    spy.mockRestore();
  });

  it("init creates a view and path", () => {
    const svgSelection = select(document.createElement("div")).append(
      "svg",
    ) as unknown as Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
    const renderer = new SeriesRenderer();
    const [series] = renderer.init(svgSelection, 1, [0]);

    expect(series.view?.tagName).toBe("g");
    expect(series.path?.tagName).toBe("path");
  });
});
