import { requireAuth } from "../_lib/auth.js";
import { jsonResponse, methodNotAllowed } from "../_lib/http.js";

async function handler(request: Request) {
	if (request.method !== "GET") {
		return methodNotAllowed(["GET"]);
	}

	return jsonResponse({ authenticated: requireAuth(request) });
}

export default { fetch: handler };
