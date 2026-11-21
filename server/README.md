# Swing — local text chatbot

A small HTML/CSS/JavaScript page with a dependency-free Node.js backend. No npm install, external account, API key, or build step is needed. Create a private Swing account on first use. Ollama and a downloaded text model must run separately.

## Windows: setup and run

**Already have Node.js, Ollama, and a model?** Double-click `Start Chat.bat`, keep its window open, then visit http://127.0.0.1:3000. The page needs this local server running; opening the HTML file directly does not start it.

1. Install a current Node.js LTS release (22 or newer) from https://nodejs.org/ and Ollama from https://ollama.com/download/windows. Open a new PowerShell window after installation.
2. Open Ollama from the Start menu. Download a small starter model:

   ```powershell
   ollama pull llama3.2:1b
   ollama list
   ```

   This download uses internet and disk space. You can choose another installed local text model in the page. Speed and quality depend on your hardware and model.

3. Extract the project ZIP. Open the `shant-chat` folder, right-click empty space and choose **Open in Terminal**, or use `cd` with its full path:

   ```powershell
   cd "C:\path\to\shant-chat"
   node server.mjs
   ```

4. Open **http://127.0.0.1:3000** in your browser. Select a model, type a message, and click **Send**. Keep the terminal open. Do not open index.html directly.
5. Press **Ctrl+C** in the terminal to stop the webpage server. Ollama runs separately.

Next time, open Ollama and repeat steps 3–4. No model download is needed again.

## Using the page

### Sign in

Use **Create an account** on the sign-in page. Choose a username (3-32 letters, digits, underscores or hyphens), a password of at least 5 characters, and confirm it. The first account must be created on the PC through http://127.0.0.1:3000/. Once it exists, additional accounts can be created from phones and tablets on your Wi-Fi. Username matching is case-insensitive and duplicate names are rejected. Password hashes are stored in data/account.json for the original account and data/accounts/ for later accounts. Never share the data folder. Existing credentials continue working. Sessions expire after seven days or when the server restarts. Sign out revokes the current session. Chats and drafts are saved per account on the PC server and load on every device signed into that account. Preferences and collected training/feedback data still stay in each browser. Existing browser chats migrate to the matching signed-in account; original browser data belongs to the original account. Shared Ollama settings still affect every signed-in account.

This is local HTTP, not HTTPS: passwords and session cookies are not encrypted in transit. Use trusted Wi-Fi and a password unique to Swing. HTTPS is needed for untrusted networks. Chat history is stored in data/chats/ on the PC, separated by account. Signing out does not delete it. Back up the entire data folder privately; the chat files are not encrypted at rest. There is no email-based password recovery. If you forget the password, stop the server and rename `data/account.json` to a backup file on the PC, then restart and create the account again through loopback. This also invalidates existing sessions.

### iPad and iPhone

Keep this PC awake with Swing and the AI server running. Join the same Wi-Fi on your phone or tablet and open **http://192.168.1.87:3000/** in Safari. This is the PC's current Wi-Fi address and may change after reconnecting. The server prints available addresses at startup. Do not type 0.0.0.0 or 127.0.0.1 on the mobile device. Chats sync through the signed-in account. Theme preferences remain separate in each browser. The Ollama address is still relative to the PC, normally 127.0.0.1:11434.

**Settings → Appearance & data:** Dark mode changes the theme and persists in this browser. Save chats defaults on; off pauses new chat/draft saves without deleting older chats. Turning it back on saves the current conversation. Training collection and local feedback default off and operate independently of chat saving. Training collection stores future prompt/context/reply examples for JSONL export, not model fine-tuning. Feedback enables Helpful / Not helpful buttons; clicking one saves that prompt/reply and rating for review/export. Neither feature automatically changes the model or sends data to OpenAI. Export chats backs up saved conversations as JSON. Clear collected data removes only training/feedback collections, after confirmation. Delete saved chats separately with their × buttons. Preferences and collections live in this browser's local storage; they do not sync between devices.

