/** Lowercase 20-byte hex address — the only shape ever inlined into a subgraph query. */
export function isLowercaseAddress(value: string): boolean {
	return /^0x[0-9a-f]{40}$/.test(value);
}

/** POST a GraphQL query to a subgraph and return its data. Throws on HTTP or GraphQL errors. */
export async function querySubgraph<T>(url: string, query: string): Promise<T> {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query }),
	});
	if (!res.ok) throw new Error(`Subgraph responded ${res.status}`);
	const json = (await res.json()) as { data?: T; errors?: unknown };
	if (json.errors || !json.data) throw new Error('Subgraph returned errors');
	return json.data;
}
