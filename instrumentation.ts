export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { seedAdmin } = await import('./lib/seed');
        await seedAdmin();
    }
}
