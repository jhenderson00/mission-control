// Use crypto.randomUUID from globalThis (available in modern runtimes)
const randomUUID = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
import { v } from "convex/values";
import { z } from "zod";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";

type OperationStatus = "queued" | "sent" | "acked" | "failed" | "timed-out";

type DispatchResult = {
  ok: boolean;
  requestId: string;
  operationId: string;
  status: OperationStatus;
  bridgeStatus?: "accepted" | "rejected" | "error";
  error?: string;
};

type BulkDispatchResult = {
  ok: boolean;
  requestId: string;
  bulkId: string;
  operations: Array<{ agentId: string; operationId: string; status: OperationStatus }>;
  bridgeStatus?: "accepted" | "rejected" | "error";
  error?: string;
};

const activeStatuses = ["queued", "sent", "acked"] as const;

const prioritySchema = z.enum(["low", "medium", "high", "critical"]);

const commandSchema = z.enum([
  "agent.pause",
  "agent.resume",
  "agent.redirect",
  "agent.kill",
  "agent.restart",
  "agent.priority.override",
]);

const bulkCommandSchema = z.enum([
  "agent.pause",
  "agent.resume",
  "agent.priority.override",
  "agent.kill",
]);

const dispatchSchema = z.object({
  agentId: z.string().min(1),
  command: commandSchema,
  params: z.unknown().optional(),
  requestId: z.string().min(1).optional(),
});

const bulkDispatchSchema = z.object({
  agentIds: z.array(z.string().min(1)).min(1),
  command: bulkCommandSchema,
  params: z.unknown().optional(),
  requestId: z.string().min(1).optional(),
});

const pauseParamsSchema = z.object({
  reason: z.string().optional(),
}).optional();

const resumeParamsSchema = z.object({}).optional();

const redirectParamsSchema = z
  .object({
    taskId: z.string().optional(),
    taskPayload: z.unknown().optional(),
    priority: prioritySchema.optional(),
  })
  .refine((value) => value.taskId || value.taskPayload, {
    message: "redirect requires taskId or taskPayload",
  });

const killParamsSchema = z.object({
  sessionKey: z.string().optional(),
  force: z.boolean().optional(),
}).optional();

const restartParamsSchema = z.object({}).optional();

const priorityOverrideParamsSchema = z.object({
  priority: prioritySchema,
  durationMs: z.number().int().positive().optional(),
});

type ControlCommand = z.infer<typeof commandSchema>;

type BridgeAck = {
  requestId: string;
  status: "accepted" | "rejected" | "error";
  error?: string;
};

type BridgeControlPayload = {
  agentId?: string;
  agentIds?: string[];
  command: string;
  params?: Record<string, unknown>;
  requestId?: string;
  requestedBy?: string;
};

const bridgeAckSchema = z
  .object({
    requestId: z.string(),
    status: z.enum(["accepted", "rejected", "error"]),
    error: z.string().optional(),
  })
  .passthrough();

function parseCommandParams(
  command: ControlCommand,
  params: unknown
): Record<string, unknown> {
  const parseOptional = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    return result.data;
  };

  switch (command) {
    case "agent.pause": {
      return (parseOptional(pauseParamsSchema, params) ?? {}) as Record<
        string,
        unknown
      >;
    }
    case "agent.resume": {
      return (parseOptional(resumeParamsSchema, params) ?? {}) as Record<
        string,
        unknown
      >;
    }
    case "agent.redirect": {
      return parseOptional(redirectParamsSchema, params) as Record<
        string,
        unknown
      >;
    }
    case "agent.kill": {
      return (parseOptional(killParamsSchema, params) ?? {}) as Record<
        string,
        unknown
      >;
    }
    case "agent.restart": {
      return (parseOptional(restartParamsSchema, params) ?? {}) as Record<
        string,
        unknown
      >;
    }
    case "agent.priority.override": {
      return parseOptional(priorityOverrideParamsSchema, params) as Record<
        string,
        unknown
      >;
    }
  }
}

function resolveBridgeConfig(): { url: string; secret: string } {
  const url = process.env.BRIDGE_CONTROL_URL;
  if (!url) {
    throw new Error("Missing BRIDGE_CONTROL_URL");
  }
  const secret = process.env.BRIDGE_CONTROL_SECRET ?? process.env.BRIDGE_SECRET;
  if (!secret) {
    throw new Error("Missing BRIDGE_CONTROL_SECRET");
  }
  return { url, secret };
}

async function dispatchToBridge(
  controlPayload: BridgeControlPayload
): Promise<BridgeAck> {
  const { url, secret } = resolveBridgeConfig();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(controlPayload),
  });

  if (!response.ok) {
    throw new Error(`Bridge responded with ${response.status}`);
  }

  const responsePayload = await response.json();
  const parsed = bridgeAckSchema.safeParse(responsePayload);
  if (!parsed.success) {
    throw new Error("Invalid bridge response");
  }

  return parsed.data;
}

