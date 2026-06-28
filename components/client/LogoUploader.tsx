"use client"

/**
 * LogoUploader — upload du logo société (bucket `societes-logos`).
 *
 * Affiche le logo courant (URL Supabase Storage), un bouton "Changer"
 * (input file) et un bouton "Supprimer". Validation côté client
 * cohérente avec lib/storage/societe-logo.ts.
 */

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Upload, Trash2, Image as ImageIcon, AlertTriangle } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]

interface Props {
  societeId: string | null
  initialLogoUrl?: string | null
  onChange?: (logoUrl: string | null) => void
  className?: string
}

export function LogoUploader({ societeId, initialLogoUrl, onChange, className }: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const locale = getLocale()

  useEffect(() => {
    setLogoUrl(initialLogoUrl ?? null)
  }, [initialLogoUrl])

  // Si pas de logo passé en prop, on tente de le charger depuis l'API
  useEffect(() => {
    if (!societeId || initialLogoUrl !== undefined) return
    fetch(`/api/client/societes/${societeId}/logo`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.logo_url) setLogoUrl(d.logo_url)
      })
      .catch(() => {})
  }, [societeId, initialLogoUrl])

  async function handleFile(file: File) {
    setError(null)
    if (!societeId) {
      setError(t('sccl.societe_unavailable', locale))
      return
    }
    if (!ALLOWED.includes(file.type)) {
      setError(t('sccl.unsupported_format', locale))
      return
    }
    if (file.size > MAX_BYTES) {
      setError(t('sccl.file_too_large', locale).replace('{max}', String(MAX_BYTES / 1024 / 1024)))
      return
    }
    setBusy(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`/api/client/societes/${societeId}/logo`, {
        method: "POST",
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || t('sccl.upload_error', locale))
      // Cache-busting : ajoute un timestamp pour forcer le navigateur à recharger
      const url = `${data.logo_url}?t=${Date.now()}`
      setLogoUrl(url)
      onChange?.(url)
    } catch (e: any) {
      setError(e?.message || t('sccl.upload_error', locale))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function handleDelete() {
    if (!societeId) return
    if (!confirm(t('sccl.confirm_delete_logo', locale))) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/client/societes/${societeId}/logo`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || t('sccl.generic_error', locale))
      setLogoUrl(null)
      onChange?.(null)
    } catch (e: any) {
      setError(e?.message || t('sccl.generic_error', locale))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`flex items-start gap-4 ${className || ""}`}>
      <div className="flex-shrink-0 w-32 h-32 border rounded-lg flex items-center justify-center bg-muted/30 overflow-hidden">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={t('sccl.logo_alt', locale)}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <ImageIcon className="w-10 h-10 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy || !societeId}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-1.5" />
            )}
            {logoUrl ? t('sccl.change_logo', locale) : t('sccl.upload_logo', locale)}
          </Button>
          {logoUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={busy}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              {t('sccl.delete', locale)}
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED.join(",")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('sccl.logo_hint', locale)}
        </p>
        {error && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
