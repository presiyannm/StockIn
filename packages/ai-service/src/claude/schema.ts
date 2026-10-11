export type Schema = Record<string, any>;

/** Structured outputs want closed objects and anyOf instead of ["x","null"]. */
export function strictSchema(node: Schema): Schema {
  if (Array.isArray(node)) return node.map(strictSchema) as unknown as Schema;
  if (node === null || typeof node !== "object") return node;
  const out: Schema = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = k === "properties"
      ? Object.fromEntries(Object.entries(v as Schema).map(([n, p]) => [n, strictSchema(p)]))
      : strictSchema(v);
  }
  if (Array.isArray(out.type) && out.type.includes("null")) {
    const { type, ...rest } = out;
    const base = type.filter((t: string) => t !== "null");
    return { ...rest, anyOf: [{ type: base.length === 1 ? base[0] : base }, { type: "null" }] };
  }
  if (out.type === "object") out.additionalProperties = false;
  return out;
}
