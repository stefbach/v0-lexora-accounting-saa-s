'use client';
// ============================================================
// app/components/CerveauTIBOK.tsx
// Interface du Cerveau Central — chatbot IA de pilotage global
// Accessible depuis tous les dashboards
// ============================================================

import { useState, useRef, useEffect } from 'react';
import { t, getLocale } from '@/lib/i18n';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  lois_citees?: string[];
  niveau_alerte?: string;
  timestamp: Date;
}

interface Suggestion {
  categorie: string;
  questions: string[];
}

interface CerveauTIBOKProps {
  societeId?: string;
  employeId?: string;
  mode?: 'floating' | 'fullpage' | 'panel';
  titre?: string;
}

export default function CerveauTIBOK({
  societeId,
  employeId,
  mode = 'floating',
  titre
}: CerveauTIBOKProps) {
  const locale = getLocale();
  const titreResolved = titre ?? t('sccl.assistant_lexora', locale);
  const [ouvert, setOuvert] = useState(mode !== 'floating');
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: t('sccl.cerveau_welcome', locale),
    timestamp: new Date()
  }]);
  const [input, setInput] = useState('');
  const [chargement, setChargement] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [categorieActive, setCategorieActive] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/cerveau/suggestions?societe_id=${societeId || ''}`)
      .then(r => r.json())
      .then(d => setSuggestions(d.suggestions || []));
  }, [societeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const envoyer = async (texte?: string) => {
    const question = texte || input.trim();
    if (!question || chargement) return;

    setInput('');
    setChargement(true);

    const userMsg: Message = { role: 'user', content: question, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const historique = messages.slice(-8).map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch('/api/cerveau', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          societe_id: societeId,
          employe_id: employeId,
          historique
        })
      });

      const data = await res.json();

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.reply,
        lois_citees: data.lois_citees,
        niveau_alerte: data.niveau_alerte,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t('sccl.cerveau_error', locale),
        timestamp: new Date()
      }]);
    } finally {
      setChargement(false);
    }
  };

  const couleurAlerte = (niveau?: string) => {
    if (niveau === 'critique') return 'border-l-4 border-red-500 bg-red-50';
    if (niveau === 'attention') return 'border-l-4 border-yellow-500 bg-yellow-50';
    return '';
  };

  // Formatage markdown simple
  const formatMessage = (texte: string) => {
    return texte
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  };

  if (mode === 'floating' && !ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="fixed bottom-6 right-6 z-50 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-4 shadow-lg flex items-center gap-2 transition-all"
      >
        <span className="text-2xl">🧠</span>
        <span className="font-semibold">{t('sccl.assistant_lexora', locale)}</span>
      </button>
    );
  }

  const contenu = (
    <div className={`flex flex-col bg-white rounded-xl shadow-xl overflow-hidden ${
      mode === 'floating' ? 'fixed bottom-6 right-6 z-50 w-[420px] h-[600px]' :
      mode === 'panel' ? 'w-full h-[700px]' :
      'w-full h-screen'
    }`}>
      {/* Header */}
      <div className="bg-indigo-700 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧠</span>
          <div>
            <div className="font-bold">{titreResolved}</div>
            <div className="text-xs text-indigo-200">{t('sccl.cerveau_subtitle', locale)}</div>
          </div>
        </div>
        {mode === 'floating' && (
          <button onClick={() => setOuvert(false)} className="text-indigo-200 hover:text-white text-xl">✕</button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-tr-sm'
                : `bg-white shadow-sm text-gray-800 rounded-tl-sm ${couleurAlerte(msg.niveau_alerte)}`
            }`}>
              <div
                dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                className="leading-relaxed"
              />
              {/* Citations légales */}
              {msg.lois_citees && msg.lois_citees.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {msg.lois_citees.map((loi, j) => (
                    <span key={j} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-mono">
                      {loi}
                    </span>
                  ))}
                </div>
              )}
              <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-indigo-200' : 'text-gray-400'}`}>
                {msg.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {chargement && (
          <div className="flex justify-start">
            <div className="bg-white shadow-sm rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions rapides */}
      {messages.length <= 2 && (
        <div className="px-4 py-2 bg-white border-t border-gray-100">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => setCategorieActive(categorieActive === s.categorie ? null : s.categorie)}
                className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                  categorieActive === s.categorie
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.categorie}
              </button>
            ))}
          </div>
          {categorieActive && (
            <div className="mt-2 space-y-1">
              {suggestions.find(s => s.categorie === categorieActive)?.questions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => { envoyer(q); setCategorieActive(null); }}
                  className="w-full text-left text-xs px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Zone de saisie */}
      <div className="px-4 py-3 bg-white border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && envoyer()}
            placeholder={t('sccl.cerveau_question_placeholder', locale)}
            disabled={chargement}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          />
          <button
            onClick={() => envoyer()}
            disabled={!input.trim() || chargement}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl px-4 py-2.5 transition-colors"
          >
            <span>↑</span>
          </button>
        </div>
        <div className="text-xs text-gray-400 mt-1 text-center">
          {t('sccl.cerveau_footer', locale)}
        </div>
      </div>
    </div>
  );

  return contenu;
}
