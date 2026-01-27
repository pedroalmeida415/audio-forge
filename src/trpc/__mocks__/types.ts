import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "~/server/api/root";

// ============================================================================
// Shared types for procedure spy (used by both real and mock implementations)
// ============================================================================

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

/**
 * Extracts all procedure paths from RouterInputs.
 * e.g., "file.getWaveformUrl" | "clippingSession.onDiarizationComplete" | ...
 */
export type AppProcedurePath = {
  [K in keyof RouterInputs]: keyof RouterInputs[K] extends string
    ? `${K & string}.${keyof RouterInputs[K]}`
    : never;
}[keyof RouterInputs];

/**
 * Split a dot-separated path into tuple segments.
 * "file.getWaveformUrl" -> ["file", "getWaveformUrl"]
 */
type Split<
  S extends string,
  D extends string = ".",
> = S extends `${infer Head}${D}${infer Tail}`
  ? [Head, ...Split<Tail, D>]
  : [S];

/**
 * Navigate a nested object type by path segments.
 * GetByPath<{ file: { get: number } }, ["file", "get"]> -> number
 */
type GetByPath<T, Path extends string[]> = Path extends [
  infer First,
  ...infer Rest,
]
  ? First extends keyof T
    ? Rest extends string[]
      ? GetByPath<T[First], Rest>
      : T[First]
    : never
  : T;

/** Get the input type for a procedure path */
export type ProcedureInput<P extends AppProcedurePath> = GetByPath<
  RouterInputs,
  Split<P>
>;

/** Get the output type for a procedure path */
export type ProcedureOutput<P extends AppProcedurePath> = GetByPath<
  RouterOutputs,
  Split<P>
>;

export type ProcedureCall<P extends AppProcedurePath = AppProcedurePath> = {
  path: P;
  type: "query" | "mutation" | "subscription";
  input: P extends AppProcedurePath ? ProcedureInput<P> : unknown;
  output?: P extends AppProcedurePath ? ProcedureOutput<P> : unknown;
};

/** Accessor for a specific procedure's spy data */
export type ProcedureSpyAccessor<P extends AppProcedurePath> = {
  /** Whether this procedure was called */
  readonly wasCalled: boolean;
  /** All calls to this procedure (with typed input/output) */
  readonly calls: ProcedureCall<P>[];
};

export type ProcedureSpy = {
  /** Access spy data for a specific procedure */
  [P in AppProcedurePath]: ProcedureSpyAccessor<P>;
} & {
  /** Get all tracked procedure calls */
  getCalls: () => ProcedureCall[];
  /** Get calls for a specific procedure path (with typed input/output) */
  getCallsFor: <P extends AppProcedurePath>(path: P) => ProcedureCall<P>[];
  /** Check if a procedure was called */
  wasCalled: (path: AppProcedurePath) => boolean;
  /** Reset all tracked calls */
  reset: () => void;
};
