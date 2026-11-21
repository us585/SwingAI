const PREFIX = 'shant-chat:v1:';
export function createChatStore(storage) {
  function valid(chat) {
    return chat && typeof chat.id === 'string' && typeof chat.updated === 'number' &&
      typeof chat.model === 'string' && typeof chat.draft === 'string' && Array.isArray(chat.messages) &&
      chat.messages.length % 2 === 0 && chat.messages.every((m, i) => m && m.role === (i % 2 ? 'assistant' : 'user') && typeof m.content === 'string');
  }
  return {
    save(chat) {
      if (!valid(chat)) throw Error('Invalid chat');
      storage.setItem(PREFIX + chat.id, JSON.stringify(chat));
      storage.setItem('shant-chat:current', chat.id);
    },
    list() {
      const chats = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        try {
          const chat = JSON.parse(storage.getItem(key));
          if (valid(chat) && key === PREFIX + chat.id) chats.push(chat);
        } catch { /* Preserve unreadable entries rather than overwrite them. */ }
      }
      return chats.sort((a, b) => b.updated - a.updated);
    },
    current() { return storage.getItem('shant-chat:current'); },
    select(id) { storage.setItem('shant-chat:current', id); },
    remove(id) { storage.removeItem(PREFIX + id); }
  };
}
