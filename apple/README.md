# Swing native Apple app

This is a SwiftUI app with native sign-in, chat, account history, model selection, and connection settings. It talks directly to the Swing API at http://192.168.1.87:3000; it does not use a web view. The Windows PC running the Swing server and AI must stay on and be reachable over the same network.

## Open in Xcode

1. Copy the complete Swing-Xcode folder to your Mac and open Swing.xcodeproj in Xcode.
2. Select the Swing target, open Signing & Capabilities, and select your Apple development team. Change the bundle identifier to a unique one if needed.
3. Select an iPhone or iPad simulator, or connect your device, then press Run. Mac Catalyst is enabled; select the Mac destination if available in your Xcode installation.
4. Keep the Swing server running on the PC. Allow access to your network if requested. Sign in with your existing Swing account.

Change the address at the top of Swing/SwingScreen.swift and rebuild if the PC IP changes. Saved conversations are stored in your existing Swing account. A pending message is saved as a draft before it is sent; completed exchanges are saved after a reply. Existing chat updates are checked by revision and an error is shown if another device changed the same chat. Drafts typed but not yet sent are held in memory and may be lost if you quit or switch chats. The first Swing account must still be created on the server PC.

Agent mode, training-example collection, ratings, export, dark-mode settings, and cancelling a reply are not yet implemented in this native version. Those features remain available in the existing Swing app. The Mac project has not been built in Xcode; signing, compilation, device network permissions, and Mac Catalyst need verification on a Mac.

The configured server uses HTTP. Messages, passwords, and session cookies are not encrypted in transit, so use a trusted network. The app enables HTTP connections in its transport settings so it can reach the existing server; replace HTTP with HTTPS before using it on untrusted networks.
