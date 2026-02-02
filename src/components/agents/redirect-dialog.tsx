"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Code, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { priorityOptions, type Priority } from "@/components/agents/priority";

const modeCopy = {
  reference: {
    title: "Task reference",
    description: "Paste a task ID or a search string to locate it.",
  },
  payload: {
    title: "Inline payload",
    description: "Provide a JSON payload that defines the next task.",
  },
} as const;

type RedirectDialogProps = {
  agentId: string;
  agentName?: string;
  agentStatus?: string;
  currentTaskTitle?: string | null;
  disabled?: boolean;
  pending?: boolean;
  onConfirm: (payload: RedirectPayload) => Promise<void> | void;
};

type RedirectPayload = {
  taskId?: string;
  taskPayload?: unknown;
  priority?: Priority;
};

type Mode = "reference" | "payload";

const previewPlaceholder = "Provide a task reference or payload to preview the redirect.";

export function RedirectDialog({
  agentId,
  agentName,
  agentStatus,
  currentTaskTitle,
  disabled = false,
  pending = false,
  onConfirm,
}: RedirectDialogProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("reference");
  const [taskReference, setTaskReference] = useState("");
  const [taskPayloadText, setTaskPayloadText] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");

  const parsedPayload = useMemo(() => {
    const trimmed = taskPayloadText.trim();
    if (!trimmed) {
      return { value: undefined, error: null };
    }
    try {
      return { value: JSON.parse(trimmed) as unknown, error: null };
    } catch (error) {
      return {
        value: undefined,
        error: error instanceof Error ? error.message : "Invalid JSON payload.",
      };
    }
  }, [taskPayloadText]);

  const trimmedReference = taskReference.trim();
  const isReferenceMode = mode === "reference";
  const isPayloadMode = mode === "payload";
  const hasValidReference = Boolean(trimmedReference);
  const hasValidPayload =
    parsedPayload.error === null && typeof parsedPayload.value !== "undefined";
  const canConfirm = isReferenceMode ? hasValidReference : hasValidPayload;
  const isBlocked = disabled || pending;

  const previewValue = isReferenceMode
    ? trimmedReference
    : typeof parsedPayload.value !== "undefined"
      ? JSON.stringify(parsedPayload.value, null, 2)
      : "";

  const resetForm = () => {
    setMode("reference");
    setTaskReference("");
    setTaskPayloadText("");
    setPriority("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  };

  const handleConfirm = async (): Promise<void> => {
    if (!canConfirm) {
      return;
    }

    await onConfirm({
      taskId: isReferenceMode ? trimmedReference : undefined,
      taskPayload: isPayloadMode ? parsedPayload.value : undefined,
      priority: priority || undefined,
    });

    setOpen(false);
    resetForm();
  };

  const displayName = agentName?.trim() || agentId;
  const statusLabel = agentStatus?.trim();
  const taskTitle = currentTaskTitle?.trim() || "No active task assigned.";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={isBlocked}>
          <ArrowRight className="mr-2 h-4 w-4" />
          {pending ? "Redirecting..." : "Redirect"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Redirect agent</DialogTitle>
          <DialogDescription>
            Send {displayName} to a new task by reference or inline payload.
          </DialogDescription>
        </DialogHeader>

        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void handleConfirm();
          }}
        >
          <div className="grid gap-4">
            <div className="rounded-xl border border-border/60 bg-background/60 p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Current agent status
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {displayName}
                </Badge>
                {agentName && (
                  <Badge variant="secondary" className="text-[10px]">
                    {agentId}
                  </Badge>
                )}
                {statusLabel && (
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {statusLabel}
                  </Badge>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Current task: {taskTitle}
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/60 p-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={isReferenceMode ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setMode("reference")}
                  disabled={isBlocked}
                >
                  <Search className="h-4 w-4" />
                  Task reference
                </Button>
                <Button
                  type="button"
                  variant={isPayloadMode ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setMode("payload")}
                  disabled={isBlocked}
                >
                  <Code className="h-4 w-4" />
                  Payload JSON
                </Button>
              </div>

              <div className="mt-4">
                {isReferenceMode ? (
                  <FormItem>
                    <FormLabel htmlFor="task-reference">
                      {modeCopy.reference.title}
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="task-reference"
                        placeholder="Task ID or search"
                        value={taskReference}
                        onChange={(event) => setTaskReference(event.target.value)}
                        disabled={isBlocked}
                        autoFocus
                      />
                    </FormControl>
                    <FormDescription>
                      {modeCopy.reference.description}
                    </FormDescription>
                  </FormItem>
                ) : (
                  <FormItem>
                    <FormLabel htmlFor="task-payload">
                      {modeCopy.payload.title}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        id="task-payload"
                        placeholder='{"title": "Investigate alert spike", "priority": "high"}'
                        value={taskPayloadText}
                        onChange={(event) => setTaskPayloadText(event.target.value)}
                        disabled={isBlocked}
                        className="min-h-[160px] font-mono text-xs leading-relaxed"
                      />
                    </FormControl>
                    <FormDescription>
                      {modeCopy.payload.description}
                    </FormDescription>
                    {parsedPayload.error && (
                      <FormMessage>{parsedPayload.error}</FormMessage>
                    )}
                  </FormItem>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/60 p-4">
              <p className="text-xs font-medium text-foreground">Priority</p>
              <p className="text-xs text-muted-foreground">
                Optional override for the redirected task.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {priorityOptions.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={priority === option ? "secondary" : "outline"}
                    onClick={() => setPriority(option)}
                    disabled={isBlocked}
                  >
                    {option}
                  </Button>
                ))}
                {priority && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPriority("")}
                    disabled={isBlocked}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/60 p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Preview
              </p>
              {canConfirm ? (
                <div className="mt-3 grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {isReferenceMode ? "Task reference" : "Inline payload"}
                    </Badge>
                    {priority && (
                      <Badge variant="secondary" className="text-[10px]">
                        {priority} priority
                      </Badge>
                    )}
                  </div>
                  {isReferenceMode ? (
                    <p className="text-sm text-foreground break-all">
                      {previewValue}
                    </p>
                  ) : (
                    <pre className="max-h-40 overflow-auto rounded-lg border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
                      {previewValue}
                    </pre>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  {previewPlaceholder}
                </p>
              )}
            </div>
          </div>
        </Form>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={!canConfirm || isBlocked}>
            {pending ? "Redirecting..." : "Confirm redirect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { RedirectPayload };
