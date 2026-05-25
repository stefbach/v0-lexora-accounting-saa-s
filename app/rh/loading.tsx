import { SkeletonPage } from '@/components/ui/skeleton-page'

export default function Loading() {
  return <SkeletonPage variant="cards" showKpis kpiCount={4} />
}
