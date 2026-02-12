declare global {
  var notificationStreams: Map<string, any> | undefined;
}

export default function broadcastNotification(userId: string, notification: any) {
  if (global.notificationStreams?.has(userId)) {
      const stream = global.notificationStreams.get(userId);
      if (stream) {
          stream.write(`data: ${JSON.stringify({ type: 'notification', data: notification })}\n\n`);
      }
  }
}