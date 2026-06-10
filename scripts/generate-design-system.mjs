import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sources = [
  {
    id: "primitive",
    label: "Primitive tokens",
    file: "/Users/leotan/Desktop/token/Primitive token.json",
  },
  {
    id: "semantic",
    label: "Semantic tokens",
    file: "/Users/leotan/Desktop/token/Semantic Tokens/semantic token.json",
  },
  {
    id: "component",
    label: "Component tokens",
    file: "/Users/leotan/Desktop/token/Component Tokens/component token.json",
  },
];

const outDir = path.join(root, "src", "design-system");
const docsDir = path.join(root, "docs");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isToken(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("value" in value || "$value" in value)
  );
}

function kebab(input) {
  return String(input)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function cssVarName(sourceId, tokenPath) {
  return `--cp-${sourceId}-${tokenPath.map(kebab).join("-")}`;
}

function resolveReference(value, sourceId) {
  if (typeof value !== "string") return null;
  const match = value.match(/^\{(.+)\}$/);
  if (!match) return null;
  return `var(${cssVarName(sourceId, match[1].split("."))})`;
}

function rgbaFromColor(value) {
  const hex = value.hex || "#000000";
  const alpha = typeof value.alpha === "number" ? value.alpha : 1;
  if (alpha >= 0.999) return hex.toUpperCase();

  const components =
    Array.isArray(value.components) && value.components.length >= 3
      ? value.components
      : [
          Number.parseInt(hex.slice(1, 3), 16) / 255,
          Number.parseInt(hex.slice(3, 5), 16) / 255,
          Number.parseInt(hex.slice(5, 7), 16) / 255,
        ];

  const [r, g, b] = components.map((channel) =>
    Math.round(Math.max(0, Math.min(1, channel)) * 255)
  );
  return `rgb(${r} ${g} ${b} / ${Number(alpha.toFixed(3))})`;
}

function normalizeValue(rawValue, type, sourceId) {
  const ref = resolveReference(rawValue, sourceId);
  if (ref) return ref;

  if (rawValue && typeof rawValue === "object" && "hex" in rawValue) {
    return rgbaFromColor(rawValue);
  }

  if (typeof rawValue === "number") {
    const unitless = new Set(["opacity", "fontWeight", "lineHeight"]);
    return unitless.has(type) ? String(rawValue) : `${rawValue}px`;
  }

  if (Array.isArray(rawValue)) return rawValue.join(", ");
  return String(rawValue);
}

function collectTokens(tree, source, tokenPath = [], result = []) {
  if (!tree || typeof tree !== "object") return result;

  if (isToken(tree)) {
    const rawValue = tree.value ?? tree.$value;
    const type = tree.type ?? tree.$type ?? "unknown";
    result.push({
      source: source.id,
      sourceLabel: source.label,
      path: tokenPath.join("."),
      name: cssVarName(source.id, tokenPath),
      type,
      value: normalizeValue(rawValue, type, source.id),
      rawValue,
      description: tree.description ?? tree.$description ?? "",
    });
    return result;
  }

  for (const [key, value] of Object.entries(tree)) {
    if (key.startsWith("$")) continue;
    collectTokens(value, source, tokenPath.concat(key), result);
  }
  return result;
}

function byType(tokens, type) {
  return tokens.filter((token) => token.type === type);
}

function findToken(tokens, suffix) {
  return tokens.find((token) => token.name.endsWith(suffix));
}

function tokenVar(tokens, suffix, fallback) {
  const token = findToken(tokens, suffix);
  return token ? `var(${token.name})` : fallback;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${content.trim()}\n`);
}

const tokens = sources.flatMap((source) =>
  collectTokens(readJson(source.file), source)
);

const tokenJson = {
  meta: {
    name: "Casino Plus Design System",
    layers: sources.map(({ id, label }) => ({ id, label })),
    generatedFrom: sources.map(({ id, label, file }) => ({ id, label, file })),
  },
  tokens,
};

function tokensFor(sourceId) {
  return tokens.filter((token) => token.source === sourceId);
}

function tokenDeclarations(sourceId) {
  return tokensFor(sourceId)
    .map((token) => `  ${token.name}: ${token.value};`)
    .join("\n");
}

function layerCss(sourceId, label, selector = ":root") {
  return `
/**
 * Casino Plus ${label}
 * Generated from Figma variable token exports.
 */

${selector} {
${tokenDeclarations(sourceId)}
}
`;
}

const primitiveCss = layerCss("primitive", "primitive tokens");
const semanticCss = layerCss(
  "semantic",
  "semantic tokens",
  ':root,\n[data-theme="dark"]'
);
const componentTokensCss = layerCss(
  "component",
  "component tokens",
  ':root,\n[data-theme="dark"]'
);

const tokensCss = `
/**
 * Casino Plus design token entrypoint
 * Primitive -> semantic -> component.
 */

@import "./primitive.css";
@import "./semantic.css";
@import "./component-tokens.css";

body {
  color: ${tokenVar(tokens, "semantic-color-text-primary", "#FFFFFF")};
  background:
    linear-gradient(
      135deg,
      ${tokenVar(tokens, "semantic-color-background-canvas-default-start", "#044A48")},
      ${tokenVar(tokens, "semantic-color-background-canvas-default-end", "#1A1859")}
    );
  font-family: ${tokenVar(tokens, "semantic-text-font-family", "Inter, system-ui, sans-serif")};
}
`;

const componentsCss = `
@import "./tokens.css";

* {
  box-sizing: border-box;
}

html {
  min-height: 100%;
}

body {
  min-height: 100vh;
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.cp-app-shell {
  min-height: 100vh;
  padding: ${tokenVar(tokens, "semantic-spacing-6", "24px")};
}

.cp-container {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.cp-navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${tokenVar(tokens, "semantic-spacing-4", "16px")};
  min-height: ${tokenVar(tokens, "component-navigation-bar-height", "64px")};
  padding: ${tokenVar(tokens, "component-navigation-bar-padding", "16px")};
  color: ${tokenVar(tokens, "semantic-color-text-primary", "#FFFFFF")};
  background: ${tokenVar(tokens, "component-navigation-bar-fill", "rgb(255 255 255 / 0.1)")};
  border: 1px solid ${tokenVar(tokens, "semantic-color-border-subtle", "rgb(255 255 255 / 0.16)")};
  border-radius: ${tokenVar(tokens, "semantic-radius-lg", "16px")};
  backdrop-filter: blur(18px);
}

.cp-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
}

.cp-brand-mark {
  width: 32px;
  height: 32px;
  border-radius: ${tokenVar(tokens, "component-button-primary-radius", "8px")};
  background: linear-gradient(
    135deg,
    ${tokenVar(tokens, "component-button-primary-fill-start", "#FDC800")},
    ${tokenVar(tokens, "component-button-primary-fill-end", "#FDC800")}
  );
  box-shadow: 0 10px 24px rgb(0 0 0 / 0.25);
}

.cp-card {
  color: ${tokenVar(tokens, "semantic-color-text-primary", "#FFFFFF")};
  background: ${tokenVar(tokens, "component-card-fill", tokenVar(tokens, "semantic-color-background-surface-default", "rgb(255 255 255 / 0.1)"))};
  border: 1px solid ${tokenVar(tokens, "component-card-border", tokenVar(tokens, "semantic-color-border-subtle", "rgb(255 255 255 / 0.16)"))};
  border-radius: ${tokenVar(tokens, "component-card-radius", "8px")};
  padding: ${tokenVar(tokens, "component-card-padding", "20px")};
  box-shadow: 0 18px 48px rgb(0 0 0 / 0.18);
  backdrop-filter: blur(18px);
}

.cp-stack {
  display: grid;
  gap: ${tokenVar(tokens, "semantic-spacing-4", "16px")};
}

.cp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: ${tokenVar(tokens, "semantic-spacing-4", "16px")};
}

.cp-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: ${tokenVar(tokens, "component-button-primary-height", "44px")};
  padding: 0 18px;
  border: 0;
  border-radius: ${tokenVar(tokens, "component-button-primary-radius", "8px")};
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms ease, filter 160ms ease, background 160ms ease;
}

