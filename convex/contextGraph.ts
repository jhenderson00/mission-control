import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { resolveConvexAgentId } from "./agentLinking";

type ContextGraphNodeType = "agent" | "decision" | "task";

type ContextGraphNode = {
  id: string;
  sourceId: string;
  type: ContextGraphNodeType;
  label: string;
  summary?: string;
  status?: string;
  decisionType?: string;
  importance?: string;
  createdAt?: number;
  metadata?: Record<string, unknown>;
};

type ContextGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: "decision_parent" | "decision_task" | "decision_agent" | "task_parent";
};

type ContextGraphResponse = {
  nodes: ContextGraphNode[];
  edges: ContextGraphEdge[];
};

type DecisionRecord = Doc<"decisions">;

type TaskRecord = Doc<"tasks">;

type AgentRecord = Doc<"agents">;

const DEFAULT_LIMIT = 80;
const FALLBACK_DECISION_TYPE = "unspecified";

function truncate(value: string | undefined, limit: number): string | undefined {
  if (!value) return undefined;
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function nodeKey(type: ContextGraphNodeType, id: string): string {
  return `${type}:${id}`;
}

function asDecisionType(decisionType: DecisionRecord["decisionType"]): string {
  return decisionType ?? FALLBACK_DECISION_TYPE;
}

function buildDecisionNode(decision: DecisionRecord): ContextGraphNode {
  const decisionType = asDecisionType(decision.decisionType);
  return {
    id: nodeKey("decision", decision._id),
    sourceId: decision._id,
    type: "decision",
    label: decision.decision,
    summary: truncate(decision.reasoning, 140),
    status: decision.outcome,
    decisionType,
    importance: decision.importance,
    createdAt: decision.createdAt,
    metadata: {
      reasoning: decision.reasoning,
      confidence: decision.confidence,
      alternativesConsidered: decision.alternativesConsidered,
      contextRefs: decision.contextRefs,
      tags: decision.tags,
      outcome: decision.outcome,
      taskId: decision.taskId,
    },
  };
}

function buildTaskNode(task: TaskRecord): ContextGraphNode {
  return {
    id: nodeKey("task", task._id),
    sourceId: task._id,
    type: "task",
    label: task.title,
    summary: truncate(task.description ?? task.blockedReason, 120),
    status: task.status,
    importance: task.priority,
    createdAt: task.createdAt,
    metadata: {
      description: task.description,
      blockedReason: task.blockedReason,
      status: task.status,
      priority: task.priority,
      assignedAgentIds: task.assignedAgentIds,
      parentTaskId: task.parentTaskId,
    },
  };
}

function buildAgentNode(agent: AgentRecord): ContextGraphNode {
  return {
    id: nodeKey("agent", agent._id),
    sourceId: agent._id,
    type: "agent",
    label: agent.name,
    summary: `${agent.type} · ${agent.model}`,
    status: agent.status,
    createdAt: agent.updatedAt,
    metadata: {
      type: agent.type,
      model: agent.model,
      host: agent.host,
      status: agent.status,
      description: agent.description,
      tags: agent.tags,
    },
  };
}

function uniqueById<T extends { _id: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const record of records) {
    if (seen.has(record._id)) continue;
    seen.add(record._id);
    result.push(record);
  }
  return result;
}

