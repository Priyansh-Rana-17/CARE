# CARE: campus issue reporting, safety and operations

Run locally:   node server.js      (Node 18+, no installs)  ->  http://localhost:3000
Single file:   node bundle.js      ->  care-single.js  (everything in one file: node care-single.js)

First run prints the staff logins once. To choose the admin login yourself:
  ADMIN_EMAIL=you@college.edu ADMIN_PASSWORD='a-long-password' node server.js

Your existing data.json is upgraded automatically. Nothing is deleted or reset.

## What is new in 3.2

| Area | What changed |
|------|--------------|
| Sidebar | Light card look, smaller (244px), and it can be closed to an icon strip with the round arrow button; the choice is remembered. Students and staff see a "Response team online" card. |
| Home cards | Student / staff Overview starts with three cards: **Your impact** (issues reported in the last 7 days, bars per day), **Campus health** (share of campus complaints that are resolved + open count) and **Community** (people who backed your reports with "Me too"). Numbers come from `home.js`. |
| Staff members | For staff-member accounts "My reports" is now **Assigned reports**: the complaints whose "Assigned to" is that person (Overview and the list page; the number next to the menu entry counts them). Students are unchanged. Administrators can now assign complaints to staff-member accounts: their names are added to the "Assigned to" list (`home.js`). |
| Compact layout | Smaller cards, hero, buttons and spacing so more fits on the home page. Style changes only. |

## What is new in 3.1

| Area | What changed |
|------|--------------|
| Gmail sharing | Email a report (PDF, optional CSV, links to its Google Doc / Sheet / Drive folder) or **any file from your computer** to anyone, sent from the connected Google account. Buttons: Reports library > Email, the report preview, Integrations > Compose email. Optionally give the recipients view access to the Google Doc/Sheet. Sent emails are listed on the report. Workflows have a new action "Email the generated report". |
| Chat with apps (MCP Apps) | AI & Automation > **Chat with apps**. Answers come with interactive apps inside the chat: a clickable dashboard chart, sortable complaint tables, staff workload bars, a recurring-issues heatmap, a report-builder form and an email form. The same apps appear in any MCP client that supports MCP Apps (`ui://care/...` resources, `_meta.ui.resourceUri` on the tools). |
| Delete options | Complaints (single and bulk; reporters can delete their own until work starts), notes and photos inside a complaint, notifications (one / read / all), finished SOS records, workflow run history, recurring-issue findings, reports (single and bulk, optionally moving their Google files to the Drive trash), sent-email records, and user accounts. The audit log is intentionally **not** deletable. Every delete asks for confirmation, is checked again on the server and is written to the audit log. |
| Tidier data | Complaints: summary strip with one-click filters, building filter, sorting, "show more" paging, duplicates/fake/withdrawn hidden by default, CSV export. Notifications grouped by day. SOS split into Active and History. Audit log searchable with CSV export. Users page with role counts, search and safe delete. Complaint window collapses long histories. |

### Gmail setup (once)
1. In Google Cloud turn on the **Gmail API** (next to Docs, Sheets and Drive).
2. Start CARE as before, then in Integrations **Disconnect** and **Connect Google** again so Google asks for the extra "send email on your behalf" permission (keep it ticked). Until then the Gmail card says "Reconnect needed".
3. Optional limits: `GMAIL_ALLOWED_DOMAINS=college.edu,gmail.com` (only these recipient domains), `GMAIL_MAX_PER_HOUR=30`.

The in-app assistant never sends email by itself: when you ask it to, it opens the email form filled in and a person presses Send. Messages go out from the connected account, so the recipient sees that address as the sender.

### New MCP tools
`send_report_email`, `compose_report_email` (form), `open_report_builder` (form). Tools that show an app: get_complaint_summary, search_complaints, get_overdue_complaints, get_staff_workload, find_recurring_issues. The server also answers `resources/list` and `resources/read` for the apps.

## What is new in 3.0

