<div align="center">

# 🏰 NPCardGame

### Service Architecture

![Frontend](https://img.shields.io/badge/Frontend-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Backend](https://img.shields.io/badge/Backend-Render-46E3B7?style=for-the-badge&logo=render&logoColor=black)
![Database](https://img.shields.io/badge/Database-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)

![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)

**Request flow:** `Player` ➜ `Vercel (Frontend)` ➜ `Render (Backend)` ➜ `Supabase (Database)`

</div>

---

## 📑 Table of Contents

1. [Architecture Diagram](#-1-architecture-diagram)
2. [Layer Overview](#-2-layer-overview)
3. [Technical Details and Environment Variables](#-3-technical-details-and-environment-variables)
4. [Operations Note](#-4-operations-note)

---

## 📊 1. Architecture Diagram

```mermaid
graph TD
    User["👤 Player / Browser"] -->|HTTPS / WSS| Vercel["⚡ Vercel<br/>Frontend · React · Vite"]
    Vercel -->|REST API / JSON| Render["🚀 Render<br/>Backend · Node.js · Express"]
    Render -->|PostgreSQL / SDK| Supabase["🗄️ Supabase<br/>Database · Auth · Storage"]

    classDef user fill:#1f2937,stroke:#9ca3af,stroke-width:2px,color:#fff;
    classDef front fill:#111827,stroke:#3b82f6,stroke-width:2px,color:#fff;
    classDef back fill:#111827,stroke:#10b981,stroke-width:2px,color:#fff;
    classDef db fill:#111827,stroke:#f59e0b,stroke-width:2px,color:#fff;

    class User user;
    class Vercel front;
    class Render back;
    class Supabase db;
```

---

## 🧱 2. Layer Overview

Vercel and Render each deploy their own directory of the same GitHub repository (shown on the right).

```text
┌──────────────────────────────────────────────┐              ┌──────────────────────────────┐
│                    VERCEL                    │              │       GITHUB REPOSITORY      │
│                (Frontend UI)                 │              ├──────────────────────────────┤
├──────────────────────────────────────────────┤◀── deploys ──│  /frontend                  │
│  • Gacha screen and animations               │              │    React + Vite              │
│  • Local player state management             │              │                              │
└──────────────────────────────────────────────┘              │                              │
                       │                                      │                              │
                       │  (1) HTTP requests / WebSockets      │                              │
                       ▼                                      │                              │
┌──────────────────────────────────────────────┐              │                              │
│                    RENDER                    │              │                              │
│               (Backend Server)               │              │                              │
├──────────────────────────────────────────────┤◀── deploys ──│ 📁 /backend                 │
│  • Game logic and business rules             │              │    Node.js + Express         │
│  • Rate limiting and session validation      │              │                              │
└──────────────────────────────────────────────┘              └──────────────────────────────┘
                       │
                       │  (2) SQL queries and transactions
                       ▼
┌──────────────────────────────────────────────┐
│                  SUPABASE                    │
│             (Database and Auth)              │
├──────────────────────────────────────────────┤
│  • PostgreSQL (cards, inventory, profiles)   │
│  • Supabase Auth and Storage (images)        │
└──────────────────────────────────────────────┘
```

---

## 🔍 3. Technical Details and Environment Variables

| Layer | Hosting | Main Responsibilities | Critical Variables |
| :--- | :---: | :--- | :--- |
| 🎨 **Frontend** | **Vercel** | User interface, fast CDN rendering and real-time interaction. | `VITE_API_URL` |
| ⚙️ **Backend** | **Render** | Service orchestration, gacha rules (UR/LR exclusion, SSR/SR/R drop rates) and security. | `PORT`, `JWT_SECRET`, `SUPABASE_URL` |
| 🗃️ **Database** | **Supabase** | Relational data persistence, user authentication and asset hosting. | `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` |

> [!WARNING]
> `JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are secrets. Keep them server-side only and never commit them to the repository or expose them in the frontend (`VITE_*` variables are public).

---

## 📝 4. Operations Note

> [!NOTE]
> The ecosystem is configured to respect traffic (*egress*) limits and to ensure smooth communication between the client hosted on Vercel and the processing server on Render.
