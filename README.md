# Job IA Hunter

Application locale pour trouver, scorer et suivre des offres d'emploi remote avec IA. Intégration CV, génération de cover letters, et gestion de profil candidat.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Bootstrap 5
- **Backend**: Node.js + Express + TypeScript
- **Stockage**: SQLite local (better-sqlite3)
- **IA**: OpenAI API avec fallback heuristique pour scoring/CV/cover letters
- **Scraping**: Playwright + Cheerio (pour les sites complexes)
- **Recherche web**: SerpAPI Google Jobs (optionnel)
- **Parsing**: pdf-parse, mammoth (PDF, DOCX, TXT)

## Démarrage rapide

### Installation

```bash
# Copier la configuration
cp backend/.env.example backend/.env

# Renseigner OPENAI_API_KEY (optionnel pour mode heuristique)
# Installer les dépendances
npm install
```

### Lancement

```bash
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:8787

## Fonctionnalités principales

### 📊 Dashboard
- Vue d'ensemble: nombre total de jobs, répartition par statut (scraped/reviewed/applied)
- Statistiques: taux de matching, tendances par source
- Performance des providers (dernière exécution, taux de succès)

### 🔍 Recherche et scoring
- **10 sources de jobs**:
- **11 sources de jobs**:
  - Remotive, RemoteOK, WeWorkRemotely, Himalayas, ArbeitNow (sans scraping)
  - Indeed (com, fr), JobsDB (th, hk) - avec Playwright
  - Google Jobs search via SerpAPI (optionnel)
  - Demo (pour tests)
- Scoring automatique basé sur:
  - Fit remote (location, fuseau horaire)
  - Match de compensation
  - Fit technique (skills, technos)
  - Type de contrat (employee/contract)
  - Score global 0-100
- Champs d'analyse détaillée: `remoteFit`, `compensationFit`, `techFit`, `contractFit`, `cvScore`

### 👤 Profil candidat
Configurable par le panel Admin:
- **Infos personnelles**: Nom, email, headline, location, timezone
- **Expérience**: Années d'expérience, résumé
- **Préférences**:
  - Remote uniquement (oui/non)
  - Salaire minimum (USD mensuel)
  - Type d'emploi (employee, contract, ou les deux)
  - Secteurs préférés
  - Langues
- **Compétences**:
  - Mots-clés recherchés (IA inclut ces termes dans le scoring)
  - Mots-clés exclus (IA rejette les jobs avec ces termes)

### 📄 Gestion du CV
- **Upload**: PDF, DOCX, ou TXT (limite 8 MB)
- **Extraction**: Texte brut utilisé pour:
  - Matching automatique avec les offres
  - Génération de cover letters contextualisées
- **Stockage**: Sauvegardé localement
- **Gestion**: Voir, télécharger, remplacer par le panel Admin

### 📧 Génération de cover letters
- **Automatique**: Une cover letter par job scoré
- **Contextualisée**: Utilise profil + CV + détails du job
- **Personnalisée**: S'adapte au score (plus détaillée pour les top matches)
- **Configurable**: Seuil minimum pour générer (défaut 70/100)
- **Mode fallback**: Génération heuristique sans OpenAI

### ⚙️ Configuration avancée (Panel Admin)
- **Modèle IA**: Choix du modèle OpenAI (gpt-4o, gpt-4-turbo, gpt-4, gpt-3.5-turbo, etc.)
- **Budget IA**: Budget quotidien max en USD
- **Tracking des coûts**: 
  - Scoring: $0.008 par job
  - Planification de recherche: $0.012 par requête
  - Cover letter: $0.01 par lettre
- **Automatisations** (toutes on/off):
  - Auto-scoring des nouveaux jobs
  - Auto-matching avec le CV
  - Auto-génération de cover letters
- **Seuils de score**:
  - Threshold pour appliquer automatiquement
  - Threshold pour reviewer
  - Threshold pour générer cover letters
  - Threshold pour planifier des recherches (1-10 requêtes par refresh)
- **Configuration des sources**:
  - Activer/désactiver par source
  - Requête de recherche personnalisée
  - Limite de résultats par source
  - Statut auto-disabled (si la source échoue trop)

### 📋 Pages de l'application

| Page | URL | Fonction |
|------|-----|----------|
| **Jobs** | `/` | Listing principal: filtrer par statut/score/source, lire détails, scorer, appliquer, générer cover letter |
| **Dashboard** | `/dashboard` | Statistiques et graphiques (répartition jobs, performance sources) |
| **Admin** | `/admin` | Configuration complète: profil, CV, clé IA, seuils, sources |
| **Logs** | `/logs` | Historique des exécutions de providers (timestamp, résultats, erreurs) |

### 📝 Statuts des jobs
- **Scraped**: Nouvellement trouvé (en attente de scoring)
- **Reviewed**: Manuellemnt ou automatiquement scoré
- **Applied**: Candidature envoyée (suivi manuel)

## Configuration

### Variables d'environnement (`backend/.env`)

```env
# Requis
PORT=8787
DATABASE_PATH=./data/jobs.db

# Optional - IA
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o  # ou gpt-4-turbo, gpt-3.5-turbo, etc.
OPENAI_MAX_RETRIES=3

# Optional - Google jobs provider via SerpAPI
SERPAPI_API_KEY=

# Optional - Sources
PLAYWRIGHT_BROWSER_PATH=/path/to/chrome  # pour Indeed, JobsDB
```

### Provider Google Search
Le provider `Google Jobs search` est désactivé par défaut et utilise SerpAPI pour interroger Google Jobs.

Pour l'activer :
- crée une clé SerpAPI
- renseigne `SERPAPI_API_KEY`
- active ensuite la source `Google Jobs search` dans le panel Admin

Le provider récupère des résultats Google Jobs et les injecte ensuite dans le pipeline habituel de scoring.

### Mode heuristique (sans OpenAI)
Si `OPENAI_API_KEY` n'est pas configurée, l'app passe automatiquement en mode fallback:
- **Scoring**: Heuristique basée sur regex + keywords
- **CV matching**: String matching simple
- **Cover letters**: Templates génériques

## Base de données

### Schéma principal
- `jobs` - Annonces scraped avec scores
- `applications` - Historique des candidatures
- `provider_runs` - Logs des exécutions
- `app_config` - Configuration utilisateur
- `candidate_profile` - Profil candidat
- `cv` - Texte du CV uploadé

## Limitations connues

- **Anti-bot protection**: Indeed et JobsDB peuvent renvoyer des pages de protection. Les sources sans scraping sont activées par défaut.
- **Budget IA**: À configurer selon usage (coûts OpenAI réels)
- **Scheduling**: Pas de scraping automatique planifié (manuel ou via webhook externe)

## Développement

```bash
# Build
npm run build

# Linter (frontend)
npm run lint

# Production
npm run start  # Backend uniquement; frontend servi via Vite preview
```

## Feuille de route (TODO)
- [ ] Scraping automatique planifié
- [ ] Webhook pour intégration externe
- [ ] Export des candidatures (CSV, JSON)
- [ ] Intégration LinkedIn/GitHub
- [ ] Multi-langue (backend/UI)
- [ ] Docker compose pour déploiement
