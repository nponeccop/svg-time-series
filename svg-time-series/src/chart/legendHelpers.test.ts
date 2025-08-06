/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fixNaN, updateDot } from "./legendHelpers.ts";

class Matrix {
  constructor(
    public tx = 0,
    public ty = 0,
  ) {}
  translate(tx: number, ty: number) {
    return new Matrix(this.tx + tx, this.ty + ty);
  }
  multiply(m: Matrix) {
    return new Matrix(this.tx + m.tx, this.ty + m.ty);
  }
}

const nodeTransforms = new Map<SVGGraphicsElement, Matrix>();
vi.mock("../utils/domNodeTransform.ts", () => ({
  updateNode: (node: SVGGraphicsElement, matrix: Matrix) => {
    nodeTransforms.set(node, matrix);
  },
}));

beforeEach(() => {
  nodeTransforms.clear();
});

describe("legend helpers", () => {
  it("fixNaN replaces NaN values", () => {
    expect(fixNaN(NaN, 5)).toBe(5);
    expect(fixNaN(3, 5)).toBe(3);
  });

  it("updateDot applies node transform", () => {
    const node = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    updateDot(42, 7, node, new Matrix() as any, new Matrix() as any);
    const transform = nodeTransforms.get(node)!;
    expect(transform.tx).toBe(7);
    expect(transform.ty).toBe(42);
  });

  it("updateDot works with sanitized NaN values", () => {
    const node = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    const val = fixNaN(NaN, 0);
    updateDot(val, 3, node, new Matrix() as any, new Matrix() as any);
    const transform = nodeTransforms.get(node)!;
    expect(transform.tx).toBe(3);
    expect(transform.ty).toBe(0);
  });
});
