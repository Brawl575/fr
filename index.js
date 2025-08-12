export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Use POST method', { status: 405 });
    }

    try {
      const body = await request.json();

      // Если пришёл один embed, превращаем в массив embeds
      let payload;
      if (body.embed) {
        payload = { embeds: [body.embed] };
      } else if (body.embeds) {
        payload = { embeds: body.embeds };
      } else {
        return new Response('No embed provided', { status: 400 });
      }

      // Отправляем на Discord
      const res = await fetch(env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        return new Response(`Discord error: ${await res.text()}`, { status: res.status });
      }

      return new Response('OK', { status: 200 });
    } catch (err) {
      return new Response(`Error: ${err.message}`, { status: 500 });
    }
  }
};
