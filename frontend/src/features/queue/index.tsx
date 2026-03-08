import { SubmitForm } from './SubmitForm'
import { JobsList } from './JobsList'

export default function QueuePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Add a Song</h1>
        <p className="text-muted-foreground text-sm">
          Paste a YouTube URL — we'll download, separate, transcribe, and render it.
        </p>
      </div>
      <SubmitForm />
      <JobsList />
    </div>
  )
}
