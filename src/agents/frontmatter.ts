import { isAlias, isMap, isScalar, parseDocument } from "yaml";

/** A decoded YAML mapping. Field-specific policy belongs to its consumer. */
export type Frontmatter = Record<string, unknown>;

/** Read a scalar field without interpreting its decoded contents as YAML again. */
export function frontmatterScalar(value: unknown, field: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "string") return value;
	if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return String(value);
	throw new Error(`Frontmatter '${field}' must be a scalar value.`);
}

/** Comma-separated scalar shorthand is an application convention, not YAML list syntax. */
export function parseFrontmatterList(value: unknown, field = "list"): string[] | undefined {
	if (value === undefined) return undefined;
	if (value === null || value === "") return [];
	if (typeof value === "string") return value.split(",").map((part) => part.trim()).filter(Boolean);
	if (Array.isArray(value)) {
		return value.map((item) => {
			if (typeof item !== "string" || !item.trim()) throw new Error(`Frontmatter '${field}' must contain non-empty strings.`);
			return item.trim();
		});
	}
	throw new Error(`Frontmatter '${field}' must be a comma-separated string or a YAML sequence of strings.`);
}

function extractFrontmatter(content: string): { header: string; body: string } | undefined {
	const normalized = content.replace(/\r\n/g, "\n");
	const opening = normalized.match(/^\uFEFF?---[ \t]*\n/);
	if (!opening) return undefined;
	const start = opening[0].length;
	const closing = /^---[ \t]*$/gm;
	closing.lastIndex = start;
	const end = closing.exec(normalized);
	if (!end) return undefined;
	return { header: normalized.slice(start, end.index), body: normalized.slice(end.index + end[0].length).trim() };
}

const YAML_OPTIONS = { version: "1.2", schema: "core", strict: true, uniqueKeys: true, merge: false, resolveKnownTags: false } as const;
const BLANK_AS_UNSET_FIELDS = new Set(["description", "runner", "acceptance", "permission", "permissions", "toolBudget", "outputSchema"]);

/** Recover only unambiguous scalar identity for an invalid definition's diagnostic. */
export function frontmatterDiagnosticIdentity(content: string): { name?: string; packageName?: string } {
	const extracted = extractFrontmatter(content);
	if (!extracted) return {};
	const doc = parseDocument(extracted.header, YAML_OPTIONS);
	const root = doc.contents;
	if (!isMap(root)) return {};
	const valueOf = (field: string): string | undefined => {
		const matches = root.items.filter((pair) => isScalar(pair.key) && pair.key.value === field);
		const values = matches.map(({ value }) => {
			// Resolving an alias node does not expand collections or load the
			// invalid document; only a scalar target can identify a diagnostic.
			const scalar = isAlias(value) ? value.resolve(doc) : value;
			if (!isScalar(scalar)) return undefined;
			if (typeof scalar.value === "string" || typeof scalar.value === "boolean" || (typeof scalar.value === "number" && Number.isFinite(scalar.value))) {
				return String(scalar.value);
			}
			return undefined;
		});
		// Duplicate declarations still invalidate the document, but identical
		// identities remain unambiguous for blocking a lower-priority fallback.
		return values.length && values[0] && values.every((value) => value === values[0]) ? values[0] : undefined;
	};
	const name = valueOf("name");
	const packageName = valueOf("package");
	return { ...(name ? { name } : {}), ...(packageName ? { packageName } : {}) };
}

/** Extract one Markdown frontmatter header; only the header is handed to YAML. */
export function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
	const extracted = extractFrontmatter(content);
	if (!extracted) return { frontmatter: {}, body: content.replace(/\r\n/g, "\n") };
	const { header, body } = extracted;
	const doc = parseDocument(header, YAML_OPTIONS);
	if (doc.errors.length) throw new Error(`Invalid YAML frontmatter: ${doc.errors.map((error) => error.message).join("; ")}`);
	if (doc.warnings.length) throw new Error(`Unsupported YAML frontmatter: ${doc.warnings.map((warning) => warning.message).join("; ")}`);
	if (doc.directives.yaml.version !== "1.2") throw new Error("Frontmatter requires YAML 1.2.");
	if (doc.contents === null) return { frontmatter: {}, body };
	if (!isMap(doc.contents)) throw new Error("Frontmatter must be a YAML mapping.");
	for (const pair of doc.contents.items) {
		if (!isScalar(pair.key) || typeof pair.key.value !== "string") throw new Error("Frontmatter keys must be strings.");
	}
	const parsed: unknown = doc.toJS({ maxAliasCount: 100 });
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Frontmatter must be a YAML mapping.");
	// Blank declarations historically mean unset for these fields, whereas an
	// explicit YAML null must reach the consumer's validation. List fields keep
	// their separate null-as-empty convention.
	for (const pair of doc.contents.items) {
		if (isScalar(pair.key) && BLANK_AS_UNSET_FIELDS.has(String(pair.key.value)) && isScalar(pair.value) && pair.value.value === null && pair.value.source === "" && pair.value.type === "PLAIN" && pair.value.tag === undefined) {
			(parsed as Frontmatter)[String(pair.key.value)] = "";
		}
	}
	const visiting = new WeakSet<object>();
	const validate = (value: unknown): void => {
		if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Frontmatter does not support non-finite numbers.");
		if (!value || typeof value !== "object") return;
		if (visiting.has(value)) throw new Error("Frontmatter does not support cyclic YAML aliases.");
		visiting.add(value);
		for (const item of Object.values(value)) validate(item);
		visiting.delete(value);
	};
	validate(parsed);
	return { frontmatter: parsed as Frontmatter, body };
}
