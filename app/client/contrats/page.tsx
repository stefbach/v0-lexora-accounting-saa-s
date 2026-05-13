// Re-export du composant pour conserver une URL cohérente /client/contrats
// (le sidebar client pointe ici plutôt que vers /comptable/contrats qui
// sortait l'utilisateur de l'espace client). La logique reste centralisée
// dans app/comptable/contrats/page.tsx.
export { default } from "../../comptable/contrats/page"
