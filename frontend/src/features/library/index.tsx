import { LibraryGrid } from './LibraryGrid'

export default function LibraryPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Library</h1>
      <LibraryGrid />
    </div>
  )
}
