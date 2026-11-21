import SwiftUI
import UIKit

private let server = URL(string: "http://192.168.1.87:3000")!
private let ink = Color(red: 0.16, green: 0.29, blue: 0.24)

struct Message: Codable, Identifiable {
    var role: String
    var content: String
    var id: String { role + content }
    enum CodingKeys: String, CodingKey { case role, content }
}
struct Chat: Codable, Identifiable {
    var id: String = UUID().uuidString.lowercased()
    var updated: Double = Date().timeIntervalSince1970 * 1000
    var model: String = ""
    var draft: String = ""
    var messages: [Message] = []
    var revision: Int = 0
}
struct User: Codable { let username: String }
struct AuthStatus: Codable { let signedIn: Bool; let user: User?; let needsSetup: Bool; let canSetup: Bool }
struct OK: Codable { let ok: Bool }
struct ChatsResponse: Codable { let chats: [Chat] }
struct ChatResponse: Codable { let chat: Chat }
struct ModelsResponse: Codable { let models: [String] }
struct Reply: Codable { let content: String }
struct ServerSettings: Codable { let enabled: Bool; let address: String }
struct Failure: Codable { let error: String }
struct Credentials: Encodable { let username: String; let password: String }
struct ChatRequest: Encodable { let model: String; let messages: [Message] }
struct SaveRequest: Encodable { let chat: Chat; let revision: Int }
struct DeleteRequest: Encodable { let id: String; let revision: Int }
struct SettingsRequest: Encodable { let enabled: Bool; let address: String }

@MainActor final class SwingModel: ObservableObject {
    @Published var user: User?
    @Published var needsSetup = false
    @Published var chats: [Chat] = []
    @Published var chat = Chat()
    @Published var models: [String] = []
    @Published var settings = ServerSettings(enabled: true, address: "127.0.0.1:11434")
    @Published var error: String?
    @Published var busy = false
    @Published var checking = false
    @Published var showSettings = false
    @Published var showHistory = false
    private let session = URLSession.shared

