import { ArticleProse, H2, OL, LI, P, Note } from "../article-shell"

export default function LettrageManuel() {
  return (
    <ArticleProse>
      <P>
        Le <strong>lettrage</strong> consiste à apparier dans un compte de tiers (client
        ou fournisseur) les écritures qui se neutralisent — typiquement une facture et
        son règlement. Un compte correctement lettré ne fait apparaître que les
        opérations réellement en suspens.
      </P>
      <H2>1. Quand utiliser le lettrage manuel ?</H2>
      <P>
        Lexora propose un lettrage automatique basé sur les montants et les libellés.
        Vous devez recourir au lettrage manuel dans les cas suivants&nbsp;:
      </P>
      <OL>
        <LI>règlement partiel d&apos;une facture&nbsp;;</LI>
        <LI>règlement groupant plusieurs factures&nbsp;;</LI>
        <LI>écart de centimes (différence de change ou arrondi)&nbsp;;</LI>
        <LI>opérations atypiques (avoir, escompte, perte sur créance).</LI>
      </OL>
      <H2>2. Procédure</H2>
      <OL>
        <LI>Ouvrez <strong>Comptabilité &gt; Lettrage</strong>.</LI>
        <LI>Sélectionnez le <strong>compte tiers</strong> (par exemple <em>411 — Clients</em>).</LI>
        <LI>Filtrez sur le tiers concerné.</LI>
        <LI>Cochez les écritures à lettrer (l&apos;équilibre est calculé en bas de l&apos;écran).</LI>
        <LI>Si l&apos;équilibre est nul, cliquez sur <strong>Lettrer</strong>. Une lettre est attribuée (A, B, C, …).</LI>
        <LI>Si un écart subsiste, cliquez sur <strong>Lettrer avec écart</strong> et imputez la différence sur un compte d&apos;ajustement (escompte, perte de change, créance irrécouvrable).</LI>
      </OL>
      <Note>
        Pour annuler un lettrage, ouvrez la même interface, cliquez sur la lettre dans
        la colonne &quot;Lettre&quot; puis sur <strong>Délettrer</strong>. Les écritures
        redeviennent ouvertes.
      </Note>
    </ArticleProse>
  )
}
