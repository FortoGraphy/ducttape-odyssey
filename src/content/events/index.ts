import type { EventDef, EventId } from "@/engine/types";

import { anomaly } from "./anomaly";
import { contact } from "./contact";
import { derelict } from "./derelict";
import { distress } from "./distress";
import { fauna } from "./fauna";
import { fault } from "./fault";
import { flare } from "./flare";
import { kipp } from "./kipp";
import { merchant } from "./merchant";
import { meteor } from "./meteor";
import { pirates } from "./pirates";
import { stowaway } from "./stowaway";
import { story } from "./story";

/** Every event in authoring order. Use this for validation: the record below would hide duplicate ids. */
export const eventList: EventDef[] = [
  ...meteor,
  ...pirates,
  ...merchant,
  ...derelict,
  ...anomaly,
  ...flare,
  ...fauna,
  ...distress,
  ...fault,
  ...stowaway,
  ...kipp,
  ...contact,
  ...story,
];

export const events: Record<EventId, EventDef> = Object.fromEntries(eventList.map((e) => [e.id, e]));
