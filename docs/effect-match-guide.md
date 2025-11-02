# Effect Match Module - Comprehensive Usage Guide

## Overview

The Effect `Match` module provides type-safe pattern matching for TypeScript, enabling declarative error handling and exhaustive checking. This guide explains how to use it properly for our refactor.

---

## 1. Creating Matchers

### `Match.type<T>()` - Type-Based Matching

**Use when**: You have a union type and want compile-time type checking.

```typescript
import { Match } from "effect"

type ErrorType = ValidationError | DatabaseError | WorkflowDependencyError

const matchError = Match.type<ErrorType>().pipe(
  // Patterns defined here
  Match.exhaustive
)
```

**Key Points**:
- Provides compile-time exhaustiveness checking
- TypeScript enforces all cases are handled with `Match.exhaustive`
- Returns a function: `(input: ErrorType) => Result`

### `Match.value(value)` - Value-Based Matching

**Use when**: You have a specific runtime value to match against.

```typescript
import { Match, Effect } from "effect"

const handleError = (error: unknown) => {
  return Match.value(error).pipe(
    // Patterns defined here
    Match.orElse(() => Effect.fail(new UnknownError()))
  )
}
```

**Key Points**:
- Works with runtime values (unknown type)
- Use `Match.orElse()` for fallback (not exhaustive)
- Better for handling `unknown` errors from catch blocks

---

## 2. Pattern Matching Methods

### `Match.when(pattern, handler)` - Single Pattern Match

**Patterns can be**:
1. **Literal values**: `Match.when("admin", handler)`
2. **Object patterns**: `Match.when({ role: "admin" }, handler)`
3. **Predicate functions**: `Match.when((e): e is DatabaseError => e instanceof DatabaseError, handler)`
4. **Built-in predicates**: `Match.when(Match.number, handler)`

#### Example 1: Matching by `_tag` (Discriminated Union)

```typescript
type DomainError = ValidationError | DatabaseError | BusinessRuleViolationError

const mapError = Match.type<DomainError>().pipe(
  Match.when({ _tag: "ValidationError" }, (e: ValidationError) => 
    Effect.fail(new WorkflowDependencyError(e.message))
  ),
  Match.when({ _tag: "DatabaseError" }, (e: DatabaseError) => 
    Effect.fail(new WorkflowDependencyError(e.message))
  ),
  Match.when({ _tag: "BusinessRuleViolationError" }, (e: BusinessRuleViolationError) => 
    Effect.fail(new WorkflowDependencyError(e.message))
  ),
  Match.exhaustive // Ensures all cases covered
)
```

#### Example 2: Matching with Predicate Functions

```typescript
const translateDbError = (error: unknown) => {
  return Match.value(error).pipe(
    // Predicate with type guard
    Match.when(
      (e): e is ConnectionError => isConnectionError(e),
      (e) => Effect.fail(new DatabaseError("Connection failed", { originalError: e }))
    ),
    Match.when(
      (e): e is TimeoutError => isTimeoutError(e),
      (e) => Effect.fail(new DatabaseError("Timeout", { originalError: e }))
    ),
    Match.when(
      isUniqueConstraintError, // Type guard function
      () => Effect.fail(creators.createConflictError(...))
    ),
    Match.orElse((e) => Effect.fail(new DatabaseError("Unexpected error", { originalError: e })))
  )
}
```

#### Example 3: Matching Object Properties

```typescript
const matchUser = Match.type<{ role: "admin" | "editor" | "viewer" }>().pipe(
  Match.when({ role: "admin" }, () => "Has full access"),
  Match.when({ role: "editor" }, () => "Can edit content"),
  Match.when({ role: "viewer" }, () => "Can view content"),
  Match.exhaustive
)
```

---

### `Match.tag(...tags, handler)` - Multiple Tag Matching

**Use when**: Multiple tags share the same handler logic.

