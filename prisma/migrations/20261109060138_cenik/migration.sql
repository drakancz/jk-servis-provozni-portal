-- Krok 4A (9. 11. 2026): ceník práce a materiálu.
-- Hodinová sazba firmy začíná na 650 Kč bez DPH; dosavadní řádky práce
-- dostanou stejnou sazbu jako „cenu ve chvíli zápisu“. Dosavadní materiál
-- zůstane bez ceny (doplní ji Dispečer nebo Majitel).

-- AlterTable
ALTER TABLE "vykaz_material" ADD COLUMN     "priceItemId" TEXT,
ADD COLUMN     "unitPrice" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "vykaz_prace" ADD COLUMN     "hourlyRate" DECIMAL(10,2) NOT NULL DEFAULT 650;
ALTER TABLE "vykaz_prace" ALTER COLUMN "hourlyRate" DROP DEFAULT;

-- CreateTable
CREATE TABLE "nastaveni" (
    "id" TEXT NOT NULL,
    "hourlyRate" DECIMAL(10,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nastaveni_pkey" PRIMARY KEY ("id")
);

INSERT INTO "nastaveni" ("id", "hourlyRate", "updatedAt") VALUES ('firma', 650, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "cenik_material" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "search" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cenik_material_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cenik_material_deletedAt_idx" ON "cenik_material"("deletedAt");

-- AddForeignKey
ALTER TABLE "vykaz_material" ADD CONSTRAINT "vykaz_material_priceItemId_fkey" FOREIGN KEY ("priceItemId") REFERENCES "cenik_material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
