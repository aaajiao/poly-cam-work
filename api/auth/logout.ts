import { clearSessionCookieHeader } from "../_lib/auth.js";
import { jsonResponse, methodNotAllowed } from "../_lib/http.js";

async function handler(request: Request) {
	if (request.method !== "POST") {
		return methodNotAllowed(["POST"]);
	}

	return jsonResponse({ ok: true }, 200, {
		"Set-Cookie": clearSessionCookieHeader(request),
	});
}

export default { fetch: handler };
