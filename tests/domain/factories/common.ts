import { faker as baseFaker } from "@faker-js/faker"
import { makeUuid } from "@domain/refined/uuid"

// Seeded Faker instance for deterministic factories
export const faker = baseFaker
faker.seed(20240103)

// Passthrough UUID maker from domain refined types
export { makeUuid }


