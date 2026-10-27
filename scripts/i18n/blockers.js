/**
 * Converts scanner blocker configs ({ id, message: (count) => JSX, description })
 * to <Trans> elements keyed by file and blocker id, with _one/_other plurals.
 *
 * Usage: node blockers.js <localesDir> <reportFile> <file...>
 */
const fs = require("fs");
const path = require("path");
const { Project, SyntaxKind, Node } = require("ts-morph");

const [, , LOCALES_DIR, REPORT_FILE, ...FILES] = process.argv;
const project = new Project({ skipAddingFilesFromTsConfig: true });
const report = [];

const camel = (s) => s.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
const fileKeyFor = (f) => camel(path.basename(f).replace(/\.tsx?$/, ""));

function cleanJsxText(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  let last = 0;
  lines.forEach((l, i) => {
    if (/[^ \t]/.test(l)) last = i;
  });
  let str = "";
  lines.forEach((line, i) => {
    let t = line.replace(/\t/g, " ");
    if (i !== 0) t = t.replace(/^[ ]+/, "");
    if (i !== lines.length - 1) t = t.replace(/[ ]+$/, "");
    if (t) {
      if (i !== last) t += " ";
      str += t;
    }
  });
  return str
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** Evaluates a template literal for one (n=1) or other (n=2). */
function evalTemplate(tpl, countName, other) {
  if (Node.isNoSubstitutionTemplateLiteral(tpl) || Node.isStringLiteral(tpl))
    return tpl.getLiteralText();
  if (!Node.isTemplateExpression(tpl)) return null;
  let out = tpl.getHead().getLiteralText();
  for (const span of tpl.getTemplateSpans()) {
    const e = span.getExpression();
    const v = evalExpr(e, countName, other);
    if (v === null) return null;
    out += v + span.getLiteral().getLiteralText();
  }
  return out;
}

function evalExpr(e, countName, other) {
  if (Node.isParenthesizedExpression(e))
    return evalExpr(e.getExpression(), countName, other);
  if (Node.isIdentifier(e) && e.getText() === countName) return "{{count}}";
  if (Node.isStringLiteral(e) || Node.isNoSubstitutionTemplateLiteral(e))
    return e.getLiteralText();
  if (Node.isTemplateExpression(e)) return evalTemplate(e, countName, other);
  if (Node.isConditionalExpression(e)) {
    const c = e.getCondition().getText().replace(/\s+/g, "");
    let isOther;
    if (
      c === `${countName}>1` ||
      c === `${countName}!==1` ||
      c === `${countName}!=1`
    )
      isOther = true;
    else if (c === `${countName}===1` || c === `${countName}==1`)
      isOther = false;
    else return null;
    const pick = isOther === other ? e.getWhenTrue() : e.getWhenFalse();
    return evalExpr(pick, countName, other);
  }
  return null;
}

/** Message text for JSX children, with <strong> as <bold>. */
function evalJsx(node, countName, other) {
  if (Node.isParenthesizedExpression(node))
    return evalJsx(node.getExpression(), countName, other);
  if (Node.isJsxFragment(node) || Node.isJsxElement(node)) {
    let out = "";
    for (const c of node.getJsxChildren()) {
      if (Node.isJsxText(c)) out += cleanJsxText(c.getFullText());
      else if (Node.isJsxExpression(c)) {
        const e = c.getExpression();
        if (!e) continue;
        const v = evalExpr(e, countName, other);
        if (v === null) return null;
        out += v;
      } else if (Node.isJsxElement(c)) {
        const tag = c.getOpeningElement().getTagNameNode().getText();
        if (tag !== "strong" && tag !== "b") return null;
        const inner = evalJsx(c, countName, other);
        if (inner === null) return null;
        out += `<bold>${inner.trim()}</bold>`;
      } else return null;
    }
    return out;
  }
  return evalExpr(node, countName, other);
}

const LOC = path.join(LOCALES_DIR, "en", "scanner.json");
const json = JSON.parse(fs.readFileSync(LOC, "utf8"));
json.blockers = json.blockers || {};
let converted = 0;

for (const file of FILES) {
  const sf = project.addSourceFileAtPath(file);
  const fileKey = fileKeyFor(file);
  const edits = [];
  for (const obj of sf.getDescendantsOfKind(
    SyntaxKind.ObjectLiteralExpression
  )) {
    const idProp = obj.getProperty("id");
    const msgProp = obj.getProperty("message");
    if (
      !idProp ||
      !msgProp ||
      !Node.isPropertyAssignment(idProp) ||
      !Node.isPropertyAssignment(msgProp)
    )
      continue;
    const idInit = idProp.getInitializer();
    if (!idInit || !Node.isStringLiteral(idInit)) {
      report.push(`${file}:${obj.getStartLineNumber()} [dynamic-id]`);
      continue;
    }
    const id = camel(idInit.getLiteralText());
    const key = `scanner.blockers.${fileKey}.${id}`;
    const entry = {};

    const fn = msgProp.getInitializer();
    if (fn && Node.isArrowFunction(fn) && fn.getParameters().length === 1) {
      const countName = fn.getParameters()[0].getName();
      const body = fn.getBody();
      const one = evalJsx(body, countName, false);
      const other = evalJsx(body, countName, true);
      if (one === null || other === null) {
        report.push(
          `${file}:${fn.getStartLineNumber()} [message] ${fn
            .getText()
            .replace(/\s+/g, " ")
            .slice(0, 120)}`
        );
      } else {
        const tidy = (s) => s.replace(/\s+/g, " ").trim();
        const plural = tidy(one) !== tidy(other);
        if (plural) {
          entry.message_one = tidy(one);
          entry.message_other = tidy(other);
        } else entry.message = tidy(one);
        const hasBold = /<bold>/.test(one + other);
        const usesCount = /\{\{count\}\}/.test(one + other) || plural;
        const props = [`i18nKey="${key}.message"`];
        if (usesCount) props.push(`count={${countName}}`);
        if (hasBold) props.push(`components={{ bold: <strong /> }}`);
        const param = fn.getParameters()[0].getText();
        const newFn = `(${
          usesCount ? param : `_${param}`
        }) => <Trans ${props.join(" ")} />`;
        edits.push({ start: fn.getStart(), end: fn.getEnd(), text: newFn });
      }
    }

    const descProp = obj.getProperty("description");
    if (descProp && Node.isPropertyAssignment(descProp)) {
      const d = descProp.getInitializer();
      if (
        d &&
        (Node.isStringLiteral(d) || Node.isNoSubstitutionTemplateLiteral(d))
      ) {
        entry.description = d.getLiteralText().replace(/\s+/g, " ").trim();
        edits.push({
          start: d.getStart(),
          end: d.getEnd(),
          text: `<Trans i18nKey="${key}.description" />`,
        });
      } else if (d && !/^<Trans\b/.test(d.getText())) {
        report.push(
          `${file}:${d.getStartLineNumber()} [description] ${d
            .getText()
            .replace(/\s+/g, " ")
            .slice(0, 100)}`
        );
      }
    }

    if (Object.keys(entry).length) {
      json.blockers[fileKey] = json.blockers[fileKey] || {};
      json.blockers[fileKey][id] = { ...json.blockers[fileKey][id], ...entry };
    }
  }
  if (!edits.length) {
    project.removeSourceFile(sf);
    continue;
  }
  let text = sf.getFullText();
  for (const e of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, e.start) + e.text + text.slice(e.end);
  const imp = sf
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === "react-i18next");
  if (imp) {
    if (!imp.getNamedImports().some((n) => n.getName() === "Trans")) {
      const names = ["Trans", ...imp.getNamedImports().map((n) => n.getText())];
      text = text.replace(
        imp.getText(),
        `import { ${names.join(", ")} } from "react-i18next";`
      );
    }
  } else {
    const imports = sf.getImportDeclarations();
    const at = imports.length ? imports[imports.length - 1].getEnd() : 0;
    // `at` is an offset in the original text; edits all sit after the imports.
    text =
      text.slice(0, at) +
      `\nimport { Trans } from "react-i18next";` +
      text.slice(at);
  }
  fs.writeFileSync(file, text);
  converted += edits.length;
  project.removeSourceFile(sf);
}

fs.writeFileSync(LOC, JSON.stringify(json, null, 2) + "\n");
fs.appendFileSync(REPORT_FILE, report.join("\n") + (report.length ? "\n" : ""));
console.log(
  `blockers: ${converted} messages/descriptions converted, ${report.length} left`
);
