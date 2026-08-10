export default async function handler(request, response) {
    if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        response.status(405).json({ error: { message: "Method not allowed" } });
        return;
    }

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
        response.status(401).json({ error: { message: "Authorization is required" } });
        return;
    }

    try {
        const upstream = await fetch("https://ark.cn-beijing.volces.com/api/v3/models", {
            headers: { Accept: "application/json", Authorization: authorization },
        });
        response.status(upstream.status);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
        response.send(await upstream.text());
    } catch {
        response.status(502).json({ error: { message: "Failed to reach Volcengine Ark" } });
    }
}
