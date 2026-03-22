/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");

// Just write the full nl.json directly
const nl = require("./nl-data.json");
fs.writeFileSync("messages/nl.json", JSON.stringify(nl, null, 2) + "\n", "utf8");
console.log("Done:", fs.statSync("messages/nl.json").size, "bytes");
