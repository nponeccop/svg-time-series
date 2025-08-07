/**
 * Manages the lifecycle and interactions for a chart's legend.
 * Implementations handle hover events, redraw the legend when the
 * underlying data or state changes, and clean up resources when the
 * legend is destroyed.
 */
export interface ILegendController {
  /**
   * Highlights legend entries for the data point at the given index.
   * @param idx Index of the hovered data point within the chart's data set.
   */
  onHover: (idx: number) => void;

  /**
   * Recomputes and rerenders legend content to reflect current chart state.
   */
  refresh: () => void;

  /**
   * Releases resources and removes event listeners associated with the legend.
   */
  destroy: () => void;
}