| Page (who sees it)            | What it does |
|-------------------------------|--------------|
| AI & Automation (admin)       | One sidebar entry and one tab bar that group every automation page: Overview, Workflows, Run history, Recurring issues, AI assistant, Report Studio, Reports library, Integrations. The Overview shows live status (active/failed workflows, reports, Google and AI connection) and what needs attention. Workflow cards are compact; the WHEN/IF/THEN steps open on demand. |
| AI Report Studio (admin)      | Type a request in plain English ("unresolved plumbing complaints this month"). Filters for period, category, building, department, priority, status, staff. Preview, PDF, CSV, Google Doc, Google Sheet, save to Drive. |
| Reports (admin)               | Library of every generated report: search, filter by type/date/source, preview, download, rename, regenerate, delete (with confirmation), shows "Saved locally" or the Drive links. Reports made by workflows appear here too. |
| Integrations (admin)          | Shows what is connected or needs setup: Google Workspace, MCP server, AI provider. Contains the step-by-step setup. |
| Workflow Automation (admin)   | Already existed. Now the actions "Generate report", "Create Google Doc", "Create Google Sheet" and "Save to Drive" really run (the monthly template works). |
| Staff Workspace               | Staff: my tasks (to do / in progress / awaiting verification / overdue / completed), accept, start, progress %, work notes, before/after photos, parts used, mark completed, request reassignment, workload summary. Admin: all teams, reassignment requests, unassigned complaints, completion progress. |
| Analytics (admin)             | Date, category and building filters; KPIs; clickable charts; monthly trend; department comparison; resolution performance; recurring issues; building x category heatmap. All from live data. |
| Intelligence (admin)          | Duplicate detection with "group as one incident" (complaints are kept), root-cause analysis, predictive maintenance, recommendations. Statements counted from data are labelled DATA; rule-based advice is labelled SUGGESTION. |
| Inventory (admin, staff view) | Stock, low-stock alerts, restock, parts used on repairs (linked to the complaint), work orders, repair costs, equipment maintenance history. |
| Complaint lifecycle           | Submitted > Assigned > In progress > **Awaiting verification** > Resolved, plus Reopened. The reporter confirms the fix or reopens it with a reason. If nobody answers in 7 days it closes automatically. Timeline, staff comments, completion note, before/after photos, assignment history. |
| Report form (students)        | While typing, CARE suggests the category, likely priority and team. |

## Google Workspace (Docs, Sheets, Drive)

Uses the official Google REST APIs with OAuth. Until configured, the Integrations page says **Setup required** and Google buttons stay disabled. Nothing is faked.

1. console.cloud.google.com: create a project; enable the Google Docs API, Google Sheets API, Google Drive API and Gmail API.
2. OAuth consent screen: External; add your Google account as a test user.
3. Credentials > Create OAuth client ID > Web application. Authorised redirect URI (shown on the Integrations page):
   http://localhost:3000/api/google/callback        (on a host: https://your-site/api/google/callback)
4. Start CARE:
   GOOGLE_CLIENT_ID=xxxx GOOGLE_CLIENT_SECRET=yyyy node server.js
   On a host also set PUBLIC_URL=https://your-site
5. Integrations > Connect Google.

CARE requests the "drive.file" scope (files it creates), Docs, Sheets and "gmail.send" (send only: CARE cannot read your mailbox). Files go into a Drive folder named "CARE Reports" (change with GOOGLE_DRIVE_FOLDER_NAME). The refresh token is stored in data.json, so protect that file and the DATA_DIR disk.

## MCP (Model Context Protocol)

CARE is an MCP server at POST /mcp (JSON-RPC 2.0: initialize, tools/list, tools/call), protected by a bearer token (Integrations page; or set MCP_TOKEN).
Tools: get_complaint_summary, search_complaints, get_overdue_complaints, get_staff_workload, find_recurring_issues, generate_operations_report, create_google_doc, create_google_sheet, save_report_to_drive, send_report_email, compose_report_email, open_report_builder.
The AI Report Studio assistant calls these same tools, so this works in the app:
"Generate a report of all plumbing complaints from this month, include unresolved issues and average resolution time, create a Google Sheet summary, and save both files to Google Drive."

Desktop AI apps that launch MCP servers as commands (for example Claude Desktop): add to their config
  { "mcpServers": { "care": { "command": "node", "args": ["/full/path/to/mcp-stdio.js"],
      "env": { "CARE_URL": "http://localhost:3000", "CARE_MCP_TOKEN": "<token from Integrations>" } } } }

