// M8 balance step 2b (§11), candidate F1: +1 swordsmanship at band three and at five (at most 2). Measurement only.
import { armLeader } from "./m8f-band-arms-leader.mjs";
export function patch(d) { armLeader(d, [3, 5]); }
