import { updateNode } from "../utils/domNodeTransform.ts";

export const fixNaN = <T>(n: number, valueForNaN: T): number | T =>
  isNaN(n) ? valueForNaN : n;

export const updateDot = (
  val: number,
  idx: number,
  node: SVGGraphicsElement | null,
  dotScaleMatrix: SVGMatrix | undefined,
  identityMatrix: SVGMatrix,
) => {
  if (node && dotScaleMatrix) {
    updateNode(
      node,
      identityMatrix.translate(idx, val).multiply(dotScaleMatrix),
    );
  }
};
