/** Structural JSON type, so service-layer signatures never need Prisma's types. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
