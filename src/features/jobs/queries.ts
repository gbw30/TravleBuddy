import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { JsonValue } from "./contracts";

const jobPublicSelect = {
  id: true,
  type: true,
  status: true,
  progress: true,
  progressMessage: true,
  attemptCount: true,
  maxAttempts: true,
  availableAt: true,
  completedAt: true,
  errorCode: true,
  result: true,
  createdAt: true,
  updatedAt: true,
  events: {
    select: {
      id: true,
      type: true,
      progress: true,
      message: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  },
} satisfies Prisma.GenerationJobSelect;

type PublicJobRecord = Prisma.GenerationJobGetPayload<{
  select: typeof jobPublicSelect;
}>;

export type GenerationJobDto = ReturnType<typeof toGenerationJobDto>;

export function toGenerationJobDto(job: PublicJobRecord) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: Math.max(0, Math.min(100, job.progress)),
    progressMessage: job.progressMessage,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    availableAt: job.availableAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    errorCode: job.errorCode,
    result: (job.result as JsonValue | null) ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    events: [...job.events].reverse().map((event) => ({
      id: event.id,
      type: event.type,
      progress: event.progress,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export async function getGenerationJobForTrip(
  userId: string,
  tripId: string,
  jobId: string,
) {
  const job = await db.generationJob.findFirst({
    where: {
      id: jobId,
      tripId,
      trip: {
        userId,
      },
    },
    select: jobPublicSelect,
  });

  return job ? toGenerationJobDto(job) : null;
}

export async function getActiveGenerationJobsForTrip(
  userId: string,
  tripId: string,
  limit = 10,
) {
  const boundedLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
  const jobs = await db.generationJob.findMany({
    where: {
      tripId,
      status: {
        in: ["PENDING", "RUNNING", "RETRYING"],
      },
      trip: {
        userId,
      },
    },
    select: jobPublicSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: boundedLimit,
  });

  return jobs.map(toGenerationJobDto);
}
