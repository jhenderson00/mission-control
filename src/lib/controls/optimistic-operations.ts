"use client";

import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import type { Doc } from "@/convex/_generated/dataModel";
import type { OperationStatus } from "@/lib/controls/operation-status";

const OPERATION_TIMEOUT_MS = 15_000;
const OPERATION_CLEANUP_MS = 60_000;
const OPERATION_TIMEOUT_MESSAGE = "Timed out waiting for acknowledgment.";

const timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

const isPendingStatus = (status: OperationStatus): boolean =>
  status === "queued" || status === "sent";

const isResolvedStatus = (status: OperationStatus): boolean =>
  status === "acked" || status === "failed" || status === "timed-out";

const clearTimer = (
  timers: Map<string, ReturnType<typeof setTimeout>>,
  operationId: string
) => {
  const timer = timers.get(operationId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(operationId);
  }
};

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
  (set, get) => {
    const clearTimers = (operationId: string) => {
      clearTimer(timeoutTimers, operationId);
      clearTimer(cleanupTimers, operationId);
    };

    const scheduleCleanup = (operationId: string) => {
      clearTimer(cleanupTimers, operationId);
      const timer = setTimeout(() => {
        cleanupTimers.delete(operationId);
        const current = get().operations[operationId];
        if (!current || !isResolvedStatus(current.status)) {
          return;
        }
        get().removeOperation(operationId);
      }, OPERATION_CLEANUP_MS);
      cleanupTimers.set(operationId, timer);
    };

    const scheduleTimeout = (operationId: string, requestedAt: number) => {
      clearTimer(timeoutTimers, operationId);
      const elapsed = Date.now() - requestedAt;
      const delay = Math.max(0, OPERATION_TIMEOUT_MS - elapsed);
      const timer = setTimeout(() => {
        timeoutTimers.delete(operationId);
        const current = get().operations[operationId];
        if (!current || !isPendingStatus(current.status)) {
          return;
        }
        get().updateOperation(operationId, {
          status: "timed-out",
          error: current.error ?? OPERATION_TIMEOUT_MESSAGE,
        });
      }, delay);
      timeoutTimers.set(operationId, timer);
    };

    const syncTimers = (operation: OptimisticOperation) => {
      if (isPendingStatus(operation.status)) {
        scheduleTimeout(operation.operationId, operation.requestedAt);
      } else {
        clearTimer(timeoutTimers, operation.operationId);
      }

      if (isResolvedStatus(operation.status)) {
        scheduleCleanup(operation.operationId);
      } else {
        clearTimer(cleanupTimers, operation.operationId);
      }
    };

    return {
      operations: {},
      addOperation: (operation) => {
        set((state) => ({
          operations: { ...state.operations, [operation.operationId]: operation },
        }));
        syncTimers(operation);
      },
      addOperations: (operations) => {
        if (operations.length === 0) {
          return;
        }
        set((state) => {
          const next = { ...state.operations };
          for (const operation of operations) {
            next[operation.operationId] = operation;
          }
          return { operations: next };
        });
        for (const operation of operations) {
          syncTimers(operation);
        }
      },
      updateOperation: (operationId, update) => {
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
        });
        const updated = get().operations[operationId];
        if (updated) {
          syncTimers(updated);
        }
      },
      updateOperations: (updates) => {
        const entries = Object.entries(updates);
        if (entries.length === 0) {
          return;
        }
        set((state) => {
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
        });
        for (const [operationId] of entries) {
          const updated = get().operations[operationId];
          if (updated) {
            syncTimers(updated);
          }
        }
      },
      removeOperation: (operationId) => {
        clearTimers(operationId);
        set((state) => {
          if (!state.operations[operationId]) {
            return state;
          }
          const next = { ...state.operations };
          delete next[operationId];
          return { operations: next };
        });
      },
      removeOperations: (operationIds) => {
        if (operationIds.length === 0) {
          return;
        }
        for (const operationId of operationIds) {
          clearTimers(operationId);
        }
        set((state) => {
          const next = { ...state.operations };
          let changed = false;
          for (const operationId of operationIds) {
            if (next[operationId]) {
              delete next[operationId];
              changed = true;
            }
          }
          return changed ? { operations: next } : state;
        });
      },
      clearAgent: (agentId) => {
        const removedIds: string[] = [];
        set((state) => {
          const next = Object.fromEntries(
            Object.entries(state.operations).filter(([operationId, operation]) => {
              if (operation.agentId === agentId) {
                removedIds.push(operationId);
                return false;
              }
              return true;
            })
          );
          if (Object.keys(next).length === Object.keys(state.operations).length) {
            return state;
          }
          return { operations: next };
        });
        for (const operationId of removedIds) {
          clearTimers(operationId);
        }
      },
    };
  }
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
  optimisticOperations: OptimisticOperation[],
  now: number = Date.now()
): OperationEntry[] => {
  const merged = new Map<string, OperationEntry>();
  for (const operation of optimisticOperations) {
    merged.set(operation.operationId, operation);
  }
  for (const operation of convexOperations) {
    merged.set(operation.operationId, operation);
  }
  return Array.from(merged.values())
    .filter((operation) => {
      if (!isResolvedStatus(operation.status)) {
        return true;
      }
      const resolvedAt =
        "ackedAt" in operation && operation.ackedAt
          ? operation.ackedAt
          : "completedAt" in operation && operation.completedAt
            ? operation.completedAt
            : operation.requestedAt;
      return now - resolvedAt <= OPERATION_CLEANUP_MS;
    })
    .sort((a, b) => b.requestedAt - a.requestedAt);
};

export const useMergedOperations = (
  agentId: string,
  convexOperations?: Array<Doc<"agentControlOperations">>
): OperationEntry[] => {
  const optimisticOperations = useOptimisticOperations(agentId);
  const removeOperations = useOptimisticOperationsStore(
    (state) => state.removeOperations
  );
  const [now, setNow] = useState(() => Date.now());

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

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  return useMemo(
    () => mergeOperations(convexOperations ?? [], optimisticOperations, now),
    [convexOperations, optimisticOperations, now]
  );
};
