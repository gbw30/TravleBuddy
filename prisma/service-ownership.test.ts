import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { models, ownerOf, serviceMap } from "../eslint.borders.mjs";

// ADR-008 rule 6: every table has exactly one owning service. The import and
// query halves of the border are checked by ESLint (eslint.borders.mjs).

const services: Record<string, { code: string[]; tables: string[] }> =
  serviceMap.services;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("service ownership map", () => {
  it("gives every table exactly one owner", () => {
    const owned = Object.values(services).flatMap((service) => service.tables);
    expect([...owned].sort()).toEqual(Object.keys(models).sort());
    expect(new Set(owned).size).toBe(owned.length);
  });

  it("lists every foreign key that crosses a border", () => {
    const crossing = Object.entries(models)
      .flatMap(([model, fields]) =>
        fields
          .filter(
            (field) =>
              field.holdsKey && ownerOf(field.target) !== ownerOf(model),
          )
          .map(
            (field) =>
              `${model}.${field.name} -> ${field.target} (${ownerOf(model)} -> ${ownerOf(field.target)})`,
          ),
      )
      .sort();
    // A new entry is a new cost of moving a service out: add it to
    // service-map.json on purpose, or keep the key inside one service.
    expect(serviceMap.crossBorderForeignKeys).toEqual(crossing);
  });

  it("has no relative import that leaves a service folder", () => {
    const folders = Object.values(services)
      .flatMap((service) => service.code)
      .filter((glob) => glob.endsWith("/**"))
      .map((glob) => resolve(glob.slice(0, -"/**".length)));
    const escapes = folders.flatMap((folder) =>
      sourceFiles(folder).flatMap((file) =>
        [
          ...readFileSync(file, "utf8").matchAll(/from\s+"(\.\.?\/[^"]+)"/g),
        ].flatMap(([, specifier]) =>
          relative(folder, resolve(dirname(file), specifier)).startsWith("..")
            ? [`${relative(process.cwd(), file)} -> ${specifier}`]
            : [],
        ),
      ),
    );
    expect(escapes).toEqual([]);
  });
});
