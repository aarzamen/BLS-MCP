# ChatGPT Setup

Two modes: developer mode (testing) and App Directory (production).

## Developer Mode (Pre-Approval)

For testing before App Directory approval:

1. Go to [ChatGPT](https://chatgpt.com)
2. Open **Settings** → **Developer Mode** (or **Beta Features**)
3. Add a custom MCP connector
4. Enter **MCP Server URL:** `https://bls-scenario-server.<account>.workers.dev/mcp`
5. Test by asking: "Run me a BLS cardiac arrest scenario"

## App Directory Submission

For public availability via the ChatGPT App Directory:

1. Go to [platform.openai.com](https://platform.openai.com) → **Apps**
2. Click **Create New App**
3. Fill in submission details from `docs/chatgpt-submission.md`
4. Upload logo (512x512 PNG)
5. Upload screenshots (3-5)
6. Enter the MCP server URL
7. Add the domain verification token:
   ```bash
   npx wrangler secret put OPENAI_VERIFICATION_TOKEN
   # Paste the token provided by OpenAI
   ```
8. Submit for review

## Test Cases

Refer to `docs/chatgpt-test-cases.md` for the required positive and negative test cases.

## Post-Approval

Once approved, the app will be available in the ChatGPT App Directory. Users can enable it from their ChatGPT settings without any configuration.
