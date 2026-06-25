import { SkeletonPage } from '@/components/ui/skeleton-page'

export default function Loading() {
  return <SkeletonPage variant="table" showKpis kpiCount={2} />
}
