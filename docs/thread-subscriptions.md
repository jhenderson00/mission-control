# Thread Subscriptions (CYD-126)

## Overview
Task discussions now support thread subscriptions. Participants are auto-subscribed so future comments notify them without requiring additional @mentions.

## Auto-subscribe rules
- Comment on a task -> the commenter is subscribed.
- @Mentioned in a comment -> the mentioned user/agent is subscribed.
- Assigned to a task -> assigned agents are subscribed (both on create and assign).

## Schema
### taskSubscriptions
Fields:
- taskId (id: tasks)
- subscriberType ("user" | "agent")
- subscriberId (string)
- createdAt (number)

Indexes:
- by_task (taskId, createdAt)
- by_subscriber (subscriberType, subscriberId, createdAt)
- by_task_subscriber (taskId, subscriberType, subscriberId)

### taskComments
Fields:
- taskId (id: tasks)
- authorType ("user" | "agent")
- authorId (string)
- body (string)
- mentions (optional array of { subscriberType, subscriberId })
- createdAt (number)

Indexes:
- by_task (taskId, createdAt)
- by_author (authorType, authorId, createdAt)

## Convex functions
### Mutations
- subscriptions.subscribe(taskId, subscriberType, subscriberId)
- subscriptions.unsubscribe(taskId, subscriberType, subscriberId)
- subscriptions.listSubscribers(taskId)
- taskComments.addComment(taskId, body, authorType, authorId, mentions?)

### Queries
- subscriptions.getSubscribers(taskId)
- subscriptions.isSubscribed(taskId, subscriberType, subscriberId)

## Mention parsing
`taskComments.addComment` parses mentions from the comment body using:
- `@userId` (defaults to user)
- `@agent:agentId` (explicit agent mention)
- `@user:userId` (explicit user mention)

Mentions passed in the optional `mentions` array are merged with parsed mentions and de-duplicated before subscribing.

## Notes
- Unassigning agents does not currently remove subscriptions.
- The subscription APIs are idempotent (repeat subscribe/unsubscribe is safe).
