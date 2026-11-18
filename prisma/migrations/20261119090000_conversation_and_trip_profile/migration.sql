-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('AGENT', 'TRAVELLER');

-- CreateTable
CREATE TABLE "conversations" (
    "trip_id" TEXT NOT NULL,
    "skipped_facts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("trip_id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" SERIAL NOT NULL,
    "trip_id" TEXT NOT NULL,
    "author" "MessageAuthor" NOT NULL,
    "body" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_profiles" (
    "trip_id" TEXT NOT NULL,
    "taste" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_profiles_pkey" PRIMARY KEY ("trip_id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "month" VARCHAR(7) NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("month")
);

-- CreateIndex
CREATE INDEX "conversation_messages_trip_id_id_idx" ON "conversation_messages"("trip_id", "id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_profiles" ADD CONSTRAINT "trip_profiles_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

