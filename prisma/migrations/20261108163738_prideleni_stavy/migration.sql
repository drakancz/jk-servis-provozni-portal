-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NOVA', 'PRIDELENA', 'V_PRACI', 'HOTOVA', 'VYFAKTUROVANA');

-- AlterTable
ALTER TABLE "zakazky" ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'NOVA',
ADD COLUMN     "technicianId" TEXT;

-- CreateIndex
CREATE INDEX "zakazky_technicianId_idx" ON "zakazky"("technicianId");

-- CreateIndex
CREATE INDEX "zakazky_status_idx" ON "zakazky"("status");

-- AddForeignKey
ALTER TABLE "zakazky" ADD CONSTRAINT "zakazky_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
