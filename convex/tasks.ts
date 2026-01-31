import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Get all tasks, optionally filtered by status
 */
export const list = query({
  args: {
    status: v.optional(v.union(
      v.literal("queued"),
      v.literal("active"),
      v.literal("blocked"),
      v.literal("completed"),
      v.literal("failed")
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let tasks;
    
    if (args.status) {
      tasks = await ctx.db
        .query("tasks")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_status", (q: any) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      tasks = await ctx.db.query("tasks").order("desc").collect();
    }
    
    if (args.limit) {
      return tasks.slice(0, args.limit);
    }
    
    return tasks;
  },
});

/**
 * Get a single task by ID
 */
export const get = query({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get task status counts for dashboard
 */
export const statusCounts = query({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    
    const counts: Record<string, number> = {
      total: tasks.length,
      queued: 0,
      active: 0,
      blocked: 0,
      completed: 0,
      failed: 0,
    };
    
    for (const task of tasks) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (task as any).status;
      if (status in counts) {
        counts[status]++;
      }
    }
    
    return counts;
  },
});

/**
 * Get recent tasks with assigned agents
 */
export const listWithAgents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .order("desc")
      .take(args.limit ?? 50);
    
    return Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tasks.map(async (task: any) => {
        const agentIds = task.assignedAgentIds ?? [];
        const agents = await Promise.all(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          agentIds.map((id: any) => ctx.db.get(id))
        );
        return { ...task, assignedAgents: agents.filter(Boolean) };
      })
    );
  },
});

/**
 * Create a new task
 */
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    requester: v.union(
      v.literal("josh"),
      v.literal("cydni"),
      v.literal("system")
    ),
    priority: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    assignedAgentIds: v.optional(v.array(v.id("agents"))),
    successCriteria: v.optional(v.array(v.string())),
    parentTaskId: v.optional(v.id("tasks")),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      requester: args.requester,
      priority: args.priority,
      assignedAgentIds: args.assignedAgentIds ?? [],
      successCriteria: args.successCriteria,
      parentTaskId: args.parentTaskId,
      dueAt: args.dueAt,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update task status
 */
export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: v.union(
      v.literal("queued"),
      v.literal("active"),
      v.literal("blocked"),
      v.literal("completed"),
      v.literal("failed")
    ),
    blockedReason: v.optional(v.string()),
    output: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {
      status: args.status,
      updatedAt: now,
    };
    
    if (args.status === "active") {
      updates.startedAt = now;
    } else if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = now;
    }
    
    if (args.blockedReason !== undefined) {
      updates.blockedReason = args.blockedReason;
    }
    
    if (args.output !== undefined) {
      updates.output = args.output;
    }
    
    await ctx.db.patch(args.id, updates);
  },
});

/**
 * Assign agents to a task
 */
export const assignAgents = mutation({
  args: {
    id: v.id("tasks"),
    agentIds: v.array(v.id("agents")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      assignedAgentIds: args.agentIds,
      updatedAt: Date.now(),
    });
  },
});
