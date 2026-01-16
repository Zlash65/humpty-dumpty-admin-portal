import { redirect } from 'next/navigation';

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function FeeStructuresPage({ searchParams }: PageProps) {
    const _params = await searchParams;
    void _params;
    redirect('/dashboard/classes');
}
