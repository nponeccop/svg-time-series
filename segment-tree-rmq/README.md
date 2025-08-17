# segment-tree-rmq

A lightweight TypeScript implementation of a generic segment tree for efficient range queries.
It supports any associative operation (such as `Math.min`, `Math.max`, or addition) and allows updates and queries in **O(log N)** time.

This package powers the autoscaling logic in [svg-time-series](../svg-time-series/README.md) by quickly finding the minimum and maximum values visible on each axis.

## Installation

This package is not yet published to npm. To try it out from this repository:

```sh
npm install path/to/svg-time-series/segment-tree-rmq
```

## Usage

```ts
import { SegmentTree } from "segment-tree-rmq";

// Build a min segment tree
const data = [5, 3, 8, 6, 2, 7];
const tree = new SegmentTree(data, (a, b) => Math.min(a, b), Infinity);

// Query the minimum value in the inclusive range [1, 4]
console.log(tree.query(1, 4)); // 2

// Query using a half-open range [1, 5)
console.log(tree.queryRange(1, 5)); // 2

// Update a value and query again
tree.update(3, 1);
console.log(tree.query(1, 4)); // 1
```

## Testing

Unit tests reside in `src/` and can be run with `npm test` from this package or the repository root.

## Relation to svg-time-series

`svg-time-series` uses `segment-tree-rmq` to perform fast range minimum/maximum queries when determining the vertical scale of time-series charts.
