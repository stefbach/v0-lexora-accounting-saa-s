// Libellés de l'installation de l'application (PWA) : bannière, boîte de
// dialogue, encart des pages publiques et guide /installer.
export const pwaChunk = {
  fr: {
    // ── Éléments communs ──
    'pwa.install': "Installer l'application",
    'pwa.install_short': 'Installer',
    'pwa.install_now': 'Installer maintenant',
    'pwa.later': 'Plus tard',
    'pwa.close': 'Fermer',
    'pwa.dismiss': 'Masquer',
    'pwa.see_guide': 'Voir la marche à suivre',
    'pwa.how_to_install': "Comment l'installer",
    'pwa.how': 'Voir',

    // ── Bannière (bas d'écran) ──
    'pwa.banner.aria': "Installer l'application Lexora",
    'pwa.banner.title': "Installez Lexora sur votre écran d'accueil",
    'pwa.banner.subtitle': 'Vos dossiers en un geste, sans passer par le navigateur.',

    // ── Boîte de dialogue (page d'accueil) ──
    'pwa.dialog.title': 'Installez Lexora sur votre appareil',
    'pwa.dialog.body':
      "Vos dossiers en deux touches, sans passer par le navigateur. Aucune donnée comptable n'est copiée sur l'appareil.",

    // ── Encart des pages publiques ──
    'pwa.callout.eyebrow': 'Application installable',
    'pwa.callout.title': "Gardez Lexora sur votre écran d'accueil",
    'pwa.callout.body':
      "Installez Lexora en une minute sur votre téléphone, votre tablette ou votre ordinateur. Aucun magasin d'applications, aucun compte supplémentaire, et l'application se met à jour toute seule.",
    'pwa.callout.phones': 'iPhone & Android',
    'pwa.callout.tablets': 'Tablettes',
    'pwa.callout.desktop': 'Windows & Mac',

    // ── Étapes abrégées, affichées dans la boîte de dialogue ──
    'pwa.steps.ios.1': 'Touchez Partager en bas de Safari',
    'pwa.steps.ios.2': "Choisissez « Sur l'écran d'accueil »",
    'pwa.steps.ios.3': 'Touchez « Ajouter »',
    'pwa.steps.android.1': 'Ouvrez le menu ⋮ du navigateur',
    'pwa.steps.android.2': "Choisissez « Installer l'application »",
    'pwa.steps.android.3': 'Confirmez',
    'pwa.steps.desktop.1': "Cliquez sur l'icône d'installation dans la barre d'adresse",
    'pwa.steps.desktop.2': 'Cliquez sur « Installer »',
    'pwa.steps.unknown.1': 'Ouvrez le menu de votre navigateur',
    'pwa.steps.unknown.2': "Choisissez « Installer » ou « Ajouter à l'écran d'accueil »",

    // ── QR code (passerelle ordinateur → téléphone) ──
    'pwa.qr.title': 'Installer sur votre téléphone',
    'pwa.qr.body':
      "Scannez ce code avec l'appareil photo de votre téléphone : la page d'installation s'y ouvrira directement.",
    'pwa.qr.alt': "QR code vers la page d'installation de Lexora",
    'pwa.qr.copy': 'Copier le lien',
    'pwa.qr.copied': 'Lien copié',

    // ── Page /installer ──
    'pwa.page.eyebrow': 'Application Lexora',
    'pwa.page.title': "Installez Lexora sur votre écran d'accueil",
    'pwa.page.subtitle':
      "Lexora s'installe comme une application, depuis le navigateur, en moins d'une minute. Pas de magasin d'applications, pas de compte supplémentaire, pas de mise à jour à surveiller.",
    'pwa.page.installed': 'Lexora est déjà installé sur cet appareil.',
    'pwa.page.open_app': "Ouvrir l'application",
    'pwa.page.steps_for': 'Marche à suivre',
    'pwa.page.device': 'Appareils',
    'pwa.page.browser': 'Navigateur',
    'pwa.page.spaces_title': 'Une application par espace',
    'pwa.page.spaces_body':
      "Installez depuis la page de l'espace que vous utilisez : le navigateur retient le manifeste de cette page. Un salarié qui installe depuis son espace obtient « Lexora Salarié », avec son icône et ses raccourcis. Plusieurs espaces peuvent cohabiter sur le même appareil.",

    // ── Arguments ──
    'pwa.perk.speed.title': 'Démarrage instantané',
    'pwa.perk.speed.body':
      "L'application s'ouvre en plein écran, sans barre d'adresse ni onglets, et garde vos accès en mémoire.",
    'pwa.perk.privacy.title': 'Rien de stocké sur l’appareil',
    'pwa.perk.privacy.body':
      "Écritures, bulletins et déclarations restent sur nos serveurs. L'application n'en conserve aucune copie locale.",
    'pwa.perk.updates.title': 'Toujours à jour',
    'pwa.perk.updates.body':
      "Chaque ouverture charge la dernière version. Aucune mise à jour à installer, aucun magasin d'applications.",
  },
  en: {
    'pwa.install': 'Install the app',
    'pwa.install_short': 'Install',
    'pwa.install_now': 'Install now',
    'pwa.later': 'Maybe later',
    'pwa.close': 'Close',
    'pwa.dismiss': 'Dismiss',
    'pwa.see_guide': 'See the full guide',
    'pwa.how_to_install': 'How to install it',
    'pwa.how': 'How',

    'pwa.banner.aria': 'Install the Lexora app',
    'pwa.banner.title': 'Add Lexora to your home screen',
    'pwa.banner.subtitle': 'Your files in one tap, without going through the browser.',

    'pwa.dialog.title': 'Install Lexora on your device',
    'pwa.dialog.body':
      'Your files in two taps, without going through the browser. No accounting data is copied onto the device.',

    'pwa.callout.eyebrow': 'Installable app',
    'pwa.callout.title': 'Keep Lexora on your home screen',
    'pwa.callout.body':
      'Install Lexora in a minute on your phone, tablet or computer. No app store, no extra account, and the app updates itself.',
    'pwa.callout.phones': 'iPhone & Android',
    'pwa.callout.tablets': 'Tablets',
    'pwa.callout.desktop': 'Windows & Mac',

    'pwa.steps.ios.1': 'Tap Share at the bottom of Safari',
    'pwa.steps.ios.2': 'Choose “Add to Home Screen”',
    'pwa.steps.ios.3': 'Tap “Add”',
    'pwa.steps.android.1': "Open the browser's ⋮ menu",
    'pwa.steps.android.2': 'Choose “Install app”',
    'pwa.steps.android.3': 'Confirm',
    'pwa.steps.desktop.1': 'Click the install icon in the address bar',
    'pwa.steps.desktop.2': 'Click “Install”',
    'pwa.steps.unknown.1': "Open your browser's menu",
    'pwa.steps.unknown.2': 'Choose “Install” or “Add to Home screen”',

    'pwa.qr.title': 'Install on your phone',
    'pwa.qr.body':
      "Scan this code with your phone's camera — the install page will open straight away.",
    'pwa.qr.alt': 'QR code to the Lexora install page',
    'pwa.qr.copy': 'Copy the link',
    'pwa.qr.copied': 'Link copied',

    'pwa.page.eyebrow': 'Lexora app',
    'pwa.page.title': 'Add Lexora to your home screen',
    'pwa.page.subtitle':
      'Lexora installs like an app, straight from the browser, in under a minute. No app store, no extra account, no updates to keep track of.',
    'pwa.page.installed': 'Lexora is already installed on this device.',
    'pwa.page.open_app': 'Open the app',
    'pwa.page.steps_for': 'Step by step',
    'pwa.page.device': 'Devices',
    'pwa.page.browser': 'Browser',
    'pwa.page.spaces_title': 'One app per space',
    'pwa.page.spaces_body':
      'Install from the space you actually use: the browser keeps that page’s manifest. An employee installing from their space gets “Lexora Salarié”, with its own icon and shortcuts. Several spaces can live side by side on the same device.',

    'pwa.perk.speed.title': 'Instant start',
    'pwa.perk.speed.body':
      'The app opens full screen, with no address bar and no tabs, and keeps you signed in.',
    'pwa.perk.privacy.title': 'Nothing stored on the device',
    'pwa.perk.privacy.body':
      'Ledgers, payslips and filings stay on our servers. The app keeps no local copy of them.',
    'pwa.perk.updates.title': 'Always up to date',
    'pwa.perk.updates.body':
      'Every launch loads the latest version. No update to install, no app store.',
  },
}
