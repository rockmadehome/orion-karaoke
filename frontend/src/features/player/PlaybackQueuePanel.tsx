import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../../api/client'
import { useStore, type PlaybackQueueEntry } from '../../store'
import { Button } from '../../components/ui/button'
import { toast } from 'sonner'
import { X, GripVertical, Music } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortableItem({ item }: { item: PlaybackQueueEntry }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.queue_item_id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  async function handleRemove() {
    try {
      await api.playback.remove(item.queue_item_id)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove item')
    }
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      layout
      className="flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-2"
    >
      <button
        className="text-muted-foreground cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Music className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm flex-1 truncate">{item.title ?? `Song #${item.position + 1}`}</span>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleRemove}>
        <X className="h-3 w-3" />
      </Button>
    </motion.div>
  )
}

export function PlaybackQueuePanel() {
  const queue = useStore((s) => s.playback.queue)
  const setPlayback = useStore((s) => s.setPlayback)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = queue.findIndex((i) => i.queue_item_id === active.id)
    const newIndex = queue.findIndex((i) => i.queue_item_id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = [...queue]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    const items = reordered.map((item, idx) => ({ id: item.queue_item_id, position: idx }))

    // Optimistic update
    setPlayback({ current_song: useStore.getState().playback.current_song, queue: reordered })

    try {
      await api.playback.reorder(items)
    } catch {
      // Server will broadcast corrected state via WS
    }
  }

  if (queue.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Queue is empty
      </p>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={queue.map((i) => i.queue_item_id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {queue.map((item) => (
              <SortableItem key={item.queue_item_id} item={item} />
            ))}
          </AnimatePresence>
        </div>
      </SortableContext>
    </DndContext>
  )
}