    func request<T: Decodable, B: Encodable>(_ route: String, body: B?, as: T.Type) async throws -> T {
        var req = URLRequest(url: server.appendingPathComponent(route))
        req.timeoutInterval = route == "api/chat" ? 190 : 25
        if let user = user { req.setValue(user.username, forHTTPHeaderField: "X-Swing-User") }
        if let body = body {
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw AppError("No response from Swing.") }
        guard (200...299).contains(http.statusCode) else {
            if http.statusCode == 401 && route != "api/auth/login" && route != "api/auth/register" { user = nil }
            throw AppError((try? JSONDecoder().decode(Failure.self, from: data).error) ?? "Request failed (\(http.statusCode)).")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    func get<T: Decodable>(_ route: String, as: T.Type) async throws -> T { try await request(route, body: Optional<String>.none, as: T.self) }
    func check() async {
        checking = true; defer { checking = false }
        do {
            let status = try await get("api/auth/status", as: AuthStatus.self)
            user = status.user; needsSetup = status.needsSetup
            if status.needsSetup && !status.canSetup { error = "Create the first account on the PC running Swing, then sign in here." }
            if user != nil { await reload() }
        } catch { self.error = "Cannot reach Swing at 192.168.1.87:3000. Check that the server is running and this device is on the same network." }
    }
    func signIn(_ name: String, _ password: String, create: Bool) async {
        busy = true; defer { busy = false }
        do {
            let _: OK = try await request(create ? "api/auth/register" : "api/auth/login", body: Credentials(username: name, password: password), as: OK.self)
            let status = try await get("api/auth/status", as: AuthStatus.self)
            user = status.user; error = nil; await reload()
        } catch { self.error = error.localizedDescription }
    }
    func reload() async {
        do {
            chats = try await get("api/chats", as: ChatsResponse.self).chats
            settings = try await get("api/settings", as: ServerSettings.self)
            do { models = try await get("api/models", as: ModelsResponse.self).models } catch { models = [] }
            if chat.model.isEmpty { chat.model = models.first ?? "" }
        } catch { self.error = error.localizedDescription }
    }
    func save(_ snapshot: Chat) async throws -> Chat {
        let result: ChatResponse = try await request("api/chats/save", body: SaveRequest(chat: snapshot, revision: snapshot.revision), as: ChatResponse.self)
        return result.chat
    }
    func send() async {
        let text = chat.draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !chat.model.isEmpty, !busy else { return }
        busy = true; defer { busy = false }
        error = nil
        do {
            // Save the draft first so a network failure does not lose the message.
            chat = try await save(chat)
            let sent = Array(chat.messages.suffix(18)) + [Message(role: "user", content: text)]
            let reply: Reply = try await request("api/chat", body: ChatRequest(model: chat.model, messages: sent), as: Reply.self)
            chat.messages.append(Message(role: "user", content: text))
            chat.messages.append(Message(role: "assistant", content: reply.content))
            chat.draft = ""
            do { chat = try await save(chat) }
            catch { self.error = "The reply is visible but could not be saved: \(error.localizedDescription). Keep this chat open."; return }
            chats = try await get("api/chats", as: ChatsResponse.self).chats
        } catch { self.error = error.localizedDescription }
    }
    func delete(_ item: Chat) async {
        do {
            let _: OK = try await request("api/chats/delete", body: DeleteRequest(id: item.id, revision: item.revision), as: OK.self)
            if chat.id == item.id { newChat() }
            chats = try await get("api/chats", as: ChatsResponse.self).chats
        } catch { self.error = error.localizedDescription }
    }
    func newChat() { let currentModel = chat.model; chat = Chat(); chat.model = currentModel }
    func saveSettings(enabled: Bool, address: String) async {
        busy = true; defer { busy = false }
        do {
            settings = try await request("api/settings", body: SettingsRequest(enabled: enabled, address: address), as: ServerSettings.self)
            models = try await get("api/models", as: ModelsResponse.self).models
            showSettings = false
        } catch { self.error = error.localizedDescription }
    }
    func signOut() async {
        do { let _: OK = try await request("api/auth/logout", body: [String:String](), as: OK.self); user = nil; chat = Chat(); chats = [] }
        catch { self.error = error.localizedDescription }
    }
}
struct AppError: LocalizedError { let message: String; init(_ message: String) { self.message = message }; var errorDescription: String? { message } }

struct SwingScreen: View {
    @StateObject private var model = SwingModel()
    var body: some View {
        Group { if model.user == nil { SignInView(model: model) } else { ChatView(model: model) } }
            .tint(ink).task { await model.check() }
            .alert("Swing", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) { Button("OK") { model.error = nil } } message: { Text(model.error ?? "") }
    }
}
struct SignInView: View {
    @ObservedObject var model: SwingModel
    @State private var name = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var create = false
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                Text("Swing").font(.largeTitle.bold()).foregroundStyle(ink)
                Text(create ? "Create your account." : "Welcome back.").font(.title)
                Text(create ? "Choose a username and a password of at least 5 characters." : "Sign in to start a conversation.").foregroundStyle(.secondary)
                TextField("Username", text: $name).textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder)
                SecureField("Password", text: $password).textFieldStyle(.roundedBorder)
                if create { SecureField("Confirm password", text: $confirm).textFieldStyle(.roundedBorder) }
                Button(create ? "Create account" : "Sign in") {
                    guard !create || (password == confirm && password.count >= 5) else { model.error = "Passwords must match and be at least 5 characters."; return }
                    Task { await model.signIn(name, password, create: create); if model.user != nil { password = ""; confirm = "" } }
                }.buttonStyle(.borderedProminent).disabled(model.busy || model.checking || name.isEmpty || password.isEmpty)
                Button(create ? "Already have an account? Sign in" : "New to Swing? Create an account") { create.toggle(); password = ""; confirm = "" }
                if model.checking { ProgressView("Connecting…") }
                Button("Retry connection") { Task { await model.check() } }.font(.footnote)
            }.padding(28).frame(maxWidth: 470)
        }
    }
}
struct ChatView: View {
    @ObservedObject var model: SwingModel
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack {
                    TextField("Model name", text: $model.chat.model).textFieldStyle(.roundedBorder).disabled(model.busy)
                    if !model.models.isEmpty {
                        Menu("Models") { ForEach(model.models, id: \.self) { name in Button(name) { model.chat.model = name } } }.disabled(model.busy)
                    }
                }.padding()
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 22) {
                            if model.chat.messages.isEmpty {
                                VStack(spacing: 15) {
                                    Image(systemName: "asterisk").font(.system(size: 42)).foregroundStyle(.green)
                                    Text("HELLO, \(model.user?.username.uppercased() ?? "")").font(.caption).tracking(2)
                                    Text("What’s on your mind?").font(.largeTitle)
                                    Text("Ask a question, untangle an idea, or start with a simple hello.").foregroundStyle(.secondary).multilineTextAlignment(.center)
                                }.frame(maxWidth: .infinity).padding(.top, 80)
                            }
                            ForEach(Array(model.chat.messages.enumerated()), id: \.offset) { index, message in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(message.role == "user" ? "YOU" : "SWING").font(.caption.bold()).foregroundStyle(.secondary)
                                    if message.role == "assistant" { MessageContent(text: message.content) }
                                    else { Text(verbatim: message.content).textSelection(.enabled) }
                                }.frame(maxWidth: .infinity, alignment: .leading).padding().background(message.role == "user" ? Color.green.opacity(0.08) : Color.clear, in: RoundedRectangle(cornerRadius: 14)).id(index)
                            }
                            if model.busy { ProgressView("Thinking…").padding() }
                        }.padding()
                    }.onChange(of: model.chat.messages.count) { count in if count > 0 { withAnimation { proxy.scrollTo(count - 1, anchor: .bottom) } } }
                }
                HStack(alignment: .bottom) {
                    TextField("Message Swing…", text: $model.chat.draft, axis: .vertical).lineLimit(1...5).textFieldStyle(.roundedBorder).disabled(model.busy)
                    Button("Send") { Task { await model.send() } }.buttonStyle(.borderedProminent).disabled(model.busy || model.chat.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.chat.model.isEmpty)
                }.padding()
            }
            .navigationTitle("Swing")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) { Button("Chats") { model.showHistory = true }.disabled(model.busy) }
                ToolbarItemGroup(placement: .navigationBarTrailing) {
                    Button { model.newChat() } label: { Image(systemName: "square.and.pencil") }.disabled(model.busy).accessibilityLabel("New chat")
                    Button { model.showSettings = true } label: { Image(systemName: "gearshape") }.disabled(model.busy).accessibilityLabel("Settings")
                }
            }
            .sheet(isPresented: $model.showHistory) { HistoryView(model: model) }
            .sheet(isPresented: $model.showSettings) { SettingsView(model: model) }
        }
    }
}
private struct MessagePart: Identifiable {
    let id: Int
    let text: String
    let language: String?
}
private func messageParts(_ text: String) -> [MessagePart] {
    let source = text as NSString
    let pattern = #"(?m)^ {0,3}(`{3,}|~{3,})([^`~\r\n]*)\r?\n([\s\S]*?)^ {0,3}\1[ \t]*(?:\r?\n|$)"#
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return [MessagePart(id: 0, text: text, language: nil)] }
    let matches = regex.matches(in: text, range: NSRange(location: 0, length: source.length))
    var result: [MessagePart] = [], position = 0
    func add(_ value: String, _ language: String?) { if !value.isEmpty || language != nil { result.append(MessagePart(id: result.count, text: value, language: language)) } }
    for match in matches {
        if match.range.location > position { add(source.substring(with: NSRange(location: position, length: match.range.location - position)), nil) }
        let info = source.substring(with: match.range(at: 2)).trimmingCharacters(in: .whitespacesAndNewlines)
        let language = String((info.split(whereSeparator: { $0.isWhitespace }).first ?? "Code").prefix(40))
        var code = source.substring(with: match.range(at: 3))
        if code.hasSuffix("\n") { code.removeLast(); if code.hasSuffix("\r") { code.removeLast() } }
        add(code, language)
        position = NSMaxRange(match.range)
    }
    if position < source.length { add(source.substring(from: position), nil) }
    return result
}
private struct MessageContent: View {
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(messageParts(text)) { part in
                if let language = part.language { NativeCodeBlock(language: language, code: part.text) }
                else { Text(verbatim: part.text).textSelection(.enabled) }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
private struct NativeCodeBlock: View {
    let language: String
    let code: String
    @State private var copied = false
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(verbatim: language).font(.caption.bold())
                Spacer()
                Button(copied ? "Copied!" : "Copy") {
                    UIPasteboard.general.string = code
                    copied = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
                }.font(.caption).accessibilityLabel("Copy \(language) code")
            }
            ScrollView(.horizontal) { Text(verbatim: code).font(.system(.footnote, design: .monospaced)).textSelection(.enabled).fixedSize(horizontal: true, vertical: false) }
        }.padding(16).foregroundColor(.white).background(Color(red: 0.08, green: 0.09, blue: 0.09), in: RoundedRectangle(cornerRadius: 14))
    }
}
struct HistoryView: View {
    @ObservedObject var model: SwingModel
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                ForEach(model.chats) { chat in
                    Button(chat.messages.first?.content ?? (chat.draft.isEmpty ? "New chat" : chat.draft)) { model.chat = chat; dismiss() }
                        .swipeActions { Button("Delete", role: .destructive) { Task { await model.delete(chat) } } }
                }
            }.navigationTitle("Saved chats").toolbar { Button("Done") { dismiss() } }.task { await model.reload() }
        }
    }
}
struct SettingsView: View {
    @ObservedObject var model: SwingModel
    @State private var enabled = true
    @State private var address = ""
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                Section("Ollama") {
                    Toggle("Ollama connection", isOn: $enabled)
                    TextField("Ollama IP", text: $address).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Text("Off uses the fallback AI server. This setting is shared with other Swing devices.").font(.footnote).foregroundStyle(.secondary)
                    Button("Save connection") { Task { await model.saveSettings(enabled: enabled, address: address) } }.disabled(model.busy)
                }
                Section("Account") { Button("Sign out", role: .destructive) { Task { await model.signOut(); dismiss() } } }
            }.navigationTitle("Settings").toolbar { Button("Done") { dismiss() } }
                .onAppear { enabled = model.settings.enabled; address = model.settings.address }
        }
    }
}
