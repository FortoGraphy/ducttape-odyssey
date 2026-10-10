// Local notifications only (a free Apple ID cannot provision push). The engine plans what is worth
// a notification (meta/notify.ts); this module asks for permission once, then replaces the whole
// schedule every time the app goes to the background and clears it when the app comes back.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export interface PlannedNotification {
  id: string;
  inSeconds: number;
  title: string;
  body: string;
}

const MAX_SCHEDULED = 4;
const MIN_DELAY_S = 5 * 60;
const supported = Platform.OS === "ios" || Platform.OS === "android";
let handlerSet = false;

function ensureHandler(): void {
  if (handlerSet || !supported) return;
  handlerSet = true;
  try {
    // Nothing is shown while the game is in the foreground: the game itself already tells the player.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
    });
  } catch (e) {
    console.warn("notifications handler", e);
  }
}

export async function notificationsAllowed(): Promise<boolean> {
  if (!supported) return false;
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}

/** Shows the system permission prompt (only when the player turns notifications on). */
export async function requestNotifications(): Promise<boolean> {
  if (!supported) return false;
  ensureHandler();
  try {
    const p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
    return p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch (e) {
    console.warn("notifications permission", e);
    return false;
  }
}

export async function clearScheduled(): Promise<void> {
  if (!supported) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn("notifications clear", e);
  }
}

/** Replaces the schedule. Capped and spaced so the game stays respectful. */
export async function scheduleAll(plan: PlannedNotification[]): Promise<number> {
  if (!supported) return 0;
  ensureHandler();
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!(await notificationsAllowed())) return 0;
    const sorted = plan
      .filter((n) => Number.isFinite(n.inSeconds) && n.inSeconds >= MIN_DELAY_S && n.title.length > 0)
      .sort((a, b) => a.inSeconds - b.inSeconds)
      .slice(0, MAX_SCHEDULED);
    let count = 0;
    for (const n of sorted) {
      await Notifications.scheduleNotificationAsync({
        identifier: n.id,
        content: { title: n.title, body: n.body, sound: false },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(n.inSeconds) },
      });
      count++;
    }
    return count;
  } catch (e) {
    console.warn("notifications schedule", e);
    return 0;
  }
}
