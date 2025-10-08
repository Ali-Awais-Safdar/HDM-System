/**
 * Simple Result type for success/failure handling
 */
export type Result<T, E> = Success<T> | Failure<E>;

export interface Success<T> {
  readonly _tag: "Success";
  readonly value: T;
}

export interface Failure<E> {
  readonly _tag: "Failure";
  readonly error: E;
}

export const ok = <T>(value: T): Success<T> => ({
  _tag: "Success",
  value
});

export const err = <E>(error: E): Failure<E> => ({
  _tag: "Failure",
  error
});

export const isOk = <T, E>(result: Result<T, E>): result is Success<T> => 
  result._tag === "Success";

export const isErr = <T, E>(result: Result<T, E>): result is Failure<E> => 
  result._tag === "Failure";
