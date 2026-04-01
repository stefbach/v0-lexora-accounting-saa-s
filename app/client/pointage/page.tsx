"use client"
import dynamic from "next/dynamic"
const PointagePage = dynamic(() => import("@/app/rh/pointage/page"), { ssr: false })
export default function ClientPointagePage() { return <PointagePage /> }
