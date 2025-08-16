import { bench, describe } from "vitest";
import { ChartData } from "../src/chart/data.ts";
import type { IDataSource } from "../src/chart/data.ts";
import { sizes, datasets } from "./timeSeriesData.ts";

describe("axisTransform performance", () => {
  sizes.forEach((size, idx) => {
    const dataset = datasets[idx]!.map((d) => [d[1]]);
    const source: IDataSource = {
      startTime: 0,
      timeStep: 1,
      length: dataset.length,
      seriesAxes: [0],
      getSeries: (i) => dataset[i]![0]!,
    };
    const cd = new ChartData(source);
    const dIndex: [number, number] = [0, size - 1];
    bench(`cached size ${String(size)}`, () => {
      cd.axisTransform(0, dIndex);
    });
    bench(`rebuild size ${String(size)}`, () => {
      const tree = cd.buildAxisTree(0);
      cd.updateScaleY(dIndex, tree);
    });
  });
});
