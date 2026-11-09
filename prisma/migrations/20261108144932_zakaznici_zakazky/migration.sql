-- CreateTable
CREATE TABLE "zakaznici" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ico" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "note" TEXT,
    "search" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zakaznici_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zakazky" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" DATE,
    "search" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zakazky_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historie" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zakaznici_deletedAt_idx" ON "zakaznici"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "zakazky_number_key" ON "zakazky"("number");

-- CreateIndex
CREATE INDEX "zakazky_customerId_idx" ON "zakazky"("customerId");

-- CreateIndex
CREATE INDEX "zakazky_deletedAt_idx" ON "zakazky"("deletedAt");

-- CreateIndex
CREATE INDEX "historie_entity_entityId_idx" ON "historie"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "zakazky" ADD CONSTRAINT "zakazky_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "zakaznici"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historie" ADD CONSTRAINT "historie_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
