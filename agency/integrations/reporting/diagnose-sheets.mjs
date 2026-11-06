import { createRequire } from "node:module";

const require = createRequire(
  "D:/AgentOps/agency/integrations/gmail/node_modules/package.json"
);

const { google } = require("googleapis");

import fs from "node:fs";
import path from "node:path";

// Small manual diagnostic: read the configured Sheet with the Sheets OAuth grant.
// It does not write rows, send email, or run any AI employee.
const dir = process.cwd();
const config = JSON.parse(
  fs.readFileSync(path.join(dir, "reporting-config.json"), "utf8")
);

const privateDir = path.join(dir, "private");
const credentials = JSON.parse(
  fs.readFileSync(path.join(privateDir, "sheets-credentials.json"), "utf8")
);
const tokens = JSON.parse(
  fs.readFileSync(path.join(privateDir, "sheets-tokens.json"), "utf8")
);

const clientConfig = credentials.installed;
if (!clientConfig) throw new Error("Expected Desktop OAuth credentials");

const oauth = new google.auth.OAuth2(
  clientConfig.client_id,
  clientConfig.client_secret,
  clientConfig.redirect_uris?.[0]
);
oauth.setCredentials(tokens);

const sheets = google.sheets({ version: "v4", auth: oauth });

try {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: "'Ledger'!A:H",

  });

  console.log("Ledger read: SUCCESS");
  console.log("Existing rows:", result.data.values?.length ?? 0);
} catch (error) {
  console.error("Ledger read: FAILED");
  console.error("HTTP status:", error.response?.status ?? "unknown");
  console.error("Google error category:",
    error.response?.data?.error?.status ?? "unknown");
     
  const message = String(
   error.response?.data?.error?.message ?? "No details"
  );

  const safeMessage = message
    .replaceAll(config.spreadsheetId, "[SPREADSHEET_ID]")
    .replace(/https?:\/\/\S+/g, "[URL_REDACTED]");

  console.error("Google error details:", safeMessage);
  process.exitCode = 1;
}

try {
  const result = await sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
    fields: "sheets(properties(title,gridProperties(rowCount,columnCount)))",
  });

  for (const sheet of result.data.sheets ?? []) {
    console.log({
      tabName: sheet.properties.title,
      rowCount: sheet.properties.gridProperties.rowCount,
      columnCount: sheet.properties.gridProperties.columnCount,
    });
  }
} catch (error) {
  console.error("HTTP status:", error.response?.status ?? "unknown");
  console.error("Google error reason:", error.response?.data?.error?.status ?? "unknown");
  console.error("Diagnostic request failed.");
  process.exitCode = 1;
}