```typescript
type Event = 
  | { readonly _tag: "fetch" }
  | { readonly _tag: "success"; readonly data: string }
  | { readonly _tag: "error"; readonly error: Error }
  | { readonly _tag: "cancel" }

const matchEvent = Match.type<Event>().pipe(
  // Match multiple tags with one handler
  Match.tag("fetch", "success", () => "Ok!"),
  // Single tag
  Match.tag("error", (event) => `Error: ${event.error.message}`),
  // Single tag
  Match.tag("cancel", () => "Cancelled"),
  Match.exhaustive
)
```

**Key Points**:
- Only works with discriminated unions (objects with `_tag` property)
- Can match multiple tags: `Match.tag("tag1", "tag2", "tag3", handler)`
- Each call narrows the remaining types

---

### `Match.tags({ tag1: handler1, tag2: handler2 })` - Object-Based Tag Matching

**Use when**: You want all tag handlers in one place (more readable).

```typescript
const mapError = Match.type<ApplicationError>().pipe(
  Match.tags({
    WorkflowDependencyError: (e) => Effect.fail(e),
    PermissionCheckError: (e) => Effect.fail(e),
    UploadInitiationError: (e) => Effect.fail(e),
    // ... more handlers
  }),
  Match.exhaustive // Still need this for exhaustiveness
)
```

**Benefits**:
- All handlers in one object (cleaner syntax)
- TypeScript ensures all tags are handled with `Match.exhaustive`

---

### `Match.tagsExhaustive({ ... })` - Exhaustive Object Matching

**Use when**: You want exhaustiveness built-in (no need for `Match.exhaustive`).

```typescript
const mapError = Match.type<ApplicationError>().pipe(
  Match.tagsExhaustive({
    WorkflowDependencyError: (e) => Effect.fail(e),
    PermissionCheckError: (e) => Effect.fail(e),
    UploadInitiationError: (e) => Effect.fail(e),
    // ... ALL tags MUST be present - TypeScript enforces this
  })
  // No need for Match.exhaustive - built into tagsExhaustive
)
```

**Key Difference from `Match.tags()`**:
- `Match.tagsExhaustive()` **requires** all tags to be handled
- `Match.tags()` allows optional handlers (still need `Match.exhaustive`)

---

### `Match.whenOr(pattern1, pattern2, ..., handler)` - OR Matching

**Use when**: Multiple patterns share the same handler.

```typescript
const handleError = Match.type<ErrorType>().pipe(
  Match.whenOr(
    { _tag: "NetworkError" },
    { _tag: "TimeoutError" },
    () => Effect.retry(3) // Shared handler for both
  ),
  Match.when({ _tag: "ValidationError" }, (e) => Effect.fail(e)),
  Match.exhaustive
)
```

---

### `Match.whenAnd(pattern1, pattern2, ..., handler)` - AND Matching

**Use when**: Value must match ALL patterns simultaneously.

```typescript
type User = { readonly age: number; readonly role: "admin" | "user" }

const checkUser = Match.type<User>().pipe(
  Match.whenAnd(
    { age: (n) => n >= 18 },
    { role: "admin" },
    () => "Admin access granted"
  ),
  Match.orElse(() => "Access denied")
)
```

---

### `Match.not(pattern, handler)` - Negation Matching

**Use when**: You want to match everything EXCEPT a pattern.

```typescript
const match = Match.type<string | number>().pipe(
  Match.not("hi", () => "ok"), // Match anything except "hi"
  Match.orElse(() => "fallback for 'hi'")
)
```

---

## 3. Completing the Match

### `Match.exhaustive` - Exhaustive Checking

**Use when**: All cases MUST be handled (discriminated unions).

```typescript
const mapError = Match.type<ApplicationError>().pipe(
  Match.when({ _tag: "WorkflowDependencyError" }, handler1),
  Match.when({ _tag: "PermissionCheckError" }, handler2),
  Match.exhaustive // TypeScript error if any case missing!
)
```

**Requirements**:
- The matcher must be `Match.type<T>()` (not `Match.value()`)
- All possible values of the union must be handled
- TypeScript will error at compile-time if a case is missing

