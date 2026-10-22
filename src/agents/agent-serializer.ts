import { stringify as stringifyYaml } from "yaml";
import type { AgentConfig } from "./agents.ts";
import { frontmatterNameForConfig } from "./identity.ts";

export const KNOWN_FIELDS = new Set([
	"name",
	"package",
	"description",
	"advertise",
	"alias",
	"aliases",
	"tools",
	"excludeTools",
	"allowNestedSubagents",
	"allowedAgents",
	"model",
	"fast",
	"thinking",
	"systemPromptMode",
	"inheritProjectContext",
	"inheritGlobalContext",
	"inheritSkills",
	"defaultContext",
	"async",
	"timeoutMs",
	"toolTimeoutMs",
	"acceptance",
	"acceptanceRole",
	"skill",
	"skills",
	"skillPath",
	"extensions",
	"subagentOnlyExtensions",
	"mutationTools",
	"machine",
	"launcher",
	"output",
	"outputMode",
	"outputSchema",
	"defaultReads",
	"defaultProgress",
	"interactive",
	"maxSubagentDepth",
	"toolBudget",
	"permission",
	"permissions",
	"memory",
	"runner",
]);

function yamlString(value: string): string {
	// This scalar is embedded after a mapping key or sequence marker, so the
	// emitter must not choose a root-level block scalar or wrap onto new lines.
	return stringifyYaml(value, { lineWidth: 0, blockQuote: false, singleQuote: false, doubleQuotedAsJSON: true }).slice(0, -1);
}

/** Remove only the YAML emitter's final line break, never block-scalar content. */
function yamlMappingLines(value: Record<string, unknown>): string[] {
	const rendered = stringifyYaml(value);
	return rendered.slice(0, -1).split("\n");
}

function emitList(lines: string[], key: string, values: string[] | undefined, force = false): void {
	if (!values?.length) {
		if (force) lines.push(`${key}:`);
		return;
	}
	if (values.some((value) => value.includes(",") || value.includes("\n"))) {
		lines.push(`${key}:`);
		for (const value of values) lines.push(`  - ${yamlString(value)}`);
	} else {
		lines.push(`${key}: ${yamlString(values.join(", "))}`);
	}
}

interface SerializeAgentOptions {
	preserveFrontmatterFields?: ReadonlySet<string>;
}