export const createOperation = internalMutation({
  args: {
    operationId: v.string(),
    requestId: v.string(),
    bulkId: v.optional(v.string()),
    agentId: v.string(),
    command: v.string(),
    params: v.optional(v.any()),
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("acked"),
      v.literal("failed"),
      v.literal("timed-out")
    ),
    requestedBy: v.string(),
    requestedAt: v.number(),
  },
  handler: async (ctx, args): Promise<{
    id: Id<"agentControlOperations">;
    existing: boolean;
    status: OperationStatus;
  }> => {
    const existing = await ctx.db
      .query("agentControlOperations")
      .withIndex("by_operation_id", (q) => q.eq("operationId", args.operationId))
      .take(1);

    if (existing.length > 0) {
      return {
        id: existing[0]._id,
        existing: true,
        status: existing[0].status as OperationStatus,
      };
    }

    const id = await ctx.db.insert("agentControlOperations", {
      operationId: args.operationId,
      requestId: args.requestId,
      bulkId: args.bulkId,
      agentId: args.agentId,
      command: args.command,
      params: args.params,
      status: args.status,
      requestedBy: args.requestedBy,
      requestedAt: args.requestedAt,
    });

    return { id, existing: false, status: args.status as OperationStatus };
  },
});

export const updateOperationStatus = internalMutation({
  args: {
    operationIds: v.array(v.id("agentControlOperations")),
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("acked"),
      v.literal("failed"),
      v.literal("timed-out")
    ),
    ackedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const updates: {
      status: OperationStatus;
      ackedAt?: number;
      completedAt?: number;
      error?: string;
    } = {
      status: args.status as OperationStatus,
    };

    if (args.ackedAt) {
      updates.ackedAt = args.ackedAt;
    }

    if (args.completedAt) {
      updates.completedAt = args.completedAt;
    }

    if (args.error) {
      updates.error = args.error;
    }

    for (const operationId of args.operationIds) {
      await ctx.db.patch(operationId, updates);
    }
  },
});

