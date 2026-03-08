import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../api/client'
import { useStore } from '../../store'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Loader2 } from 'lucide-react'

const YT_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{11}/

export function SubmitForm() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const upsertJob = useStore((s) => s.upsertJob)
  const jobs = useStore((s) => s.jobs)

  const isDuplicate = jobs.some(
    (j) => j.url === url.trim() && j.status !== 'failed',
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!YT_REGEX.test(trimmed)) {
      toast.error('Please enter a valid YouTube URL')
      return
    }
    setLoading(true)
    try {
      const job = await api.jobs.submit(trimmed)
      upsertJob(job)
      setUrl('')
      toast.success('Song added to processing queue')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit job')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          placeholder="https://youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !url.trim()}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Add Song
        </Button>
      </div>
      {isDuplicate && (
        <p className="text-xs text-amber-400">
          This URL is already in the queue
        </p>
      )}
    </form>
  )
}
