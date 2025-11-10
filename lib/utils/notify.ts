export async function sendNotification(title: string, message: string, type = "info") {
    await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message, type }),
    });
}

