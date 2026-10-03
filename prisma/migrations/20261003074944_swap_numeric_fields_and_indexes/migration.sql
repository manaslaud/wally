/*
  Warnings:

  - You are about to drop the column `transactionId` on the `Swap` table. All the data in the column will be lost.
  - Added the required column `txHash` to the `Swap` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `timestamp` on the `Swap` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `blockNumber` on the `Swap` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Swap" DROP COLUMN "transactionId",
ADD COLUMN     "txHash" TEXT NOT NULL,
DROP COLUMN "timestamp",
ADD COLUMN     "timestamp" BIGINT NOT NULL,
DROP COLUMN "blockNumber",
ADD COLUMN     "blockNumber" BIGINT NOT NULL;

-- CreateIndex
CREATE INDEX "Swap_timestamp_idx" ON "Swap"("timestamp");

-- CreateIndex
CREATE INDEX "Swap_txHash_idx" ON "Swap"("txHash");

-- CreateIndex
CREATE INDEX "Swap_poolId_idx" ON "Swap"("poolId");

-- CreateIndex
CREATE INDEX "Swap_token0Id_idx" ON "Swap"("token0Id");

-- CreateIndex
CREATE INDEX "Swap_token1Id_idx" ON "Swap"("token1Id");
