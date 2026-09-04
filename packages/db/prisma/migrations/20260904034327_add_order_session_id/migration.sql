-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "sessionId" TEXT;

-- CreateIndex
CREATE INDEX "orders_sessionId_status_idx" ON "orders"("sessionId", "status");
