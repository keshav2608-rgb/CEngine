# CEngine — Real-Time Messaging Platform

CEngine is a modern, high-performance, real-time messaging web application built with **Next.js (App Router)**, **Node.js/Express**, **Socket.IO**, and **PostgreSQL (Prisma ORM)**.

Architected for clean separation of concerns, high reliability, low-latency WebSocket communication, and effortless future deployment on **Render**, **Neon**, **Vercel**, and **Cloudflare R2**.

---

## 🚀 Key Features

### 1. Accounts & Authentication
- **Secure Authentication**: Sign up and login with email & password (hashed using `bcryptjs` with work factor 12) or Google OAuth flow.
- **JWT Session Management**: Short-lived access tokens (`15m`) paired with secure, database-persisted refresh tokens (`7d`) featuring token rotation.
- **Email Verification**: Token-based email verification flow with console preview links in development.
- **Password Reset**: Secure forgot-password and reset-password token workflows.
- **User Profiles**: Custom display names, avatar upload support, and customizable presence statuses (*"Available"*, *"In a meeting"*, etc.).
- **Privacy First**: Complete account deletion & cascading data wipe from day one.

### 2. Real-Time Messaging & Chat
- **1:1 Direct Chats**: Instant peer-to-peer conversations with automatic room provisioning.
- **Group Chats**: Create groups, custom group descriptions, avatars, and member management.
- **Group Roles & Permissions**:
  - `OWNER`: Full control, can promote admins, remove members, or transfer ownership upon departure.
  - `ADMIN`: Can add members, edit group metadata, and moderate regular members.
  - `MEMBER`: Regular participant with message controls.
- **Browser-Based Invite Links**: Shareable invite links (`/invite/[code]`) that allow anyone to join a group straight from a web browser without installing anything.
- **WebSocket Delivery**: Powered by **Socket.IO** with automatic reconnection, heartbeat pings, and graceful fallbacks.
- **Message States (Receipts)**:
  - Single check: **Sent**
  - Double gray check: **Delivered**
  - Double green check: **Read**
- **Typing Indicators**: Real-time *"User is typing..."* events with debounced status dispatch.
- **Presence Tracking**: Live online/offline tracking with state synchronization.
- **Message Actions**:
  - Edit own messages (with `(edited)` tag).
  - Delete messages (with clean placeholder state).
  - Reply to specific messages (with quotation preview banner).
- **Cursor-Based Pagination**: Smooth upward scroll loading older messages without jumping.
- **Extensible Metadata**: Messages include structured JSON `metadata` for future features (polls, encrypted payloads, voice notes, reaction records).

### 3. Media & Uploads
- **Image & File Uploads**: Image preview rendering and download cards for attachments (PDF, DOCX, ZIP, TXT).
- **Validation**: Strict MIME-type checking and configurable file size limits (default 15MB).
- **Dual-Storage Provider**:
  - **Local Disk Fallback**: Zero-configuration local development serving uploads from `/uploads`.
  - **Cloudflare R2 / AWS S3**: Seamless S3-compatible cloud storage via `@aws-sdk/client-s3` when credentials are provided.

### 4. Safety & Non-Functional
- **XSS Protection**: HTML sanitization on all message bodies and user inputs.
- **Rate Limiting**: Configurable rate limits on sensitive authentication and general API endpoints.
- **Responsive Mobile UI**: Mobile-first design with drawer/navigation transitions.
- **PWA Ready**: Web App Manifest (`manifest.json`) and mobile meta tags for home screen installation.

---

## 📁 Project Architecture

```
CEngine/
├── client/                     # Next.js Frontend (App Router, Tailwind CSS, Lucide)
│   ├── src/
│   │   ├── app/                # Next.js App Router Pages
│   │   │   ├── (auth)/         # Login, Register, Verify, Forgot, Reset
│   │   │   ├── chat/           # Dual-pane real-time chat interface
│   │   │   ├── invite/[code]/  # Browser group invite landing
│   │   │   └── manifest.json   # PWA manifest
│   │   ├── components/
│   │   │   ├── chat/           # Sidebar, ChatHeader, MessageList, MessageItem, MessageInput
│   │   │   ├── modals/         # NewChat, CreateGroup, GroupDetails, Profile
│   │   │   └── ui/             # Avatar, Modal
│   │   └── lib/                # API client, Socket client, Auth & Chat React contexts
│   └── .env.example
│
├── server/                     # Node.js + Express + Socket.IO Backend
│   ├── prisma/
│   │   └── schema.prisma       # PostgreSQL schema (Users, Rooms, Members, Messages, Receipts, Attachments)
│   ├── src/
│   │   ├── config/             # Typed environment configuration
│   │   ├── controllers/        # Request controllers
│   │   ├── db/                 # Prisma singleton
│   │   ├── middlewares/        # Auth, rate limiting, error handling, validation
│   │   ├── routes/             # RESTful API routers
│   │   ├── services/           # Business logic (Auth, Chat, Message, Storage, Presence)
│   │   ├── sockets/            # Socket.IO event handlers and rooms
│   │   └── index.ts            # Server entrypoint
│   └── .env.example
│
├── package.json                # Root convenience scripts
└── README.md
```

