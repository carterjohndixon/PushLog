declare global {
  var notificationStreams: Map<string, any> | undefined;
}

export default function broadcastNotification(userId: string, notification: any) {
  const streamCount = global.notificationStreams?.size ?? 0;
  const hasStream = global.notificationStreams?.has(userId) ?? false;

  if (!hasStream) {
    console.log(`[broadcastNotification] No SSE stream for user ${userId} (${streamCount} active streams)`);
    return;
  }

  const stream = global.notificationStreams!.get(userId);
  if (!stream) {
    console.log(`[broadcastNotification] Stream object null for user ${userId}`);
    return;
  }

  try {
    const payload = JSON.stringify({ type: "notification", data: notification });
    stream.write(`data: ${payload}\n\n`);
    console.log(`[broadcastNotification] Sent ${notification?.type ?? "unknown"} to user ${userId}`);
  } catch (err: any) {
    console.warn(`[broadcastNotification] Write failed for user ${userId}:`, err?.message);
    global.notificationStreams?.delete(userId);
  }
}
