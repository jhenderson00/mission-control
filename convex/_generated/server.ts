/**
 * Stub file for Convex generated types
 * 
 * This will be replaced when you run `npx convex dev` with a configured project.
 * For now, these stubs allow the build to pass.
 */

import {
  queryGeneric,
  mutationGeneric,
  internalQueryGeneric,
  internalMutationGeneric,
} from "convex/server";

// Re-export the generic versions as the typed versions
// These will be properly typed when Convex codegen runs
export const query = queryGeneric;
export const mutation = mutationGeneric;
export const internalQuery = internalQueryGeneric;
export const internalMutation = internalMutationGeneric;

// Stub types for DataModel
export type DataModel = Record<string, unknown>;
