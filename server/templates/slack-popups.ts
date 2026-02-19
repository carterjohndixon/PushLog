import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let slackConnectedHtml: string | null = null;
let slackErrorHtml: string | null = null;

function loadTemplate(name: string): string {
  const templatesDir =
    path.basename(__dirname) === "dist"
      ? path.join(__dirname, "templates")
      : __dirname;
  const filePath = path.join(templatesDir, name);
  return fs.readFileSync(filePath, "utf-8");
}

/** HTML for Slack OAuth success popup (closes and postMessages to opener or redirects). */
export function getSlackConnectedPopupHtml(): string {
  if (!slackConnectedHtml) {
    slackConnectedHtml = loadTemplate("slack-connected-popup.html");
  }
  return slackConnectedHtml;
}

/** HTML for Slack OAuth error popup. redirectUrl is the dashboard URL with error hash. */
export function getSlackErrorPopupHtml(redirectUrl: string): string {
  if (!slackErrorHtml) {
    slackErrorHtml = loadTemplate("slack-error-popup.html");
  }
  const safe = redirectUrl.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return slackErrorHtml.replace("{{REDIRECT_URL}}", safe);
}
