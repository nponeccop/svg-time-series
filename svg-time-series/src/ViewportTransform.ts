import {
  scaleLinear,
  type ScaleContinuousNumeric,
  type ScaleLinear,
  type ScaleTime,
} from "d3-scale";
import { zoomIdentity, type ZoomTransform } from "d3-zoom";
import { scalesToDomMatrix } from "./utils/domMatrix.ts";

export class ViewportTransform {
  private baseScaleX: ScaleContinuousNumeric<number, number> = scaleLinear();
  private baseScaleY: ScaleContinuousNumeric<number, number> = scaleLinear();
  private scaleX: ScaleContinuousNumeric<number, number> = this.baseScaleX;
  private scaleY: ScaleContinuousNumeric<number, number> = this.baseScaleY;
  private zoomTransform: ZoomTransform = zoomIdentity;
  private composedMatrix: DOMMatrix = new DOMMatrix();

  private static readonly DET_EPSILON = 1e-12;

  private updateScales() {
    this.scaleX = this.zoomTransform.rescaleX(this.baseScaleX);
    this.scaleY = this.zoomTransform.rescaleY(this.baseScaleY);
    this.updateComposedMatrix();
  }

  private updateComposedMatrix() {
    this.composedMatrix = scalesToDomMatrix(this.scaleX, this.scaleY);
  }

  public onViewPortResize(
    viewScales: [
      ScaleLinear<number, number> | ScaleTime<number, number>,
      ScaleLinear<number, number> | ScaleTime<number, number>,
    ],
  ): this {
    const [viewX, viewY] = viewScales;
    this.baseScaleX = this.baseScaleX
      .copy()
      .range(viewX.range() as [number, number]);
    this.baseScaleY = this.baseScaleY
      .copy()
      .range(viewY.range() as [number, number]);
    this.updateScales();
    return this;
  }

  public onReferenceViewWindowResize(
    refScales: [
      ScaleContinuousNumeric<number, number>,
      ScaleContinuousNumeric<number, number>,
    ],
  ): this {
    const [refX, refY] = refScales;
    this.baseScaleX = this.baseScaleX
      .copy()
      .domain(refX.domain() as [number, number]);
    this.baseScaleY = this.baseScaleY
      .copy()
      .domain(refY.domain() as [number, number]);
    this.updateScales();
    return this;
  }

  public onZoomPan(t: ZoomTransform): this {
    this.zoomTransform = t;
    this.updateScales();
    return this;
  }

  private assertInvertible(scale: ScaleContinuousNumeric<number, number>) {
    const k = this.zoomTransform.k;
    const [d0, d1] = scale.domain() as [number, number];
    if (
      !Number.isFinite(k) ||
      Math.abs(k) < ViewportTransform.DET_EPSILON ||
      !Number.isFinite(d0) ||
      !Number.isFinite(d1) ||
      Math.abs(d1 - d0) < ViewportTransform.DET_EPSILON
    ) {
      throw new Error(
        "ViewportTransform: composed matrix is not invertible (determinant is zero)",
      );
    }
  }

  private toScreenPoint(x: number, y: number) {
    return new DOMPoint(x, y).matrixTransform(this.composedMatrix);
  }

  public fromScreenToModelX(x: number) {
    this.assertInvertible(this.scaleX);
    return this.scaleX.invert(x);
  }

  public fromScreenToModelY(y: number) {
    this.assertInvertible(this.scaleY);
    return this.scaleY.invert(y);
  }

  public fromScreenToModelBasisX(b: [number, number]): [number, number] {
    this.assertInvertible(this.scaleX);
    const [bp1, bp2] = b;
    const p1 = this.scaleX.invert(bp1);
    const p2 = this.scaleX.invert(bp2);
    return [p1, p2];
  }

  public toScreenFromModelX(x: number) {
    return this.toScreenPoint(x, 0).x;
  }

  public toScreenFromModelY(y: number) {
    return this.toScreenPoint(0, y).y;
  }

  public toScreenFromModelBasisX(b: [number, number]): [number, number] {
    const transformPoint = (x: number) => this.toScreenPoint(x, 0).x;
    const [bp1, bp2] = b;
    const p1 = transformPoint(bp1);
    const p2 = transformPoint(bp2);
    return [p1, p2];
  }

  public get matrix(): DOMMatrix {
    return this.composedMatrix;
  }
}
