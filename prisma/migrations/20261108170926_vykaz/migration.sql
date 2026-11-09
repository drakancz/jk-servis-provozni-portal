-- CreateTable
CREATE TABLE "vykaz_prace" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vykaz_prace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vykaz_material" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vykaz_material_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vykaz_prace_orderId_idx" ON "vykaz_prace"("orderId");

-- CreateIndex
CREATE INDEX "vykaz_material_orderId_idx" ON "vykaz_material"("orderId");

-- AddForeignKey
ALTER TABLE "vykaz_prace" ADD CONSTRAINT "vykaz_prace_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "zakazky"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vykaz_prace" ADD CONSTRAINT "vykaz_prace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vykaz_material" ADD CONSTRAINT "vykaz_material_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "zakazky"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vykaz_material" ADD CONSTRAINT "vykaz_material_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
