-- Un solo carrito abierto por sesión.
--
-- `draftSessionId` vale lo mismo que `sessionId` mientras la orden ES el
-- carrito de esa sesión, y pasa a NULL en el checkout. Como en PostgreSQL
-- los NULL no colisionan en un índice único, cualquier número de órdenes ya
-- cursadas conviven, pero dos carritos simultáneos de la misma sesión no.
--
-- Es la forma de expresar un índice único parcial que Prisma no sabe
-- declarar en el esquema.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "draftSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_draftSessionId_key" ON "orders"("draftSessionId");
