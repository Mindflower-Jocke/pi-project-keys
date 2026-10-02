/**
 * Per-project API keys.
 * Config: ~/.pi/agent/project-keys.json
 * {
 *   "openrouter": {
 *     "~/source/focus-on-me": "$OPENROUTER_KEY_FOCUS",
 *     "~/source": "!security find-generic-password -ws 'openrouter-source'"
 *   }
 * }
 * Values: literal key, $ENV / ${ENV}, or !command. Longest matching folder prefix wins.
 */
import { execSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CONFIG = join(homedir(), ".pi", "agent", "project-keys.json");
const cache = new Map<string, string>();

function expand(p: string): string {
	return resolve(p.startsWith("~") ? join(homedir(), p.slice(1)) : p);
}

function resolveValue(v: string): string | undefined {
	if (cache.has(v)) return cache.get(v);
	let out: string | undefined;
	if (v.startsWith("!")) {
		try {
			out = execSync(v.slice(1), { encoding: "utf8", timeout: 10000 }).trim();
		} catch {}
	} else if (/^\$\{?\w+\}?$/.test(v)) {
		out = process.env[v.replace(/[${}]/g, "")];
	} else {
		out = v;
	}
	if (out) cache.set(v, out);
	return out;
}

function lookup(provider: string, cwd: string): { folder: string; key: string } | undefined {
	let cfg: Record<string, Record<string, string>>;
	try {
		cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
	} catch {
		return undefined;
	}
	const dir = resolve(cwd);
	const matches = Object.keys(cfg[provider] ?? {})
		.map((f) => ({ f, abs: expand(f) }))
		.filter(({ abs }) => dir === abs || dir.startsWith(abs + sep))
		.sort((a, b) => b.abs.length - a.abs.length);
	for (const m of matches) {
		const key = resolveValue(cfg[provider][m.f]);
		if (key) return { folder: m.f, key };
	}
	return undefined;
}

function load(): Record<string, Record<string, string>> {
	try {
		return JSON.parse(readFileSync(CONFIG, "utf8"));
	} catch {
		return {};
	}
}

function save(cfg: Record<string, Record<string, string>>) {
	writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + "\n");
	chmodSync(CONFIG, 0o600);
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("projectkey", {
		description: "Set API key for this folder: /projectkey [key | $ENV | !cmd | clear | show]",
		handler: async (args, ctx) => {
			const provider = ctx.model?.provider ?? "openrouter";
			const dir = resolve(ctx.cwd);
			const cfg = load();
			const arg = args.trim();
			if (arg === "show") {
				const hit = lookup(provider, dir);
				const rt = (ctx as any).modelRegistry?.runtime;
				const active = ctx.modelRegistry?.getProviderAuthStatus?.(provider)?.source === "runtime";
				const where = hit?.folder.replace(homedir(), "~");
				let msg: string;
				if (!rt?.setRuntimeApiKey) msg = `${provider}: default key (override unavailable in this pi version)`;
				else if (hit && active) msg = `${provider}: project key …${hit.key.slice(-4)} (${where})`;
				else if (hit) msg = `${provider}: default key (project key …${hit.key.slice(-4)} not applied yet, try /reload)`;
				else msg = `${provider}: default key`;
				ctx.ui.notify(msg, "info");
				return;
			}
			if (arg === "clear") {
				if (cfg[provider]) delete cfg[provider][dir];
				save(cfg);
				cache.clear();
				await apply(ctx);
				ctx.ui.notify(`Removed ${provider} key for ${dir}`, "info");
				return;
			}
			const value = arg || (await ctx.ui.input(`${provider} API key for ${dir}`, "sk-or-… | $ENV | !command"));
			if (!value?.trim()) return;
			(cfg[provider] ??= {})[dir] = value.trim();
			save(cfg);
			cache.clear();
			await apply(ctx);
			ctx.ui.notify(`Saved ${provider} key for ${dir}`, "info");
		},
	});

	// Uses the same runtime-key mechanism as `--api-key` (highest credential priority).
	const apply = async (ctx: any) => {
		const provider = ctx.model?.provider;
		if (!provider) return;
		const runtime = ctx.modelRegistry?.runtime;
		if (!runtime?.setRuntimeApiKey) return;
		const hit = lookup(provider, ctx.cwd);
		if (hit) await runtime.setRuntimeApiKey(provider, hit.key);
		else await runtime.removeRuntimeApiKey?.(provider);
		ctx.ui.setStatus?.("project-keys", hit ? `key: ${hit.folder}` : undefined);
	};
	pi.on("session_start", async (_e, ctx) => apply(ctx));
	pi.on("before_agent_start", async (_e, ctx) => apply(ctx));
}
