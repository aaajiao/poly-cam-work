import { readdirSync } from "node:fs";
import path from "node:path";
import { discoverScenes } from "../_lib/discovery.js";

function handler(request: Request): Response {
	if (request.method !== "GET") {
		return new Response(JSON.stringify({ error: "Method not allowed" }), {
			status: 405,
			headers: { "Content-Type": "application/json" },
		});
	}

	const modelsDir = path.resolve(process.cwd(), "public", "models");

	let entries: string[];
	try {
		entries = readdirSync(modelsDir);
	} catch {
		return new Response(JSON.stringify({ scenes: [], errors: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	const result = discoverScenes({ entries, modelsDir, validateFiles: true });
	return new Response(JSON.stringify(result), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

export default { fetch: handler };
