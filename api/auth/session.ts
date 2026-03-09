import { requireAuth } from "../_lib/auth.js";
import { jsonResponse, methodNotAllowed } from "../_lib/http.js";

export default async function handler(request: Request) {
	if (request.method !== "GET") {
		return methodNotAllowed(["GET"]);
	}

	return jsonResponse({ authenticated: requireAuth(request) });
}
