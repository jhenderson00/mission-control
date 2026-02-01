import { v } from "convex/values";
import { z } from "zod";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";

type TaskStatus = "queued" | "active" | "blocked" | "completed" | "failed";

type TaskDoc = {
  _id: Id<"tasks">;
  title: string;
  status: TaskStatus;
  assignedAgentIds?: Array<Id<"agents">>;
  completedAt?: number;
  startedAt?: number;
  updatedAt?: number;
  blockedReason?: string;
};

type DecisionOutcome = "accepted" | "rejected" | "pending";

type DecisionDoc = {
  _id: Id<"decisions">;
  agentId: Id<"agents">;
  decision: string;
  outcome: DecisionOutcome;
  createdAt: number;
  decidedAt?: number;
};

type StandupItem = {
  id: string;
  label: string;
};

type StandupGroup = {
  agentId: string | null;
  agentName: string;
  items: StandupItem[];
};

type StandupSections = {
  completed: StandupGroup[];
  inProgress: StandupGroup[];
  blocked: StandupGroup[];
  needsReview: StandupGroup[];
  decisions: StandupGroup[];
};

export type DailyStandupReport = {
  date: string;
  displayDate: string;
  timezoneOffsetMinutes: number;
  rangeStart: number;
  rangeEnd: number;
  sections: StandupSections;
  markdown: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z
  .string()
  .regex(DATE_PATTERN, "dailyStandup: date must be YYYY-MM-DD");

function formatDisplayDate(dateISO: string): string {
  return new Date(`${dateISO}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getDayRange(dateISO: string, timezoneOffsetMinutes: number): {
  start: number;
  end: number;
} {
  const base = Date.parse(`${dateISO}T00:00:00.000Z`);
  if (Number.isNaN(base)) {
    throw new Error("dailyStandup: invalid date");
  }
  const offsetMs = timezoneOffsetMinutes * 60 * 1000;
  const start = base - offsetMs;
  return { start, end: start + MS_PER_DAY };
}

function ensureDateInput(dateISO: string): string {
  const parsed = dateSchema.safeParse(dateISO);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "dailyStandup: invalid date");
  }
  return parsed.data;
}

function addItemToGroup(
  groups: Map<string, StandupGroup>,
  agentId: string | null,
  agentName: string,
  item: StandupItem
) {
  const key = agentId ?? "unassigned";
  const existing = groups.get(key);
  if (existing) {
    existing.items.push(item);
    return;
  }
  groups.set(key, {
    agentId,
    agentName,
    items: [item],
  });
}

function sortGroups(groups: Map<string, StandupGroup>): StandupGroup[] {
  const list = Array.from(groups.values());
  list.forEach((group) => {
    group.items.sort((a, b) => a.label.localeCompare(b.label));
  });

  return list.sort((a, b) => {
    const aUnassigned = a.agentId === null;
    const bUnassigned = b.agentId === null;
    if (aUnassigned && !bUnassigned) return 1;
    if (!aUnassigned && bUnassigned) return -1;
    return a.agentName.localeCompare(b.agentName);
  });
}

function buildSectionLines(
  title: string,
  groups: StandupGroup[],
  emptyLabel = "• None"
): string[] {
  const lines = [title];
  if (groups.length === 0) {
    lines.push(emptyLabel);
    return lines;
  }

  for (const group of groups) {
    for (const item of group.items) {
      lines.push(`• ${group.agentName}: ${item.label}`);
    }
  }

  return lines;
}

function buildMarkdown(displayDate: string, sections: StandupSections): string {
  const lines: string[] = [
    `📊 DAILY STANDUP — ${displayDate}`,
    ...buildSectionLines("✅ COMPLETED TODAY", sections.completed),
    ...buildSectionLines("🔄 IN PROGRESS", sections.inProgress),
    ...buildSectionLines("🚫 BLOCKED", sections.blocked),
    ...buildSectionLines("🧪 NEEDS REVIEW QUEUE", sections.needsReview),
    ...buildSectionLines("🧭 KEY DECISIONS MADE", sections.decisions),
  ];

  return lines.join("\n");
}

export const dailyStandup = query({
  args: {
    date: v.string(),
    timezoneOffsetMinutes: v.optional(v.number()),
    includeUnassigned: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<DailyStandupReport> => {
    const date = ensureDateInput(args.date);
    const timezoneOffsetMinutes = args.timezoneOffsetMinutes ?? 0;
    const includeUnassigned = args.includeUnassigned ?? true;
    const { start, end } = getDayRange(date, timezoneOffsetMinutes);

    const [completedTasks, activeTasks, blockedTasks, pendingDecisions, accepted, rejected] =
      await Promise.all([
        ctx.db
          .query("tasks")
          .withIndex("by_status", (q) => q.eq("status", "completed"))
          .filter((q) =>
            q.and(
              q.gte(q.field("completedAt"), start),
              q.lt(q.field("completedAt"), end)
            )
          )
          .collect(),
        ctx.db
          .query("tasks")
          .withIndex("by_status", (q) => q.eq("status", "active"))
          .collect(),
        ctx.db
          .query("tasks")
          .withIndex("by_status", (q) => q.eq("status", "blocked"))
          .collect(),
        ctx.db
          .query("decisions")
          .withIndex("by_outcome", (q) => q.eq("outcome", "pending"))
          .collect(),
        ctx.db
          .query("decisions")
          .withIndex("by_outcome", (q) => q.eq("outcome", "accepted"))
          .filter((q) =>
            q.and(
              q.gte(q.field("decidedAt"), start),
              q.lt(q.field("decidedAt"), end)
            )
          )
          .collect(),
        ctx.db
          .query("decisions")
          .withIndex("by_outcome", (q) => q.eq("outcome", "rejected"))
          .filter((q) =>
            q.and(
              q.gte(q.field("decidedAt"), start),
              q.lt(q.field("decidedAt"), end)
            )
          )
          .collect(),
      ]);

    const resolvedDecisions = [...accepted, ...rejected] as DecisionDoc[];
    const taskDocs = [
      ...completedTasks,
      ...activeTasks,
      ...blockedTasks,
    ] as TaskDoc[];

    const agentIds = new Set<Id<"agents">>();
    for (const task of taskDocs) {
      for (const agentId of task.assignedAgentIds ?? []) {
        agentIds.add(agentId);
      }
    }
    for (const decision of [...pendingDecisions, ...resolvedDecisions] as DecisionDoc[]) {
      agentIds.add(decision.agentId);
    }

    const agentEntries = await Promise.all(
      Array.from(agentIds).map(async (id) => {
        const record = await ctx.db.get(id);
        return record ? [id, record.name] : null;
      })
    );

    const agentNameById = new Map<string, string>();
    for (const entry of agentEntries) {
      if (entry) {
        agentNameById.set(entry[0], entry[1]);
      }
    }

    const completedGroups = new Map<string, StandupGroup>();
    for (const task of completedTasks as TaskDoc[]) {
      const agents = task.assignedAgentIds ?? [];
      if (agents.length === 0) {
        if (includeUnassigned) {
          addItemToGroup(completedGroups, null, "Unassigned", {
            id: task._id,
            label: task.title,
          });
        }
        continue;
      }
      for (const agentId of agents) {
        addItemToGroup(completedGroups, agentId, agentNameById.get(agentId) ?? "Unknown Agent", {
          id: task._id,
          label: task.title,
        });
      }
    }

    const inProgressGroups = new Map<string, StandupGroup>();
    for (const task of activeTasks as TaskDoc[]) {
      const agents = task.assignedAgentIds ?? [];
      if (agents.length === 0) {
        if (includeUnassigned) {
          addItemToGroup(inProgressGroups, null, "Unassigned", {
            id: task._id,
            label: task.title,
          });
        }
        continue;
      }
      for (const agentId of agents) {
        addItemToGroup(inProgressGroups, agentId, agentNameById.get(agentId) ?? "Unknown Agent", {
          id: task._id,
          label: task.title,
        });
      }
    }

    const blockedGroups = new Map<string, StandupGroup>();
    for (const task of blockedTasks as TaskDoc[]) {
      const label = task.blockedReason
        ? `${task.title} — ${task.blockedReason}`
        : task.title;
      const agents = task.assignedAgentIds ?? [];
      if (agents.length === 0) {
        if (includeUnassigned) {
          addItemToGroup(blockedGroups, null, "Unassigned", {
            id: task._id,
            label,
          });
        }
        continue;
      }
      for (const agentId of agents) {
        addItemToGroup(blockedGroups, agentId, agentNameById.get(agentId) ?? "Unknown Agent", {
          id: task._id,
          label,
        });
      }
    }

    const reviewGroups = new Map<string, StandupGroup>();
    for (const decision of pendingDecisions as DecisionDoc[]) {
      addItemToGroup(
        reviewGroups,
        decision.agentId,
        agentNameById.get(decision.agentId) ?? "Unknown Agent",
        {
          id: decision._id,
          label: decision.decision,
        }
      );
    }

    const decisionGroups = new Map<string, StandupGroup>();
    for (const decision of resolvedDecisions as DecisionDoc[]) {
      addItemToGroup(
        decisionGroups,
        decision.agentId,
        agentNameById.get(decision.agentId) ?? "Unknown Agent",
        {
          id: decision._id,
          label: `${decision.decision} (${decision.outcome})`,
        }
      );
    }

    const sections: StandupSections = {
      completed: sortGroups(completedGroups),
      inProgress: sortGroups(inProgressGroups),
      blocked: sortGroups(blockedGroups),
      needsReview: sortGroups(reviewGroups),
      decisions: sortGroups(decisionGroups),
    };

    const displayDate = formatDisplayDate(date);

    return {
      date,
      displayDate,
      timezoneOffsetMinutes,
      rangeStart: start,
      rangeEnd: end,
      sections,
      markdown: buildMarkdown(displayDate, sections),
    };
  },
});
