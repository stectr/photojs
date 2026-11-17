const projects = [
    {
        name: "devo.beeffilet.com",
        url: "https://devo.beeffilet.com",
        description: "A website I built and provide for public use.",
    },
    {
        name: "oemfellowship.com",
        url: "https://oemfellowship.com",
        description: "A website I built and provide for public use.",
    },
];

export default function Portfolio() {
    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <a href="/" className="text-sm text-muted hover:text-foreground">← back to gallery</a>
            <h1 className="mt-6 text-3xl font-semibold">portfolio</h1>
            <p className="mt-2 text-muted">websites I provide for others to use.</p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
                {projects.map((project) => (
                    <li key={project.url}>
                        <a
                            href={project.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-2xl border border-border bg-card p-6 transition hover:shadow-md"
                        >
                            <h2 className="text-lg font-medium">{project.name}</h2>
                            <p className="mt-2 text-sm text-muted">{project.description}</p>
                            <span className="mt-4 inline-block text-sm text-accent">visit site →</span>
                        </a>
                    </li>
                ))}
            </ul>
        </main>
    );
}
