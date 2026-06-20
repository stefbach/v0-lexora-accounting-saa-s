/**
 * renderLegalMarkdown — Markdown → HTML soigné pour les échanges juridiques.
 * Rendu professionnel : titres, gras, listes, tableaux, citations [S1] mises
 * en valeur, et niveaux d'alerte 🔴/🟡/🟢 transformés en pastilles colorées.
 *
 * Renvoie une chaîne HTML à injecter via dangerouslySetInnerHTML (l'entrée est
 * échappée en premier — pas d'injection possible depuis le texte du modèle).
 */
export function renderLegalMarkdown(text: string): string {
  let html = (text || '')
    // Échappement HTML
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Titres
    .replace(/^#### (.+)$/gm, '<h5 class="text-[13px] font-bold text-[#0B0F2E] mt-3 mb-1">$1</h5>')
    .replace(/^### (.+)$/gm, '<h4 class="text-sm font-bold text-[#0B0F2E] mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="text-[15px] font-bold text-[#0B0F2E] mt-4 mb-2 border-b border-gray-200 pb-1">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="text-base font-bold text-[#0B0F2E] mt-4 mb-2">$1</h2>')
    // Citations de loi/sources [S1], [S2]… → puce dorée
    .replace(/\[(S\d+)\]/g, '<span class="inline-block align-middle text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#D4AF37]/15 text-[#8a6d15] mx-0.5">$1</span>')
    // Alertes de risque
    .replace(/🔴/g, '<span class="inline-block w-2 h-2 rounded-full bg-red-500 mr-1 align-middle"></span>')
    .replace(/🟡/g, '<span class="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1 align-middle"></span>')
    .replace(/🟢/g, '<span class="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1 align-middle"></span>')
    // Gras / italique / code
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[#0B0F2E]">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/^---$/gm, '<hr class="my-3 border-gray-200"/>')
    // Listes numérotées
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal text-sm py-0.5 marker:text-[#D4AF37]">$1</li>')
    // Listes à puces
    .replace(/^[-•]\s+(.+)$/gm, '<li class="ml-4 list-disc text-sm py-0.5 marker:text-[#D4AF37]">$1</li>')
    // Tableaux
    .replace(/^\|(.+)\|$/gm, (_m, content: string) => {
      const cells = content.split('|').map((c) => c.trim())
      if (cells.every((c) => /^[-:]+$/.test(c))) return ''
      const isHeader = cells.some((c) => c.startsWith('**') && c.endsWith('**'))
      const tag = isHeader ? 'th' : 'td'
      const cls = isHeader
        ? 'class="px-3 py-1.5 text-left text-xs font-semibold bg-gray-50 border border-gray-200 text-[#0B0F2E]"'
        : 'class="px-3 py-1.5 text-xs border border-gray-200"'
      return `<tr>${cells.map((c) => `<${tag} ${cls}>${c.replace(/^\*\*|\*\*$/g, '')}</${tag}>`).join('')}</tr>`
    })

  html = html.replace(/((?:<li[^>]*list-decimal[^>]*>.*?<\/li>\s*)+)/g, '<ol class="my-2 space-y-0.5">$1</ol>')
  html = html.replace(/((?:<li[^>]*list-disc[^>]*>.*?<\/li>\s*)+)/g, '<ul class="my-2 space-y-0.5">$1</ul>')
  html = html.replace(/((?:<tr>.*?<\/tr>\s*)+)/g, '<table class="w-full border-collapse my-3 rounded overflow-hidden">$1</table>')
  html = html.replace(/\n\n/g, '</p><p class="my-1.5">').replace(/\n/g, '<br/>')

  return `<div class="leading-relaxed"><p class="my-1.5">${html}</p></div>`
}
