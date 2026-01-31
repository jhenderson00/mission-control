import { vi } from "vitest";

type TableName = "agents" | "tasks" | "events" | "decisions";

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
        return items.filter((item) => item[filter.field] === filter.value);
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