- Open **Settings → Ollama** to choose the connection mode. On uses the configured Ollama IP with its native API. Off keeps AI available through an OpenAI-compatible local server at 127.0.0.1:11434 using /v1/models and /v1/chat/completions. This does not stop the Ollama app or create an AI server: one must be running at the active address. Currently both default addresses point to the same installed Ollama service. Other local servers can serve the fallback interface if they support these endpoints without authentication. The switch applies to all tabs until the backend restarts. Enter a private IPv4 address for the Ollama mode and click Save address. Use the model dropdown in the bottom message bar to select a model reported by the active server, or choose **Custom** to type an exact model name. Refresh models updates the list.

- Enter sends; Shift+Enter inserts a line break.
- Stop cancels the browser request and aborts the backend's Ollama request. Ollama may take a moment to release ongoing work.
- Chats, drafts, and each chat model are saved automatically to the signed-in account on the PC. New chat keeps earlier conversations in the Saved chats sidebar. Click a saved chat to reopen it; its x button deletes it from the account across devices. The sidebar refreshes every 10 seconds and when returning to the page; reopen a chat to load changes from another device. Concurrent edits are preserved as separate chats rather than overwritten. Pending drafts are saved after a short typing pause; wait for Saved before closing. An in-progress AI reply cannot resume after reload.
- Refresh models updates the list after a download. Model changes apply to the next message with existing history; use New chat for a fresh conversation.
- Replies appear when complete, rather than token by token. Only the latest nine completed exchanges are sent with your next message. Full transcripts remain saved; only the most recent nine exchanges are sent to the model. Saved conversations do not create shared memory between separate chats.
- This is text chat only. Model output is displayed as plain text, including code and Markdown; it is never executed.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| `node` or `ollama` not recognized | Install the app, then reopen PowerShell. Check with `node --version` and `ollama --version`. |
| Cannot reach Ollama | Open Ollama from Start. If needed, run `ollama serve` in a separate terminal. If it says the address is in use, Ollama is probably already running. |
| No local models | Run `ollama pull llama3.2:1b`, wait for completion, then click Refresh models. |
| Port 3000 is in use | In PowerShell run `$env:PORT="3001"`, then `node server.mjs`. Open http://127.0.0.1:3001. |
| Slow reply or timeout | The first request loads the model. Use a smaller model or shorter conversation. Requests have a three-minute timeout. |
| No text returned | Choose a text chat model. Thinking-heavy models may exhaust the output limit before producing a final answer. |
| Conversation too large | Click New chat or shorten your prompt. Each message allows 12,000 characters; a request allows 64 KiB. |
| Another reply is running | Wait briefly, especially after Stop. The backend allows one generation at a time across tabs. |

## Files and architecture

```text
Browser → localhost Node server → localhost Ollama

public/index.html   Page structure
public/style.css    Responsive design
public/app.js       Chat state, rendering, requests
server.mjs          Static files and validated Ollama proxy
server.test.mjs     Integration checks using a mock Ollama server
package.json        Optional npm start / npm test shortcuts
```

In Ollama mode, the backend uses Ollama's `GET /api/tags` and `POST /api/chat` with `stream: false`. The upstream address defaults to `http://127.0.0.1:11434` and can be changed through validated Settings. Redirects are blocked. Requests use HTTP; choose a trusted machine on your private network.

## Local safety and limits

- The server binds to 0.0.0.0 for home-network access. It validates Host against this PC's addresses and enforces same-origin API requests. Sign-in protects the chat page and model, chat, and settings APIs. Use trusted Wi-Fi and do not port-forward it to the internet.
- Only explicitly listed static files and API routes are exposed. Input size, message roles, model name, generation length, and concurrent generation are limited. Request fields are rebuilt explicitly; browser-supplied tools, system prompts, or URLs are not forwarded.
- A Content Security Policy and text-only rendering prevent replies from running HTML or scripts. The app never executes generated code. Agent desktop actions use a fixed Windows PowerShell helper for screenshot capture and a single approved click; model text is never interpreted as a command.
- Use downloaded local models. Names containing `cloud` are excluded as a basic guard, not a guarantee about custom Ollama configuration. Ollama itself controls its models, networking, and logs. This app adds no analytics or third-party assets.
- Conversation history is bounded; this is not long-term memory. Output is capped at 1,024 tokens with an 8,192-token context setting. Models may handle these settings differently.

