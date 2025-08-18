import { scaleLinear, type ScaleLinear } from "d3-scale";
import { zoomIdentity, type ZoomTransform } from "d3-zoom";
import { scalesToDomMatrix } from "./utils/domMatrix.ts";

export class ViewportTransform {
  private baseScaleX = scaleLinear();
  private baseScaleY = scaleLinear();
  private zoomTransform: ZoomTransform = zoomIdentity;
  private composedMatrix: DOMMatrix = new DOMMatrix();
  private updateMatrix() {
    const scaleX = this.zoomTransform.rescaleX(this.baseScaleX);
    const scaleY = this.zoomTransform.rescaleY(this.baseScaleY.copy());
    this.composedMatrix = scalesToDomMatrix(scaleX, scaleY);
  }

  public onViewPortResize(
    viewX: readonly [number, number],
    viewY: readonly [number, number],
  ): this {
    this.baseScaleX = this.baseScaleX.copy().range(viewX as [number, number]);
    this.baseScaleY = this.baseScaleY.copy().range(viewY as [number, number]);
    this.updateMatrix();
    return this;
  }

  public onReferenceViewWindowResize(
    refX: readonly [number, number],
    refY: readonly [number, number],
  ): this {
    this.baseScaleX = this.baseScaleX.copy().domain(refX as [number, number]);
    this.baseScaleY = this.baseScaleY.copy().domain(refY as [number, number]);
    this.updateMatrix();
    return this;
  }

  public onZoomPan(t: ZoomTransform): this {
    this.zoomTransform = t;
    this.updateMatrix();
    return this;
  }

  private assertFiniteScale(scale: ScaleLinear<number, number>) {
    const [d0, d1] = scale.domain() as [number, number];
    const [r0, r1] = scale.range() as [number, number];
    if (
      !Number.isFinite(d0) ||
      !Number.isFinite(d1) ||
      !Number.isFinite(r0) ||
      !Number.isFinite(r1)
    ) {
      throw new Error(
        "ViewportTransform: scale domain or range contains non-finite values",
      );
    }
  }

  private currentScaleX() {
    return this.zoomTransform.rescaleX(this.baseScaleX);
  }

  private currentScaleY() {
    return this.zoomTransform.rescaleY(this.baseScaleY.copy());
  }

  public fromScreenToModelX(x: number) {
    const scale = this.currentScaleX();
    this.assertFiniteScale(scale);
    return scale.invert(x);
  }

  public fromScreenToModelY(y: number) {
    const scale = this.currentScaleY();
    this.assertFiniteScale(scale);
    return scale.invert(y);
  }

  public fromScreenToModelBasisX(
    b: readonly [number, number],
  ): [number, number] {
    const scale = this.currentScaleX();
    this.assertFiniteScale(scale);
    return [scale.invert(b[0]), scale.invert(b[1])];
  }

  public fromScreenToModelBasisY(
    b: readonly [number, number],
  ): [number, number] {
    const scale = this.currentScaleY();
    this.assertFiniteScale(scale);
    return [scale.invert(b[0]), scale.invert(b[1])];
  }

  public toScreenFromModelX(x: number) {
    const scale = this.currentScaleX();
    this.assertFiniteScale(scale);
    return scale(x);
  }

  public toScreenFromModelY(y: number) {
    const scale = this.currentScaleY();
    this.assertFiniteScale(scale);
    return scale(y);
  }

  public toScreenFromModelBasisX(
    b: readonly [number, number],
  ): [number, number] {
    const scale = this.currentScaleX();
    this.assertFiniteScale(scale);
    return [scale(b[0]), scale(b[1])];
  }

  public toScreenFromModelBasisY(
    b: readonly [number, number],
  ): [number, number] {
    const scale = this.currentScaleY();
    this.assertFiniteScale(scale);
    return [scale(b[0]), scale(b[1])];
  }

  public get matrix(): DOMMatrix {
    return this.composedMatrix;
  }
}
