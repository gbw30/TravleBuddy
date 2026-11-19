-- AlterTable
ALTER TABLE "places" ADD COLUMN     "fetched_at" TIMESTAMP(3),
ADD COLUMN     "last_edited_at" TIMESTAMP(3),
ADD COLUMN     "osm_tags" JSONB;
