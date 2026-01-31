import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agents: defineTable({
    name: v.string(),
    role: v.string(),
    status: v.string(),
    summary: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastActiveAt: v.optional(v.number()),
  }),
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    priority: v.string(),
    assigneeId: v.optional(v.id("agents")),
    createdAt: v.number(),
    updatedAt: v.number(),
    dueAt: v.optional(v.number()),
  }),
  events: defineTable({
    type: v.string(),
    agentId: v.optional(v.id("agents")),
    taskId: v.optional(v.id("tasks")),
    message: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }),
  decisions: defineTable({
    title: v.string(),
    summary: v.optional(v.string()),
    status: v.string(),
    ownerId: v.optional(v.id("agents")),
    context: v.optional(v.string()),
    outcome: v.optional(v.string()),
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
  }),
});
