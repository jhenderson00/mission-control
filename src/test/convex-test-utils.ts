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
};

class QueryBuilder {
  private items: Document[];

  constructor(items: Document[]) {
    this.items = items;
  }

  withIndex(_index: string, callback: (q: { eq: (field: string, value: unknown) => IndexFilter }) => IndexFilter) {
    const filter = callback({
      eq: (field, value) => ({ field, value }),
    });

    const filtered = filter?.field
      ? this.items.filter((item) => item[filter.field] === filter.value)
      : this.items;

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
