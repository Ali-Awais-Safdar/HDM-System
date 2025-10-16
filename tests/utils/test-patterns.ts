import { expect } from "vitest"
//
import {
  expectSuccess,
  expectFailure,
  expectAsyncSuccess,
  expectSome,
  expectNone,
  expectSomeWith,
  equals as optionEquals,
} from "./test.helpers"

type Constraint<T> = {
  name: string
  validator: (value: T) => boolean
  message?: string
}

const Factory = {
  testFactoryConstraints<T>(
    make: () => T,
    constraints: ReadonlyArray<Constraint<T>>,
    samples: number = 20
  ) {
    for (let i = 0; i < samples; i++) {
      const value = make()
      for (const c of constraints) {
        const ok = c.validator(value)
        expect(ok).toBe(true)
      }
    }
  },

  testFactoryUniqueness<T, K>(
    make: () => T,
    key: (value: T) => K,
    samples: number = 20
  ) {
    const keys = new Set<K>()
    for (let i = 0; i < samples; i++) {
      const value = make()
      const k = key(value)
      expect(keys.has(k)).toBe(false)
      keys.add(k)
    }
  },
}

const EffectHelpers = { expectSuccess, expectFailure, expectAsyncSuccess }

const OptionHelpers = { expectSome, expectNone, expectSomeWith, equals: optionEquals }

export const TestPatterns = {
  Factory,
  Effect: EffectHelpers,
  Option: OptionHelpers,
}


