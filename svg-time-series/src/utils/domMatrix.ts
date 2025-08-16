import type { ScaleContinuousNumeric } from "d3-scale";
import { zoomIdentity, type ZoomTransform } from "d3-zoom";

function zoomTransformFromScale(
  scale: ScaleContinuousNumeric<number, number>,
  axis: "x" | "y",
): ZoomTransform {
  const [d0, d1] = scale.domain() as [number, number];
  const [r0, r1] = scale.range() as [number, number];
  const k = (r1 - r0) / (d1 - d0);
  const b = r0 - d0 * k;
  return axis === "x"
    ? zoomIdentity.translate(b, 0).scale(k)
    : zoomIdentity.translate(0, b).scale(k);
}

function fromInit(init: DOMMatrixInit): DOMMatrix {
  const ctor = DOMMatrix as unknown as {
    fromMatrix?: (init: DOMMatrixInit) => DOMMatrix;
  };
  if (typeof ctor.fromMatrix === "function") {
    return ctor.fromMatrix(init);
  }
  const m = new DOMMatrix();
  m.a = init.a ?? 1;
  m.b = init.b ?? 0;
  m.c = init.c ?? 0;
  m.d = init.d ?? 1;
  m.e = init.e ?? 0;
  m.f = init.f ?? 0;
  return m;
}

/**
 * Convert a D3 scale's domain and range into a DOMMatrix along a specific axis.
 */
export function scaleToDomMatrix(
  scale: ScaleContinuousNumeric<number, number>,
  axis: "x" | "y" = "x",
): DOMMatrix {
  const t = zoomTransformFromScale(scale, axis);
  const init =
    axis === "x"
      ? { a: t.k, d: 1, e: t.x, f: t.y }
      : { a: 1, d: t.k, e: t.x, f: t.y };
  return fromInit(init);
}

/**
 * Combine independent X and Y scales into a single DOMMatrix.
 */
export function scalesToDomMatrix(
  scaleX: ScaleContinuousNumeric<number, number>,
  scaleY: ScaleContinuousNumeric<number, number>,
): DOMMatrix {
  const tx = zoomTransformFromScale(scaleX, "x");
  const ty = zoomTransformFromScale(scaleY, "y");
  return fromInit({ a: tx.k, d: ty.k, e: tx.x, f: ty.y });
}
