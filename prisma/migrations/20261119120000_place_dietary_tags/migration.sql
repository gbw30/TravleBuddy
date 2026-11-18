-- AlterTable
ALTER TABLE "places" ADD COLUMN     "serves" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "serves_not" TEXT[] DEFAULT ARRAY[]::TEXT[];

