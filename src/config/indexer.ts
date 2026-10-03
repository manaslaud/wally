import { env } from "./env";

export const SUBGRAPH_ID = "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV";

export const GRAPH_URL = `https://gateway.thegraph.com/api/${env.SUBGRAPH_API_KEY}/subgraphs/id/${SUBGRAPH_ID}`;

export const TRAINING_DATASET = {
  maxSwaps: 15_000,
  minSwapsPerWallet: 5,
  maxSwapsPerWallet: 50,
  walletCandidates: 2_000,
  concurrency: 8,
} as const;

export const SKIPPED_ORIGINS = new Set(
  [
    "0x0000000000000000000000000000000000000000",
    "0xe592427a0aece92de3edee1f18e0157c05861564",
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
    "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
    "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b",
    "0x1111111254eeb25477b68fb85ed929f73a960582",
    "0x1111111254fb6c44bac0bed2854e3a8a1d4ff529",
    "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
  ].map((address) => address.toLowerCase()),
);
