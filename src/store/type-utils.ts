export type ExtractNulls<T> = T & (null | undefined);

export type IfEquals<X, Y, A = X, B = never> = (<T>() => T extends X
  ? 1
  : 2) extends <T>() => T extends Y ? 1 : 2
  ? A
  : B;

export type BasicType =
  | boolean
  | null
  | undefined
  | number
  | BigInt
  | string
  | Symbol;

export type Falsy = false | 0 | "" | null | undefined;
