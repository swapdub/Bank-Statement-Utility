# Expense Analyzer — Web UI

A modern web-based expense analysis tool built on top of [Bank-Statement-Utility](../README.md)'s parsing engine.

## Architecture

```
web/
├── backend/                 # FastAPI + SQLite
│   ├── app/
│   │   ├── main.py          # FastAPI app entry
│   │   ├── database.py      # SQLite + SQLAlchemy setup
│   │   ├── models.py        # DB models (transactions, keywords, categories, tags)
│   │   ├── schemas.py       # Pydantic request/response schemas
│   │   ├── routers/         # API endpoints
│   │   │   ├── upload.py    # Upload & parse bank statements
│   │   │   ├── transactions.py  # Transaction listing & filters
│   │   │   ├── keywords.py  # Keyword management & bulk ops
│   │   │   ├── categories.py    # Category CRUD
│   │   │   ├── tags.py      # Tag CRUD
│   │   │   └── analytics.py # Spending analytics
│   │   └── services/
│   │       ├── parser_bridge.py     # Bridge to bank_statement_utility parsers
│   │       └── keyword_extractor.py # Keyword extraction engine
│   ├── data/                # SQLite DB file (auto-created)
│   └── requirements.txt
├── frontend/                # React + Vite + shadcn/ui
│   └── src/
│       ├── pages/
│       │   ├── UploadPage.tsx       # Upload bank statements
│       │   ├── TransactionsPage.tsx  # Browse & filter transactions
│       │   ├── CategorizePage.tsx    # Keyword → Category management
│       │   └── AnalyticsPage.tsx     # Charts & spending dashboard
│       ├── components/
│       │   └── Layout.tsx    # App shell with nav
│       └── lib/
│           ├── api.ts        # API client
│           ├── types.ts      # TypeScript interfaces
│           └── format.ts     # INR formatting utilities
└── run.sh                   # One-command startup script
```

## Quick Start

### Option 1: One-command startup

```bash
./web/run.sh
```

This will:
1. Create a Python venv and install backend deps
2. Install the parent `bank_statement_utility` package
3. Start the FastAPI server (default: http://localhost:8000, configurable via BACKEND_PORT)
4. Install frontend deps and start Vite (default: http://localhost:5173, configurable via FRONTEND_PORT)
## Configuration

You can configure all ports in a single place: `web/.env`.

- `BACKEND_PORT`: Port for FastAPI backend (default: 8000)
- `FRONTEND_PORT`: Port for Vite frontend (default: 5173)
- `FRONTEND_PORTS`: Comma-separated list of allowed frontend ports or full URLs for backend CORS (default: 5173)

You only need to edit `web/.env`. The startup script will automatically generate the correct `frontend/.env` for you. Do not manually edit `frontend/.env` or `backend/.env` for ports.

See `.env.example` in `web/` for usage.

### Option 2: Manual startup

**Backend:**
```bash
cd web/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install -e ../..  # install bank_statement_utility
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd web/frontend
npm install
npm run dev
```

## User Flow

### 1. Upload
- Select bank and account type from the supported list
- Drag & drop or browse for your statement file (CSV, XLS, XLSX, PDF)
- Files are parsed using the original `bank_statement_utility` parsers
- Transactions are stored in SQLite; keywords are auto-extracted

### 2. Browse Transactions
- View all transactions in a sortable, paginated table
- Quick filters: text search, amount range (> ₹10K, < ₹1K), date range
- Filter by bank, category, or uncategorized

### 3. Categorize
- **Keywords Tab**: View extracted keywords sorted by frequency
  - Select multiple keywords → bulk assign to a category or tag
  - Add custom keywords, mark noise, delete
- **Categories Tab**: Pre-seeded categories (Food, Transport, etc.)
  - Create custom categories with colors
  - See which keywords belong to each bucket
- **Tags Tab**: Create free-form labels for cross-cutting concerns
- Click **"Apply Categories to Transactions"** to propagate keyword→category rules

### 4. Analyze
- Summary cards: Total Spent, Total Received, Net Flow, Categorization %
- Pie chart of spending by category
- Monthly trends (bar chart + line chart)
- Category breakdown with progress bars
- Top keywords

## Categorization Engine

The keyword extraction works as follows:

1. **Tokenization**: Descriptions are split on ` / - _ | : ;` and spaces
2. **Smart splitting**: `IMPS536413258077` → `["IMPS", "536413258077"]` (letter-digit boundaries)
3. **Noise filtering**: Removes pure numbers, single chars, date fragments, common stopwords (TO, FROM, DR, CR, etc.)
4. **Frequency counting**: Each keyword's frequency = number of distinct transactions containing it
5. **Category assignment**: Users assign keywords to categories; each keyword → exactly 1 category
6. **Conflict resolution**: If a transaction matches keywords from multiple categories, the highest-frequency keyword's category wins
7. **Uncategorized view**: Transactions with no keyword matches are highlighted

## Supported Banks

| Bank   | Account Types                | File Formats |
|--------|------------------------------|-------------|
| HDFC   | Saving, Current              | CSV         |
| KOTAK  | Saving, Current, Creditcard  | CSV, PDF    |
| SBI    | Saving, Current, Creditcard  | XLSX, PDF   |
| BOB    | Saving, Current              | XLS         |
| IDBI   | Saving, Current              | XLS         |
| SVC    | Saving, Current              | XLS         |
| YES    | Creditcard                   | PDF         |

## API Documentation

Once the backend is running, interactive API docs are available at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Design Decisions

- **Separation from upstream**: The web app lives in `web/` and *imports* from `bank_statement_utility/` without modifying it. This makes it easy to pull upstream parser changes.
- **SQLite over Cassandra**: Zero-config, file-based, perfect for local expense analysis. No Docker needed.
- **Keyword-based categorization**: More flexible than regex rules. Users see real data tokens and assign meaning, making it accurate and transparent.
