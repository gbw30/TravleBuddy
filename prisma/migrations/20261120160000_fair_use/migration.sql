-- CreateTable
CREATE TABLE "fair_use_counts" (
    "key" VARCHAR(100) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fair_use_counts_pkey" PRIMARY KEY ("key","ends_at")
);

-- CreateIndex
CREATE INDEX "fair_use_counts_ends_at_idx" ON "fair_use_counts"("ends_at");

