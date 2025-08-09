export interface ChartOptions {
  /** Number of time series to display */
  seriesCount: number;
  /** Mapping from series index to Y-axis index. */
  seriesAxes: number[];
  /** Unix timestamp of the first data point. */
  startTime: number;
  /** Time difference between consecutive points in milliseconds. */
  timeStep: number;
  /** Whether to enable a secondary Y axis. */
  dualYAxis?: boolean;
}
