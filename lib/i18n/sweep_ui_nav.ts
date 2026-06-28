// UI navigation strings swept from sidebars / command palette / help into i18n.
// Namespace uinav.* — labels left untranslated in the prior i18n lots
// (AdminSidebar nav items + ClientSidebarFull "GBC & Full IFRS" section title).

export const sweepUiNavChunk = {
  fr: {
    // ClientSidebarFull — section title
    'uinav.gbc_full_ifrs': 'GBC & Full IFRS',
    // AdminSidebar — nav item labels
    'uinav.admin_registration_requests': "Demandes d'inscription",
    'uinav.admin_pricing_catalog': 'Catalogue tarifaire',
    'uinav.admin_lexora_billing': 'Facturation Lexora',
    'uinav.admin_lexora_tooling': 'Lexora Tooling (IA)',
    'uinav.admin_cascade_purge': 'Purge cascade',
  },
  en: {
    'uinav.gbc_full_ifrs': 'GBC & Full IFRS',
    'uinav.admin_registration_requests': 'Registration requests',
    'uinav.admin_pricing_catalog': 'Pricing catalog',
    'uinav.admin_lexora_billing': 'Lexora billing',
    'uinav.admin_lexora_tooling': 'Lexora Tooling (AI)',
    'uinav.admin_cascade_purge': 'Cascade purge',
  },
} as const