export function serializeAgent(config: AgentConfig, options: SerializeAgentOptions = {}): string {
	const lines: string[] = [];
	const preserve = (...fields: string[]) => fields.some((field) => options.preserveFrontmatterFields?.has(field));
	const preservingExistingFrontmatter = options.preserveFrontmatterFields !== undefined;
	lines.push("---");
	lines.push(`name: ${yamlString(frontmatterNameForConfig(config))}`);
	if (config.packageName) lines.push(`package: ${yamlString(config.packageName)}`);
	lines.push(...yamlMappingLines({ description: config.description }));
	if (config.advertise === true || preserve("advertise")) lines.push(`advertise: ${config.advertise === true ? "true" : "false"}`);
	emitList(lines, "aliases", config.aliases, preserve("alias", "aliases"));

	const tools = [
		...(config.tools ?? []),
		...(config.mcpDirectTools ?? []).map((tool) => `mcp:${tool}`),
	];
	emitList(lines, "tools", tools, preserve("tools"));
	emitList(lines, "excludeTools", config.excludeTools, preserve("excludeTools"));
	if (config.allowNestedSubagents === true || preserve("allowNestedSubagents")) {
		lines.push(`allowNestedSubagents: ${config.allowNestedSubagents === undefined ? "" : config.allowNestedSubagents ? "true" : "false"}`);
	}
	if (config.allowedAgents !== undefined || preserve("allowedAgents")) {
		emitList(lines, "allowedAgents", config.allowedAgents, true);
	}

	if (config.model || preserve("model")) lines.push(`model: ${config.model ? yamlString(config.model) : ""}`);
	if (config.fast === true || preserve("fast")) lines.push(`fast: ${config.fast === undefined ? "" : config.fast ? "true" : "false"}`);
	if ((config.thinking && (config.thinking !== "off" || preserve("thinking"))) || (!config.thinking && preserve("thinking"))) {
		lines.push(`thinking: ${config.thinking === false ? "false" : config.thinking ? yamlString(config.thinking) : ""}`);
	}
	if (!preservingExistingFrontmatter || preserve("systemPromptMode")) lines.push(`systemPromptMode: ${config.systemPromptMode}`);
	if (!preservingExistingFrontmatter || preserve("inheritProjectContext")) lines.push(`inheritProjectContext: ${config.inheritProjectContext ? "true" : "false"}`);
	if (config.inheritGlobalContext || preserve("inheritGlobalContext")) lines.push(`inheritGlobalContext: ${config.inheritGlobalContext ? "true" : "false"}`);
	if (!preservingExistingFrontmatter || preserve("inheritSkills")) lines.push(`inheritSkills: ${config.inheritSkills ? "true" : "false"}`);
	if (config.defaultContext || preserve("defaultContext")) lines.push(`defaultContext: ${config.defaultContext ?? ""}`);
	if (config.runner || preserve("runner")) {
		if (config.runner) {
			lines.push(...yamlMappingLines({ runner: config.runner }));
		} else {
			lines.push("runner:");
		}
	}
	if (config.defaultAsync !== undefined || preserve("async")) lines.push(`async: ${config.defaultAsync === undefined ? "" : config.defaultAsync ? "true" : "false"}`);
	if (config.defaultTimeoutMs !== undefined || preserve("timeoutMs")) lines.push(`timeoutMs: ${config.defaultTimeoutMs ?? ""}`);
	if (config.defaultToolTimeoutMs !== undefined || preserve("toolTimeoutMs")) lines.push(`toolTimeoutMs: ${config.defaultToolTimeoutMs ?? ""}`);
	if (config.defaultAcceptance !== undefined || preserve("acceptance")) {
		lines.push(`acceptance: ${config.defaultAcceptance === undefined
			? ""
			: typeof config.defaultAcceptance === "object"
				? JSON.stringify(config.defaultAcceptance)
				: String(config.defaultAcceptance)}`);
	}
	if (config.acceptanceRole || preserve("acceptanceRole")) lines.push(`acceptanceRole: ${config.acceptanceRole ?? ""}`);

	emitList(lines, "skills", config.skills, preserve("skill", "skills"));
	emitList(lines, "skillPath", config.skillPath, preserve("skillPath"));

	if (config.extensions !== undefined) {
		emitList(lines, "extensions", config.extensions, true);
	}
	if (config.subagentOnlyExtensions !== undefined || preserve("subagentOnlyExtensions")) {
		emitList(lines, "subagentOnlyExtensions", config.subagentOnlyExtensions, true);
	}
	emitList(lines, "mutationTools", config.mutationTools, preserve("mutationTools"));

	if (config.machine || preserve("machine")) lines.push(`machine: ${config.machine ? yamlString(config.machine) : ""}`);
	if (config.launcher) lines.push(`launcher: ${yamlString(config.launcher)}`);
	if (config.output || preserve("output")) lines.push(`output: ${config.output ? yamlString(config.output) : ""}`);
	if (config.outputMode || preserve("outputMode")) lines.push(`outputMode: ${config.outputMode ?? ""}`);
	if (config.outputSchema || preserve("outputSchema")) lines.push(`outputSchema: ${config.outputSchema ? JSON.stringify(config.outputSchema) : ""}`);

	emitList(lines, "defaultReads", config.defaultReads, preserve("defaultReads"));

	if (config.defaultProgress) lines.push("defaultProgress: true");
	if (config.interactive) lines.push("interactive: true");
	const maxSubagentDepth = config.maxSubagentDepth;
	if (typeof maxSubagentDepth === "number" && Number.isInteger(maxSubagentDepth) && maxSubagentDepth >= 0) {
		lines.push(`maxSubagentDepth: ${maxSubagentDepth}`);
	}
	if (config.toolBudget || preserve("toolBudget")) {
		lines.push(`toolBudget: ${config.toolBudget ? JSON.stringify(config.toolBudget) : ""}`);
	}
	if (config.permissions || preserve("permission", "permissions")) {
		const key = preserve("permission") && !preserve("permissions") ? "permission" : "permissions";
		if (config.permissions) {
			lines.push(...yamlMappingLines({ [key]: config.permissions }));
		} else {
			lines.push(`${key}:`);
		}
	}

	if (config.memory) {
		lines.push("memory:");
		lines.push(`  scope: ${config.memory.scope}`);
		lines.push(`  path: ${yamlString(config.memory.path)}`);
	}

	if (config.extraFields) {
		for (const [key, value] of Object.entries(config.extraFields)) {
			if (KNOWN_FIELDS.has(key)) continue;
			lines.push(...yamlMappingLines({ [key]: value }));
		}
	}

	lines.push("---");

	const body = config.systemPrompt ?? "";
	return `${lines.join("\n")}\n\n${body}\n`;
}
