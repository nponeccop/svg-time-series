/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import type { Selection } from "d3-selection";
import { select } from "d3-selection";
import { SeriesRenderer } from "../../src/chart/seriesRenderer.ts";
import { createSeries } from "../../src/chart/series.ts";

describe("SeriesRenderer", () => {
  describe("draw", () => {
    it("skips segments for NaN values", () => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const renderer = new SeriesRenderer();
      renderer.series = createSeries(
        select(svg) as unknown as Selection<
          SVGSVGElement,
          unknown,
          HTMLElement,
          unknown
        >,
        [0, 1],
      );
      const data: Array<[number, number]> = [
        [0, 0],
        [NaN, NaN],
        [2, 2],
      ];

      renderer.draw(data);

      const d = renderer.series[0]!.pathSelection.attr("d");
      expect(d).not.toContain("NaN");
      expect(d.match(/M/g)?.length).toBe(2);
    });

    it("only updates primary path when hasSf is false", () => {
      const svgSelection = select(document.createElement("div")).append(
        "svg",
      ) as unknown as Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
      const renderer = new SeriesRenderer();
      const seriesList = createSeries(svgSelection, [0]);
      const [series] = seriesList;
      renderer.series = seriesList;
      const spy = vi.spyOn(series!.pathSelection, "attr");

      renderer.draw([[0], [1]]);

      expect(spy).toHaveBeenCalledWith("d", expect.any(String));
      expect(series!.pathSelection.attr("d")).not.toBe("");
      expect(svgSelection.selectAll("path").nodes().length).toBe(1);

      spy.mockRestore();
    });
  });
});

describe("createSeries", () => {
  const makeSvg = () =>
    select(document.createElement("div")).append("svg") as unknown as Selection<
      SVGSVGElement,
      unknown,
      HTMLElement,
      unknown
    >;

  it("creates a view and path", () => {
    const svgSelection = makeSvg();
    const [series] = createSeries(svgSelection, [0]);

    expect(series!.viewSelection.node()?.tagName).toBe("g");
    expect(series!.pathSelection.node()?.tagName).toBe("path");
    expect(series!.id).toBe("series-0");
    expect(series!.axisIdx).toBe(0);
  });

  it("assigns each series its axis index and a distinct id", () => {
    const svgSelection = makeSvg();
    const series = createSeries(svgSelection, [0, 1, 1]);

    expect(series.map((s) => s.axisIdx)).toEqual([0, 1, 1]);
    expect(series.map((s) => s.id)).toEqual([
      "series-0",
      "series-1",
      "series-2",
    ]);
  });

  it("pairs each view with its own path", () => {
    const svgSelection = makeSvg();
    const series = createSeries(svgSelection, [0, 1, 1]);

    for (const s of series) {
      expect(s.pathSelection.node()?.parentNode).toBe(s.viewSelection.node());
    }
  });

  it("reuses existing nodes when called again with the same series count", () => {
    const svgSelection = makeSvg();
    const first = createSeries(svgSelection, [0, 1]);
    const second = createSeries(svgSelection, [0, 1]);

    expect(svgSelection.selectAll("g.view").nodes().length).toBe(2);
    expect(second.map((s) => s.viewSelection.node())).toEqual(
      first.map((s) => s.viewSelection.node()),
    );
    expect(second.map((s) => s.pathSelection.node())).toEqual(
      first.map((s) => s.pathSelection.node()),
    );
  });

  it("keeps a series bound to its node when its axis changes", () => {
    const svgSelection = makeSvg();
    const first = createSeries(svgSelection, [0, 0]);
    const second = createSeries(svgSelection, [0, 1]);

    expect(second[1]!.id).toBe(first[1]!.id);
    expect(second[1]!.viewSelection.node()).toBe(
      first[1]!.viewSelection.node(),
    );
    expect(second[1]!.axisIdx).toBe(1);
  });

  it("removes surplus nodes and keeps the survivors when the series count shrinks", () => {
    const svgSelection = makeSvg();
    const first = createSeries(svgSelection, [0, 1, 1]);
    const second = createSeries(svgSelection, [0]);

    expect(svgSelection.selectAll("g.view").nodes().length).toBe(1);
    expect(second[0]!.viewSelection.node()).toBe(
      first[0]!.viewSelection.node(),
    );
    expect(first[1]!.viewSelection.node()?.parentNode).toBeNull();
    expect(first[2]!.viewSelection.node()?.parentNode).toBeNull();
  });

  it("appends nodes and keeps the existing ones when the series count grows", () => {
    const svgSelection = makeSvg();
    const first = createSeries(svgSelection, [0]);
    const second = createSeries(svgSelection, [0, 1]);

    expect(svgSelection.selectAll("g.view").nodes().length).toBe(2);
    expect(second[0]!.viewSelection.node()).toBe(
      first[0]!.viewSelection.node(),
    );
    expect(second[1]!.viewSelection.node()).not.toBe(
      first[0]!.viewSelection.node(),
    );
    expect(second[1]!.pathSelection.node()?.tagName).toBe("path");
  });
});
