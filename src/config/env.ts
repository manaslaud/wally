export const env = {
  SUBGRAPH_API_KEY: process.env.SUBGRAPH_API_KEY,
} as const;

if (!env.SUBGRAPH_API_KEY) {
  throw new Error("Missing SUBGRAPH_API_KEY in .env");
}
