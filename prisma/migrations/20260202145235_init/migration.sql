-- CreateTable
CREATE TABLE "whatsapp_sessions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sprint_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_job_runs" (
    "id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "executed_at" TIMESTAMP(3),
    "skipped_reason" TEXT,
    "message_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_state" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "last_heartbeat" TIMESTAMP(3) NOT NULL,
    "scheduler_started" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_sessions_session_id_key" ON "whatsapp_sessions"("session_id");

-- CreateIndex
CREATE INDEX "goals_user_id_idx" ON "goals"("user_id");

-- CreateIndex
CREATE INDEX "goals_status_idx" ON "goals"("status");

-- CreateIndex
CREATE INDEX "goals_sprint_number_idx" ON "goals"("sprint_number");

-- CreateIndex
CREATE INDEX "scheduled_job_runs_job_type_scheduled_for_idx" ON "scheduled_job_runs"("job_type", "scheduled_for");

-- CreateIndex
CREATE INDEX "scheduled_job_runs_job_type_status_idx" ON "scheduled_job_runs"("job_type", "status");
