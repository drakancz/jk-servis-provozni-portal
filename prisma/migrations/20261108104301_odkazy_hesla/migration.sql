-- CreateTable
CREATE TABLE "odkazy_hesla" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odkazy_hesla_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "odkazy_hesla_tokenHash_key" ON "odkazy_hesla"("tokenHash");

-- CreateIndex
CREATE INDEX "odkazy_hesla_userId_idx" ON "odkazy_hesla"("userId");

-- AddForeignKey
ALTER TABLE "odkazy_hesla" ADD CONSTRAINT "odkazy_hesla_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