**Type Error Example**:
```typescript
type Error = A | B | C

const match = Match.type<Error>().pipe(
  Match.when({ _tag: "A" }, handler),
  Match.when({ _tag: "B" }, handler),
  // Missing "C" case!
  Match.exhaustive // ❌ TypeScript Error: Type 'C' is not assignable to type 'never'
)
```

---

### `Match.orElse(handler)` - Fallback Handler

**Use when**: You have a default case or can't ensure exhaustiveness.

```typescript
const handleError = Match.value(error).pipe(
  Match.when({ _tag: "ValidationError" }, handler1),
  Match.when({ _tag: "DatabaseError" }, handler2),
  Match.orElse(() => Effect.fail(new UnknownError())) // Fallback
)
```

**Key Points**:
- Works with both `Match.type()` and `Match.value()`
- Handles any unmatched cases
- No exhaustiveness checking

---

### `Match.option` - Wraps Result in Option

**Returns**: `Option<Result>` - `Some(value)` if match, `None` if no match.

```typescript
const getRole = Match.type<User>().pipe(
  Match.when({ role: "admin" }, () => "Has full access"),
  Match.when({ role: "editor" }, () => "Can edit content"),
  Match.option // Returns Option<string>
)

const result = getRole({ role: "viewer" }) // Returns Option.none
```

---

### `Match.either` - Wraps Result in Either

**Returns**: `Either<Matched, Unmatched>` - `Right(value)` if match, `Left(unmatched)` if no match.

```typescript
const getRole = Match.type<User>().pipe(
  Match.when({ role: "admin" }, () => "Has full access"),
  Match.when({ role: "editor" }, () => "Can edit content"),
  Match.either // Returns Either<string, User>
)

const result = getRole({ role: "viewer" }) 
// Returns Either.left({ role: "viewer" })
```

---

## 4. Built-in Predicates

The Match module provides built-in type predicates:

```typescript
Match.string      // Matches string values
Match.number      // Matches number values
Match.boolean     // Matches boolean values
Match.defined     // Matches non-null, non-undefined
Match.any         // Matches anything
Match.instanceOf(Class) // Matches class instances
Match.is("a", 42, true) // Matches literal values
```

**Example**:
```typescript
const match = Match.type<string | number>().pipe(
  Match.when(Match.number, (n) => `Number: ${n}`),
  Match.when(Match.string, (s) => `String: ${s}`),
  Match.exhaustive
)
```

---

## 5. Using Match with Effect Error Handling

### Pattern: Converting Errors to Effects

```typescript
import { Match, Effect } from "effect"

const mapPersistenceError = (error: unknown): Effect.Effect<never, WorkflowDependencyError> => {
  return Match.value(error).pipe(
    // Use type guards for unknown errors
    Match.when(
      (e): e is ValidationError => e instanceof ValidationError,
      (e) => Effect.fail(new WorkflowDependencyError(e.message, ...))
    ),
    Match.when(
      (e): e is DatabaseError => e instanceof DatabaseError,
      (e) => {
        // Fail fast for unexpected DB errors
        if (isUnexpectedDbError(e)) {
          return Effect.fail(e) // Don't wrap - fail fast!
        }
        return Effect.fail(new WorkflowDependencyError(e.message, ...))
      }
    ),
    Match.orElse((e) => 
      Effect.fail(new WorkflowDependencyError(`Unexpected error: ${String(e)}`, ...))
    )
  )
}
```

### Pattern: Using with Effect.catchAll

```typescript
import { Match, Effect } from "effect"

const workflow = someEffect.pipe(
  Effect.catchAll((error: unknown) => {
    return Match.value(error).pipe(
      Match.when(
        (e): e is ValidationError => e instanceof ValidationError,
        (e) => Effect.fail(new WorkflowDependencyError(e.message))
      ),
      Match.when(
        (e): e is DatabaseError => e instanceof DatabaseError,
        (e) => {
          if (isUnexpectedDbError(e)) {
            return Effect.fail(e) // Fail fast
          }
          return Effect.fail(new WorkflowDependencyError(e.message))
        }
      ),
      Match.orElse((e) => 
        Effect.fail(new WorkflowDependencyError(String(e)))
      )
    )
  })
)
```

