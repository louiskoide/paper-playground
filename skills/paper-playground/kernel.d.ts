// paper-playground kernel 0.1.0: the API generated code may use. The kernel itself is inlined by
// scripts/build.mjs; never write or copy it. Everything below is a global.

/** Mount the figure. Call exactly once. Params, metrics, title and the self-test come from the frozen
 *  extraction; the definition supplies only behaviour. */
declare function playground(def: Def): void;

type Params = Record<string, number | boolean | string>; // keyed by the extraction's param names
type Metrics = Record<string, number | null>;              // exactly the extraction's metric names
type Trace = { t: number[] } & Record<string, (number | null)[]>; // every metric at every step so far

interface Common {
  caption: string;                         // bottom-left instruction: lowercase imperative, ≤ 60 chars
  metrics(s: any, p: Params, trace: Trace): Metrics; // null = not defined yet; NaN/±Infinity = diverged (halts the run)
  readout?(s: any, p: Params, m: Metrics): string;   // optional; replaces the default "label value · …" tail
  aspect?: number;                         // canvas width / height, default 1.6
  rate?: number;                           // steps per second while playing; default: whole run in ~4 s
}

/** Exactly one of these shapes, matching the extraction's archetype. */
type Def = Common & (
  | { /* dynamical */ init(p: Params, rand: () => number): { y: number[] } & any; deriv(y: number[], p: Params, t: number): number[];
      dt?: number; substeps?: number; draw: Draw }                 // kernel: RK4, s.t, s.path = { t[], y[component][] }
  | { /* dynamical (discrete), iterative, grid */ init(p: Params, rand: () => number): any;
      step?(s: any, p: Params, rand: () => number): any | void;  // grid may name it update
      update?(s: any, p: Params, rand: () => number): any | void; draw: Draw }
  | { /* sweep */ f(x: number, p: Params): number | number[]; domain?(p: Params): [number, number, number] | [number, number, number, 'log'];
      init?(p: Params, rand: () => number, curve: { x: number[]; y: number[][] }): object; draw: Draw } // s = { x, y[series][] }
  | { /* stochastic */ sample(p: Params, rand: () => number): number | { value: number }; batch?: number;
      init?(p: Params, rand: () => number): object; draw: Draw }  // s = { samples: number[], draws: object[] }
  | { /* pipeline */ stages: { name: string; run(prev: any, p: Params, rand: () => number, s: any): any; draw(g: G, out: any, p: Params, s: any): void }[];
      init?(p: Params, rand: () => number): object }              // s = { outs: any[], view: number }
  | { /* diagram */ init(p: Params, rand: () => number): any; drag?(key: string, x: number, y: number, p: Params): Partial<Params> | void; draw: Draw }
);
type Draw = (g: G, s: any, p: Params, m: Metrics, trace: Trace) => void;

/** Drawing context. Every call is recorded (the self-test hashes them), so draw only through g.
 *  Coordinates are data coordinates of the last axes() call; without axes(), the unit square. */
interface G {
  split(spec: '1x2' | '2x1' | '2x2' | number): G[];  // rows x cols panels
  title(s: string): G;                     // small caption above the panel; call before axes()
  axes(o: { x: [number, number]; y: [number, number]; xlabel?: string; ylabel?: string; xlog?: boolean; ylog?: boolean; xticks?: boolean; yticks?: boolean }): G;
  line(xs: ArrayLike<number>, ys: ArrayLike<number>, o?: { series?: 0 | 1 | 2 | 3; label?: string; dash?: number[]; width?: number }): G; // non-finite points break the line
  line(ys: ArrayLike<number>, o?: object): G; // xs = indices
  scatter(xs: ArrayLike<number>, ys: ArrayLike<number>, o?: { series?: number; r?: number; label?: string; live?: number }): G;
  bars(labels: string[], values: number[], o?: { series?: number; live?: number; y?: [number, number] }): G; // sets its own axes if none
  hist(values: ArrayLike<number>, o?: { bins?: number; range?: [number, number]; density?: boolean; series?: number; label?: string }): G;
  heatmap(M: number[][] | Grid, o?: { range?: [number, number]; rowLabels?: string[]; colLabels?: string[]; diverging?: boolean; values?: boolean }): G;
  cells(grid: Grid, o?: { range?: [number, number]; diverging?: boolean }): G; // after heatmap/cells, x = column, y = row (0 at top)
  field(fn: (x: number, y: number) => [number, number], o?: { n?: number; series?: number }): G; // arrows over the current axes
  graph(nodes: { x: number; y: number; label?: string; r?: number; live?: boolean; drag?: string }[],
        edges?: ([number, number] | { a: number; b: number; label?: string; live?: boolean; dash?: boolean; arrow?: boolean })[],
        o?: { r?: number; arrows?: boolean }): G;
  text(x: number, y: number, s: string, o?: { anchor?: 'start' | 'middle' | 'end'; live?: boolean; size?: number }): G;
  marker(x: number, y: number, o?: { label?: string; r?: number }): G; // ring in the live colour
  vline(x: number, o?: { label?: string; series?: number; dash?: number[] }): G;
  hline(y: number, o?: { label?: string; series?: number; dash?: number[] }): G;
}
// Series styles: 0 = live colour (the thing the claim is about), 1 = grey, 2 = grey dashed, 3 = grey dotted.
// Heatmaps ramp from the panel colour to the live colour; diverging maps put negatives in a muted red.

interface Grid { w: number; h: number; data: Float32Array } // row-major
declare function makeGrid(w: number, h: number, fill?: number): Grid;

declare function rand(): number;   // seeded uniform [0, 1); reseeded on reset and on every self-test run
declare function randn(): number;  // seeded standard normal
declare const fixed: Readonly<Record<string, any>>; // the extraction's fixed constants
declare function fmt(x: number | null, digits?: number): string; // 3 significant digits, 1.2e-4 style when tiny or huge
declare function clamp(x: number, lo: number, hi: number): number;
declare function lerp(a: number, b: number, t: number): number;
declare function linspace(a: number, b: number, n: number): number[];
declare function logspace(a: number, b: number, n: number): number[]; // a, b are values, not exponents
declare function extent(...arrays: any[]): [number, number];         // padded min/max over (nested) arrays
declare function sum(xs: ArrayLike<number>): number;
declare function mean(xs: ArrayLike<number>): number;
declare function std(xs: ArrayLike<number>): number;                 // population sd
declare function argmax(xs: ArrayLike<number>): number;
declare function softmax(xs: number[], temperature?: number): number[];
declare function zeros(rows: number, cols: number): number[][];
declare function matmul(A: number[][], B: number[][]): number[][];
declare function transpose(A: number[][]): number[][];
declare function rk4(f: (y: number[], p: Params, t: number) => number[], y: number[], p: Params, t: number, h: number): number[];
