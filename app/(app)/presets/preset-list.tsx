'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { Preset } from '@/lib/types'

const DEFAULT_FORM = {
  name: '',
  rate: 50,
  uma_first: 20,
  uma_second: 10,
  uma_third: -10,
  uma_fourth: -20,
  starting_score: 25000,
  return_score: 30000,
  oka_enabled: true,
  chip_rate: 100,
  seat_change_interval: '' as string | number,
  hako_shita_enabled: true,
}

type FormData = typeof DEFAULT_FORM

function FormField({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-zinc-400">{label}</Label>
      {children}
    </div>
  )
}

export function PresetList({ presets: initial, userId }: { presets: Preset[]; userId: string }) {
  const router = useRouter()
  const [presets, setPresets] = useState(initial)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Preset | null>(null)
  const [form, setForm] = useState<FormData>(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)

  function openNew() {
    setEditing(null)
    setForm(DEFAULT_FORM)
    setOpen(true)
  }

  function openEdit(preset: Preset) {
    setEditing(preset)
    setForm({
      name: preset.name,
      rate: preset.rate,
      uma_first: preset.uma_first,
      uma_second: preset.uma_second,
      uma_third: preset.uma_third,
      uma_fourth: preset.uma_fourth,
      starting_score: preset.starting_score,
      return_score: preset.return_score,
      oka_enabled: preset.oka_enabled,
      chip_rate: preset.chip_rate,
      seat_change_interval: preset.seat_change_interval ?? '',
      hako_shita_enabled: preset.hako_shita_enabled ?? true,
    })
    setOpen(true)
  }

  function field(key: keyof FormData) {
    return {
      id: key,
      value: String(form[key]),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value
        setForm(f => ({ ...f, [key]: v }))
      },
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('名前を入力してください'); return }
    setLoading(true)
    const supabase = createClient()
    const payload = {
      ...form,
      user_id: userId,
      seat_change_interval: form.seat_change_interval === '' ? null : Number(form.seat_change_interval),
    }

    const { data, error } = editing
      ? await supabase.from('presets').update(payload).eq('id', editing.id).select().single()
      : await supabase.from('presets').insert(payload).select().single()

    if (error) { toast.error('保存に失敗しました'); setLoading(false); return }

    if (editing) {
      setPresets(ps => ps.map(p => p.id === editing.id ? data as Preset : p))
    } else {
      setPresets(ps => [...ps, data as Preset])
    }
    toast.success(editing ? '更新しました' : '作成しました')
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('このプリセットを削除しますか？')) return
    const supabase = createClient()
    const { error } = await supabase.from('presets').delete().eq('id', id)
    if (error) { toast.error('削除に失敗しました'); return }
    setPresets(ps => ps.filter(p => p.id !== id))
    toast.success('削除しました')
    router.refresh()
  }

  async function handleSetDefault(id: string) {
    const supabase = createClient()
    await supabase.from('presets').update({ is_default: false }).eq('user_id', userId)
    await supabase.from('presets').update({ is_default: true }).eq('id', id)
    setPresets(ps => ps.map(p => ({ ...p, is_default: p.id === id })))
    toast.success('デフォルトに設定しました')
    router.refresh()
  }

  async function createSamples() {
    setLoading(true)
    const supabase = createClient()
    const samples = [
      { user_id: userId, name: 'テンゴ・10-20', rate: 50, uma_first: 20, uma_second: 10, uma_third: -10, uma_fourth: -20, starting_score: 25000, return_score: 30000, oka_enabled: true, chip_rate: 100, is_default: true },
      { user_id: userId, name: 'テンピン・10-30', rate: 100, uma_first: 30, uma_second: 10, uma_third: -10, uma_fourth: -30, starting_score: 25000, return_score: 30000, oka_enabled: true, chip_rate: 500, is_default: false },
    ]
    const { data, error } = await supabase.from('presets').insert(samples).select()
    if (error) { toast.error('作成に失敗しました'); setLoading(false); return }
    setPresets(data as Preset[])
    toast.success('サンプルプリセットを作成しました')
    setLoading(false)
    router.refresh()
  }

  const inputClass = 'bg-zinc-900 border-zinc-700 text-zinc-50 h-10 text-sm'

  return (
    <div className="space-y-4">
      {presets.length === 0 && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 text-center space-y-3">
          <p className="text-zinc-400 text-sm">プリセットがありません</p>
          <Button onClick={createSamples} disabled={loading} variant="outline" className="w-full border-zinc-700 text-zinc-300">
            サンプルプリセットを作成
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {presets.map(p => (
          <div key={p.id} className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-100">{p.name}</span>
                  {p.is_default && <Star size={14} className="text-yellow-400 fill-yellow-400" />}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  {p.rate}円/千点 ・ ウマ {p.uma_first}/{p.uma_second}/{p.uma_third}/{p.uma_fourth} ・ チップ{p.chip_rate}円
                  {p.seat_change_interval ? ` ・ 場替え${p.seat_change_interval}局` : ''}
                  {!(p.hako_shita_enabled ?? true) ? ' ・ 箱下なし' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!p.is_default && (
                  <button onClick={() => handleSetDefault(p.id)} className="p-2 text-zinc-500 hover:text-yellow-400 transition-colors" aria-label="デフォルト設定">
                    <Star size={16} />
                  </button>
                )}
                <button onClick={() => openEdit(p)} className="p-2 text-zinc-500 hover:text-zinc-200 transition-colors">
                  <Pencil size={16} />
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-2 text-zinc-500 hover:text-red-400 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button onClick={openNew} className="w-full h-12 gap-2">
        <Plus size={18} /> 新規プリセット作成
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-50 max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'プリセット編集' : '新規プリセット'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <FormField label="名前" id="name">
              <Input {...field('name')} placeholder="テンゴ・10-20" className={inputClass} />
            </FormField>
            <FormField label="レート（円/千点）" id="rate">
              <Input {...field('rate')} type="number" inputMode="numeric" className={inputClass} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="ウマ1位" id="uma_first">
                <Input {...field('uma_first')} type="number" inputMode="numeric" className={inputClass} />
              </FormField>
              <FormField label="ウマ2位" id="uma_second">
                <Input {...field('uma_second')} type="number" inputMode="numeric" className={inputClass} />
              </FormField>
              <FormField label="ウマ3位" id="uma_third">
                <Input {...field('uma_third')} type="number" inputMode="numeric" className={inputClass} />
              </FormField>
              <FormField label="ウマ4位" id="uma_fourth">
                <Input {...field('uma_fourth')} type="number" inputMode="numeric" className={inputClass} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="原点" id="starting_score">
                <Input {...field('starting_score')} type="number" inputMode="numeric" className={inputClass} />
              </FormField>
              <FormField label="返し" id="return_score">
                <Input {...field('return_score')} type="number" inputMode="numeric" className={inputClass} />
              </FormField>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="oka_enabled"
                checked={form.oka_enabled}
                onChange={e => setForm(f => ({ ...f, oka_enabled: e.target.checked }))}
                className="w-5 h-5 rounded accent-zinc-50"
              />
              <Label htmlFor="oka_enabled" className="text-sm">オカあり</Label>
            </div>
            <div className="rounded-lg bg-zinc-800 border border-zinc-700 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="hako_shita_enabled" className="text-sm">箱下計算あり</Label>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {form.hako_shita_enabled
                      ? 'マイナスの素点をそのまま計算'
                      : '素点がマイナスでも0扱い（トップの取り分が減る）'}
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="hako_shita_enabled"
                  checked={form.hako_shita_enabled}
                  onChange={e => setForm(f => ({ ...f, hako_shita_enabled: e.target.checked }))}
                  className="w-5 h-5 rounded accent-zinc-50 flex-none"
                />
              </div>
            </div>
            <FormField label="チップ単価（円/枚）" id="chip_rate">
              <Input {...field('chip_rate')} type="number" inputMode="numeric" className={inputClass} />
            </FormField>
            <FormField label="場替え間隔（半荘数、空欄=なし）" id="seat_change_interval">
              <Input
                id="seat_change_interval"
                type="number"
                inputMode="numeric"
                placeholder="例: 4"
                value={String(form.seat_change_interval)}
                onChange={e => setForm(f => ({ ...f, seat_change_interval: e.target.value }))}
                className={inputClass}
              />
            </FormField>
            <Button onClick={handleSave} disabled={loading} className="w-full h-12">
              {loading ? '保存中...' : '保存'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
