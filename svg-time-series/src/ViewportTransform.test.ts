import { beforeAll, describe, expect, it } from "vitest";
import { zoomIdentity } from "d3-zoom";
import { scaleLinear } from "d3-scale";
import { polyfillDom } from "./setupDom.ts";
import type { ViewportTransform as ViewportTransformClass } from "./ViewportTransform.ts";
import { scalesToDomMatrix } from "./utils/domMatrix.ts";

await polyfillDom();

let ViewportTransform: typeof ViewportTransformClass;

beforeAll(async () => {
  ({ ViewportTransform } = await import("./ViewportTransform.ts"));
});

describe("ViewportTransform", () => {
  it("composes zoom and reference transforms and inverts them", () => {
    const vt = new ViewportTransform();

    vt.onViewPortResize([0, 100], [0, 100]);
    vt.onReferenceViewWindowResize([0, 10], [0, 10]);

    // without zoom
    expect(vt.fromScreenToModelX(50)).toBeCloseTo(5);
    expect(vt.fromScreenToModelY(20)).toBeCloseTo(2);

    // apply zoom: translate 10 and scale 2
    const zoom = zoomIdentity.translate(10, 0).scale(2);
    vt.onZoomPan(zoom);
    expect(vt.fromScreenToModelX(70)).toBeCloseTo(3);
    // `scale(2)` uniformly scales both axes, so y is halved
    expect(vt.fromScreenToModelY(20)).toBeCloseTo(1);

    const sx = scaleLinear().domain([0, 10]).range([0, 100]);
    const sy = scaleLinear().domain([0, 10]).range([0, 100]);
    const expected = scalesToDomMatrix(zoom.rescaleX(sx), zoom.rescaleY(sy));
    expect(vt.matrix.a).toBeCloseTo(expected.a);
    expect(vt.matrix.e).toBeCloseTo(expected.e);
  });

  it("maps screen bases back to model bases through inverse transforms", () => {
    const vt = new ViewportTransform();

    vt.onViewPortResize([0, 100], [0, 100]);
    vt.onReferenceViewWindowResize([0, 10], [0, 10]);
    vt.onZoomPan(zoomIdentity.translate(10, 0).scale(2));

    const basisX = vt.fromScreenToModelBasisX([20, 40]);
    const [x1, x2] = basisX;
    expect(x1).toBeCloseTo(0.5);
    expect(x2).toBeCloseTo(1.5);

    const basisY = vt.fromScreenToModelBasisY([20, 40]);
    const [y1, y2] = basisY;
    expect(y1).toBeCloseTo(1);
    expect(y2).toBeCloseTo(2);
  });

  it("converts screen points to model points", () => {
    const vt = new ViewportTransform();

    vt.onViewPortResize([0, 100], [0, 100]);
    vt.onReferenceViewWindowResize([0, 10], [0, 10]);
    vt.onZoomPan(zoomIdentity.translate(10, 0).scale(2));

    const x = vt.fromScreenToModelX(70);
    const y = vt.fromScreenToModelY(20);
    expect(x).toBeCloseTo(3);
    expect(y).toBeCloseTo(1);
  });

  it("round-trips between screen and model coordinates", () => {
    const vt = new ViewportTransform();

    vt.onViewPortResize([0, 100], [0, 100]);
    vt.onReferenceViewWindowResize([0, 10], [0, 10]);
    vt.onZoomPan(zoomIdentity.translate(10, 0).scale(2));

    const xScreen = 70;
    const xModel = vt.fromScreenToModelX(xScreen);
    expect(vt.toScreenFromModelX(xModel)).toBeCloseTo(xScreen);

    const yScreen = 20;
    const yModel = vt.fromScreenToModelY(yScreen);
    expect(vt.toScreenFromModelY(yModel)).toBeCloseTo(yScreen);

    const basisScreenX: [number, number] = [20, 40];
    const basisModelX = vt.fromScreenToModelBasisX(basisScreenX);
    const roundTripX = vt.toScreenFromModelBasisX(basisModelX);
    const [x1, x2] = roundTripX;
    expect(x1).toBeCloseTo(20);
    expect(x2).toBeCloseTo(40);

    const basisScreenY: [number, number] = [20, 40];
    const basisModelY = vt.fromScreenToModelBasisY(basisScreenY);
    const roundTripY = vt.toScreenFromModelBasisY(basisModelY);
    const [y1, y2] = roundTripY;
    expect(y1).toBeCloseTo(20);
    expect(y2).toBeCloseTo(40);
  });

  it("keeps pan offset constant when scaling", () => {
    const vt = new ViewportTransform();
    vt.onZoomPan(zoomIdentity.translate(50, 0));
    const t1 = vt.matrix.e;
    vt.onZoomPan(zoomIdentity.translate(50, 0).scale(2));
    const t2 = vt.matrix.e;
    expect(t1).toBeCloseTo(50);
    expect(t2).toBeCloseTo(50);
  });

  it("throws when the domain contains non-finite values", () => {
    const vt = new ViewportTransform();
    vt.onViewPortResize([0, 100], [0, 100]);
    vt.onReferenceViewWindowResize([NaN, 10], [0, 10]);
    expect(() => vt.fromScreenToModelX(0)).toThrow(/non-finite/);
  });

  it("throws when the range contains non-finite values", () => {
    const vt = new ViewportTransform();
    vt.onViewPortResize([NaN, 100], [0, 100]);
    vt.onReferenceViewWindowResize([0, 10], [0, 10]);
    expect(() => vt.fromScreenToModelX(0)).toThrow(/non-finite/);
  });
});
