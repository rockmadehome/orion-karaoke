import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { api, type Song, type SongListResponse } from '../../api/client'
import { SongCard } from './SongCard'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useDebounce } from '../../hooks/useDebounce'

const PAGE_SIZE = 12

export function LibraryGrid() {
  const [data, setData] = useState<SongListResponse | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const debouncedQuery = useDebounce(query, 300)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.songs.list({ q: debouncedQuery || undefined, page, page_size: PAGE_SIZE })
      setData(res)
    } finally {
      setLoading(false)
    }
  }, [debouncedQuery, page])

  useEffect(() => {
    fetch()
  }, [fetch])

  useEffect(() => {
    setPage(1)
  }, [debouncedQuery])

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search songs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {[...Array(PAGE_SIZE)].map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      ) : data?.items && data.items.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {data.items.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                onDeleted={(id) =>
                  setData((prev) =>
                    prev
                      ? { ...prev, items: prev.items.filter((s) => s.id !== id), total: prev.total - 1 }
                      : prev
                  )
                }
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center py-20 text-muted-foreground">
          {debouncedQuery ? `No songs matching "${debouncedQuery}"` : 'No songs yet. Add a YouTube URL to get started.'}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="icon"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
