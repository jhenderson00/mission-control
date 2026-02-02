export const priorityOptions = ["low", "medium", "high", "critical"] as const;

export type Priority = (typeof priorityOptions)[number];
