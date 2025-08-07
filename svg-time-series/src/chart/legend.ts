export interface ILegendController {
  highlightIndex: (idx: number) => void;
  refresh: () => void;
  destroy: () => void;
}
