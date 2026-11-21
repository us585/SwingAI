# SwingAI

Swing is a personal AI chat app with saved accounts and conversations, model selection, and an optional Agent mode. This repository includes:

- `server/` — the Node.js server, chat interface, account storage, Agent tools and tests.
- `apple/` — the native SwiftUI Xcode project for iPhone and iPad, with Mac Catalyst enabled. See its README for current feature limitations.
- `windows/` — source for the Windows app launcher.
- `website/` — the SwingAI introduction website and video.

## Start Swing on Windows

Install Node.js 22 or newer, start a compatible AI server with an installed model, then open `server/Start Chat.bat`. Visit the URL printed in the window and create the first Swing account on the PC. See [server/README.md](server/README.md) for full setup, security, and feature details. Run tests with `node --test` inside `server`.

The Apple project and Windows launcher are currently configured to reach `192.168.1.87:3000`. Change the configured address and rebuild if your server has a different address. The server must be running for those clients to connect.

## Notes

The existing server uses HTTP on the local network, so messages and credentials are not encrypted in transit. Use a trusted network. The native Apple project was prepared on Windows and still needs to be built and tested in Xcode. Agent mode supports a limited set of actions, each requiring review and approval.

Runtime data, account records, chats, keys, dependencies, and build output are not included. Keep them out of version control.
