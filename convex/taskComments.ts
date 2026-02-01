import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { ensureSubscription, type SubscriberType } from "./subscriptions";

type Mention = {
  subscriberType: SubscriberType;
  subscriberId: string;
};

const mentionPattern = /@(?:(user|agent):)?([a-zA-Z0-9_-]+)/g;

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

    const commentId = await ctx.db.insert("taskComments", {
      taskId: args.taskId,
      body: args.body,
      authorType: args.authorType,
      authorId: args.authorId,
      mentions: mentions.length > 0 ? mentions : undefined,
      createdAt: Date.now(),
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

    return commentId;
  },
});
