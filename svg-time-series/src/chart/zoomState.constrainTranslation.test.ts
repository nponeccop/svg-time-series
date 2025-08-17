/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { zoomIdentity } from "d3-zoom";
import { constrainTranslation } from "./zoomState.ts";

describe("constrainTranslation", () => {
  it("clamps translation when panned beyond left/top", () => {
    const current = zoomIdentity.translate(30, 40).scale(2);
    const constrained = constrainTranslation(current, 50, 50);
    expect(constrained).toMatchObject({ x: 0, y: 0, k: 2 });
  });

  it("clamps translation when panned beyond right/bottom", () => {
    const current = zoomIdentity.translate(-120, -80).scale(2);
    const constrained = constrainTranslation(current, 50, 50);
    expect(constrained).toMatchObject({ x: -50, y: -50, k: 2 });
  });

  it("returns original transform when already inside bounds", () => {
    const current = zoomIdentity.translate(-20, -30).scale(2);
    const constrained = constrainTranslation(current, 50, 50);
    expect(constrained).toBe(current);
  });

  it("returns original transform at left/top boundary", () => {
    const current = zoomIdentity.translate(0, 0).scale(2);
    const constrained = constrainTranslation(current, 50, 50);
    expect(constrained).toBe(current);
  });

  it("returns original transform at right/bottom boundary", () => {
    const current = zoomIdentity.translate(-50, -50).scale(2);
    const constrained = constrainTranslation(current, 50, 50);
    expect(constrained).toBe(current);
  });

  it("returns original transform when no adjustment needed", () => {
    const current = zoomIdentity;
    const constrained = constrainTranslation(current, 100, 100);
    expect(constrained).toBe(current);
  });
});
