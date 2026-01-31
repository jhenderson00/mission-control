import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Mission Control Schema
 * Based on PRD data models: Agents, Tasks, Events, Decisions
 */

export default defineSchema({
  /**
   * Agent - Represents an AI operator in the organization
   */
  agents: defineTable({
    // Identity
    name: v.string(),
    type: v.union(
      v.literal("coordinator"),
      v.literal("planner"),
      v.literal("executor"),
      v.literal("critic"),
      v.literal("specialist")
    ),
    model: v.string(), // claude-opus-4, claude-sonnet-4, etc.
    
    // Status
    status: v.union(
      v.literal("idle"),
      v.literal("active"),
      v.literal("blocked"),
      v.literal("failed")
    ),
    
    // Current work
    currentTaskId: v.optional(v.id("tasks")),
    
    // Runtime info
    host: v.string(), // 'local', 'tank', etc.
    sessionId: v.optional(v.string()), // tmux session, process ID
    
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    lastActiveAt: v.optional(v.number()),
    
    // Metadata
    tags: v.optional(v.array(v.string())),
    description: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .index("by_host", ["host"]),

  /**
   * Task - Work items assigned to agents
   */
  tasks: defineTable({
    // Identity
    title: v.string(),
    description: v.optional(v.string()),
    
    // Assignment
    requester: v.union(
      v.literal("josh"),
      v.literal("cydni"),
      v.literal("system")
    ),
    assignedAgentIds: v.array(v.id("agents")),
    
    // Status
    status: v.union(
      v.literal("queued"),
      v.literal("active"),
      v.literal("blocked"),
      v.literal("completed"),
      v.literal("failed")
    ),
    priority: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    
    // Success criteria (per Team of Rivals)
    successCriteria: v.optional(v.array(v.string())),
    
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    dueAt: v.optional(v.number()),
    
    // Hierarchy
    parentTaskId: v.optional(v.id("tasks")),
    
    // Output
    output: v.optional(v.any()),
    blockedReason: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_priority", ["priority"])
    .index("by_requester", ["requester"])
    .index("by_parent", ["parentTaskId"]),

  /**
   * Event - For event sourcing / agent activity log
   */
  events: defineTable({
    // Context
    agentId: v.id("agents"),
    taskId: v.optional(v.id("tasks")),
    
    // Event type
    type: v.union(
      v.literal("message"),
      v.literal("tool_call"),
      v.literal("tool_result"),
      v.literal("decision"),
      v.literal("error"),
      v.literal("status_change"),
      v.literal("spawn"),
      v.literal("complete")
    ),
    
    // For messages
    role: v.optional(v.union(
      v.literal("system"),
      v.literal("user"),
      v.literal("assistant")
    )),
    
    // Content
    content: v.string(),
    metadata: v.optional(v.object({
      tokens: v.optional(v.number()),
      latencyMs: v.optional(v.number()),
      model: v.optional(v.string()),
      toolName: v.optional(v.string()),
      exitCode: v.optional(v.number()),
    })),
    
    // Timestamp
    createdAt: v.number(),
  })
    .index("by_agent", ["agentId", "createdAt"])
    .index("by_task", ["taskId", "createdAt"])
    .index("by_type", ["type", "createdAt"]),

  /**
   * Decision - Context graph nodes for traceable reasoning
   */
  decisions: defineTable({
    // Context
    agentId: v.id("agents"),
    taskId: v.optional(v.id("tasks")),
    
    // The decision
    decision: v.string(),
    reasoning: v.string(),
    
    // Confidence
    confidence: v.optional(v.number()), // 0-1
    
    // Alternatives considered
    alternativesConsidered: v.optional(v.array(v.object({
      option: v.string(),
      rejectedBecause: v.string(),
    }))),
    
    // Context references
    contextRefs: v.optional(v.array(v.object({
      type: v.union(
        v.literal("file"),
        v.literal("message"),
        v.literal("decision"),
        v.literal("external")
      ),
      id: v.string(),
      summary: v.optional(v.string()),
      relevance: v.optional(v.string()),
    }))),
    
    // Outcome
    outcome: v.union(
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("pending")
    ),
    
    // Decision chain
    parentDecisionId: v.optional(v.id("decisions")),
    
    // Timestamps
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index("by_agent", ["agentId", "createdAt"])
    .index("by_task", ["taskId", "createdAt"])
    .index("by_outcome", ["outcome"])
    .index("by_parent", ["parentDecisionId"]),
});
