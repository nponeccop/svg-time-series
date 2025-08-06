export interface IDataSource {
  readonly length: number;
  readonly startTime: number;
  readonly timeStep: number;
  at(index: number): [number, number?];
  append(value: [number, number?]): void;
  toArray(): Array<[number, number?]>;
}

export class ArrayDataSource implements IDataSource {
  constructor(
    public startTime: number,
    public timeStep: number,
    private data: Array<[number, number?]>,
  ) {}

  get length(): number {
    return this.data.length;
  }

  at(index: number): [number, number?] {
    return this.data[index];
  }

  append(value: [number, number?]): void {
    this.data.push(value);
    this.data.shift();
  }

  toArray(): Array<[number, number?]> {
    return this.data;
  }
}

export class ConcatUint8ArrayDataSource implements IDataSource {
  private readonly seriesLength: number;

  constructor(
    public startTime: number,
    public timeStep: number,
    private data: Uint8Array,
  ) {
    if (data.length % 2 !== 0) {
      throw new Error("Concatenated array must have even length");
    }
    this.seriesLength = data.length / 2;
  }

  get length(): number {
    return this.seriesLength;
  }

  at(index: number): [number, number?] {
    const ny = this.data[index];
    const sf = this.data[index + this.seriesLength];
    return [ny, sf];
  }

  append(value: [number, number?]): void {
    const n = this.seriesLength;
    this.data.copyWithin(0, 1, n);
    this.data.copyWithin(n, n + 1, n * 2);
    this.data[n - 1] = value[0];
    if (value[1] !== undefined) {
      this.data[2 * n - 1] = value[1]!;
    }
  }

  toArray(): Array<[number, number?]> {
    const n = this.seriesLength;
    const arr: Array<[number, number?]> = new Array(n);
    for (let i = 0; i < n; i++) {
      arr[i] = [this.data[i], this.data[i + n]];
    }
    return arr;
  }
}
