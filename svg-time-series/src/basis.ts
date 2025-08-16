export type Basis = [number, number];
export type DirectProductBasis = [Basis, Basis];

export const bPlaceholder: Basis = [0, 1];

export function basisRange(b: Basis): number {
  return Math.abs(b[1] - b[0]);
}
