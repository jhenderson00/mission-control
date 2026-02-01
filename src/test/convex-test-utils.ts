import { vi } from "vitest";

/**
 * Helper type for Convex functions with internal _handler property.
 * Used for testing Convex functions directly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConvexFunctionWithHandler<TArgs = any, TResult = any> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _handler: (ctx: any, args: TArgs) => TResult;
};

/**
 * Helper type for HTTP actions that can be called directly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HttpActionHandler = (ctx: any, request: Request) => Promise<Response>;

/**
 * Cast a Convex function to access its _handler for testing.
 * This is a type-safe way to access internal Convex function handlers.
 * 
 * @example
 * const result = await asHandler(myQuery)._handler(ctx, { id: "123" });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asHandler<TArgs = any, TResult = any>(
  fn: unknown
): ConvexFunctionWithHandler<TArgs, TResult> {
  return fn as ConvexFunctionWithHandler<TArgs, TResult>;
}

/**
 * Cast an HTTP action to be callable for testing.
 * 
 * @example
 * const response = await asHttpAction(myHttpAction)(ctx, request);
 */
export function asHttpAction(fn: unknown): HttpActionHandler {
  return fn as HttpActionHandler;
}

type TableName =
  | "agents"
  | "tasks"
  | "events"
  | "decisions"
  | "taskSubscriptions"
  | "taskComments"
  | "agentStatus"
  | "agentWorkingMemory"
  | "messages"
  | "agentControlOperations"
  | "agentControlAudits";

type Document = {
  _id: string;
  _creationTime: number;
  [key: string]: unknown;
};

type IndexFilter = {
  field: string;
  value: unknown;
  op: "eq" | "gte";
};

type IndexQuery = {
  eq: (field: string, value: unknown) => IndexQuery;
  gte: (field: string, value: unknown) => IndexQuery;
};

type Expression<T> = (doc: Document) => T;

type FilterBuilder = {
  eq: <T>(l: Expression<T> | T, r: Expression<T> | T) => Expression<boolean>;
  neq: <T>(l: Expression<T> | T, r: Expression<T> | T) => Expression<boolean>;
  lt: <T>(l: Expression<T> | T, r: Expression<T> | T) => Expression<boolean>;
  lte: <T>(l: Expression<T> | T, r: Expression<T> | T) => Expression<boolean>;
  gt: <T>(l: Expression<T> | T, r: Expression<T> | T) => Expression<boolean>;
  gte: <T>(l: Expression<T> | T, r: Expression<T> | T) => Expression<boolean>;
  and: (...exprs: Array<Expression<boolean> | boolean>) => Expression<boolean>;
  or: (...exprs: Array<Expression<boolean> | boolean>) => Expression<boolean>;
  not: (expr: Expression<boolean> | boolean) => Expression<boolean>;
  field: (fieldPath: string) => Expression<unknown>;
};

function asExpression<T>(value: Expression<T> | T): Expression<T> {
  if (typeof value === "function") {
    return value as Expression<T>;
  }
  return () => value as T;
}

function getFieldValue(doc: Document, fieldPath: string): unknown {
  return fieldPath.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in (value as Record<string, unknown>)) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, doc);
}

function isEqualValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => isEqualValue(value, right[index]));
  }

  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const leftKeys = Object.keys(left as Record<string, unknown>);
    const rightKeys = Object.keys(right as Record<string, unknown>);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) =>
      isEqualValue(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key]
      )
    );
  }

  return left === right;
}

const filterBuilder: FilterBuilder = {
  eq: (l, r) => (doc) =>
    isEqualValue(asExpression(l)(doc), asExpression(r)(doc)),
  neq: (l, r) => (doc) =>
    !isEqualValue(asExpression(l)(doc), asExpression(r)(doc)),
  lt: (l, r) => (doc) => (asExpression(l)(doc) as never) < (asExpression(r)(doc) as never),
  lte: (l, r) => (doc) => (asExpression(l)(doc) as never) <= (asExpression(r)(doc) as never),
  gt: (l, r) => (doc) => (asExpression(l)(doc) as never) > (asExpression(r)(doc) as never),
  gte: (l, r) => (doc) => (asExpression(l)(doc) as never) >= (asExpression(r)(doc) as never),
  and: (...exprs) => (doc) => exprs.every((expr) => asExpression(expr)(doc)),
  or: (...exprs) => (doc) => exprs.some((expr) => asExpression(expr)(doc)),
  not: (expr) => (doc) => !asExpression(expr)(doc),
  field: (fieldPath) => (doc) => getFieldValue(doc, fieldPath),
};

