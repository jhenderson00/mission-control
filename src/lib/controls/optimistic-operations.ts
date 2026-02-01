"use client";

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import type { Doc } from "@/convex/_generated/dataModel";
import type { OperationStatus } from "@/lib/controls/operation-status";

export type OptimisticOperation = {
  operationId: string;
  agentId: string;
  command: string;
  params?: Record<string, unknown>;
  status: OperationStatus;
  requestedAt: number;
  requestedBy: string;
  error?: string;
  isOptimistic: true;
};

export type OperationEntry = Doc<"agentControlOperations"> | OptimisticOperation;

type OptimisticOperationsStore = {
  operations: Record<string, OptimisticOperation>;
  addOperation: (operation: OptimisticOperation) => void;
  addOperations: (operations: OptimisticOperation[]) => void;
  updateOperation: (
    operationId: string,
    update: Partial<OptimisticOperation>
  ) => void;
  updateOperations: (
    updates: Record<string, Partial<OptimisticOperation>>
  ) => void;
  removeOperation: (operationId: string) => void;
  removeOperations: (operationIds: string[]) => void;
  clearAgent: (agentId: string) => void;
};

export const useOptimisticOperationsStore = create<OptimisticOperationsStore>(
  (set) => ({
    operations: {},
    addOperation: (operation) =>
      set((state) => ({
        operations: { ...state.operations, [operation.operationId]: operation },
      })),
    addOperations: (operations) =>
      set((state) => {
        if (operations.length === 0) {
          return state;
        }
        const next = { ...state.operations };
        for (const operation of operations) {
          next[operation.operationId] = operation;
        }
        return { operations: next };
      }),
    updateOperation: (operationId, update) =>
      set((state) => {
        const existing = state.operations[operationId];
        if (!existing) {
          return state;
        }
        return {
          operations: {
            ...state.operations,
            [operationId]: { ...existing, ...update },
          },
        };
      }),
    updateOperations: (updates) =>
      set((state) => {
        const entries = Object.entries(updates);
        if (entries.length === 0) {
          return state;
        }
        const next = { ...state.operations };
        let changed = false;
        for (const [operationId, update] of entries) {
          const existing = next[operationId];
          if (!existing) {
            continue;
          }
          next[operationId] = { ...existing, ...update };
          changed = true;
        }
        return changed ? { operations: next } : state;
      }),
    removeOperation: (operationId) =>
      set((state) => {
        if (!state.operations[operationId]) {
          return state;
        }
        const next = { ...state.operations };
        delete next[operationId];
        return { operations: next };
      }),
    removeOperations: (operationIds) =>
      set((state) => {
        if (operationIds.length === 0) {
          return state;
        }
        const next = { ...state.operations };
        let changed = false;
        for (const operationId of operationIds) {
          if (next[operationId]) {
            delete next[operationId];
            changed = true;
          }
        }
        return changed ? { operations: next } : state;
      }),
    clearAgent: (agentId) =>
      set((state) => {
        const next = Object.fromEntries(
          Object.entries(state.operations).filter(
            ([, operation]) => operation.agentId !== agentId
          )
        );
        if (Object.keys(next).length === Object.keys(state.operations).length) {
          return state;
        }
        return { operations: next };
      }),
  })
);

export const createRequestId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const randomPart = Math.random().toString(16).slice(2);
  return `req_${Date.now().toString(16)}_${randomPart}`;
};

export const useOptimisticOperations = (
  agentId: string
): OptimisticOperation[] => {
  const operations = useOptimisticOperationsStore((state) => state.operations);
  return useMemo(
    () =>
      Object.values(operations).filter(
        (operation) => operation.agentId === agentId
      ),
    [agentId, operations]
  );
};

export const mergeOperations = (
  convexOperations: Array<Doc<"agentControlOperations">>,
  optimisticOperations: OptimisticOperation[]
): OperationEntry[] => {
  const merged = new Map<string, OperationEntry>();
  for (const operation of optimisticOperations) {
    merged.set(operation.operationId, operation);
  }
  for (const operation of convexOperations) {
    merged.set(operation.operationId, operation);
  }
  return Array.from(merged.values()).sort(
    (a, b) => b.requestedAt - a.requestedAt
  );
};

export const useMergedOperations = (
  agentId: string,
  convexOperations?: Array<Doc<"agentControlOperations">>
): OperationEntry[] => {
  const optimisticOperations = useOptimisticOperations(agentId);
  const removeOperations = useOptimisticOperationsStore(
    (state) => state.removeOperations
  );

  useEffect(() => {
    if (!convexOperations || optimisticOperations.length === 0) {
      return;
    }
    const serverIds = new Set(
      convexOperations.map((operation) => operation.operationId)
    );
    const resolvedIds = optimisticOperations
      .filter((operation) => serverIds.has(operation.operationId))
      .map((operation) => operation.operationId);
    if (resolvedIds.length > 0) {
      removeOperations(resolvedIds);
    }
  }, [convexOperations, optimisticOperations, removeOperations]);

  return useMemo(
    () => mergeOperations(convexOperations ?? [], optimisticOperations),
    [convexOperations, optimisticOperations]
  );
};