export const recordAudit = internalMutation({
  args: {
    operationId: v.string(),
    requestId: v.string(),
    bulkId: v.optional(v.string()),
    agentId: v.string(),
    command: v.string(),
    params: v.optional(v.any()),
    outcome: v.union(
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("error")
    ),
    requestedBy: v.string(),
    requestedAt: v.number(),
    ackedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"agentControlAudits">> => {
    return await ctx.db.insert("agentControlAudits", {
      operationId: args.operationId,
      requestId: args.requestId,
      bulkId: args.bulkId,
      agentId: args.agentId,
      command: args.command,
      params: args.params,
      outcome: args.outcome,
      requestedBy: args.requestedBy,
      requestedAt: args.requestedAt,
      ackedAt: args.ackedAt,
      completedAt: args.completedAt,
      error: args.error,
    });
  },
});

export const dispatch = action({
  args: {
    agentId: v.string(),
    command: v.string(),
    params: v.optional(v.any()),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<DispatchResult> => {
    const parsed = dispatchSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const requestId = parsed.data.requestId ?? randomUUID();
    const operationId = requestId;
    const command = parsed.data.command;
    const params = parseCommandParams(command, parsed.data.params);
    const requestedBy = identity.subject;
    const requestedAt = Date.now();

    const operation = await ctx.runMutation(internal.controls.createOperation, {
      operationId,
      requestId,
      agentId: parsed.data.agentId,
      command,
      params,
      status: "queued",
      requestedBy,
      requestedAt,
    });

    if (operation.existing) {
      return {
        ok: true,
        requestId,
        operationId,
        status: operation.status,
      };
    }

    await ctx.runMutation(internal.controls.updateOperationStatus, {
      operationIds: [operation.id],
      status: "sent",
    });

    let bridgeAck: BridgeAck | null = null;
    try {
      bridgeAck = await dispatchToBridge({
        agentId: parsed.data.agentId,
        command,
        requestId,
        params,
        requestedBy,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bridge error";
      await ctx.runMutation(internal.controls.updateOperationStatus, {
        operationIds: [operation.id],
        status: "failed",
        error: message,
      });
      await ctx.runMutation(internal.controls.recordAudit, {
        operationId,
        requestId,
        agentId: parsed.data.agentId,
        command,
        params,
        outcome: "error",
        requestedBy,
        requestedAt,
        error: message,
      });
      await ctx.runMutation(internal.audit.recordControlAudit, {
        action: "control.dispatch",
        operationId,
        requestId,
        agentId: parsed.data.agentId,
        command,
        params,
        outcome: "error",
        requestedBy,
        requestedAt,
        error: message,
      });
      return {
        ok: false,
        requestId,
        operationId,
        status: "failed",
        bridgeStatus: "error",
        error: message,
      };
    }

    const ackedAt = Date.now();
    if (bridgeAck.status === "accepted") {
      await ctx.runMutation(internal.controls.updateOperationStatus, {
        operationIds: [operation.id],
        status: "acked",
        ackedAt,
      });
      await ctx.runMutation(internal.controls.recordAudit, {
        operationId,
        requestId,
        agentId: parsed.data.agentId,
        command,
        params,
        outcome: "accepted",
        requestedBy,
        requestedAt,
        ackedAt,
      });
      await ctx.runMutation(internal.audit.recordControlAudit, {
        action: "control.dispatch",
        operationId,
        requestId,
        agentId: parsed.data.agentId,
        command,
        params,
        outcome: "accepted",
        requestedBy,
        requestedAt,
        ackedAt,
      });
      return {
        ok: true,
        requestId,
        operationId,
        status: "acked",
        bridgeStatus: "accepted",
      };
    }

    const errorMessage = bridgeAck.error ?? "Bridge rejected request";
    await ctx.runMutation(internal.controls.updateOperationStatus, {
      operationIds: [operation.id],
      status: "failed",
      ackedAt,
      error: errorMessage,
    });
    await ctx.runMutation(internal.controls.recordAudit, {
      operationId,
      requestId,
      agentId: parsed.data.agentId,
      command,
      params,
      outcome: bridgeAck.status === "rejected" ? "rejected" : "error",
      requestedBy,
      requestedAt,
      ackedAt,
      error: errorMessage,
    });
    await ctx.runMutation(internal.audit.recordControlAudit, {
      action: "control.dispatch",
      operationId,
      requestId,
      agentId: parsed.data.agentId,
      command,
      params,
      outcome: bridgeAck.status === "rejected" ? "rejected" : "error",
      requestedBy,
      requestedAt,
      ackedAt,
      error: errorMessage,
    });

    return {
      ok: false,
      requestId,
      operationId,
      status: "failed",
      bridgeStatus: bridgeAck.status,
      error: errorMessage,
    };
  },
});

export const bulkDispatch = action({
  args: {
    agentIds: v.array(v.string()),
    command: v.string(),
    params: v.optional(v.any()),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<BulkDispatchResult> => {
    const parsed = bulkDispatchSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const requestId = parsed.data.requestId ?? randomUUID();
    const bulkId = requestId;
    const command = parsed.data.command as ControlCommand;
    const params = parseCommandParams(command, parsed.data.params);
    const requestedBy = identity.subject;
    const requestedAt = Date.now();

    const operations = await Promise.all(
      parsed.data.agentIds.map(async (agentId) => {
        const operationId = `${requestId}:${agentId}`;
        const created = await ctx.runMutation(internal.controls.createOperation, {
          operationId,
          requestId,
          bulkId,
          agentId,
          command,
          params,
          status: "queued",
          requestedBy,
          requestedAt,
        });

        return {
          agentId,
          operationId,
          id: created.id,
          status: created.status,
          existing: created.existing,
        };
      })
    );

    const operationSnapshots = operations.map((operation) => ({
      agentId: operation.agentId,
      operationId: operation.operationId,
      status: operation.status,
    }));

    if (operations.every((operation) => operation.existing)) {
      return {
        ok: operations.every((operation) => operation.status === "acked"),
        requestId,
        bulkId,
        operations: operationSnapshots,
      };
    }

    const newOperations = operations.filter((op) => !op.existing);
    const operationIds = newOperations.map((op) => op.id);
    const newOperationIds = new Set(newOperations.map((op) => op.operationId));

    if (operationIds.length > 0) {
      await ctx.runMutation(internal.controls.updateOperationStatus, {
        operationIds,
        status: "sent",
      });
    }

    let bridgeAck: BridgeAck | null = null;
    try {
      bridgeAck = await dispatchToBridge({
        agentIds: parsed.data.agentIds,
        command,
        requestId,
        params,
        requestedBy,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bridge error";
      if (operationIds.length > 0) {
        await ctx.runMutation(internal.controls.updateOperationStatus, {
          operationIds,
          status: "failed",
          error: message,
        });
      }
      await Promise.all(
        newOperations.map(async (operation) => {
          await ctx.runMutation(internal.controls.recordAudit, {
            operationId: operation.operationId,
            requestId,
            bulkId,
            agentId: operation.agentId,
            command,
            params,
            outcome: "error",
            requestedBy,
            requestedAt,
            error: message,
          });
          await ctx.runMutation(internal.audit.recordControlAudit, {
            action: "control.bulkDispatch",
            operationId: operation.operationId,
            requestId,
            bulkId,
            agentId: operation.agentId,
            command,
            params,
            outcome: "error",
            requestedBy,
            requestedAt,
            error: message,
          });
        })
      );
      return {
        ok: false,
        requestId,
        bulkId,
        operations: operationSnapshots.map((operation) => ({
          ...operation,
          status: newOperationIds.has(operation.operationId)
            ? "failed"
            : operation.status,
        })),
        bridgeStatus: "error",
        error: message,
      };
    }

    const ackedAt = Date.now();
    const status = bridgeAck.status === "accepted" ? "acked" : "failed";
    if (operationIds.length > 0) {
      await ctx.runMutation(internal.controls.updateOperationStatus, {
        operationIds,
        status,
        ackedAt,
        error:
          bridgeAck.status === "accepted"
            ? undefined
            : bridgeAck.error ?? "Bridge rejected request",
      });
    }

    await Promise.all(
      newOperations.map(async (operation) => {
        const outcome =
          bridgeAck.status === "accepted"
            ? "accepted"
            : bridgeAck.status === "rejected"
              ? "rejected"
              : "error";
        const error =
          bridgeAck.status === "accepted"
            ? undefined
            : bridgeAck.error ?? "Bridge rejected request";
        await ctx.runMutation(internal.controls.recordAudit, {
          operationId: operation.operationId,
          requestId,
          bulkId,
          agentId: operation.agentId,
          command,
          params,
          outcome,
          requestedBy,
          requestedAt,
          ackedAt,
          error,
        });
        await ctx.runMutation(internal.audit.recordControlAudit, {
          action: "control.bulkDispatch",
          operationId: operation.operationId,
          requestId,
          bulkId,
          agentId: operation.agentId,
          command,
          params,
          outcome,
          requestedBy,
          requestedAt,
          ackedAt,
          error,
        });
      })
    );

    return {
      ok: bridgeAck.status === "accepted",
      requestId,
      bulkId,
      operations: operationSnapshots.map((operation) => ({
        ...operation,
        status: newOperationIds.has(operation.operationId)
          ? status
          : operation.status,
      })),
      bridgeStatus: bridgeAck.status,
      error:
        bridgeAck.status === "accepted"
          ? undefined
          : bridgeAck.error ?? "Bridge rejected request",
    };
  },
});

export const listActiveByAgent = query({
  args: {
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<Doc<"agentControlOperations">>> => {
    return await listActiveByAgentHandler(ctx, args);
  },
});

const listActiveByAgentHandler = async (
  ctx: QueryCtx,
  args: { agentId: string; limit?: number }
): Promise<Array<Doc<"agentControlOperations">>> => {
  return await ctx.db
    .query("agentControlOperations")
    .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
    .filter((q) =>
      q.or(
        q.eq(q.field("status"), activeStatuses[0]),
        q.eq(q.field("status"), activeStatuses[1]),
        q.eq(q.field("status"), activeStatuses[2])
      )
    )
    .order("desc")
    .take(args.limit ?? 50);
};

export const activeByAgent = query({
  args: {
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<Doc<"agentControlOperations">>> => {
    return await listActiveByAgentHandler(ctx, args);
  },
});

export const operationsByAgent = query({
  args: {
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<Doc<"agentControlOperations">>> => {
    return await ctx.db
      .query("agentControlOperations")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listRecentByOperator = query({
  args: {
    requestedBy: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<Doc<"agentControlOperations">>> => {
    return await ctx.db
      .query("agentControlOperations")
      .withIndex("by_requested_by", (q) => q.eq("requestedBy", args.requestedBy))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listByBulkId = query({
  args: {
    bulkId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<Doc<"agentControlOperations">>> => {
    return await ctx.db
      .query("agentControlOperations")
      .withIndex("by_bulk", (q) => q.eq("bulkId", args.bulkId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

const auditOutcomeValidator = v.union(
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("error")
);

export const listAuditsByAgent = query({
  args: {
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<Doc<"agentControlAudits">>> => {
    return await ctx.db
      .query("agentControlAudits")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const auditByAgent = query({
  args: {
    agentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<Doc<"agentControlAudits">>> => {
    return await ctx.db
      .query("agentControlAudits")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listAuditsRecent = query({
  args: {
    limit: v.optional(v.number()),
    requestedBy: v.optional(v.string()),
    outcome: v.optional(auditOutcomeValidator),
  },
  handler: async (ctx, args): Promise<Array<Doc<"agentControlAudits">>> => {
    const baseQuery = args.requestedBy
      ? ctx.db
          .query("agentControlAudits")
          .withIndex("by_requested_by", (q) =>
            q.eq("requestedBy", args.requestedBy as string)
          )
      : ctx.db.query("agentControlAudits");

    const filtered = args.outcome
      ? baseQuery.filter((q) => q.eq(q.field("outcome"), args.outcome))
      : baseQuery;

    return await filtered.order("desc").take(args.limit ?? 50);
  },
});
