"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Scale, FileText, Shield, TrendingUp } from "lucide-react"

export default function JuridiquePage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [employes, setEmployes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [action, setAction] = useState<"contrat"|"verification"|null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string|null>(null)
  const [form, setForm] = useState({ employe_id:"",type:"CDI",secteur:"general",date_debut:"",salaire:"" })

  useEffect(() => { fetch("/api/comptable/societes").then(r=>r.json()).then(d=>setSocietes(d.societes||[])) }, [])
  useEffect(() => {
    if (societe) fetch(`/api/rh/employes?societe_id=${societe}`).then(r=>r.json()).then(d=>setEmployes(d.employes||[]))
  }, [societe])

  const genererContrat = async () => {
    const emp = employes.find(e=>e.id===form.employe_id)
    if (!emp||!form.date_debut||!form.salaire) { alert("Champs requis manquants"); return }
    setLoading(true); setResult(null)
    try {
      const res = await fetch("/api/juridique", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"generer_contrat", societe_id:societe, ...form, employe_nom:`${emp.prenom} ${emp.nom}`, poste:emp.poste, salaire:parseFloat(form.salaire) }) })
      const data = await res.json()
      setResult(data.html || "Erreur génération")
    } catch(e) { setResult("Erreur lors de la génération") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold text-[#1E2A4A]">Module Juridique</h1><p className="text-sm text-gray-500">Contrats, KYC, Due Diligence — Droit mauricien (WRA 2019, Companies Act 2001)</p></div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {icon:"📄",label:"Contrats de travail",desc:"CDI, CDD, Temps partiel",action:"contrat" as const},
          {icon:"🔍",label:"Due Diligence",desc:"KYC, AML/CFT",action:null},
          {icon:"💼",label:"Valorisation",desc:"DCF, multiples sectoriels",action:null},
          {icon:"📋",label:"Formalités ROC",desc:"Annual Return, résolutions",action:null},
        ].map(a=>(
          <Card key={a.label} className={`cursor-pointer hover:shadow-md transition-shadow ${action===a.action&&a.action?"border-[#1E2A4A] border-2":""}`} onClick={()=>a.action&&setAction(a.action)}>
            <CardContent className="p-4 text-center">
              <div className="text-3xl mb-2">{a.icon}</div>
              <p className="font-semibold text-[#1E2A4A] text-sm">{a.label}</p>
              <p className="text-xs text-gray-500 mt-1">{a.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {action==="contrat" && (
        <Card>
          <CardHeader><CardTitle className="text-[#1E2A4A] flex items-center gap-2"><FileText className="w-4 h-4"/>Générer un contrat de travail</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Société</Label><Select value={societe} onValueChange={setSociete}><SelectTrigger><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Employé</Label><Select value={form.employe_id} onValueChange={v=>setForm(f=>({...f,employe_id:v}))}><SelectTrigger><SelectValue placeholder="Choisir..."/></SelectTrigger><SelectContent>{employes.map(e=><SelectItem key={e.id} value={e.id}>{e.prenom} {e.nom}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Type contrat</Label><Select value={form.type} onValueChange={v=>setForm(f=>({...f,type:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["CDI","CDD","Temps_partiel","Consultant","Stage"].map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Date début *</Label><Input type="date" value={form.date_debut} onChange={e=>setForm(f=>({...f,date_debut:e.target.value}))}/></div>
              <div><Label>Salaire brut MUR *</Label><Input type="number" value={form.salaire} onChange={e=>setForm(f=>({...f,salaire:e.target.value}))}/></div>
              <div><Label>Secteur</Label><Select value={form.secteur} onValueChange={v=>setForm(f=>({...f,secteur:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["general","sante","bpo","tech","retail","finance"].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <Button onClick={genererContrat} disabled={loading} className="bg-[#1E2A4A] text-white">{loading?<><Loader2 className="w-4 h-4 animate-spin mr-2"/>Génération en cours...</>:"Générer le contrat (IA)"}</Button>
            {result && (
              <div className="border rounded-lg p-4 bg-gray-50 max-h-96 overflow-y-auto">
                <div className="flex justify-between mb-2">
                  <p className="text-sm font-semibold text-[#1E2A4A]">Contrat généré</p>
                  <Button size="sm" variant="outline" onClick={()=>{const b=new Blob([result],{type:"text/html"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="contrat.html";a.click()}}>Télécharger</Button>
                </div>
                <div className="text-xs text-gray-600 prose prose-sm max-w-none" dangerouslySetInnerHTML={{__html:result}}/>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