.cp-button:hover {
  transform: translateY(-1px);
}

.cp-button:active {
  transform: translateY(0);
}

.cp-button-primary {
  color: ${tokenVar(tokens, "component-button-primary-label", "#171717")};
  background: linear-gradient(
    135deg,
    ${tokenVar(tokens, "component-button-primary-fill-start", "#FDC800")},
    ${tokenVar(tokens, "component-button-primary-fill-end", "#FDC800")}
  );
}

.cp-button-primary:hover {
  background: linear-gradient(
    135deg,
    ${tokenVar(tokens, "component-button-primary-hover-start", "#FEDA54")},
    ${tokenVar(tokens, "component-button-primary-hover-end", "#FEDA54")}
  );
}

.cp-button-secondary {
  color: ${tokenVar(tokens, "component-button-secondary-label", "#FFFFFF")};
  background: ${tokenVar(tokens, "component-button-secondary-fill", "#005BDF")};
}

.cp-button-secondary:hover {
  background: ${tokenVar(tokens, "component-button-secondary-hover", "#5491EA")};
}

.cp-button-tertiary {
  color: ${tokenVar(tokens, "component-button-tertiary-label", "#FFFFFF")};
  background: transparent;
  border: 1px solid ${tokenVar(tokens, "component-button-tertiary-border", "#BEC2C6")};
}

