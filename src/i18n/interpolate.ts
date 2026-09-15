/** Replace `{name}` placeholders; unknown names stay visible so a missing var is noticed. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (_, key: string) => {
		const value = vars[key];
		return value === undefined ? `{${key}}` : String(value);
	});
}
