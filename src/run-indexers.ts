import { TRAINING_DATASET } from "./config/indexer";
import { prisma } from "./db/client";
import { UniswapV3Indexer } from "./indexer/uniswap-v3";

async function main() {
  const indexer = new UniswapV3Indexer(TRAINING_DATASET);

  const data = await indexer.index();
  const swapCount = data.reduce(
    (total, wallet) => total + wallet.swaps.length,
    0,
  );

  console.log(
    `Indexed ${data.length} wallets / ${swapCount} swaps for training`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
