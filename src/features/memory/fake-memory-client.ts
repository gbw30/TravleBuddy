// A stand-in for the Memory service's tables, for tests. It keeps rows in
// memory and honours the `where` it is given, so a query that forgets to
// name the traveller shows up as a failing test.

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, wanted]) => {
    if (wanted && typeof wanted === "object" && "in" in wanted) {
      return (wanted as { in: unknown[] }).in.includes(row[key]);
    }
    return row[key] === wanted;
  });
}

function table(rows: Row[], uniqueName?: string) {
  let serial = 0;
  const add = (data: Row) => {
    serial += 1;
    const row: Row = {
      id: `${uniqueName ?? "row"}-${serial}`,
      createdAt: new Date(Date.UTC(2027, 0, 1, 0, 0, serial)),
      ...data,
    };
    rows.push(row);
    return row;
  };
  const unique = (where: Where) =>
    uniqueName && where[uniqueName] ? (where[uniqueName] as Where) : where;
  return {
    findMany: async (args: { where?: Where; take?: number; orderBy?: Row }) => {
      const found = rows.filter((row) => matches(row, args?.where));
      const newestFirst =
        args?.orderBy && Object.values(args.orderBy)[0] === "desc";
      return (newestFirst ? [...found].reverse() : found).slice(0, args?.take);
    },
    findFirst: async (args: { where: Where }) =>
      rows.find((row) => matches(row, args.where)) ?? null,
    findUnique: async (args: { where: Where }) =>
      rows.find((row) => matches(row, unique(args.where))) ?? null,
    create: async (args: { data: Row }) => add(args.data),
    createMany: async (args: { data: Row[] }) => {
      args.data.forEach(add);
    },
    deleteMany: async (args: { where: Where }) => {
      const kept = rows.filter((row) => !matches(row, args.where));
      rows.splice(0, rows.length, ...kept);
    },
    update: async (args: { where: Where; data: Row }) => {
      const row = rows.find((item) => matches(item, unique(args.where)));
      if (row) Object.assign(row, args.data);
      return row;
    },
    upsert: async (args: { where: Where; create: Row; update: Row }) => {
      const row = rows.find((item) => matches(item, unique(args.where)));
      if (!row) return add(args.create);
      for (const [key, value] of Object.entries(args.update)) {
        row[key] =
          value && typeof value === "object" && "increment" in value
            ? (row[key] as number) + (value as { increment: number }).increment
            : value;
      }
      return row;
    },
  };
}

export function fakeMemoryClient() {
  const rows = {
    profiles: [] as Row[],
    entries: [] as Row[],
    notes: [] as Row[],
    history: [] as Row[],
    forgotten: [] as Row[],
    tripProfiles: [] as Row[],
  };
  const client = {
    profile: table(rows.profiles),
    profileEntry: table(rows.entries, "userId_topic_value"),
    profileNote: table(rows.notes),
    profileHistory: table(rows.history),
    forgottenEvidence: table(rows.forgotten, "userId_topic_value"),
    tripProfile: table(rows.tripProfiles),
  };
  return { client: client as never, rows };
}
