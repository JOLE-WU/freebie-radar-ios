/**
 * 把图标/名称/版本/Bundle ID 覆盖到 Capacitor 生成的 Xcode 工程。
 * 在 `npx cap add ios` / `npx cap sync ios` 之后运行：node scripts/prepare-ios.mjs
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const IOS = join(ROOT, "ios", "App");
const OVERRIDES = join(ROOT, "ios-overrides", "App");
const PBXPROJ = join(IOS, "App.xcodeproj", "project.pbxproj");

const BUNDLE_ID = process.env.RADAR_BUNDLE_ID || "com.jolewu.radar";
const TEAM = process.env.DEVELOPMENT_TEAM || "";
const MARKETING = process.env.RADAR_VERSION || "1.0.0";
const BUILD = process.env.RADAR_BUILD || "1";

if (!/^\d+(\.\d+){0,2}$/.test(MARKETING)) { console.error(`✖ 非法版本号: ${MARKETING}`); process.exit(1); }
if (!/^\d+$/.test(BUILD)) { console.error(`✖ 非法构建号: ${BUILD}`); process.exit(1); }
if (!existsSync(PBXPROJ)) { console.error("✖ 未找到 ios/App/App.xcodeproj，请先运行 npx cap add ios"); process.exit(1); }

cpSync(OVERRIDES, IOS, { recursive: true, force: true });
console.log("✓ 已复制 ios-overrides/App -> ios/App/（图标 + Info.plist）");

const PLIST = join(IOS, "App", "Info.plist");
let plist = readFileSync(PLIST, "utf8")
  .replace(/\$\(MARKETING_VERSION\)/g, MARKETING)
  .replace(/\$\(CURRENT_PROJECT_VERSION\)/g, BUILD);
writeFileSync(PLIST, plist);
console.log(`✓ Info.plist 版本 = ${MARKETING} (${BUILD})`);

let pbx = readFileSync(PBXPROJ, "utf8");
pbx = pbx.replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${BUNDLE_ID};`);
pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${MARKETING};`);
pbx = pbx.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${BUILD};`);
if (TEAM) {
  pbx = pbx.replace(/CODE_SIGN_STYLE = [^;]+;/g, "CODE_SIGN_STYLE = Manual;");
  pbx = pbx.replace(/(PRODUCT_BUNDLE_IDENTIFIER = [^;]+;)/g, `$1\n\t\t\t\tDEVELOPMENT_TEAM = ${TEAM};`);
  pbx = pbx.replace(/(DEVELOPMENT_TEAM = [^;]+;\s*\n\s*)+DEVELOPMENT_TEAM = ([^;]+;)/g, "DEVELOPMENT_TEAM = $2");
} else {
  pbx = pbx.replace(/CODE_SIGN_STYLE = [^;]+;/g, "CODE_SIGN_STYLE = Automatic;");
}
writeFileSync(PBXPROJ, pbx);
console.log(`✓ project.pbxproj  Bundle ID = ${BUNDLE_ID}`);

const exportOptions = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>${process.env.EXPORT_METHOD || "development"}</string>
  <key>teamID</key><string>${TEAM}</string>
  <key>signingStyle</key><string>${TEAM ? "manual" : "automatic"}</string>
  <key>stripSwiftSymbols</key><true/><key>compileBitcode</key><false/>
</dict></plist>
`;
mkdirSync(join(ROOT, "build"), { recursive: true });
writeFileSync(join(ROOT, "build", "ExportOptions.plist"), exportOptions);

console.log(`\nFresource v${MARKETING} (build ${BUILD}) — Xcode 工程就绪。`);
