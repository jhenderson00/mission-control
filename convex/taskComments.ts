import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { ensureSubscription, type SubscriberType } from "./subscriptions";

type Mention = {
  subscriberType: SubscriberType;
  subscriberId: string;
};

const mentionPattern = /@(?:(user|agent):)?([a-zA-Z0-9_-]+)/g;
const MAX_MENTION_BODY_LENGTH = 800;

function parseMentions(body: string): Mention[] {
  const matches: Mention[] = [];
  for (const match of body.matchAll(mentionPattern)) {
    const rawType = match[1];
    const subscriberId = match[2];
    if (!subscriberId) continue;
    const subscriberType: SubscriberType = rawType === "agent" ? "agent" : "user";
    matches.push({ subscriberType, subscriberId });
  }
  return matches;
}

function dedupeMentions(mentions: Mention[]): Mention[] {
  const seen = new Set<string>();
  const unique: Mention[] = [];
  for (const mention of mentions) {
    const key = `${mention.subscriberType}:${mention.subscriberId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(mention);
  }
  return unique;
}

function truncateBody(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function buildMentionMessage(input: {
  taskTitle: string | null;
  authorType: string;
  authorId: string;
  body: string;
}): string {
  const taskLabel = input.taskTitle
    ? `task "${input.taskTitle}"`
    : "a task";
  const header = `[Mission Control] Mention from ${input.authorType}:${input.authorId} on ${taskLabel}.`;
  const trimmedBody = input.body.trim();
  if (!trimmedBody) {
    return header;
  }
  const snippet = truncateBody(trimmedBody, MAX_MENTION_BODY_LENGTH);
  return `${header}\n\n${snippet}`;
}

export const addComment = mutation({
  args: {
    taskId: v.id("tasks"),
    body: v.string(),
    authorType: v.union(v.literal("user"), v.literal("agent")),
    authorId: v.string(),
    mentions: v.optional(
      v.array(
        v.object({
          subscriberType: v.union(v.literal("user"), v.literal("agent")),
          subscriberId: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args): Promise<Id<"taskComments">> => {
    const parsedMentions = parseMentions(args.body);
    const explicitMentions: Mention[] = (args.mentions ?? []).map((mention) => ({
      subscriberType: mention.subscriberType,
      subscriberId: mention.subscriberId,
    }));
    const mentions = dedupeMentions([...parsedMentions, ...explicitMentions]);
    const agentMentions = mentions.filter(
      (mention) => mention.subscriberType === "agent"
    );
    const now = Date.now();

    const commentId = await ctx.db.insert("taskComments", {
      taskId: args.taskId,
      body: args.body,
      authorType: args.authorType,
      authorId: args.authorId,
      mentions: mentions.length > 0 ? mentions : undefined,
      createdAt: now,
    });

    await ensureSubscription(ctx, {
      taskId: args.taskId,
      subscriberType: args.authorType,
      subscriberId: args.authorId,
    });

    for (const mention of mentions) {
      await ensureSubscription(ctx, {
        taskId: args.taskId,
        subscriberType: mention.subscriberType,
        subscriberId: mention.subscriberId,
      });
    }

    if (agentMentions.length > 0) {
      const task = await ctx.db.get(args.taskId);
      const mentionMessage = buildMentionMessage({
        taskTitle: task?.title ?? null,
        authorType: args.authorType,
        authorId: args.authorId,
        body: args.body,
      });

      for (const mention of agentMentions) {
        await ctx.db.insert("notifications", {
          recipientType: "agent",
          recipientId: mention.subscriberId,
          type: "mention",
          status: "pending",
          message: mentionMessage,
          attempts: 0,
          taskId: args.taskId,
          commentId,
          metadata: {
            authorType: args.authorType,
            authorId: args.authorId,
          },
          createdAt: now,
        });
      }
    }

    return commentId;
  },
});
