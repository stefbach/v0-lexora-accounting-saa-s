import { NextResponse } from 'next/server'

export async function GET() {
  const jurisdictions = [
    { code: 'MU', name: 'Mauritius', nameFr: 'Maurice', framework: 'PCM', currency: 'MUR', zone: null, flag: '🇲🇺' },
    // UEMOA
    { code: 'SN', name: 'Senegal', nameFr: 'Sénégal', framework: 'SYSCOHADA', currency: 'XOF', zone: 'UEMOA', flag: '🇸🇳' },
    { code: 'CI', name: 'Ivory Coast', nameFr: 'Côte d\'Ivoire', framework: 'SYSCOHADA', currency: 'XOF', zone: 'UEMOA', flag: '🇨🇮' },
    { code: 'ML', name: 'Mali', nameFr: 'Mali', framework: 'SYSCOHADA', currency: 'XOF', zone: 'UEMOA', flag: '🇲🇱' },
    { code: 'BF', name: 'Burkina Faso', nameFr: 'Burkina Faso', framework: 'SYSCOHADA', currency: 'XOF', zone: 'UEMOA', flag: '🇧🇫' },
    { code: 'NE', name: 'Niger', nameFr: 'Niger', framework: 'SYSCOHADA', currency: 'XOF', zone: 'UEMOA', flag: '🇳🇪' },
    { code: 'BJ', name: 'Benin', nameFr: 'Bénin', framework: 'SYSCOHADA', currency: 'XOF', zone: 'UEMOA', flag: '🇧🇯' },
    { code: 'TG', name: 'Togo', nameFr: 'Togo', framework: 'SYSCOHADA', currency: 'XOF', zone: 'UEMOA', flag: '🇹🇬' },
    { code: 'GW', name: 'Guinea-Bissau', nameFr: 'Guinée-Bissau', framework: 'SYSCOHADA', currency: 'XOF', zone: 'UEMOA', flag: '🇬🇼' },
    // CEMAC
    { code: 'CM', name: 'Cameroon', nameFr: 'Cameroun', framework: 'SYSCOHADA', currency: 'XAF', zone: 'CEMAC', flag: '🇨🇲' },
    { code: 'GA', name: 'Gabon', nameFr: 'Gabon', framework: 'SYSCOHADA', currency: 'XAF', zone: 'CEMAC', flag: '🇬🇦' },
    { code: 'CG', name: 'Congo', nameFr: 'Congo', framework: 'SYSCOHADA', currency: 'XAF', zone: 'CEMAC', flag: '🇨🇬' },
    { code: 'TD', name: 'Chad', nameFr: 'Tchad', framework: 'SYSCOHADA', currency: 'XAF', zone: 'CEMAC', flag: '🇹🇩' },
    { code: 'CF', name: 'CAR', nameFr: 'Centrafrique', framework: 'SYSCOHADA', currency: 'XAF', zone: 'CEMAC', flag: '🇨🇫' },
    { code: 'GQ', name: 'Equatorial Guinea', nameFr: 'Guinée Équatoriale', framework: 'SYSCOHADA', currency: 'XAF', zone: 'CEMAC', flag: '🇬🇶' },
    // Other OHADA
    { code: 'KM', name: 'Comoros', nameFr: 'Comores', framework: 'SYSCOHADA', currency: 'KMF', zone: 'OHADA', flag: '🇰🇲' },
    { code: 'CD', name: 'DR Congo', nameFr: 'RDC', framework: 'SYSCOHADA', currency: 'CDF', zone: 'OHADA', flag: '🇨🇩' },
    { code: 'GN', name: 'Guinea', nameFr: 'Guinée', framework: 'SYSCOHADA', currency: 'GNF', zone: 'OHADA', flag: '🇬🇳' },
  ]

  return NextResponse.json({ jurisdictions, count: jurisdictions.length })
}
