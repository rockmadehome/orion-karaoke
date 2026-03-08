import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { api, type Job } from '../../api/client'
import { useStore } from '../../store'
import { Badge } from '../../components/ui/badge'
import { Progress } from '../../components/ui/progress'
import { Button } from '../../components/ui/button'
import { X } from 'lucide-react'

const STAGE_LABELS: Record<string, string> = {
  downloading: 'Downloading',
  separating: 'Separating vocals',
  transcribing: 'Transcribing',
  rendering: 'Rendering video',
  finalizing: 'Finalizing',
}

const STATUS_VARIANTS = {
  pending: 'secondary',
  processing: 'default',
  completed: 'outline',
  failed: 'destructive',
} as const

function statusLabel(job: Job): string {
  if (job.status === 'processing' && job.stage) {
    return STAGE_LABELS[job.stage] ?? job.stage
  }
  return job.status.charAt(0).toUpperCase() + job.status.slice(1)
}

interface Props {
  job: Job
}

export function JobCard({ job }: Props) {
  const upsertJob = useStore((s) => s.upsertJob)
  const removeJob = useStore((s) => s.removeJob)

  async function handleCancel() {
    try {
      await api.jobs.cancel(job.id)
      removeJob(job.id)
      toast.info('Job cancelled')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel job')
    }
  }

  const shortUrl = job.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">{shortUrl}</p>
          <Badge variant={STATUS_VARIANTS[job.status]}>{statusLabel(job)}</Badge>
        </div>
        {(job.status === 'pending' || job.status === 'processing') && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleCancel}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {job.status === 'processing' && (
        <Progress value={job.progress} className="h-1.5" />
      )}

      {job.status === 'failed' && job.error_message && (
        <p className="text-xs text-destructive">{job.error_message}</p>
      )}
    </motion.div>
  )
}
