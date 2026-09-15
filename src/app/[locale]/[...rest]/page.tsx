import { notFound } from 'next/navigation';

/** Any URL the other routes don't claim renders the locale 404 inside the shell. */
export default function CatchAll() {
	notFound();
}
