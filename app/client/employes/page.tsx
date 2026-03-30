"use client"
import dynamic from "next/dynamic"
const EmployesPage = dynamic(() => import("@/app/rh/employes/page"), { ssr: false })
export default function ClientEmployesPage() { return <EmployesPage /> }