export const getGraph = query({
  args: {
    agentId: v.optional(v.string()),
    decisionType: v.optional(v.string()),
    timeRangeMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ContextGraphResponse> => {
    const limit = args.limit ?? DEFAULT_LIMIT;
    const since = args.timeRangeMs ? Date.now() - args.timeRangeMs : null;

    const normalizedDecisionType = args.decisionType?.trim();
    const normalizedAgentId = args.agentId?.trim();

    let decisions: DecisionRecord[] = [];

    if (normalizedAgentId) {
      const resolvedAgentId = await resolveConvexAgentId(ctx, normalizedAgentId);
      if (!resolvedAgentId) {
        return { nodes: [], edges: [] };
      }
      decisions = await ctx.db
        .query("decisions")
        .withIndex("by_agent", (q) => q.eq("agentId", resolvedAgentId))
        .order("desc")
        .take(limit * 3);
    } else {
      decisions = await ctx.db
        .query("decisions")
        .order("desc")
        .take(limit * 3);
    }

    if (since) {
      decisions = decisions.filter((decision) => decision.createdAt >= since);
    }

    if (normalizedDecisionType) {
      decisions = decisions.filter(
        (decision) => asDecisionType(decision.decisionType) === normalizedDecisionType
      );
    }

    decisions = decisions.slice(0, limit);

    const decisionIds = new Set<Id<"decisions">>(decisions.map((decision) => decision._id));
    const parentDecisionIds = new Set<Id<"decisions">>();

    for (const decision of decisions) {
      if (decision.parentDecisionId && !decisionIds.has(decision.parentDecisionId)) {
        parentDecisionIds.add(decision.parentDecisionId);
      }
    }

    const parentDecisions = await Promise.all(
      Array.from(parentDecisionIds).map((id) => ctx.db.get(id))
    );

    const allDecisions = uniqueById(
      [...decisions, ...parentDecisions.filter(Boolean)] as DecisionRecord[]
    );

    const taskIds = new Set<Id<"tasks">>();
    const agentIds = new Set<Id<"agents">>();

    for (const decision of allDecisions) {
      agentIds.add(decision.agentId);
      if (decision.taskId) {
        taskIds.add(decision.taskId);
      }
    }

    const tasks = (await Promise.all(
      Array.from(taskIds).map((id) => ctx.db.get(id))
    )).filter(Boolean) as TaskRecord[];

    const parentTaskIds = new Set<Id<"tasks">>();
    for (const task of tasks) {
      if (task.parentTaskId && !taskIds.has(task.parentTaskId)) {
        parentTaskIds.add(task.parentTaskId);
      }
    }

    const parentTasks = (await Promise.all(
      Array.from(parentTaskIds).map((id) => ctx.db.get(id))
    )).filter(Boolean) as TaskRecord[];

    const allTasks = uniqueById([...tasks, ...parentTasks]);

    const agents = (await Promise.all(
      Array.from(agentIds).map((id) => ctx.db.get(id))
    )).filter(Boolean) as AgentRecord[];

    const nodes: ContextGraphNode[] = [
      ...agents.map(buildAgentNode),
      ...allDecisions.map(buildDecisionNode),
      ...allTasks.map(buildTaskNode),
    ];

    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges: ContextGraphEdge[] = [];

    for (const decision of allDecisions) {
      const decisionNodeId = nodeKey("decision", decision._id);
      const agentNodeId = nodeKey("agent", decision.agentId);

      edges.push({
        id: `${agentNodeId}->${decisionNodeId}:decision_agent`,
        source: agentNodeId,
        target: decisionNodeId,
        relation: "decision_agent",
      });

      if (decision.parentDecisionId) {
        const parentNodeId = nodeKey("decision", decision.parentDecisionId);
        edges.push({
          id: `${parentNodeId}->${decisionNodeId}:decision_parent`,
          source: parentNodeId,
          target: decisionNodeId,
          relation: "decision_parent",
        });
      }

      if (decision.taskId) {
        const taskNodeId = nodeKey("task", decision.taskId);
        edges.push({
          id: `${decisionNodeId}->${taskNodeId}:decision_task`,
          source: decisionNodeId,
          target: taskNodeId,
          relation: "decision_task",
        });
      }
    }

    for (const task of allTasks) {
      if (task.parentTaskId) {
        const parentNodeId = nodeKey("task", task.parentTaskId);
        const taskNodeId = nodeKey("task", task._id);
        edges.push({
          id: `${parentNodeId}->${taskNodeId}:task_parent`,
          source: parentNodeId,
          target: taskNodeId,
          relation: "task_parent",
        });
      }
    }

    const filteredEdges = edges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );

    return { nodes, edges: filteredEdges };
  },
});