---

## 🛠️ Local Development Quickstart

### Prerequisites
- **Node.js** v18+ (tested on v24)
- **PostgreSQL Database** (e.g., a free instance from [Neon](https://neon.tech), Supabase, Render Postgres, or local PostgreSQL)

### 1. Configure the Backend

Navigate to `server/` and create `.env` from `.env.example`:

```bash
cd server
copy .env.example .env
```

Edit `server/.env` with your PostgreSQL database URL:

```env
DATABASE_URL="postgresql://user:password@ep-sample.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

Push the database schema and generate Prisma client:

```bash
npx prisma db push
```

Start the backend server in development watch mode:

```bash
npm run dev
# Server will run at http://localhost:5000
```

### 2. Configure the Frontend

In another terminal, navigate to `client/`:

```bash
cd client
copy .env.example .env.local
```

Start the Next.js development server:

```bash
npm run dev
# Frontend will run at http://localhost:3000
```

### 3. Using Convenience Scripts from Root

From the root `CEngine/` folder:

```bash
# Run server
npm run dev:server

# Run client
npm run dev:client
```

---

## 🌐 Deployment Guide

### Database (Neon PostgreSQL)
1. Create a free project at [neon.tech](https://neon.tech).
2. Copy the Connection String (`postgresql://...sslmode=require`).
3. Set this as `DATABASE_URL` in your backend environment variables.
4. Run `npx prisma db push` or `npx prisma migrate deploy`.

### Backend (Render Free Web Service)
1. Push your repository to GitHub.
2. In Render, create a new **Web Service**.
3. Set the **Root Directory** to `server`.
4. Set **Build Command** to `npm install && npm run build`.
5. Set **Start Command** to `npm start`.
6. Add environment variables:
   - `DATABASE_URL`: *(Your Neon PostgreSQL URL)*
   - `JWT_ACCESS_SECRET`: *(A random 64-char string)*
   - `JWT_REFRESH_SECRET`: *(A random 64-char string)*
   - `CLIENT_URL`: `https://your-frontend.vercel.app`
   - `STORAGE_PROVIDER`: `local` or `s3`
7. *Render supports WebSockets on free-tier services.*

### Frontend (Vercel / Netlify / Cloudflare Pages)
1. In Vercel, import your GitHub repository.
2. Set **Root Directory** to `client`.
3. Framework Preset: **Next.js**.
4. Add environment variables:
   - `NEXT_PUBLIC_API_URL`: `https://your-render-backend.onrender.com/api`
   - `NEXT_PUBLIC_SOCKET_URL`: `https://your-render-backend.onrender.com`
5. Deploy!

### Media Storage (Cloudflare R2 / S3)
To enable Cloudflare R2:
1. Create an R2 bucket in Cloudflare.
2. Create an API Token with Read & Write permissions.
3. Configure the following variables in the backend:
   ```env
   STORAGE_PROVIDER="s3"
   S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
   S3_BUCKET="cengine-media"
   S3_ACCESS_KEY_ID="<key-id>"
   S3_SECRET_ACCESS_KEY="<secret-key>"
   S3_PUBLIC_URL="https://pub-<hash>.r2.dev"
   ```

---

## 🔒 Security Best Practices Implemented
- Passwords hashed with `bcrypt` (12 rounds).
- HTTP-only cookies for refresh tokens.
- Cross-Site Scripting (XSS) prevention via `sanitize-html`.
- Express rate limiting for sensitive auth routes and general endpoints.
- Strict room membership and sender authorization checks before persisting or emitting any message.
- Full cascading data deletion for account privacy compliance.
