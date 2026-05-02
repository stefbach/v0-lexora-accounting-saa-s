import { ArticleProse, H2, OL, LI, P, Note } from "../article-shell"

export default function CreerSociete() {
  return (
    <ArticleProse>
      <P>
        Cette procédure permet de créer une nouvelle société (un nouveau dossier
        comptable) dans Lexora. Vous devez disposer du rôle <strong>Administrateur</strong>{" "}
        ou <strong>Comptable</strong> pour cette action.
      </P>
      <H2>1. Accéder à l&apos;assistant de création</H2>
      <OL>
        <LI>Connectez-vous à votre espace Lexora.</LI>
        <LI>Ouvrez le menu utilisateur en haut à droite, puis cliquez sur <strong>Mes sociétés</strong>.</LI>
        <LI>Cliquez sur <strong>Nouvelle société</strong>.</LI>
      </OL>
      <H2>2. Renseigner les informations légales</H2>
      <OL>
        <LI>Saisissez la <strong>raison sociale</strong> exactement telle qu&apos;enregistrée auprès du <em>Registrar of Companies</em>.</LI>
        <LI>Renseignez le <strong>numéro BRN</strong> (Business Registration Number) — 9 caractères commençant par C.</LI>
        <LI>Indiquez le <strong>numéro TAN</strong> (Tax Account Number) si la société est assujettie à l&apos;impôt sur les sociétés.</LI>
        <LI>Si la société est assujettie à la TVA, cochez <strong>Assujetti TVA</strong> et indiquez le numéro VAT.</LI>
      </OL>
      <H2>3. Paramétrer l&apos;exercice comptable</H2>
      <OL>
        <LI>Choisissez la <strong>date de début d&apos;exercice</strong>. Par défaut, Lexora propose le 1er&nbsp;juillet (exercice fiscal mauricien standard).</LI>
        <LI>Sélectionnez la <strong>devise principale</strong> (MUR par défaut).</LI>
        <LI>Choisissez le <strong>plan comptable</strong> (PCM&nbsp;— Plan Comptable Mauricien — par défaut).</LI>
      </OL>
      <Note>
        Le choix du plan comptable est définitif. Pour le modifier, il faudra créer une nouvelle société et migrer les écritures.
      </Note>
      <H2>4. Inviter les collaborateurs</H2>
      <P>
        Une fois la société créée, vous pouvez inviter d&apos;autres utilisateurs depuis
        l&apos;onglet <strong>Équipe</strong> et leur attribuer un rôle (Administrateur,
        Comptable, Lecteur, etc.). Les permissions sont gérées par le système RLS
        multi-tenant&nbsp;: chaque utilisateur ne voit que les données des sociétés
        auxquelles il a été rattaché.
      </P>
    </ArticleProse>
  )
}
