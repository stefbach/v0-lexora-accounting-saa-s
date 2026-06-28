"use client"
/**
 * Sprint 5 AMÉLIO F — Éditeur riche (TipTap) pour modifier un contrat
 * généré. Utilisé dans /rh/juridique → bouton "Modifier".
 *
 * Le contenu édité est sauvegardé dans `contrats_employes.html_content_modified`
 * (mig 142). Le rendu utilise html_content_modified en priorité, avec
 * fallback vers html_content (contenu original généré par IA).
 */
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { useEffect } from "react"
import { t, getLocale } from "@/lib/i18n"

export interface ContractEditorProps {
  /** Contenu initial (HTML). */
  initialHtml: string
  /** Callback au changement (throttled à chaque transaction TipTap). */
  onChange: (html: string) => void
  /** Lecture seule (pour preview). */
  readonly?: boolean
  className?: string
}

export function ContractEditor({
  initialHtml,
  onChange,
  readonly = false,
  className = "",
}: ContractEditorProps) {
  const locale = getLocale()
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialHtml || "",
    editable: !readonly,
    // Sprint 5 AMÉLIO F — SSR safety (hydration mismatch warning sinon).
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (!readonly) onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[320px] p-4 focus:outline-none " +
          "prose-headings:text-[#0B0F2E] prose-p:text-gray-800 prose-strong:text-[#0B0F2E]",
      },
    },
  })

  // Sync quand initialHtml change (ex. sélection d'un autre contrat).
  useEffect(() => {
    if (editor && initialHtml !== editor.getHTML()) {
      editor.commands.setContent(initialHtml || "", { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHtml])

  if (!editor) {
    return (
      <div className={`border rounded-xl p-4 text-sm text-gray-400 ${className}`}>
        Chargement de l'éditeur…
      </div>
    )
  }

  return (
    <div className={`border rounded-xl bg-white ${className}`}>
      {!readonly && (
        <div className="border-b px-2 py-1.5 flex flex-wrap gap-1 bg-gray-50">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            label="B"
            title={t('srh.editor.bold', locale)}
            bold
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            label="I"
            title={t('srh.editor.italic', locale)}
            italic
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")}
            label="S"
            title={t('srh.editor.strike', locale)}
            strike
          />
          <div className="w-px bg-gray-200 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive("heading", { level: 1 })}
            label="H1"
            title={t('srh.editor.h1', locale)}
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive("heading", { level: 2 })}
            label="H2"
            title={t('srh.editor.h2', locale)}
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive("heading", { level: 3 })}
            label="H3"
            title={t('srh.editor.h3', locale)}
          />
          <div className="w-px bg-gray-200 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            label="• Liste"
            title={t('srh.editor.bullet_list', locale)}
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            label="1. Liste"
            title={t('srh.editor.ordered_list', locale)}
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")}
            label="❝"
            title={t('srh.editor.quote', locale)}
          />
          <div className="w-px bg-gray-200 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            label="↶"
            title={t('srh.editor.undo', locale)}
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            label="↷"
            title={t('srh.editor.redo', locale)}
          />
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}

function ToolbarButton({
  onClick,
  active,
  label,
  title,
  bold,
  italic,
  strike,
}: {
  onClick: () => void
  active?: boolean
  label: string
  title: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // éviter de perdre le focus
      onClick={onClick}
      title={title}
      className={`text-xs px-2 py-1 rounded transition-colors ${
        active ? "bg-[#0B0F2E] text-white" : "hover:bg-gray-200 text-gray-700"
      } ${bold ? "font-bold" : ""} ${italic ? "italic" : ""} ${strike ? "line-through" : ""}`}
    >
      {label}
    </button>
  )
}
