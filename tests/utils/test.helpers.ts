import { Effect, Option, Exit, Cause } from "effect";
import { expect } from "vitest";
import * as fc from "fast-check";

/**
 * Test pattern helpers for working with Effect and Option types in tests.
 * Provides safe unwrapping and assertion utilities.
 */
export const TestPatterns = {
  /**
   * Effect testing utilities
   */
  Effect: {
    /**
     * Unwrap a successful Effect value, throw if it fails
     */
    expectSuccess: <A, E>(effect: Effect.Effect<A, E>): A => {
      const result = Effect.runSync(effect);
      return result;
    },

    /**
     * Expect an Effect to fail and return the error
     */
    expectFailure: <A, E>(
      effect: Effect.Effect<A, E>,
      expectedErrorType?: new (...args: any[]) => E
    ): E => {
      const exit = Effect.runSyncExit(effect);
      
      if (Exit.isSuccess(exit)) {
        throw new Error("Expected effect to fail, but it succeeded");
      }
      
      // Extract the error from the Cause
      const actualError = Cause.failureOption(exit.cause).pipe(
        Option.getOrElse(() => {
          throw new Error("Expected a failure error in Cause, but got none");
        })
      );
      
      if (expectedErrorType && !(actualError instanceof expectedErrorType)) {
        throw new Error(
          `Expected error of type ${expectedErrorType.name}, but got ${actualError?.constructor?.name}`
        );
      }
      
      return actualError as E;
    },

    /**
     * Unwrap an async Effect value
     */
    expectAsyncSuccess: async <A, E>(effect: Effect.Effect<A, E>): Promise<A> => {
      const result = await Effect.runPromise(effect);
      return result;
    },

    /**
     * Expect an async Effect to fail and return the error
     */
    expectAsyncFailure: async <A, E>(
      effect: Effect.Effect<A, E>,
      expectedErrorType?: new (...args: any[]) => E
    ): Promise<E> => {
      const exit = await Effect.runPromiseExit(effect);
      
      if (Exit.isSuccess(exit)) {
        throw new Error("Expected effect to fail, but it succeeded");
      }
      
      // Extract the error from the Cause
      const actualError = Cause.failureOption(exit.cause).pipe(
        Option.getOrElse(() => {
          throw new Error("Expected a failure error in Cause, but got none");
        })
      );
      
      if (expectedErrorType && !(actualError instanceof expectedErrorType)) {
        throw new Error(
          `Expected error of type ${expectedErrorType.name}, but got ${actualError?.constructor?.name}`
        );
      }
      
      return actualError as E;
    },
  },

  /**
   * Option testing utilities
   */
  Option: {
    /**
     * Assert Option is Some and extract value
     */
    expectSome: <T>(option: Option.Option<T>): T => {
      if (Option.isNone(option)) {
        throw new Error("Expected Option to be Some, but it was None");
      }
      return option.value;
    },

    /**
     * Assert Option is Some and validate value with assertion
     */
    expectSomeWith: <T>(
      option: Option.Option<T>,
      assertion: (value: T) => boolean,
      message?: string
    ): T => {
      const value = TestPatterns.Option.expectSome(option);
      if (!assertion(value)) {
        throw new Error(message || "Option value assertion failed");
      }
      return value;
    },

    /**
     * Assert Option is None
     */
    expectNone: <T>(option: Option.Option<T>): void => {
      if (Option.isSome(option)) {
        throw new Error(`Expected Option to be None, but it was Some(${option.value})`);
      }
    },

    /**
     * Check if two Options are equal
     */
    equals: <T>(opt1: Option.Option<T>, opt2: Option.Option<T>): boolean => {
      if (Option.isNone(opt1) && Option.isNone(opt2)) return true;
      if (Option.isSome(opt1) && Option.isSome(opt2)) {
        return opt1.value === opt2.value;
      }
      return false;
    },
  },

  /**
   * Factory testing utilities
   */
  Factory: {
    /**
     * Test factory constraints by generating multiple samples
     */
    testFactoryConstraints: <T>(
      factory: () => T,
      constraints: Array<{
        name: string;
        validator: (value: T) => boolean;
        message: string;
      }>,
      sampleCount: number = 10
    ): void => {
      const samples = Array.from({ length: sampleCount }, factory);
      
      samples.forEach((sample, index) => {
        constraints.forEach((constraint) => {
          if (!constraint.validator(sample)) {
            throw new Error(
              `Factory constraint "${constraint.name}" failed for sample ${index}: ${constraint.message}`
            );
          }
        });
      });
    },

    /**
     * Test factory generates unique values
     */
    testFactoryUniqueness: <T, K>(
      factory: () => T,
      keyExtractor: (value: T) => K,
      sampleCount: number = 10
    ): void => {
      const samples = Array.from({ length: sampleCount }, factory);
      const keys = samples.map(keyExtractor);
      const uniqueKeys = new Set(keys);
      
      if (uniqueKeys.size !== keys.length) {
        throw new Error(
          `Factory uniqueness failed: expected ${keys.length} unique values, got ${uniqueKeys.size}`
        );
      }
    },

    /**
     * Test factory overrides work correctly
     */
    testFactoryOverrides: <TData, TEntity>(
      factory: (overrides: Partial<TData>) => TData,
      entityCreator: (data: TData) => Effect.Effect<TEntity, any>,
      scenarios: Array<{
        name: string;
        overrides: Partial<TData>;
        validator: (entity: TEntity) => void;
      }>
    ): void => {
      scenarios.forEach((scenario) => {
        const data = factory(scenario.overrides);
        const entity = TestPatterns.Effect.expectSuccess(entityCreator(data));
        scenario.validator(entity);
      });
    },
  },

  /**
   * Entity testing utilities
   */
  Entity: {
    /**
     * Test entity computed properties
     */
    testComputedProperties: <T>(
      entity: T,
      properties: Array<{
        name: string;
        getter: (entity: T) => any;
        expected: any;
      }>
    ): void => {
      properties.forEach((prop) => {
        const actual = prop.getter(entity);
        expect(actual).toBe(prop.expected);
      });
    },

    /**
     * Test entity serialization round-trip
     */
    testSerializationRoundTrip: async <TEntity, TData>(
      entity: TEntity,
      serialize: (entity: TEntity) => Effect.Effect<TData, any>,
      deserialize: (data: TData) => Effect.Effect<TEntity, any>,
      equals: (a: TEntity, b: TEntity) => boolean
    ): Promise<void> => {
      const serialized = await TestPatterns.Effect.expectAsyncSuccess(serialize(entity));
      const deserialized = await TestPatterns.Effect.expectAsyncSuccess(deserialize(serialized));
      
      if (!equals(entity, deserialized)) {
        throw new Error("Serialization round-trip failed: entities are not equal");
      }
    },
  },

  /**
   * Property-based testing utilities
   */
  Property: {
    /**
     * Run property-based test with custom arbitrary
     */
    assert: <T>(
      arbitrary: fc.Arbitrary<T>,
      predicate: (value: T) => boolean | void,
      options?: fc.Parameters<[T]>
    ): void => {
      fc.assert(
        fc.property(arbitrary, predicate),
        options
      );
    },

    /**
     * Run async property-based test
     */
    assertAsync: async <T>(
      arbitrary: fc.Arbitrary<T>,
      predicate: (value: T) => Promise<boolean | void>,
      options?: fc.Parameters<[T]>
    ): Promise<void> => {
      await fc.assert(
        fc.asyncProperty(arbitrary, predicate),
        options
      );
    },
  },
};

