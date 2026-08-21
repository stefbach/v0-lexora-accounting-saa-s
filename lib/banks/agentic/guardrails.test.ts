/**
 * Tests EXHAUSTIFS et ADVERSARIAUX des garde-fous lecture seule.
 * Un faux négatif ici = risque de mouvement d'argent : chaque motif de liste
 * noire est testé, avec variations de casse, accents, obfuscation d'URL,
 * caractères invisibles et séparateurs.
 */
import { describe, expect, it } from 'vitest'
import {
  FORBIDDEN_PATTERNS,
  checkAction,
  classifyFillTarget,
  findForbiddenPattern,
  normalizeForMatching,
} from './guardrails'
import type { AgenticAction, ObservedElement } from './types'

const SAFE_URL = 'https://ib.mcb.mu/accounts/overview'

function el(partial: Partial<ObservedElement>): ObservedElement {
  return { selector: partial.selector ?? '#el', ...partial }
}

function click(target = '#el'): AgenticAction {
  return { type: 'click', target, raison: 'test' }
}

function fill(target = '#el', value = 'x'): AgenticAction {
  return { type: 'fill', target, value, raison: 'test' }
}

describe('normalizeForMatching', () => {
  it('minusculise et supprime les accents', () => {
    expect(normalizeForMatching('BÉNÉFICIAIRE')).toBe('beneficiaire')
    expect(normalizeForMatching('Prélèvement')).toBe('prelevement')
  })

  it('décode les échappements URL, y compris doubles', () => {
    expect(normalizeForMatching('Vire%20ment')).toBe('vire ment')
    expect(normalizeForMatching('vire%2520ment')).toBe('vire ment')
    expect(normalizeForMatching('vire+ment')).toBe('vire ment')
  })

  it('supprime les caractères invisibles (zero-width)', () => {
    expect(normalizeForMatching('vire​ment')).toBe('virement')
    expect(normalizeForMatching('care­free card')).toBe('carefree card')
  })

  it('survit à un pourcentage invalide sans lever', () => {
    expect(normalizeForMatching('100% s%ZZur')).toContain('s%zzur')
  })
})

describe('findForbiddenPattern — chaque motif de la liste noire', () => {
  // Chaque motif brut doit être détecté tel quel, en MAJUSCULES, et entouré
  // de texte.
  for (const pattern of FORBIDDEN_PATTERNS) {
    it(`détecte « ${pattern} » (brut, casse, contexte)`, () => {
      expect(findForbiddenPattern(pattern)).not.toBeNull()
      expect(findForbiddenPattern(pattern.toUpperCase())).not.toBeNull()
      expect(findForbiddenPattern(`menu ${pattern} en ligne`)).not.toBeNull()
    })
  }

  it('détecte les variantes accentuées françaises', () => {
    expect(findForbiddenPattern('Bénéficiaire')).toBe('beneficiaire')
    expect(findForbiddenPattern('Prélèvements')).toBe('prelevement')
    expect(findForbiddenPattern('Paramètres de sécurité')).toBe('parametres de securite')
  })

  it('détecte les mots obfusqués par séparateurs', () => {
    expect(findForbiddenPattern('vire-ment')).not.toBeNull()
    expect(findForbiddenPattern('v_i_r_e_m_e_n_t')).not.toBeNull()
    expect(findForbiddenPattern('trans.fer')).not.toBeNull()
    expect(findForbiddenPattern('bene ficiaire')).not.toBeNull()
    expect(findForbiddenPattern('pay/ment')).not.toBeNull()
  })

  it("détecte l'obfuscation par encodage URL", () => {
    expect(findForbiddenPattern('https://bank.mu/%76%69%72%65%6d%65%6e%74')).not.toBeNull()
    expect(findForbiddenPattern('https://bank.mu/tra%6esfer/new')).not.toBeNull()
    expect(findForbiddenPattern('https://bank.mu/pay%2Dment')).not.toBeNull()
  })

  it('détecte les caractères invisibles insérés', () => {
    expect(findForbiddenPattern('vire​ment')).not.toBeNull()
    expect(findForbiddenPattern('trans­fer')).not.toBeNull()
    expect(findForbiddenPattern('be‌ne‍ficiaire')).not.toBeNull()
  })

  it('détecte transfert (français) via le radical transfer', () => {
    expect(findForbiddenPattern('Transfert de fonds')).not.toBeNull()
    expect(findForbiddenPattern('/transferts/nouveau')).not.toBeNull()
  })

  it('laisse passer les libellés de consultation', () => {
    expect(findForbiddenPattern('Relevé de compte')).toBeNull()
    expect(findForbiddenPattern('Historique des transactions')).toBeNull()
    expect(findForbiddenPattern('Télécharger le relevé PDF')).toBeNull()
    expect(findForbiddenPattern('https://ib.mcb.mu/accounts/statements')).toBeNull()
    expect(findForbiddenPattern('Solde disponible')).toBeNull()
  })

  it('retourne null pour null/undefined/vide', () => {
    expect(findForbiddenPattern(null)).toBeNull()
    expect(findForbiddenPattern(undefined)).toBeNull()
    expect(findForbiddenPattern('')).toBeNull()
  })
})

