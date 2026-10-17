import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const sourceArg = process.argv[2];
const targetUrl = process.env.GH_TEST_URL;
if (!sourceArg) throw new Error("usage: node scripts/run_test_with_url.mjs <test-script>");
if (!targetUrl) throw new Error("GH_TEST_URL is required");

const root = process.cwd();
const sourcePath = path.resolve(root, sourceArg);
if (!sourcePath.startsWith(root + path.sep)) throw new Error("test script must be inside repository");

const source = fs.readFileSync(sourcePath, "utf8");
const oldLine = 'const url="http://127.0.0.1:4173/checkpoints/V172_CSP_IMAGE_FIX/index.html";';
const oldLineSpaced = 'const url = "http://127.0.0.1:4173/checkpoints/V172_CSP_IMAGE_FIX/index.html";';
const occurrences = source.split(oldLine).length - 1 + source.split(oldLineSpaced).length - 1;
if (occurrences !== 1) throw new Error(`expected one V172 URL declaration in ${sourceArg}, found ${occurrences}`);

const replacement = `const url=${JSON.stringify(targetUrl)};`;
const patched = source.includes(oldLine)
  ? source.replace(oldLine, replacement)
  : source.replace(oldLineSpaced, replacement);
const generatedPath = path.join(
  path.dirname(sourcePath),
  `.gh-url-target-${path.basename(sourcePath)}-${process.pid}.mjs`,
);
fs.writeFileSync(generatedPath, patched);
console.log(`TEST_SOURCE=${path.relative(root, sourcePath)}`);
console.log(`TEST_URL=${targetUrl}`);
console.log(`GENERATED_TEST=${path.relative(root, generatedPath)}`);

try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  fs.rmSync(generatedPath, { force: true });
}
