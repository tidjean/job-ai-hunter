# Job IA Hunter

Application locale pour trouver, scorer et suivre des offres d'emploi remote avec IA.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Stockage: SQLite local
- IA: OpenAI API avec fallback heuristique

## Lancement

1. Copier `backend/.env.example` vers `backend/.env`
2. Renseigner `OPENAI_API_KEY` si tu veux le scoring IA réel
3. Installer les dépendances:

```bash
npm install
```

4. Lancer l'application:

```bash
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:8787`

## Notes

- Les providers `indeed.com`, `fr.indeed.com`, `th.jobsdb.com` et `hk.jobsdb.com` sont inclus, mais ces sites renvoient souvent des pages de protection anti-bot aux scrapers.
- Des sources plus accessibles sont activées par défaut pour garder une application utilisable immédiatement.
- Le scoring, le matching CV et la génération de cover letters passent automatiquement en mode heuristique si aucune clé OpenAI n'est configurée.
