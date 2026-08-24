/**
 * components/operations — design system partagé des tableaux de bord
 * "Opérations" (inventaire, POS, production, jobs).
 *
 * Point d'entrée unique : les 4 modules importent depuis
 * `@/components/operations`.
 */

export {
  formatMUR,
  formatNumber,
  formatPct,
  signedClass,
  severityColor,
  severityRank,
  hexToRgba,
  SEVERITY_ORDER,
  type Severity,
  type SeverityPalette,
} from './format'

export { KpiCard, KpiGrid, type KpiCardProps, type KpiGridProps, type KpiTrend } from './kpi'
export { SectionCard, ChartCard, type SectionCardProps, type ChartCardProps } from './section'
export { OpsEmpty, OpsSkeleton, type OpsEmptyProps, type OpsSkeletonProps } from './states'
export { AlertsPanel, type AlertsPanelProps, type AlertItem } from './alerts'
export {
  OperationsInsights,
  type OperationsInsightsProps,
  type OperationsModule,
  type OperationsInsight,
} from './insights'
