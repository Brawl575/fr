export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
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

    // Разрешённые ключи в embed
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

    // Цвет должен быть числом
    if (typeof embed.color !== "number") {
      return new Response("Invalid color", { status: 400 });
    }

    // Проверка footer (только если есть)
    if (embed.footer) {
      if (typeof embed.footer.text !== "string") {
        return new Response("Invalid footer", { status: 400 });
      }
    }

    // Проверка fields
    if (!Array.isArray(embed.fields) || embed.fields.length < 5) {
      return new Response("Invalid fields array", { status: 400 });
    }

    // Список допустимых названий полей
    const allowedFieldNames = [
      "🪙 Name:",
      "📈 Generation:",
      "👥 Players:",
      "🔗 Server Link:",
      "📱 Job-ID (Mobile):",
      "💻 Job-ID (PC):",
      "📲 Join:"
    ];

    for (const field of embed.fields) {
      if (
        !allowedFieldNames.includes(field.name) ||
        typeof field.value !== "string"
      ) {
        return new Response(`Invalid field: ${field.name}`, { status: 400 });
      }

      // inline допустим только true/false или отсутствует
      if (
        field.inline !== undefined &&
        typeof field.inline !== "boolean"
      ) {
        return new Response(`Invalid inline value in: ${field.name}`, { status: 400 });
      }

      // 🔎 Дополнительная проверка для поля Players
      if (field.name === "👥 Players:") {
        const match = field.value.match(/^(\d+)\/(\d+)$/);
        if (!match) {
          return new Response("Invalid Players format", { status: 400 });
        }
        const current = parseInt(match[1], 10);

        // ❗ Если игроков 4 или меньше — блокируем
        if (current <= 4) {
          return new Response("Too few players", { status: 400 });
        }
      }
    }

    // Если всё ок, отправляем в Discord
    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      return new Response(`Discord error: ${await res.text()}`, { status: res.status });
    }

    return new Response("OK", { status: 200 });
  }
};
