"use client"
import dynamic from "next/dynamic"
const CongesPage = dynamic(() => import("@/app/rh/conges/page"), { ssr: false })
export default function ClientCongesPage() { return <CongesPage /> }