---

## 6. Best Practices for Our Refactor

### ✅ DO: Use `Match.type<T>()` for Known Error Types

```typescript
// ✅ GOOD: Type-safe, exhaustive checking
const mapDomainError = Match.type<ValidationError | DatabaseError>().pipe(
  Match.when({ _tag: "ValidationError" }, handler),
  Match.when({ _tag: "DatabaseError" }, handler),
  Match.exhaustive
)
```

### ✅ DO: Use `Match.value()` for `unknown` Errors

```typescript
// ✅ GOOD: Runtime error handling
const mapUnknownError = (error: unknown) => {
  return Match.value(error).pipe(
    Match.when(
      (e): e is ValidationError => e instanceof ValidationError,
      handler
    ),
    Match.orElse(defaultHandler)
  )
}
```

### ✅ DO: Use `Match.tag()` for Discriminated Unions

```typescript
// ✅ GOOD: Clear, concise tag matching
const mapError = Match.type<ApplicationError>().pipe(
  Match.tag("WorkflowDependencyError", handler1),
  Match.tag("PermissionCheckError", handler2),
  Match.exhaustive
)
```

### ✅ DO: Use `Match.tagsExhaustive()` for Many Tags

```typescript
// ✅ GOOD: All handlers in one place, exhaustive by default
const mapError = Match.type<ApplicationError>().pipe(
  Match.tagsExhaustive({
    WorkflowDependencyError: handler1,
    PermissionCheckError: handler2,
    UploadInitiationError: handler3,
    // ... all tags required
  })
)
```

### ❌ DON'T: Use `instanceof` Checks with Match

```typescript
// ❌ BAD: Don't check instanceof in patterns
Match.when({ _tag: "DatabaseError" }, (e) => {
  if (e instanceof DatabaseError) { // ❌ Redundant - already matched by tag
    // ...
  }
})

// ✅ GOOD: Use type guards in Match.when()
Match.when(
  (e): e is DatabaseError => e instanceof DatabaseError && isUnexpectedDbError(e),
  (e) => Effect.fail(e)
)
```

### ❌ DON'T: Mix `Match.exhaustive` with `Match.orElse`

```typescript
// ❌ BAD: Can't use both
Match.exhaustive,
Match.orElse(...) // ❌ TypeScript error

// ✅ GOOD: Use one or the other
Match.exhaustive // For exhaustive checking
// OR
Match.orElse(...) // For fallback
```

---

## 7. Common Patterns for Our Refactor

### Pattern 1: Infrastructure Error Translation

```typescript
// src/app/infra/db/errors.ts
export const translateDbError = <TConflictError, TNotFoundError, TValidationError>(
  error: unknown,
  context: { operation: string; entityType: string },
  creators: { ... }
): Effect.Effect<never, TConflictError | TNotFoundError | TValidationError | DatabaseError> => {
  return Match.value(error).pipe(
    // Expected errors
    Match.when(isUniqueConstraintError, () =>
      Effect.fail(creators.createConflictError(...))
    ),
    Match.when(isForeignKeyError, () =>
      Effect.fail(creators.createValidationError(...))
    ),
    // Unexpected errors - FAIL FAST
    Match.when(isConnectionError, (e) =>
      Effect.fail(new DatabaseError("Connection failed", { originalError: e }))
    ),
    Match.when(isTimeoutError, (e) =>
      Effect.fail(new DatabaseError("Timeout", { originalError: e }))
    ),
    // Everything else - FAIL FAST
    Match.orElse((e) =>
      Effect.fail(new DatabaseError(`Unexpected error during ${context.operation}`, {
        originalError: e,
        operation: context.operation,
        entityType: context.entityType
      }))
    )
  )
}
```

