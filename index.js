import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export default {
  async fetch(request, env) {
    const supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    const url = new URL(request.url);

    if (request.method !== 'POST') {
      if (request.method === 'GET' && url.searchParams.has('msg')) {
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

    // Генерация токена
    if (body.action === 'get_token' && body.key === env.STATIC_TOKEN_KEY) {
      const token = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      const { error } = await supabase
        .from('tokens')
        .insert([{ token, timestamp }]);

      if (error) {
        return new Response('Failed to generate token', { status: 500 });
      }

      return new Response(JSON.stringify({ token }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Проверка embeds
    if (!body.embeds || !Array.isArray(body.embeds) || body.embeds.length < 1) {
      return new Response("Invalid embeds array", { status: 400 });
    }

    const token = body.token;
    if (!token) {
      return new Response("Missing token", { status: 401 });
    }

    const { data, error } = await supabase
      .from('tokens')
      .select('timestamp')
      .eq('token', token)
      .single();

    if (error || !data) {
      return new Response("Invalid or expired token", { status: 401 });
    }

    const storedTimestamp = new Date(data.timestamp).getTime();
    const age = Date.now() - storedTimestamp;
    if (age > 10000) { // 10 секунд
      await supabase.from('tokens').delete().eq('token', token);
      return new Response("Token expired", { status: 401 });
    }

    await supabase.from('tokens').delete().eq('token', token);

    const embed = body.embeds[0];
    if (!embed.title || !embed.description || !embed.fields || embed.fields.length < 5) {
      return new Response("Invalid embeds array", { status: 400 });
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
      if (!allowedFieldNames.includes(field.name) || typeof field.value !== "string") {
        return new Response(`Invalid field: ${field.name}`, { status: 400 });
      }

      if (field.inline !== undefined && typeof field.inline !== "boolean") {
        return new Response(`Invalid inline value in: ${field.name}`, { status: 400 });
      }

      for (const badWord of blacklist) {
        if (
          field.name.toLowerCase().includes(badWord) ||
          field.value.toLowerCase().includes(badWord)
        ) {
          return new Response(`Blacklisted word detected: ${badWord}`, { status: 400 });
        }
      }
    }

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
