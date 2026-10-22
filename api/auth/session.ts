import { requireAuth } from "../_lib/auth.js";
import { jsonResponse, methodNotAllowed } from "../_lib/http.js";

if (process.env.VERCEL === "1") {
	console.info(`[runtime] node=${process.version}`);
}

async function handler(request: Request) {
	if (request.method !== "GET") {
		return methodNotAllowed(["GET"]);
	}

	return jsonResponse({ authenticated: requireAuth(request) });
}

export default { fetch: handler };
