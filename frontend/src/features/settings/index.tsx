import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, AppSettings } from '../../api/client'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Select } from '../../components/ui/select'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export default function SettingsPage() {
  const [form, setForm] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.settings.get().then((s) => {
      setForm(s)
      setLoading(false)
    }).catch(() => {
      toast.error('Failed to load settings')
      setLoading(false)
    })
  }, [])

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function handleSave() {
    if (!form) return
    setSaving(true)
    try {
      const updated = await api.settings.update(form)
      setForm(updated)
      toast.success('Settings saved — takes effect on the next processed song')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading settings…
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Changes take effect on the next song processed. They are <strong>not</strong> persisted across restarts — set values in <code>.env</code> for permanent changes.
        </p>
      </div>

      {/* AI Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Separator model" hint="audio_separator = MDX-Net ONNX (recommended CPU). passthrough = skip separation (faster, worse karaoke).">
            <Select value={form.separator_model} onChange={(e) => set('separator_model', e.target.value)}>
              <option value="audio_separator">audio_separator (MDX-Net ONNX)</option>
              <option value="spleeter">spleeter</option>
              <option value="passthrough">passthrough (no separation)</option>
            </Select>
          </Field>

          <Field label="Transcriber backend">
            <Select value={form.transcriber_backend} onChange={(e) => set('transcriber_backend', e.target.value)}>
              <option value="faster_whisper">faster_whisper (recommended)</option>
              <option value="whisper_cpp">whisper_cpp</option>
            </Select>
          </Field>

          <Field label="Whisper model size" hint="Larger = more accurate but slower. 'small' is a good balance for Spanish/non-English.">
            <Select value={form.whisper_model_size} onChange={(e) => set('whisper_model_size', e.target.value)}>
              <option value="tiny">tiny (fastest)</option>
              <option value="base">base</option>
              <option value="small">small (recommended for non-English)</option>
              <option value="medium">medium</option>
              <option value="large">large (slowest, most accurate)</option>
            </Select>
          </Field>

          <Field label="Language" hint="ISO 639-1 code (e.g. es, en, fr, pt). Leave empty for auto-detection.">
            <Input
              placeholder="auto-detect"
              value={form.whisper_language}
              onChange={(e) => set('whisper_language', e.target.value)}
              maxLength={10}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Subtitle Style */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subtitle Style</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Active word color" hint="ASS format: &HAABBGGRR&">
              <Input
                value={form.subtitle_active_color}
                onChange={(e) => set('subtitle_active_color', e.target.value)}
                placeholder="&H00FFAA00&"
              />
            </Field>
            <Field label="Inactive word color">
              <Input
                value={form.subtitle_inactive_color}
                onChange={(e) => set('subtitle_inactive_color', e.target.value)}
                placeholder="&H00CCCCCC&"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Font size (px)">
              <Input
                type="number"
                min={20}
                max={120}
                value={form.subtitle_font_size}
                onChange={(e) => set('subtitle_font_size', Number(e.target.value))}
              />
            </Field>
            <Field label="Max chars per line" hint="Words wrap at this length.">
              <Input
                type="number"
                min={20}
                max={80}
                value={form.subtitle_max_line_chars}
                onChange={(e) => set('subtitle_max_line_chars', Number(e.target.value))}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Subtitle Timing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subtitle Timing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Post-hold (s)" hint="How long the cue stays visible after the last word ends.">
              <Input
                type="number"
                step="0.1"
                min={0}
                max={5}
                value={form.subtitle_post_hold_s}
                onChange={(e) => set('subtitle_post_hold_s', Number(e.target.value))}
              />
            </Field>
            <Field label="Pause break (s)" hint="Silence gap that forces a new cue.">
              <Input
                type="number"
                step="0.1"
                min={0.1}
                max={3}
                value={form.subtitle_pause_cue_break_s}
                onChange={(e) => set('subtitle_pause_cue_break_s', Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Anticipation threshold (s)" hint="Silence gap that triggers early display of the next cue. Set high (6+) to avoid showing mid-song lyrics during short breaks.">
              <Input
                type="number"
                step="0.5"
                min={1}
                max={30}
                value={form.subtitle_anticipation_threshold_s}
                onChange={(e) => set('subtitle_anticipation_threshold_s', Number(e.target.value))}
              />
            </Field>
            <Field label="Anticipation time (s)" hint="How early the next cue appears (greyed-out) before singing starts.">
              <Input
                type="number"
                step="0.5"
                min={0.5}
                max={10}
                value={form.subtitle_anticipation_s}
                onChange={(e) => set('subtitle_anticipation_s', Number(e.target.value))}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">System</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Hardware:</span>
            <Badge variant="secondary">{form.hardware_backend.toUpperCase()}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Auth:</span>
            <Badge variant={form.auth_enabled ? 'default' : 'secondary'}>
              {form.auth_enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="min-w-24">
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}
