export async function sendActivity(type: string, title: string, metadata: string) {
    await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, metadata }),
    });
}