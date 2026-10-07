import React from "react";
import { createRoot } from "react-dom/client";
import { Activity, Fish, Radio } from "lucide-react";
import "./style.css";

function App() {
  return (
    <main className="min-h-screen px-6 py-12 text-slate-900 sm:px-10">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div className="flex items-center gap-3 font-semibold tracking-tight">
          <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Fish aria-hidden="true" size={23} />
          </span>
          <span className="text-lg">JellyTrack</span>
        </div>
        <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-500">
          v3 · Go
        </span>
      </div>

      <section className="mx-auto mt-16 max-w-5xl rounded-3xl border border-white bg-white/80 p-8 shadow-xl shadow-slate-300/30 backdrop-blur sm:mt-24 sm:p-12">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700">
          <Activity aria-hidden="true" size={16} />
          Nouvelle base technique
        </div>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          JellyTrack se prépare pour la v3.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
          Le serveur Go et le frontend embarqué fonctionnent. Les écrans et les
          fonctions de la version actuelle seront portés étape par étape.
        </p>
        <div className="mt-9 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-900">
          <Radio aria-hidden="true" className="shrink-0" size={19} />
          <span>Le serveur est prêt à recevoir les prochaines étapes du portage.</span>
        </div>
      </section>
      <footer className="mx-auto mt-8 max-w-5xl px-1 text-xs text-slate-500">
        Cette page est temporaire; aucune fonction de JellyTrack n’a encore été retirée.
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
