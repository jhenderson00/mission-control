# Daily Standup Report (CYD-128)

Automated daily standup summary intended for Telegram delivery. The report aggregates
task status and decision activity, groups items by agent, and emits a Markdown block
with the required emoji headings.

## Query

`api.reports.dailyStandup`

### Args

- `date` (string, required): `YYYY-MM-DD` for the report's local day.
- `timezoneOffsetMinutes` (number, optional): Minutes offset from UTC for the report day.
  - Example: `-300` for UTC-5.
  - Default: `0` (UTC).
- `includeUnassigned` (boolean, optional): Include tasks with no assigned agents.
  - Default: `true`.

### Output

- `markdown`: The Telegram-ready report text.
- `sections`: Structured groups by status and agent (completed, inProgress, blocked,
  needsReview, decisions).
- `rangeStart`, `rangeEnd`: UTC epoch bounds of the report day.
- `displayDate`: `MMM D, YYYY` formatted label used in the header.

## Section Rules

- **Completed Today**: tasks with `status = "completed"` and `completedAt` within the
  report day.
- **In Progress**: tasks with `status = "active"` (current work).
- **Blocked**: tasks with `status = "blocked"` (includes `blockedReason` when present).
- **Needs Review Queue**: decisions with `outcome = "pending"`.
- **Key Decisions Made**: decisions with `outcome = "accepted"` or `"rejected"` and
  `decidedAt` within the report day.

## Example

```text
📊 DAILY STANDUP — Feb 1, 2026
✅ COMPLETED TODAY
• Agent A: Task X
🔄 IN PROGRESS
• Agent B: Task Y
🚫 BLOCKED
• Agent C: Waiting for approval
🧪 NEEDS REVIEW QUEUE
• Agent D: Validate rollout criteria
🧭 KEY DECISIONS MADE
• Agent E: Approve launch (accepted)
```

## Notes

- The report is deterministic: callers supply the date and optional timezone offset.
- If no items exist in a section, the report outputs `• None` under that heading.
