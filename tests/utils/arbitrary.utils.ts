import { faker } from "@faker-js/faker";
import { Arbitrary, Schema as S } from "effect";
import * as fc from "fast-check";

/**
 * Refined arbitrary generators for test factories.
 * Provides type-safe, domain-specific generators using Faker and FastCheck.
 */
export const refined = {
  /**
   * UUID generators
   */
  uuid: () => ({
    arbitrary: (fc: typeof import("fast-check")) => fc.uuid()
  }),

  /**
   * Date/Time generators
   */
  dateTime: {
    past: (options?: { years?: number }) => ({
      arbitrary: (fc: typeof import("fast-check")) => fc.date({ max: new Date() }).map(() => faker.date.past(options))
    }),
    
    recent: (options?: { days?: number }) => ({
      arbitrary: (fc: typeof import("fast-check")) => fc.date({ max: new Date() }).map(() => faker.date.recent(options))
    }),
    
    future: (options?: { years?: number }) => ({
      arbitrary: (fc: typeof import("fast-check")) => fc.date({ min: new Date() }).map(() => faker.date.future(options))
    }),
    
    between: (from: Date, to: Date) => ({
      arbitrary: (fc: typeof import("fast-check")) => fc.date({ min: from, max: to })
    }),
  },

  /**
   * Optional field generators with probability control
   */
  optional: {
    value: <T>(generator: () => T, probability: number = 0.5) => ({
      arbitrary: (fc: typeof import("fast-check")) => 
        fc.option(fc.constant(null), { freq: Math.round((1 - probability) * 100), nil: null })
          .map(opt => opt === null ? generator() : null)
    }),
    
    string: (generator: () => string, probability: number = 0.5) => ({
      arbitrary: (fc: typeof import("fast-check")) => 
        fc.option(fc.constant(null), { freq: Math.round((1 - probability) * 100), nil: null })
          .map(opt => opt === null ? generator() : null)
    }),
  },

  /**
   * String generators
   */
  string: {
    alphanumeric: (length: { min: number; max: number }) => ({
      arbitrary: (fc: typeof import("fast-check")) => fc.string({ 
        minLength: length.min, 
        maxLength: length.max,
        unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''))
      })
    }),
    
    email: () => ({
      arbitrary: (fc: typeof import("fast-check")) => fc.emailAddress()
    }),
    
    hexadecimal: (length: number) => ({
      arbitrary: (fc: typeof import("fast-check")) => fc.hexaString({ minLength: length, maxLength: length })
    }),
  },

  /**
   * Number generators
   */
  number: {
    positive: (options?: { min?: number; max?: number }) => ({
      arbitrary: (fc: typeof import("fast-check")) => fc.integer({ 
        min: options?.min ?? 1, 
        max: options?.max ?? Number.MAX_SAFE_INTEGER 
      })
    }),
    
    nonNegative: (options?: { min?: number; max?: number }) => ({
      arbitrary: (fc: typeof import("fast-check")) => fc.integer({ 
        min: options?.min ?? 0, 
        max: options?.max ?? Number.MAX_SAFE_INTEGER 
      })
    }),
  },

  /**
   * Array generators
   */
  array: {
    of: <T>(itemGen: fc.Arbitrary<T>, options?: { minLength?: number; maxLength?: number }) => ({
      arbitrary: (fc: typeof import("fast-check")) => fc.array(itemGen, { 
        minLength: options?.minLength ?? 0, 
        maxLength: options?.maxLength ?? 10 
      })
    }),
    
    unique: <T>(itemGen: fc.Arbitrary<T>, options?: { minLength?: number; maxLength?: number }) => ({
      arbitrary: (fc: typeof import("fast-check")) => fc.uniqueArray(itemGen, { 
        minLength: options?.minLength ?? 0, 
        maxLength: options?.maxLength ?? 10 
      })
    }),
  },
};

/**
 * Helper to create arbitrary from Effect Schema with annotations
 */
export const makeArbitrary = <A, I, R>(schema: S.Schema<A, I, R>) => {
  return Arbitrary.make(schema);
};

/**
 * Sample one value from an arbitrary
 */
export const sampleOne = <T>(arbitrary: fc.Arbitrary<T>): T => {
  const sample = fc.sample(arbitrary, 1)[0];
  if (!sample) {
    throw new Error("Failed to generate sample from arbitrary");
  }
  return sample;
};

/**
 * Sample multiple values from an arbitrary
 */
export const sampleMany = <T>(arbitrary: fc.Arbitrary<T>, count: number): T[] => {
  return fc.sample(arbitrary, count);
};

