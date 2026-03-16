# Claude.ai Custom Connector Setup

Connect BLS.ai to Claude.ai as a custom MCP connector.

## Prerequisites

- BLS.ai Worker deployed to Cloudflare (`npx wrangler deploy`)
- Note your Worker URL: `https://bls-scenario-server.<account>.workers.dev`

## Steps

1. Go to [Claude.ai](https://claude.ai)
2. Open **Settings** (gear icon)
3. Navigate to **Connectors**
4. Click **"+"** → **Add Custom Connector**
5. Enter:
   - **Name:** BLS.ai
   - **URL:** `https://bls-scenario-server.<account>.workers.dev/mcp`
6. No OAuth needed (public server for v3)
7. Click **Add**

## Usage

Once connected, start a conversation and ask Claude to run a BLS scenario:

> "Run me a witnessed cardiac arrest scenario with a 55-year-old male"

Claude will use the BLS.ai tools to create the scenario, track your actions, and generate a debrief.

## Troubleshooting

- If Claude says "no tools available", verify the Worker is running: `curl https://bls-scenario-server.<account>.workers.dev/`
- If the dashboard doesn't render, the host may not support `ui://` resources — Claude will narrate the scenario conversationally instead.