### Pattern 2: Application Layer Error Mapping

```typescript
// src/app/application/workflow/helpers/error-mappers.ts
export const mapDocumentPersistenceError = (source: "save" | "search" | "findById") => {
  return Effect.catchAll((error: unknown): Effect.Effect<never, WorkflowDependencyError> => {
    return Match.value(error).pipe(
      // Use type guards for unknown errors
      Match.when(
        (e): e is ValidationError => e instanceof ValidationError,
        (e) => Effect.fail(new WorkflowDependencyError(
          `Document persistence failed: ${e.message}`,
          "DocumentAggregateRepository",
          source,
          { originalError: e }
        ))
      ),
      Match.when(
        (e): e is DatabaseError => e instanceof DatabaseError,
        (e) => {
          if (isUnexpectedDbError(e)) {
            return Effect.fail(e) // Fail fast - don't wrap
          }
          return Effect.fail(new WorkflowDependencyError(
            `Database error during document ${source}: ${e.message}`,
            "Database",
            source,
            { originalError: e }
          ))
        }
      ),
      Match.when(
        (e): e is WorkflowDependencyError => e instanceof WorkflowDependencyError,
        (e) => Effect.fail(e) // Pass through
      ),
      Match.orElse((e) =>
        Effect.fail(new WorkflowDependencyError(
          `Document ${source} failed: ${String(e)}`,
          "DocumentAggregateRepository",
          source,
          { originalError: e }
        ))
      )
    )
  })
}
```

### Pattern 3: Presentation Layer Error Mapping (with Exhaustive Checking)

```typescript
// src/presentation/http/orpc/error-map.ts
export function mapToORPCError(error: unknown, options?: ErrorMappingOptions): ORPCError<string, unknown> {
  // First, narrow to ApplicationError if possible
  if (error && typeof error === "object" && "_tag" in error) {
    return Match.value(error).pipe(
      Match.when(
        (e): e is PermissionCheckError => e._tag === "PermissionCheckError",
        (e) => new ORPCError("FORBIDDEN", { ... })
      ),
      Match.when(
        (e): e is WorkflowDependencyError => e._tag === "WorkflowDependencyError",
        (e) => {
          return isNotFoundDependency(e)
            ? new ORPCError("NOT_FOUND", { ... })
            : new ORPCError("INTERNAL_SERVER_ERROR", { ... })
        }
      ),
      // ... more cases
      Match.orElse(() =>
        new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "An unexpected error occurred",
          status: 500,
          data: enrichErrorData({ code: "UNKNOWN_ERROR" }, options)
        })
      )
    )
  }
  
  // Fallback for unknown errors
  return new ORPCError("INTERNAL_SERVER_ERROR", { ... })
}
```

---

## 8. Key Takeaways

1. **Use `Match.type<T>()`** for known types with exhaustive checking
2. **Use `Match.value()`** for `unknown` runtime errors
3. **Use `Match.tag()` or `Match.tagsExhaustive()`** for discriminated unions
4. **Use `Match.exhaustive`** to enforce all cases are handled
5. **Use `Match.orElse()`** when exhaustiveness isn't possible
6. **Fail fast** for unexpected errors using `Effect.fail()` directly (don't wrap)
7. **Use type guards** in `Match.when()` for runtime type checking

---

## 9. Migration Checklist

When refactoring error handling:

- [ ] Replace `if (error instanceof ...)` with `Match.when()`
- [ ] Replace `if/else chains` with `Match.pipe(...)`
- [ ] Use `Match.type<T>()` for known error union types
- [ ] Use `Match.value()` for `unknown` error handling
- [ ] Add `Match.exhaustive` for exhaustive checking
- [ ] Remove fallback `as unknown as WorkflowError` casts
- [ ] Ensure unexpected errors fail fast (don't wrap)
- [ ] Verify TypeScript exhaustiveness errors are resolved

