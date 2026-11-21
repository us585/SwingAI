# SwingAI

**A place to think, chat, and take the next small step.**

Swing is a self-hosted AI chat app with account-based conversation history, support for local model servers, and an optional Agent mode. Use it in a browser, try the Windows launcher, or explore the native SwiftUI app for Apple devices.

## What you can do

- **Chat with your models:** select an installed model or enter a custom name. Code replies appear in copyable, language-labeled blocks.
- **Pick up where you left off:** conversations are saved to your account on your Swing server and can be opened from another device.
- **Try Agent mode:** propose a folder or text-file action in your Agent workspace, or review a suggested PC click. Each supported action requires approval.
- **Make it yours:** choose a light or dark theme, configure your model connection, and export your chats.

## Get started

1. Install Node.js 22 or newer and run a compatible AI server with a text model installed.
2. Open `server/Start Chat.bat` on Windows, or run `node server.mjs` inside `server/`.
3. Open the address printed in the terminal. Create the first account on the server PC, then sign in.

For model setup, Agent mode, troubleshooting, and phone access, see the [server setup guide](server/README.md).

> **Network note:** The current server uses HTTP. Messages, passwords, and session cookies are not encrypted in transit. Use a trusted network. The server should not be exposed directly to the public internet.

## Explore the project

| Folder | What's inside |
| --- | --- |
| [server](server/) | Node.js server, browser chat interface, Agent tools, and tests |
| [apple](apple/) | Native SwiftUI project for iPhone and iPad; Mac Catalyst enabled |
| [windows](windows/) | Windows launcher source |
| [website](website/) | SwingAI introduction site and video |

The Apple app is an early version prepared on Windows; it still needs Xcode build and device testing. It does not yet include Agent mode. The Apple and Windows clients currently point to `192.168.1.87:3000`; change that address and rebuild for another server.

## Tests

```sh
cd server
node --test
```

Tests use temporary files and local mock servers. Desktop-click tests do not click your screen.

## Contributing

Ideas and bug reports are welcome through [GitHub Issues](https://github.com/us585/SwingAI/issues). When reporting a problem, describe your device, the steps to reproduce it, and what happened. Please leave out passwords, chat transcripts, and other private information.

Swing is a work in progress. Some features and model behavior depend on the AI server and model you choose.
