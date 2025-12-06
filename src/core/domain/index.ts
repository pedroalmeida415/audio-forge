/**
 * Domain Layer
 *
 * The domain layer contains:
 * - Business entities and value objects
 * - Service contracts (interfaces/ports)
 * - Domain errors
 * - DTOs for data transfer
 *
 * This layer has NO external dependencies except Effect for type definitions.
 * It defines WHAT the system does, not HOW.
 */

// Errors
export * from "./errors";

// Value Objects
export * from "./value-objects";

// DTOs
export * from "./dtos";

// Service Contracts
export * from "./services";
