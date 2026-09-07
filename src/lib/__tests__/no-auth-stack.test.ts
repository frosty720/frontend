/**
 * Guards the 2026-08-27 removal of the backend-session stack.
 *
 * The backend no longer has users, JWTs, custodial wallets or API keys: thirdweb in-app
 * wallets need no backend, and launchpad ownership is recorded from the deployment
 * receipt (`ownerAddress`). Everything that minted, stored or sent an `auth_token`
 * was deleted along with the custodial Send tab and the /dashboard page. These tests
 * fail if any of it comes back.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

const DELETED_PATHS = [
	'hooks/useAuth.ts',
	'hooks/useAutoAuth.ts',
	'hooks/useMigration.ts',
	'utils/auth.ts',
	'components/auth',
	'components/wallet/MigrationBanner.tsx',
	'components/wallet/MigrationWizard.tsx',
	'app/dashboard',
];

// Identifiers that only existed for the deleted session/custodial stack.
const FORBIDDEN = [
	/auth_token/,
	/useAutoAuth|useEnsureAuth|ensureAuth\(/,
	/isAuthenticated/,
	/['"`]Authorization['"`]\s*:\s*`Bearer/,
	/authenticateWithWallet|walletMigrationStatus|linkThirdwebWallet/,
	/\bme\s*\{/, // the `me { ... }` GraphQL query
	/sendTransaction\(input/, // custodial send mutation
	/user\s*\{\s*id\s+username/,
	/href=["']\/dashboard["']/,
];

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry === '.next' || entry === '__tests__') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.tsx?$/.test(entry)) out.push(full);
	}
	return out;
}

describe('backend-session stack removal', () => {
	it('deleted files stay deleted', () => {
		for (const rel of DELETED_PATHS) {
			expect(existsSync(join(SRC, rel)), `${rel} was re-added`).toBe(false);
		}
	});

	it('no source file references the session/custodial stack', () => {
		const offenders: string[] = [];
		for (const file of walk(SRC)) {
			const text = readFileSync(file, 'utf8');
			for (const re of FORBIDDEN) {
				if (re.test(text)) offenders.push(`${file.replace(SRC, 'src')} matches ${re}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('launchpad creators gate on the connected wallet and save ownerAddress', () => {
		for (const name of ['PresaleCreator', 'FairlaunchCreator']) {
			const text = readFileSync(join(SRC, 'components', 'launchpad', `${name}.tsx`), 'utf8');
			expect(text, `${name} must gate on isConnected`).toMatch(/if \(!isConnected\) \{/);
			expect(text, `${name} must select ownerAddress from the save mutation`).toMatch(/ownerAddress/);
		}
	});

	it('the swap page has no Send tab', () => {
		const text = readFileSync(join(SRC, 'app', 'swaps', 'page.tsx'), 'utf8');
		expect(text).not.toMatch(/value="send"/);
		expect(text).not.toMatch(/promptForPassword/);
	});
});
