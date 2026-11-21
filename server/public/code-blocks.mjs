// Parse complete Markdown fences only; incomplete fences remain readable as text.
export function splitCodeBlocks(value) {
  const parts = [];
  const lines = value.match(/[^\n]*\n|[^\n]+$/g) || [];
  let text = '', fence = null, code = '', label = '';
  for (const line of lines) {
    const raw = line.replace(/\r?\n$/, '');
    if (!fence) {
      const match = /^ {0,3}(`{3,}|~{3,})([^`~]*)$/.exec(raw);
      if (!match) { text += line; continue; }
      fence = {char:match[1][0], length:match[1].length, opening:line};
      label = match[2].trim().split(/\s+/)[0].slice(0,40);
      code = '';
    } else {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(raw);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) {
        if (text) parts.push({type:'text', content:text});
        parts.push({type:'code', language:label || 'Code', content:code.endsWith('\n') ? code.slice(0,-1).replace(/\r$/, '') : code});
        text = ''; fence = null; code = ''; label = '';
      } else code += line;
    }
  }
  if (fence) text += fence.opening + code;
  if (text) parts.push({type:'text', content:text});
  return parts;
}

export async function copyCode(value) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(value); return true; } catch { /* Try the fallback. */ }
  }
  const field = document.createElement('textarea');
  field.value = value; field.setAttribute('readonly',''); field.className = 'copy-helper';
  document.body.append(field);
  const previous = document.activeElement;
  field.focus(); field.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* Report failure below. */ }
  field.remove(); previous?.focus();
  return copied;
}

export function renderMessageContent(container, value, {codeBlocks = true} = {}) {
  container.replaceChildren();
  for (const part of codeBlocks ? splitCodeBlocks(value) : [{type:'text',content:value}]) {
    if (part.type === 'text') {
      const paragraph = document.createElement('p'); paragraph.textContent = part.content; container.append(paragraph); continue;
    }
    const box = document.createElement('section'); box.className = 'code-block';
    const header = document.createElement('div'); header.className = 'code-header';
    const language = document.createElement('span'); language.textContent = part.language;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'copy-code'; button.textContent = 'Copy';
    button.setAttribute('aria-label', `Copy ${part.language} code`);
    const notice = document.createElement('span'); notice.className = 'sr-only'; notice.setAttribute('role','status');
    button.onclick = async () => {
      const copied = await copyCode(part.content);
      button.textContent = copied ? 'Copied!' : 'Couldn’t copy';
      notice.textContent = copied ? 'Code copied.' : 'Copy failed. Select the code and copy it manually.';
      clearTimeout(button.resetTimer);
      button.resetTimer = setTimeout(() => { button.textContent = 'Copy'; }, 2000);
    };
    const pre = document.createElement('pre'); const code = document.createElement('code'); code.textContent = part.content;
    pre.append(code); header.append(language,button,notice); box.append(header,pre); container.append(box);
  }
}