## Optional AI

Everything works without it (reports are built from your data; requests are understood with built-in rules).
ANTHROPIC_API_KEY=... adds an AI-written summary (tick the box in the Studio; it is always labelled as AI-generated) and lets the assistant plan multi-step requests with the MCP tools. Optional: CARE_AI_MODEL (default claude-sonnet-5-5). When used, report figures and complaint titles go to the provider; reporter names never do.

## Environment variables

  PORT, DATA_DIR, ADMIN_EMAIL / ADMIN_PASSWORD, TRUST_PROXY=1, COOKIE_SECURE=1, NO_DEMO=1   (as before)
  PUBLIC_URL                 public address of the site (used for the Google redirect link)
  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI / GOOGLE_DRIVE_FOLDER_NAME
  MCP_TOKEN                  fixed MCP token (otherwise one is generated and shown to admins)
  GMAIL_ALLOWED_DOMAINS / GMAIL_MAX_PER_HOUR   limit who can receive email and how many per hour (default 30)
  ANTHROPIC_API_KEY / CARE_AI_MODEL / ANTHROPIC_BASE_URL
  CARE_CURRENCY              symbol used in Inventory (default the rupee sign)

Generated reports are stored as files in DATA_DIR/reports/. Back up DATA_DIR (data.json, uploads/, reports/) when hosting.

## Files

  server.js      core server (small hooks added) | reports.js  report engine, PDF, CSV, library
  google.js      Google OAuth, Docs, Sheets, Drive | ops.js  intelligence, analytics, staff, inventory
  mcp.js         MCP server, assistant, workflow actions | mcp-stdio.js  stdio bridge for desktop MCP apps
  app.js, index.html   original frontend | ui-studio.js, ui-ops.js  new pages
  ui-hub.js      AI & Automation hub: sidebar entry, tab bar, Overview page (loaded last)
  mcp-ui.js      the interactive apps shown in the chat (MCP Apps) | tidy.js  every delete action and its rules
  ui-chat.js     Chat with apps (MCP Apps host) | ui-care.js  tidier lists and delete buttons
  home.js        numbers for the home cards | ui-home.js  the three cards on the student / staff Overview
  bundle.js      builds care-single.js

API documentation is served at /api.

## Automatic WhatsApp SOS (new)

Pressing **SOS** now sends the WhatsApp alert to the person's saved trusted contacts by itself. No WhatsApp window opens.
WhatsApp can only be sent through a business API, so one of these must be set once (Google Cloud has no WhatsApp API):

1. Copy `.env.example` to `.env` (same folder as server.js) and fill in **Twilio** (quickest to test) or the **Meta WhatsApp Cloud API**.
2. Restart `node server.js`.
3. Set `PUBLIC_URL` to an address the contacts' phones can open, or the tracking link in the message only works on your own computer.

Notes
- Twilio sandbox: each contact must first send the join code to the sandbox number once. Meta: people who have not messaged your number first can only receive an approved template (set `WA_TEMPLATE`, 4 variables: name, type, place, link).
- Numbers without a country code get `WA_DEFAULT_CC` (default 91). Each number is alerted at most once a minute.
- If no API is set up, the old buttons in the SOS window still open WhatsApp, so an emergency is never left without a way to alert someone.
- The SOS timeline shows "WhatsApp alert sent to N contacts" or the reason a message was not delivered.

## Role dashboards
Student and staff member: Your impact, Campus health, Community. Administrator: Open complaints, Resolution, Emergencies. Maintenance: My tasks, Completed, Awaiting verification. Responder: Active alerts, Response time, Resolved. All numbers are counted from live data (ui-redesign.js, ui-home.js).

### Why WhatsApp still opened (and the fix)
If no WhatsApp API keys are set, CARE cannot send by itself, and no website can: WhatsApp only allows automatic sending through its business API. The SOS window's WhatsApp buttons no longer open WhatsApp; they tell you the keys are missing. After adding keys to `.env`, run `node wa-test.js +91XXXXXXXXXX` to check them, and `node server.js` prints "automatic sending is ON" at start.
