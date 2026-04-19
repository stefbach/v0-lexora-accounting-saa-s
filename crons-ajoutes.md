# Nouveaux crons ajoutés (Wave 1)

> Note : cible initiale `.claude/notes/crons-ajoutes.md` mais le sandbox de
> l'agent Claude Code a bloqué toute écriture dans `.claude/`. Placé à la
> racine du repo en fallback (déplacer à la main vers `.claude/notes/` au
> besoin).

## Fichiers créés
- `app/api/cron/relances-factures-clients/route.ts`
- `app/api/cron/factures-recurrentes-attendues/route.ts`
- `supabase/migrations/149_relances_factures.sql`

## À ajouter dans vercel.json (NE PAS FAIT PAR CET AGENT - Wave 2)
```json
{ "path": "/api/cron/relances-factures-clients", "schedule": "0 9 * * *" },
{ "path": "/api/cron/factures-recurrentes-attendues", "schedule": "30 9 * * *" }
```

## Migrations associées
- `149_relances_factures.sql` crée :
  - table `relances_factures` (idempotence + audit)
  - en bonus : table `alertes_factures_manquantes` (idempotence du 2eme cron)

## Logique cle
### relances-factures-clients (09:00 quotidien)
- Parcourt les societes (filtre `statut='actif'` si present, sinon toutes).
- Selectionne factures `type_facture='client'` avec `date_echeance NOT NULL`
  et `statut NOT IN ('paye','annule','annulee','comptabilisee')`.
- Classification selon ecart `NOW() - date_echeance` :
  - J-7  -> niveau 0 "rappel amical"
  - J+7  -> niveau 1 "premiere relance"
  - J+15 -> niveau 2 "seconde relance"
  - J+30 -> niveau 3 "mise en demeure"
- Idempotence via `UNIQUE (facture_id, niveau)` sur `relances_factures`.
- Envoi via `envoyerNotification` au client (canaux variables selon niveau)
  + copie app au comptable.
- Retour JSON : `{ ok, processed, relances_envoyees, erreurs }`.

### factures-recurrentes-attendues (09:30 quotidien)
- Lit `affectations_comptables WHERE recurrent=true`.
- Skip gracieux si la table n'existe pas -> `{ ok, skipped: true, reason }`.
- `date_attendue = derniere_utilisation + 30j` (heuristique mensuelle).
- Alerte si `NOW() > date_attendue + 3j` ET aucune facture trouvee dans une
  fenetre +/-5j (match `ilike %fournisseur%` sur `tiers`).
- Idempotence via `alertes_factures_manquantes (societe_id, tiers, periode)`.
- Retour JSON : `{ ok, societes_traitees, alertes_envoyees }`.

## Templates de relances
Stockes en dur dans le code du cron - a externaliser plus tard dans une table
`relances_templates`. Placeholders supportes : `{numero}, {date_echeance},
{montant}, {devise}, {tiers}`.

## Prerequis / TODO Wave 2
- [ ] Ajouter les 2 entrees dans `vercel.json` (cf. JSON ci-dessus).
- [ ] Verifier que `envoyerNotification` dans `lib/notifications.ts` accepte
      bien les `type: 'relance_facture'` et
      `type: 'alerte_facture_recurrente_manquante'` (actuellement
      `type: string`, OK, mais la colonne `notifications.type` peut avoir
      un CHECK constraint - a verifier avant prod).
- [ ] Appliquer migration 149 (`supabase migration up` ou equivalent).
- [ ] Variable env `CRON_SECRET` (deja presente).
- [ ] Variables `WATI_*` / `RESEND_API_KEY` pour les canaux whatsapp/email
      (deja presentes cote notifications).
- [ ] Externaliser les templates dans une table.
- [ ] Ajouter des tests e2e sur la classification des niveaux (mock NOW).
