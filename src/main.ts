import { UniswapV3Indexer } from "./indexer/uniswap-v3";

async function main() {
  const indexer = new UniswapV3Indexer({
    walletCount: 5,
    concurrency: 5,
  });

  const data = await indexer.index();

  console.log(`Indexed ${data.length} wallets`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
