// Service borders (ADR-008). Reads service-map.json and the Prisma schema and
// builds the ESLint blocks that keep each service's files and tables private.
// How to work with them: docs/architecture/service-borders.md
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

export const serviceMap = JSON.parse(read("./service-map.json"));
const services = serviceMap.services;

/**
 * Every model in the schema with its relation fields.
 * @param {string} schemaText
 * @returns {Record<string, { name: string, target: string, holdsKey: boolean }[]>}
 */
export function parseModels(schemaText) {
  const blocks = [...schemaText.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)];
  const names = new Set(blocks.map(([, name]) => name));
  return Object.fromEntries(
    blocks.map(([, name, body]) => [
      name,
      body.split("\n").flatMap((line) => {
        const [field, type = ""] = line.trim().split(/\s+/);
        const target = type.replace(/[?[\]]/g, "");
        return names.has(target)
          ? [{ name: field, target, holdsKey: line.includes("fields: [") }]
          : [];
      }),
    ]),
  );
}

export const models = parseModels(read("./prisma/schema.prisma"));

export function ownerOf(model) {
  return Object.keys(services).find((name) =>
    services[name].tables.includes(model),
  );
}

const GUIDE = "See docs/architecture/service-borders.md.";
const QUERY_METHODS =
  "findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany|count|aggregate|groupBy";
const delegate = (model) => model[0].toLowerCase() + model.slice(1);
const others = (own) =>
  Object.entries(services).filter(([name]) => name !== own);

/** A service's folders may be imported only through index.ts or contracts.ts. */
function importPatterns(own) {
  return others(own).flatMap(([name, service]) =>
    service.code
      .filter((glob) => glob.endsWith("/**"))
      .map((glob) => {
        const alias = `@/${glob.slice("src/".length, -"/**".length)}`;
        return {
          group: [`${alias}/*`, `!${alias}/contracts`],
          message: `Import the ${name} service through "${alias}" (or "${alias}/contracts" in browser code), not its internal files. ${GUIDE}`,
        };
      }),
  );
}

/** Only the owning service may query a table. */
function tableSelectors(own) {
  return others(own)
    .filter(([, service]) => service.tables.length > 0)
    .map(([name, service]) => ({
      selector: `MemberExpression[property.name=/^(${QUERY_METHODS})$/][object.type="MemberExpression"][object.property.name=/^(${service.tables.map(delegate).join("|")})$/]`,
      message: `This table belongs to the ${name} service. Ask through its interface. ${GUIDE}`,
    }));
}

/** A service may not join into another service's tables through include or select. */
function joinSelectors(own) {
  const tables = new Set(services[own].tables);
  const outward = new Set();
  const inward = new Set();
  for (const model of tables) {
    for (const field of models[model] ?? []) {
      (tables.has(field.target) ? inward : outward).add(field.name);
    }
  }
  // shortcut: matches by field name, so a name used for both an inside and an
  // outside relation is not checked; upgrade to a type-aware rule if that bites.
  const names = [...outward].filter((name) => !inward.has(name));
  if (names.length === 0) return [];
  return [
    {
      selector: `Property[key.name=/^(include|select)$/] > ObjectExpression > Property[key.name=/^(${names.join("|")})$/]`,
      message: `This joins into another service's table. Ask that service through its interface. ${GUIDE}`,
    },
  ];
}

const block = (files, own) => ({
  files,
  ignores: ["**/*.test.ts", "**/*.test.tsx"],
  rules: {
    "no-restricted-imports": ["error", { patterns: importPatterns(own) }],
    "no-restricted-syntax": [
      "error",
      ...tableSelectors(own),
      ...(own ? joinSelectors(own) : []),
    ],
  },
});

/** Code outside every service first, then one block per service that lifts its own limits. */
export const serviceBorders = [
  block(["src/**/*.ts", "src/**/*.tsx"], null),
  ...Object.entries(services).map(([name, service]) =>
    block(service.code, name),
  ),
];
