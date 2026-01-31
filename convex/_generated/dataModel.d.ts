/**
 * Stub file for Convex DataModel types
 * 
 * This will be replaced when you run `npx convex dev` with a configured project.
 */

import { GenericDataModel, GenericDocument, GenericTableInfo } from "convex/server";

export type DataModel = GenericDataModel;
export type Doc<T extends string> = GenericDocument;
export type Id<T extends string> = string;
