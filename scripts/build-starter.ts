import fs from "node:fs";
import path from "node:path";

import { renderStarter } from "../lib/briefing-starter";

const target = path.join(process.cwd(), "template", "public", "index.html");
fs.writeFileSync(target, renderStarter());
console.log(`Wrote ${path.relative(process.cwd(), target)}`);
