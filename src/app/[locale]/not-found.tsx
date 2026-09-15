'use client';

import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel } from '@/components/primitives';
import { useDict, useLocaleHref } from '@/i18n/hooks';

export default function NotFound() {
	const dict = useDict();
	const href = useLocaleHref();
	return (
		<Panel className="mx-auto max-w-xl">
			<EmptyState
				icon={Compass}
				title={dict.pages.notFound.title}
				body={dict.notFound.body}
				action={
					<Button asChild variant="secondary">
						<Link href={href('/')}>
							<ArrowLeft />
							{dict.common.backToDashboard}
						</Link>
					</Button>
				}
			/>
		</Panel>
	);
}
