import type { Prisma } from "../../generated/prisma/client";
import type { WalletData } from "../types/indexer/uniswap-v3";
import { prisma } from "./client";
import { insertManyWithRetry } from "./insert";

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function uniqueByTxHashLogIndex<T extends { txHash: string; logIndex: bigint }>(
  items: T[],
): T[] {
  return [
    ...new Map(
      items.map((item) => [`${item.txHash}:${item.logIndex}`, item]),
    ).values(),
  ];
}

function parseLogIndex(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`Invalid logIndex: ${value}`);
  }
}

function parseDecimals(value: string): number {
  const decimals = Number.parseInt(value, 10);

  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Invalid token decimals: ${value}`);
  }

  return decimals;
}

export async function persistWalletData(data: WalletData): Promise<void> {
  const walletAddress = data.wallet.toLowerCase();

  await prisma.wallet.upsert({
    where: { address: walletAddress },
    create: { address: walletAddress },
    update: {},
  });

  if (data.swaps.length === 0) {
    return;
  }

  const tokens: Prisma.TokenCreateManyInput[] = uniqueById(
    data.swaps.flatMap((swap) => [
      {
        id: swap.token0.id.toLowerCase(),
        symbol: swap.token0.symbol,
        name: swap.token0.name,
        decimals: parseDecimals(swap.token0.decimals),
      },
      {
        id: swap.token1.id.toLowerCase(),
        symbol: swap.token1.symbol,
        name: swap.token1.name,
        decimals: parseDecimals(swap.token1.decimals),
      },
    ]),
  );

  const pools: Prisma.PoolCreateManyInput[] = uniqueById(
    data.swaps.map((swap) => ({
      id: swap.pool.id.toLowerCase(),
      feeTier: swap.pool.feeTier,
    })),
  );

  const swaps: Prisma.SwapCreateManyInput[] = uniqueByTxHashLogIndex(
    data.swaps.map((swap) => ({
      id: swap.id,
      timestamp: BigInt(swap.timestamp),
      blockNumber: BigInt(swap.transaction.blockNumber),
      logIndex: parseLogIndex(swap.logIndex),
      sender: swap.sender.toLowerCase(),
      recipient: swap.recipient.toLowerCase(),
      amount0: swap.amount0,
      amount1: swap.amount1,
      amountUSD: swap.amountUSD,
      txHash: swap.transaction.id.toLowerCase(),
      walletAddress,
      token0Id: swap.token0.id.toLowerCase(),
      token1Id: swap.token1.id.toLowerCase(),
      poolId: swap.pool.id.toLowerCase(),
    })),
  );

  await insertManyWithRetry(tokens, (chunk) =>
    prisma.token.createMany({
      data: chunk,
      skipDuplicates: true,
    }),
  );

  await insertManyWithRetry(pools, (chunk) =>
    prisma.pool.createMany({
      data: chunk,
      skipDuplicates: true,
    }),
  );

  await insertManyWithRetry(swaps, (chunk) =>
    prisma.swap.createMany({
      data: chunk,
      skipDuplicates: true,
    }),
  );
}
