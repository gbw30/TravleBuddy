-- AlterTable
ALTER TABLE "fixed_commitments" ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "located_address" VARCHAR(240),
ADD COLUMN     "located_ref" VARCHAR(80),
ADD COLUMN     "longitude" DECIMAL(10,7);

-- CreateTable
CREATE TABLE "address_lookups" (
    "key" VARCHAR(200) NOT NULL,
    "results" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "address_lookups_pkey" PRIMARY KEY ("key")
);

