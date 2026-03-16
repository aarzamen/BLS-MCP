# Claude Desktop Setup

Two options for connecting BLS.ai to Claude Desktop.

## Option 1: Local stdio (requires local build)

Build the project locally and point Claude Desktop at the compiled server.

```bash
git clone <repo-url>
cd BLS-MCP
npm install
npm run build
```

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bls-scenario": {
      "command": "node",
      "args": ["/path/to/BLS-MCP/dist/index.js"]
    }
  }
}
```

Config file location:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

## Option 2: Remote via mcp-remote (requires deployed Worker)

Connect to the deployed Cloudflare Worker without a local build.

```json
{
  "mcpServers": {
    "bls-scenario": {
      "command": "npx",
      "args": ["mcp-remote", "https://bls-scenario-server.<account>.workers.dev/mcp"]
    }
  }
}
```

This uses the `mcp-remote` package to bridge Claude Desktop's stdio transport to the remote HTTP server.

## Verify

Restart Claude Desktop after editing the config. You should see "bls-scenario" in the MCP servers list. Try:

> "Start a BLS scenario with an opioid overdose patient"