describe('checkAction — clics', () => {
  it('autorise un clic de consultation', () => {
    const verdict = checkAction(
      click('#statements'),
      el({ selector: '#statements', text: 'Relevés de compte', href: '/accounts/statements' }),
      SAFE_URL,
    )
    expect(verdict.allowed).toBe(true)
  })

  it('refuse un clic dont le libellé contient un motif interdit — pour chaque motif', () => {
    for (const pattern of FORBIDDEN_PATTERNS) {
      const verdict = checkAction(
        click(),
        el({ text: `Aller vers ${pattern}` }),
        SAFE_URL,
      )
      expect(verdict.allowed, `libellé « ${pattern} » aurait dû être refusé`).toBe(false)
    }
  })

  it("refuse un clic dont l'URL de destination contient un motif interdit — pour chaque motif", () => {
    for (const pattern of FORBIDDEN_PATTERNS) {
      const verdict = checkAction(
        click(),
        el({ text: 'Continuer', href: `https://bank.mu/${pattern.replace(/ /g, '-')}` }),
        SAFE_URL,
      )
      expect(verdict.allowed, `URL « ${pattern} » aurait dû être refusée`).toBe(false)
    }
  })

  it('double filtre : libellé anodin mais href interdit → refus', () => {
    const verdict = checkAction(
      click(),
      el({ text: 'Continuer', href: '/app/transfer/new' }),
      SAFE_URL,
    )
    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.rule).toBe('forbidden_url')
  })

  it('double filtre : href anodin mais libellé interdit → refus', () => {
    const verdict = checkAction(
      click(),
      el({ text: 'Nouveau virement', href: '/app/step2' }),
      SAFE_URL,
    )
    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.rule).toBe('forbidden_label')
  })

  it('refuse un libellé interdit via aria-label, name, id ou sélecteur', () => {
    expect(checkAction(click(), el({ ariaLabel: 'Faire un virement' }), SAFE_URL).allowed).toBe(false)
    expect(checkAction(click(), el({ name: 'btnPayment' }), SAFE_URL).allowed).toBe(false)
    expect(checkAction(click(), el({ id: 'card-settings' }), SAFE_URL).allowed).toBe(false)
    expect(
      checkAction(click('a[href*=transfer]'), el({ selector: 'a[href*=transfer]' }), SAFE_URL).allowed,
    ).toBe(false)
  })

  it('refuse les obfuscations adversariales de libellé', () => {
    const adversarial = [
      'Vire​ment',
      'V I R E M E N T',
      'TRANS-FER',
      'Pay%20ment',
      'bénéficiaire'.toUpperCase(),
      'Standing Order',
    ]
    for (const text of adversarial) {
      expect(checkAction(click(), el({ text }), SAFE_URL).allowed, text).toBe(false)
    }
  })

  it('refuse un clic dont la cible est introuvable dans l’observation', () => {
    const verdict = checkAction(click('#ghost'), null, SAFE_URL)
    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.rule).toBe('target_not_observed')
  })

  it('refuse toute action non-abort quand l’URL COURANTE est en zone interdite', () => {
    const forbiddenUrl = 'https://bank.mu/payments/new'
    expect(checkAction(click(), el({ text: 'OK' }), forbiddenUrl).allowed).toBe(false)
    expect(checkAction({ type: 'scroll', raison: 'r' }, null, forbiddenUrl).allowed).toBe(false)
    expect(checkAction({ type: 'done', raison: 'r' }, null, forbiddenUrl).allowed).toBe(false)
    // abort reste possible pour sortir proprement.
    expect(checkAction({ type: 'abort', raison: 'r' }, null, forbiddenUrl).allowed).toBe(true)
  })
})

