import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { api, type Song } from '../../api/client'
import { useStore } from '../../store'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import {
  Card,
  CardContent,
  CardFooter,
} from '../../components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog'
import { PlusCircle, Music, Trash2 } from 'lucide-react'

interface Props {
  song: Song
  onDeleted?: (id: string) => void
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function SongCard({ song, onDeleted }: Props) {
  const setPlayback = useStore((s) => s.setPlayback)
  const [deleting, setDeleting] = useState(false)

  async function handleAddToQueue() {
    try {
      await api.playback.add(song.id)
      toast.success(`"${song.title}" added to playback queue`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add to queue')
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.songs.delete(song.id)
      toast.success(`"${song.title}" deleted`)
      onDeleted?.(song.id)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete song')
      setDeleting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      layout
    >
      <Card className="overflow-hidden flex flex-col">
        <div className="relative aspect-video bg-muted flex items-center justify-center">
          {song.thumbnail_path ? (
            <img
              src={api.storageUrl(song.thumbnail_path)}
              alt={song.title}
              className="object-cover w-full h-full"
            />
          ) : (
            <Music className="h-10 w-10 text-muted-foreground" />
          )}
          {song.duration_seconds && (
            <span className="absolute bottom-1 right-1 text-xs bg-black/70 text-white px-1 rounded">
              {formatDuration(song.duration_seconds)}
            </span>
          )}
        </div>
        <CardContent className="pt-3 pb-2 flex-1">
          <p className="text-sm font-medium line-clamp-2">{song.title}</p>
          {song.artist && (
            <p className="text-xs text-muted-foreground mt-0.5">{song.artist}</p>
          )}
          {song.language && (
            <Badge variant="secondary" className="mt-2 text-xs uppercase">
              {song.language}
            </Badge>
          )}
        </CardContent>
        <CardFooter className="pt-0 pb-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2"
            onClick={handleAddToQueue}
          >
            <PlusCircle className="h-4 w-4" />
            Add to Queue
          </Button>
          <AlertDialog>
            <AlertDialogTrigger>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={deleting}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete song?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{song.title}</strong> and its video file. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDelete}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    </motion.div>
  )
}