class QueryBuilder {
  private items: Document[];

  constructor(items: Document[]) {
    this.items = items;
  }

  withIndex(_index: string, callback: (q: IndexQuery) => unknown) {
    const filters: IndexFilter[] = [];
    const query: IndexQuery = {
      eq: (field: string, value: unknown) => {
        filters.push({ field, value, op: "eq" });
        return query;
      },
      gte: (field: string, value: unknown) => {
        filters.push({ field, value, op: "gte" });
        return query;
      },
    };

    callback(query);

    const filtered = filters.reduce((items, filter) => {
      if (filter.op === "eq") {
        return items.filter((item) => isEqualValue(item[filter.field], filter.value));
      }

      return items.filter((item) => {
        const fieldValue = item[filter.field];
        if (fieldValue === undefined || fieldValue === null) {
          return false;
        }
        if (typeof fieldValue === "number" && typeof filter.value === "number") {
          return fieldValue >= filter.value;
        }
        if (typeof fieldValue === "string" && typeof filter.value === "string") {
          return fieldValue >= filter.value;
        }
        return false;
      });
    }, this.items);

    return new QueryBuilder(filtered);
  }

  filter(predicate: (q: FilterBuilder) => Expression<boolean> | boolean) {
    const expr = predicate(filterBuilder);
    const evaluator = asExpression(expr);
    return new QueryBuilder(this.items.filter((item) => evaluator(item)));
  }

  order(direction: "asc" | "desc") {
    const sorted = [...this.items].sort((a, b) => {
      if (direction === "asc") return a._creationTime - b._creationTime;
      return b._creationTime - a._creationTime;
    });

    return new QueryBuilder(sorted);
  }

  async collect() {
    return [...this.items];
  }

  async take(count: number) {
    return [...this.items].slice(0, count);
  }
}

class InMemoryDB {
  private tables: Record<TableName, Document[]> = {
    agents: [],
    tasks: [],
    events: [],
    decisions: [],
    taskSubscriptions: [],
    taskComments: [],
    agentStatus: [],
    agentWorkingMemory: [],
    messages: [],
    agentControlOperations: [],
    agentControlAudits: [],
  };

  query(table: TableName) {
    return new QueryBuilder(this.tables[table]);
  }

  async insert(table: TableName, value: Record<string, unknown>) {
    const id = `${table}_${this.tables[table].length + 1}`;
    const doc: Document = {
      _id: id,
      _creationTime: Date.now(),
      ...value,
    };
    this.tables[table].push(doc);
    return id;
  }

  async get(id: string) {
    for (const table of Object.keys(this.tables) as TableName[]) {
      const match = this.tables[table].find((item) => item._id === id);
      if (match) return match;
    }
    return null;
  }

  async patch(id: string, updates: Record<string, unknown>) {
    for (const table of Object.keys(this.tables) as TableName[]) {
      const index = this.tables[table].findIndex((item) => item._id === id);
      if (index !== -1) {
        this.tables[table][index] = {
          ...this.tables[table][index],
          ...updates,
        };
        return;
      }
    }
  }

  async delete(id: string) {
    for (const table of Object.keys(this.tables) as TableName[]) {
      this.tables[table] = this.tables[table].filter((item) => item._id !== id);
    }
  }

  seed(table: TableName, docs: Array<Record<string, unknown>>) {
    docs.forEach((doc) => {
      this.tables[table].push({
        _id: `${table}_${this.tables[table].length + 1}`,
        _creationTime: Date.now(),
        ...doc,
      });
    });
  }
}

export function createMockCtx() {
  const db = new InMemoryDB();
  return {
    db,
    scheduler: {
      runAfter: vi.fn(),
    },
    auth: {
      getUserIdentity: vi.fn(),
    },
  } as const;
}

export type MockCtx = ReturnType<typeof createMockCtx>;
