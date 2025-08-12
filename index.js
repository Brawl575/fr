export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Use POST method', { status: 405 });
    }

    try {
      const body = await request.json();

      // Если embed передан как embed или embeds
      let payload;
      if (body.embed) {
        payload = { embeds: [body.embed] };
      } else if (body.embeds) {
        payload = { embeds: body.embeds };
      } else {
        return new Response('No embed provided', { status: 400 });
      }

      // Кодируем JSON в строку и добавляем в конец URL
      const encoded = encodeURIComponent(JSON.stringify(payload));
      const targetUrl = `${env.DISCORD_WEBHOOK_URL}${encoded}`;

      const res = await fetch(targetUrl, { method: 'GET' });

      if (!res.ok) {
        return new Response(`Error: ${await res.text()}`, { status: res.status });
      }

      return new Response('OK', { status: 200 });
    } catch (err) {
      return new Response(`Error: ${err.message}`, { status: 500 });
    }
  }
};
