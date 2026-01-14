import { redirect } from 'next/navigation';

export default async function FeeStructuresPage({ searchParams }) {
    const _ = await searchParams;
    redirect('/dashboard/classes');
}
