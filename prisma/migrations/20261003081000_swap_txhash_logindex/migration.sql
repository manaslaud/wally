-- AlterTable
ALTER TABLE "Swap" ADD COLUMN "logIndex" BIGINT;

UPDATE "Swap"
SET "logIndex" = split_part(id, '#', 2)::bigint
WHERE "logIndex" IS NULL;

ALTER TABLE "Swap" ALTER COLUMN "logIndex" SET NOT NULL;

-- DropIndex
DROP INDEX "Swap_txHash_idx";

-- AlterTable
ALTER TABLE "Swap" DROP CONSTRAINT "Swap_pkey";

-- CreateIndex
CREATE INDEX "Swap_id_idx" ON "Swap"("id");

-- CreateIndex
ALTER TABLE "Swap" ADD CONSTRAINT "Swap_pkey" PRIMARY KEY ("txHash", "logIndex");
