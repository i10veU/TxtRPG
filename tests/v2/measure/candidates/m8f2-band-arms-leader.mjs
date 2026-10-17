// M8 balance step 2b (§11), candidate F2: +1 swordsmanship for each band step from two (five at six). Measurement only.
import { armLeader } from "./m8f-band-arms-leader.mjs";
export function patch(d) { armLeader(d, [2, 3, 4, 5, 6]); }
