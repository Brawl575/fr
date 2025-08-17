export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== 'POST') {
      if (request.method === 'GET' && url.searchParams.has('msg')) {
        // Старый GET ?msg= — оставляем без защиты (можно добавить при желании)
        return new Response('GET not supported except for ?msg=', { status: 405 });
      }
      return new Response('Use POST method', { status: 405 });
    }

    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return new Response("Content-Type must be application/json", { status: 415 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Проверка embeds
    if (!body.embeds || !Array.isArray(body.embeds) || body.embeds.length !== 1) {
      return new Response("Invalid embeds array", { status: 400 });
    }

    const embed = body.embeds[0];

    // Разрешённые ключи
    const allowedEmbedKeys = ["title", "color", "fields", "footer"];
    for (const key of Object.keys(embed)) {
      if (!allowedEmbedKeys.includes(key)) {
        return new Response(`Invalid embed key: ${key}`, { status: 400 });
      }
    }

    // Проверка заголовка
    if (embed.title !== "Nameless Pet Notifier") {
      return new Response("Invalid title", { status: 400 });
    }

    // Цвет = число
    if (typeof embed.color !== "number") {
      return new Response("Invalid color", { status: 400 });
    }

    // Footer (если есть)
    if (embed.footer) {
      if (typeof embed.footer.text !== "string") {
        return new Response("Invalid footer", { status: 400 });
      }
    }

    // Проверка полей
    if (!Array.isArray(embed.fields) || embed.fields.length < 5) {
      return new Response("Invalid fields array", { status: 400 });
    }

    const allowedFieldNames = [
      "🪙 Name:",
      "📈 Generation:",
      "👥 Players:",
      "🔗 Server Link:",
      "📱 Job-ID (Mobile):",
      "💻 Job-ID (PC):",
      "📲 Join:"
    ];

    const blacklist = ["dragon", "cannelloni"];

    for (const field of embed.fields) {
      if (
        !allowedFieldNames.includes(field.name) ||
        typeof field.value !== "string"
      ) {
        return new Response(`Invalid field: ${field.name}`, { status: 400 });
      }

      if (field.inline !== undefined && typeof field.inline !== "boolean") {
        return new Response(`Invalid inline value in: ${field.name}`, { status: 400 });
      }

      // ❌ УБРАНА проверка на количество игроков

      for (const badWord of blacklist) {
        if (
          field.name.toLowerCase().includes(badWord) ||
          field.value.toLowerCase().includes(badWord)
        ) {
          return new Response(`Blacklisted word detected: ${badWord}`, { status: 400 });
        }
      }
    }

    // Отправка в Discord
    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: body.embeds })
    });

    if (!res.ok) {
      return new Response(`Discord error: ${await res.text()}`, { status: res.status });
    }

    return new Response("OK", { status: 200 });
  }
};
