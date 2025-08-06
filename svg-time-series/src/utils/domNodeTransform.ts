export function updateNode(n: SVGGraphicsElement, m: DOMMatrix | SVGMatrix) {
  const svgTranformList = n.transform.baseVal;
  const t = svgTranformList.createSVGTransformFromMatrix(m);
  svgTranformList.initialize(t);
}
