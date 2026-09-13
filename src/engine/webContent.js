// Lets "Сообщение с ИИ" read a URL that shows up in its prompt, so the AI
// can answer using that page's content instead of just guessing.
//
// Pure `fetch` + regex — no DOM parser dependency — so this one file works
// unmodified in both the browser (TestPanel preview) and the Netlify
// function (real bot), same as the rest of src/engine/.
//
// Limitation: this only reads the static HTML that the server returns.
// Pages that render their content with client-side JavaScript (many
// single-page apps) won't have anything useful to extract.

export function extractUrls(text, max = 3) {
  const matches = String(text ?? '').match(/https?:\/\/[^\s)>\]]+/g) || [];
  return [...new Set(matches)].slice(0, max);
}

export async function fetchUrlContent(url, maxLength = 4000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FlowbaseBot/1.0)' },
      redirect: 'follow'
    });
    if (!res.ok) return `(страница ответила ошибкой ${res.status})`;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return `(содержимое не текстовое: ${contentType || 'неизвестный тип'})`;
    }

    const html = await res.text();
    const text = stripHtml(html);
    return text ? text.slice(0, maxLength) : '(страница пустая)';
  } catch (e) {
    // in the browser preview this is usually just CORS blocking the
    // request — it still works from the real bot, which fetches server-side
    return `(не удалось загрузить ${url}: ${e.message})`;
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