describe('checkAction — saisie (fill)', () => {
  it('autorise la saisie dans un champ login', () => {
    const verdict = checkAction(
      fill('#user'),
      el({ selector: '#user', name: 'username', inputType: 'text' }),
      SAFE_URL,
    )
    expect(verdict.allowed).toBe(true)
  })

  it('autorise la saisie dans un champ mot de passe (type natif)', () => {
    const verdict = checkAction(
      fill('#pwd'),
      el({ selector: '#pwd', inputType: 'password' }),
      SAFE_URL,
    )
    expect(verdict.allowed).toBe(true)
  })

  it('autorise la saisie dans un champ OTP', () => {
    const verdict = checkAction(
      fill('#otp'),
      el({ selector: '#otp', placeholder: 'Code SMS', inputType: 'tel' }),
      SAFE_URL,
    )
    expect(verdict.allowed).toBe(true)
  })

  it('autorise la saisie dans un champ de recherche de compte', () => {
    const verdict = checkAction(
      fill('#q'),
      el({ selector: '#q', ariaLabel: 'Recherche', inputType: 'search' }),
      SAFE_URL,
    )
    expect(verdict.allowed).toBe(true)
  })

  it('refuse la saisie dans tout champ non autorisé — montant, IBAN, bénéficiaire, motif, référence', () => {
    const forbiddenFields: Array<Partial<ObservedElement>> = [
      { name: 'amount' },
      { name: 'montant' },
      { placeholder: 'Somme à transférer' },
      { ariaLabel: 'IBAN du destinataire' },
      { name: 'beneficiary_name' },
      { id: 'beneficiaire' },
      { placeholder: 'Payee' },
      { name: 'motif' },
      { ariaLabel: 'Payment reference' },
    ]
    for (const field of forbiddenFields) {
      const verdict = checkAction(fill(), el(field), SAFE_URL)
      expect(verdict.allowed, JSON.stringify(field)).toBe(false)
    }
  })

  it('refuse la saisie dans un champ inconnu / non classifiable (deny by default)', () => {
    const verdict = checkAction(fill(), el({ selector: '#mystery', name: 'foo' }), SAFE_URL)
    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.rule).toBe('forbidden_fill_target')
  })

  it('refuse un champ qui ressemble à un login MAIS porte un motif interdit', () => {
    // « beneficiary email » : email matcherait login_username, mais le motif
    // bénéficiaire doit primer.
    const verdict = checkAction(
      fill(),
      el({ selector: '#be', name: 'beneficiary_email', inputType: 'text' }),
      SAFE_URL,
    )
    expect(verdict.allowed).toBe(false)
  })

  it('refuse un champ montant obfusqué (a-m-o-u-n-t)', () => {
    const verdict = checkAction(fill(), el({ name: 'a-m-o-u-n-t' }), SAFE_URL)
    expect(verdict.allowed).toBe(false)
  })

  it('refuse un fill sans élément observé', () => {
    const verdict = checkAction(fill('#ghost'), null, SAFE_URL)
    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.rule).toBe('target_not_observed')
  })
})

describe('checkAction — press / scroll / états terminaux', () => {
  it('autorise les touches de navigation neutres', () => {
    for (const key of ['Enter', 'Tab', 'Escape', 'ArrowDown', 'PageDown']) {
      expect(
        checkAction({ type: 'press', value: key, raison: 'r' }, null, SAFE_URL).allowed,
        key,
      ).toBe(true)
    }
  })

  it('refuse toute autre touche (raccourcis, caractères, combinaisons)', () => {
    for (const key of ['F12', 'Control+A', 'a', 'Delete', 'Backspace', '']) {
      expect(
        checkAction({ type: 'press', value: key, raison: 'r' }, null, SAFE_URL).allowed,
        key,
      ).toBe(false)
    }
  })

  it('autorise scroll, done, need_otp, abort sur une page sûre', () => {
    for (const type of ['scroll', 'done', 'need_otp', 'abort'] as const) {
      expect(checkAction({ type, raison: 'r' }, null, SAFE_URL).allowed).toBe(true)
    }
  })

  it('refuse un type d’action inconnu (deny by default)', () => {
    const rogue = { type: 'execute_js', raison: 'r' } as unknown as AgenticAction
    const verdict = checkAction(rogue, null, SAFE_URL)
    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.rule).toBe('unknown_action')
  })
})

describe('classifyFillTarget', () => {
  it('classe les champs de la liste blanche', () => {
    expect(classifyFillTarget(el({ name: 'username' }))).toBe('login_username')
    expect(classifyFillTarget(el({ placeholder: 'Identifiant' }))).toBe('login_username')
    expect(classifyFillTarget(el({ inputType: 'password' }))).toBe('login_password')
    expect(classifyFillTarget(el({ name: 'mot-de-passe' }))).toBe('login_password')
    expect(classifyFillTarget(el({ id: 'otp-code' }))).toBe('otp')
    expect(classifyFillTarget(el({ placeholder: 'Code de vérification' }))).toBe('otp')
    expect(classifyFillTarget(el({ ariaLabel: 'Account number' }))).toBe('account_search')
    expect(classifyFillTarget(el({ name: 'recherche' }))).toBe('account_search')
  })

  it('retourne null pour un champ hors liste blanche', () => {
    expect(classifyFillTarget(el({ name: 'commentaire' }))).toBeNull()
    expect(classifyFillTarget(el({}))).toBeNull()
  })

  it('le mot de passe prime : type natif password avec nom trompeur reste password', () => {
    expect(classifyFillTarget(el({ inputType: 'password', name: 'x' }))).toBe('login_password')
  })
})