.cp-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: ${tokenVar(tokens, "component-tab-radius", "8px")};
  background: ${tokenVar(tokens, "component-tab-container-fill", "rgb(255 255 255 / 0.08)")};
}

.cp-tab {
  min-height: ${tokenVar(tokens, "component-tab-height", "36px")};
  padding: 0 14px;
  border: 0;
  border-radius: ${tokenVar(tokens, "component-tab-radius", "8px")};
  color: ${tokenVar(tokens, "component-tab-label", "rgb(255 255 255 / 0.7)")};
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.cp-tab[aria-selected="true"] {
  color: ${tokenVar(tokens, "component-tab-active-label", "#FFFFFF")};
  background: ${tokenVar(tokens, "component-tab-active-fill", "rgb(255 255 255 / 0.14)")};
}

.cp-text-muted {
  color: ${tokenVar(tokens, "semantic-color-text-secondary", "rgb(255 255 255 / 0.7)")};
}

.cp-heading {
  margin: 0;
  color: ${tokenVar(tokens, "semantic-color-text-primary", "#FFFFFF")};
  font-size: clamp(2rem, 5vw, 4rem);
  line-height: 1;
}

.cp-section-title {
  margin: 0 0 12px;
  color: ${tokenVar(tokens, "semantic-color-text-primary", "#FFFFFF")};
  font-size: 1rem;
  font-weight: 700;
}

.cp-token-swatch {
  min-height: 96px;
  border: 1px solid ${tokenVar(tokens, "semantic-color-border-subtle", "rgb(255 255 255 / 0.16)")};
  border-radius: 8px;
  overflow: hidden;
  background: ${tokenVar(tokens, "semantic-color-background-surface-subtle", "rgb(255 255 255 / 0.08)")};
}

.cp-token-color {
  height: 48px;
}

.cp-token-meta {
  display: grid;
  gap: 4px;
  padding: 10px;
  font-size: 12px;
}

.cp-layer-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.cp-layer-header p {
  max-width: 680px;
  margin: 6px 0 0;
}

.cp-kicker {
  margin: 0 0 6px;
  color: ${tokenVar(tokens, "component-button-primary-fill-start", "#FDC800")};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.cp-count {
  flex: 0 0 auto;
  color: ${tokenVar(tokens, "semantic-color-text-secondary", "rgb(255 255 255 / 0.7)")};
  font-size: 12px;
}

.cp-token-name {
  overflow-wrap: anywhere;
}

.cp-token-value {
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .cp-app-shell {
    padding: 16px;
  }

  .cp-navbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .cp-layer-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
`;

function tokenPreviewCard(token) {
  const isColor = token.type === "color";
  const previewStyle = isColor
    ? `background: var(${token.name})`
    : `background: linear-gradient(135deg, rgb(255 255 255 / 0.12), rgb(255 255 255 / 0.04))`;
  const value = token.value.length > 56 ? `${token.value.slice(0, 56)}...` : token.value;

  return `
          <article class="cp-token-swatch">
            <div class="cp-token-color" style="${previewStyle}"></div>
            <div class="cp-token-meta">
              <strong class="cp-token-name">${token.path}</strong>
              <span class="cp-text-muted cp-token-value">${value}</span>
            </div>
          </article>`;
}

function tokenPreviewSection({
  id,
  title,
  kicker,
  description,
}) {
  const sourceTokens = tokensFor(id);
  const previewTokens = sourceTokens;
  const cards = previewTokens
  .map(
    (token) => tokenPreviewCard(token)
  )
  .join("");

  return `
        <section class="cp-card">
          <div class="cp-layer-header">
            <div>
              <p class="cp-kicker">${kicker}</p>
              <h2 class="cp-section-title">${title}</h2>
              <p class="cp-text-muted">${description}</p>
            </div>
            <span class="cp-count">${previewTokens.length} shown / ${sourceTokens.length} tokens</span>
          </div>
          <div class="cp-grid">
${cards}
          </div>
        </section>`;
}

const previewSections = [
  tokenPreviewSection({
    id: "primitive",
    kicker: "01 Primitive",
    title: "Primitive tokens",
    description:
      "Raw foundations from Figma: color scales, font values, spacing, size, and radius.",
  }),
  tokenPreviewSection({
    id: "semantic",
    kicker: "02 Semantic",
    title: "Semantic tokens",
    description:
      "Meaningful application roles for dark mode, such as canvas, surface, text, border, spacing, radius, and effects.",
  }),
  tokenPreviewSection({
    id: "component",
    kicker: "03 Component",
    title: "Component tokens",
    description:
      "Component-level decisions for buttons, tabs, navigation, cards, headers, and footers.",
  }),
].join("");

const previewHtml = `
<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Casino Plus Design System</title>
    <link rel="stylesheet" href="../src/design-system/components.css" />
  </head>
  <body>
    <main class="cp-app-shell">
      <div class="cp-container cp-stack">
        <nav class="cp-navbar">
          <div class="cp-brand">
            <span class="cp-brand-mark" aria-hidden="true"></span>
            <span>Casino Plus</span>
          </div>
          <div class="cp-tabs" role="tablist" aria-label="Preview sections">
            <button class="cp-tab" aria-selected="true">Primitive</button>
            <button class="cp-tab">Semantic</button>
            <button class="cp-tab">Component</button>
          </div>
        </nav>

        <section class="cp-card cp-stack">
          <p class="cp-text-muted">Design system generated from Figma variable tokens.</p>
          <h1 class="cp-heading">Casino Plus UI foundation</h1>
          <p class="cp-text-muted">A three-layer token structure: primitive foundations, semantic roles, and component decisions.</p>
          <div>
            <button class="cp-button cp-button-primary">Primary action</button>
            <button class="cp-button cp-button-secondary">Secondary</button>
            <button class="cp-button cp-button-tertiary">Tertiary</button>
          </div>
        </section>

${previewSections}
      </div>
    </main>
  </body>
</html>
`;

const readme = `
# Casino Plus Design System

Generated from the Figma variable token exports in:

- \`Primitive token.json\`
- \`Semantic Tokens/semantic token.json\`
- \`Component Tokens/component token.json\`

## Files

- \`src/design-system/primitive.css\` contains raw foundations: colors, fonts, spacing, size, and radius.
- \`src/design-system/semantic.css\` contains dark mode semantic roles for product surfaces, text, borders, spacing, radius, and effects.
- \`src/design-system/component-tokens.css\` contains component-level variables for buttons, tabs, navigation, cards, headers, and footers.
- \`src/design-system/tokens.css\` imports the three token layers in order.
- \`src/design-system/components.css\` contains a small component foundation that consumes those variables.
- \`src/design-system/tokens.json\` contains the flattened token inventory.
- \`docs/design-system.html\` is the main browser preview of the primitive, semantic, and component layers.
- \`docs/design-system-preview.html\` is kept as an alias preview page.

## Usage

Import the component CSS in your app:

\`\`\`css
@import "./src/design-system/components.css";
\`\`\`

Or use only the variables:

\`\`\`css
@import "./src/design-system/tokens.css";
\`\`\`

Use \`data-theme="dark"\` on the root element for the dark semantic and component token set.

## Token Layers

- Primitive: stable raw values from Figma, with variables prefixed by \`--cp-primitive-\`.
- Semantic: dark mode meaning and usage roles, with variables prefixed by \`--cp-semantic-\`.
- Component: component-specific decisions, with variables prefixed by \`--cp-component-\`.

## Regenerate

When the Figma token JSON files change, run:

\`\`\`bash
npm run generate
\`\`\`
`;

write(path.join(outDir, "tokens.json"), JSON.stringify(tokenJson, null, 2));
write(path.join(outDir, "primitive.css"), primitiveCss);
write(path.join(outDir, "semantic.css"), semanticCss);
write(path.join(outDir, "component-tokens.css"), componentTokensCss);
write(path.join(outDir, "tokens.css"), tokensCss);
write(path.join(outDir, "components.css"), componentsCss);
write(path.join(docsDir, "design-system.html"), previewHtml);
write(path.join(docsDir, "design-system-preview.html"), previewHtml);
write(path.join(root, "README.md"), readme);

console.log(`Generated ${tokens.length} tokens into ${path.relative(root, outDir)}`);
