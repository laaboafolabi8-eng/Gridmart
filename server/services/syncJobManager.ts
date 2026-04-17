export interface SyncJob {
  id: string;
  status: 'pending' | 'running' | 'complete' | 'error' | 'cancelled';
  current: number;
  total: number;
  currentRow?: number;
  currentName?: string;
  errors: string[];
  imported: number;
  cancelled: boolean;
  createdAt: number;
  completedAt?: number;
  lastSyncLog?: string;
}

const jobs = new Map<string, SyncJob>();
const JOB_TTL = 10 * 60 * 1000; // 10 minutes

function cleanupOldJobs() {
  const now = Date.now();
  const entries = Array.from(jobs.entries());
  for (const [id, job] of entries) {
    if (now - job.createdAt > JOB_TTL) {
      jobs.delete(id);
    }
  }
}

export function createJob(): string {
  cleanupOldJobs();
  const id = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  jobs.set(id, {
    id,
    status: 'pending',
    current: 0,
    total: 0,
    errors: [],
    imported: 0,
    cancelled: false,
    createdAt: Date.now(),
  });
  return id;
}

export function getJob(id: string): SyncJob | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, updates: Partial<SyncJob>): void {
  const job = jobs.get(id);
  if (job) {
    Object.assign(job, updates);
  }
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (job && job.status === 'running') {
    job.cancelled = true;
    job.status = 'cancelled';
    return true;
  }
  return false;
}

export function deleteJob(id: string): void {
  jobs.delete(id);
}
