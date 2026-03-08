import { useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { api } from '../../api/client'
import { useStore } from '../../store'
import { JobCard } from './JobCard'
import { Skeleton } from '../../components/ui/skeleton'

export function JobsList() {
  const jobs = useStore((s) => s.jobs)
  const upsertJob = useStore((s) => s.upsertJob)

  useEffect(() => {
    api.jobs.list().then((list) => list.forEach(upsertJob)).catch(() => {
      toast.error('Failed to load jobs')
    })
  }, [])

  const active = jobs.filter((j) => j.status === 'processing' || j.status === 'pending')
  const recent = jobs.filter((j) => j.status === 'completed' || j.status === 'failed')

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {active.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Processing
          </h2>
          <AnimatePresence mode="popLayout">
            {active.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </AnimatePresence>
        </section>
      )}

      {recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Recent
          </h2>
          <AnimatePresence mode="popLayout">
            {recent.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </AnimatePresence>
        </section>
      )}
    </div>
  )
}
