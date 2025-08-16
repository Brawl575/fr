export default {
  async fetch(request, env) {
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

    // 🔑 Запрос на токен
    if (body.action === 'get_token' && body.key === env.STATIC_TOKEN_KEY) {
      const token = crypto.randomUUID();
      const timestamp = Date.now();

      // Сохраняем токен в Firestore через REST API
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/tokens/${token}`;
      const accessToken = await getFirebaseAccessToken(env); // Получаем токен доступа
      const setResponse = await fetch(firestoreUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          fields: {
            timestamp: { integerValue: timestamp }
          }
        }),
      });

      if (!setResponse.ok) {
        return new Response(`Firestore error: ${await setResponse.text()}`, { status: 500 });
      }

      return new Response(JSON.stringify({ token }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Проверка embeds
    if (!body.embeds || !Array.isArray(body.embeds) || body.embeds.length !== 1) {
      return new Response("Invalid embeds array", { status: 400 });
    }

    // Проверка токена
    const token = body.token;
    if (!token) {
      return new Response("Missing token", { status: 401 });
    }

    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/tokens/${token}`;
    const accessToken = await getFirebaseAccessToken(env);
    const getResponse = await fetch(firestoreUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!getResponse.ok) {
      return new Response("Invalid or expired token", { status: 401 });
    }

    const doc = await getResponse.json();
    if (!doc.fields || !doc.fields.timestamp) {
      return new Response("Invalid or expired token", { status: 401 });
    }

    const timestamp = parseInt(doc.fields.timestamp.integerValue, 10);
    const age = Date.now() - timestamp;
    if (age > 10000) { // 10 секунд
      // Удаляем токен
      await fetch(firestoreUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      return new Response("Token expired", { status: 401 });
    }

    // Одноразовый токен — удаляем после проверки
    await fetch(firestoreUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

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

// Функция для получения токена доступа Firebase
async function getFirebaseAccessToken(env) {
  const authUrl = 'https://oauth2.googleapis.com/token';
  const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const jwtHeader = {
    alg: 'RS256',
    typ: 'JWT'
  };
  const jwtPayload = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: authUrl,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000)
  };

  // Кодируем заголовок и тело в base64
  const encodeBase64 = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '');
  const header = encodeBase64(jwtHeader);
  const payload = encodeBase64(jwtPayload);

  // Подписываем JWT (используем Web Crypto API)
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=+$/, '');

  const jwt = `${header}.${payload}.${signatureBase64}`;

  // Запрашиваем токен доступа
  const response = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Конвертируем PEM ключ в ArrayBuffer
function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\n/g, '');
  const binary = atob(b64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
}