## Verification

Run `node --test` from the project folder. Tests use a temporary local mock, require no model download, and cover successful chat forwarding, model listing, origin/host rejection, invalid messages, oversized requests, static-file isolation, and Ollama errors.

For a real check, run the app and ask “Reply with hello.” Then ask “What did I ask you to say?” to check conversation context.

## Future extensions

Vision would require image upload validation and a vision-capable model. Coding features could add safe Markdown formatting and copy buttons. Agent mode supports the limited, approved actions described below; it is not an unattended desktop agent.

Fallback API reference: https://docs.ollama.com/api/openai-compatibility

Official references: https://docs.ollama.com/windows · https://docs.ollama.com/api/chat · https://docs.ollama.com/api/tags







## Agent mode

Turn on **Agent** above the green star, then start a message with **@Files** or **@Computer**. Typing @ opens the feature menu. Agent mode starts off for each sign-in session. Turning it off revokes pending proposals. Every action is reviewed separately; it never runs a chain of actions unattended.

- **@Files**: create folders, read text files, or create/replace text files in `data/agent-workspaces/<username>/` on the PC. Other accounts have separate workspaces. Paths are relative to that folder. Files are limited to 32 KB. Parent folders must already exist before writing files. Before editing, ask the agent to read the file; existing and proposed contents appear in the approval dialog. Read content becomes part of chat history and may be sent to the configured model on your next message. Saved chats can therefore contain file contents.
- Example: `@Files create a folder called Notes`, then `@Files create Notes/hello.txt containing Hello from Swing`.
- **@Computer**: available to the original account through localhost or any local-network address printed by the Windows server. You can also use it from a phone or tablet on your trusted Wi-Fi. It always controls the server PC, not the device displaying the webpage. Other accounts can use @Files but cannot control the desktop. It captures the primary screen, lets you review it before sharing with the configured AI server, then asks a vision-capable model to propose one click. Ordinary text-only models cannot interpret screenshots reliably.
- Capture and approved click each wait 5 seconds: bring the intended window to the front during that delay. Check the proposed coordinates and screenshot. Cancel if the desktop has changed or the click is not safe. This first version supports only one left click at a time: no keyboard typing, app launching, shell commands, or automatic multi-step workflows.
- Proposals expire after 5 minutes; screenshot approvals expire after 2 minutes. Model output is validated, bound to the account, and stored on the server; the browser cannot change an approved action by submitting different file content. Existing files changed since preview require a fresh proposal.
- The primary-screen screenshot is held temporarily in memory, not saved in chat storage. The model provider you configure may log requests. Approve sending only screenshots you intend to share with that server.
- Agent workspace files are real files on the PC, independent of browser chat saving. The app provides no delete/execute tools. Review replacements carefully; there is no built-in undo for an approved file overwrite or desktop click.

Run `node --test` to verify account isolation, approval, cancellation, path validation, conflict detection, and the existing chat behavior. Desktop clicks are intentionally not executed by automated tests.

## Account chat storage and migration

Chats are stored under `data/chats/` using account-derived filenames. Authenticated requests always use the signed-in account; clients cannot select another account. Saves use revision checks and atomic file replacement. Each chat is limited to 2 MB, with 50 MB per account including migration/deletion records.

On first load, existing chats from this browser and site address are uploaded to the matching account. Each browser record is removed only after its server import succeeds. Retries are idempotent; different versions are preserved as separate chats, and deleted chats are not resurrected by reimport. If an import fails, the old browser copy remains and a notice is shown. Open each previously used browser/address once while signed in to migrate its old history. Never clear old browser storage before migration succeeds.

The Save chats switch still pauses new saves in that browser without deleting existing account chats. Training examples, feedback collections and appearance settings remain browser-local. This is synchronization through your own running PC server, not cloud hosting: keep the PC awake and the server running for other devices to access chats.
