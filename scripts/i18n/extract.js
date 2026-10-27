/**
 * i18n extraction codemod.
 *
 * Usage (from apps/webapp):
 *   node ../../scripts/i18n/extract.js <area> app/i18n/locales <report> [--props|--trans] <file...>
 *
 * Default pass: rewrites user-visible JSX text, string props and string
 * branches of `?:` / `||` into t("area.file.slug") calls, adds
 * `const { t } = useTranslation()` to the enclosing component (or hook), adds
 * `t` to the deps of any memo/callback/effect that now uses it, and merges the
 * English into <localesDir>/en/<area>.json.
 *
 * --props  also converts visible object properties ({ title: "Assets" }).
 * --trans  converts sentences that wrap inline elements into one <Trans> key
 *          with numbered slots, inlining fragments already translated.
 *
 * Anything it cannot convert safely is left untouched and listed in the
 * report. See scripts/i18n/README.md.
 */
const fs = require("fs");
const path = require("path");
const { Project, SyntaxKind, Node } = require("ts-morph");

const ARGS = process.argv.slice(2);
const WITH_PROPS = ARGS.includes("--props");
const TRANS_MODE = ARGS.includes("--trans");
const [AREA, LOCALES_DIR, REPORT_FILE, ...FILES] = ARGS.filter(
  (a) => !a.startsWith("--")
);

/** Tags that structure a page; a sentence never spans them. */
const BLOCK_TAGS = new Set([
  "div",
  "p",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "tr",
  "td",
  "th",
  "section",
  "form",
  "header",
  "footer",
  "nav",
  "main",
  "article",
  "aside",
  "dl",
  "dt",
  "dd",
  "label",
  "fieldset",
]);

/** English text of every existing key, to inline fragments a sentence already uses. */
function loadEnglish(dir) {
  const out = new Map();
  const walk = (n, prefix) => {
    for (const [k, v] of Object.entries(n)) {
      if (v && typeof v === "object") walk(v, `${prefix}${k}.`);
      else out.set(`${prefix}${k}`, v);
    }
  };
  for (const f of fs.readdirSync(path.join(dir, "en"))) {
    walk(
      JSON.parse(fs.readFileSync(path.join(dir, "en", f), "utf8")),
      `${f.replace(/\.json$/, "")}.`
    );
  }
  return out;
}

/** Object properties holding visible text (only with --props). */
const TEXT_PROPS = new Set([
  "title",
  "label",
  "text",
  "description",
  "placeholder",
  "tooltip",
  "message",
  "heading",
  "subHeading",
  "buttonText",
  "emptyMessage",
  "helpText",
]);

const TEXT_ATTRS = new Set([
  "label",
  "placeholder",
  "aria-label",
  "title",
  "tooltip",
  "description",
  "tooltipTitle",
  "rowLabel",
  "alt",
  "tooltipContent",
  "text",
  "badgeText",
  "subHeading",
  "contentLabel",
  "otherInputLabel",
  "buttonLabel",
  "subText",
  "ctaText",
  "previewAlt",
  "otherInputPlaceholder",
  "emptyMessage",
  "ariaLabel",
  "headline",
  "subtitle",
  "hint",
  "heading",
  "triggerLabel",
  "secondaryLabel",
  "buttonText",
  "ctaLabel",
  "confirmText",
  "cancelText",
  "helpText",
  "emptyStateTitle",
  "emptyStateText",
  "confirmLabel",
  "cancelLabel",
  "loadingText",
  "successText",
  "errorText",
  "searchPlaceholder",
]);

/** Elements whose text is code or markup, never prose. */
const SKIP_PARENTS = new Set(["code", "pre", "style", "script", "kbd"]);

const ENTITIES = {
  amp: "&",
  apos: "'",
  quot: '"',
  lt: "<",
  gt: ">",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  middot: "·",
  times: "×",
  copy: "©",
  rarr: "→",
  larr: "←",
  bull: "•",
  ndash: "-",
  mdash: "-",
};

const report = [];
const project = new Project({ skipAddingFilesFromTsConfig: true });

function decodeEntities(text) {
  let unknown = false;
  const out = text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ent) => {
    if (ent[0] === "#") {
      const code =
        ent[1] === "x"
          ? parseInt(ent.slice(2), 16)
          : parseInt(ent.slice(1), 10);
      return String.fromCodePoint(code);
    }
    if (ENTITIES[ent] !== undefined) return ENTITIES[ent];
    unknown = true;
    return m;
  });
  return { out, unknown };
}

/** JSX whitespace rules (as Babel's cleanJSXElementLiteralChild). */
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
  return str;
}

const hasWords = (s) => /[A-Za-z]{2,}/.test(s);

/** Does a string look like prose rather than an id, URL, class list or code? */
function looksLikeProse(s) {
  const v = s.trim();
  if (!hasWords(v)) return false;
  if (/^(https?:|mailto:|\/|#|\.\/)/.test(v)) return false;
  if (/^[a-z0-9_-]+$/.test(v) && !/^[a-z]+$/.test(v)) return false; // kebab/snake ids
  if (/^[a-z]+[A-Z]\w*$/.test(v)) return false; // camelCase identifiers
  if (/[{}<>]|=>|\(\)/.test(v)) return false;
  if (/^[A-Z0-9_]+$/.test(v)) return false; // CONSTANTS
  if (!/\s/.test(v) && /[@.]/.test(v)) return false; // emails, domains, file names
  return true;
}

function camel(words) {
  return words
    .map((w, i) =>
      i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()
    )
    .join("");
}

function slugFor(text) {
  const words =
    text
      .replace(/\{\{\w+\}\}/g, " ")
      .replace(/['\u2019]/g, "")
      .match(/[A-Za-z0-9]+/g) || [];
  let slug = camel(words.slice(0, 5));
  if (!slug || /^[0-9]/.test(slug))
    slug = "text" + (slug ? slug[0].toUpperCase() + slug.slice(1) : "");
  return slug.slice(0, 40);
}

function fileKeyFor(file) {
  const base = path
    .basename(file)
    .replace(/\.tsx$/, "")
    .replace(/^_+/, "");
  const words = base.match(/[A-Za-z0-9]+/g) || ["file"];
  return camel(words);
}

/** The component a node renders in, or null when it is not inside one. */
function enclosingComponent(node) {
  let fn = node.getParent();
  while (fn) {
    if (
      Node.isFunctionDeclaration(fn) ||
      Node.isArrowFunction(fn) ||
      Node.isFunctionExpression(fn)
    ) {
      if (isComponent(fn)) return fn;
    }
    if (Node.isClassDeclaration(fn)) return null;
    fn = fn.getParent();
  }
  return null;
}

function isComponent(fn) {
  const upper = (n) => !!n && (/^[A-Z]/.test(n) || /^use[A-Z]/.test(n));
  if (Node.isFunctionDeclaration(fn)) return upper(fn.getName());
  if (Node.isFunctionExpression(fn) && upper(fn.getName())) return true;
  let p = fn.getParent();
  // forwardRef(...) / memo(...) wrappers
  while (p && Node.isCallExpression(p)) {
    const callee = p.getExpression().getText();
    if (!/(^|\.)(forwardRef|memo)$/.test(callee)) return false;
    p = p.getParent();
  }
  if (p && Node.isVariableDeclaration(p)) return upper(p.getName());
  return false;
}

/** Placeholder name for an interpolated expression. */
function placeholderName(expr) {
  if (Node.isCallExpression(expr)) {
    const callee = expr
      .getExpression()
      .getText()
      .replace(/^get(?=[A-Z])/, "");
    return callee[0].toLowerCase() + callee.slice(1);
  }
  const text = expr.getText();
  const parts = text.match(/[A-Za-z_$][\w$]*/g) || ["value"];
  let name = parts[parts.length - 1];
  if (name === "length" && parts.length > 1)
    name = parts[parts.length - 2] + "Count";
  return name;
}

const isSimpleExpr = (e) =>
  e &&
  (Node.isIdentifier(e) ||
    Node.isPropertyAccessExpression(e) ||
    (Node.isCallExpression(e) &&
      e.getArguments().length === 0 &&
      Node.isIdentifier(e.getExpression())) ||
    (Node.isElementAccessExpression(e) &&
      Node.isStringLiteral(e.getArgumentExpression())));

/**
 * Builds a Trans message from JSX children. Returns null when a child cannot
 * be expressed (conditional expressions, block elements, unknown keys).
 */
function buildTrans(children, ctx) {
  let msg = "";
  for (const c of children) {
    if (Node.isJsxText(c)) {
      const { out, unknown } = decodeEntities(cleanJsxText(c.getFullText()));
      if (unknown) return null;
      msg += out;
    } else if (Node.isJsxExpression(c)) {
      const e = c.getExpression();
      if (!e) continue;
      if (Node.isStringLiteral(e) || Node.isNoSubstitutionTemplateLiteral(e)) {
        msg += e.getLiteralText();
        continue;
      }
      if (isSimpleExpr(e)) {
        let name = placeholderName(e),
          base = name,
          i = 2;
        while (ctx.names.has(name) && ctx.names.get(name) !== e.getText())
          name = base + i++;
        ctx.names.set(name, e.getText());
        msg += `{{${name}}}`;
        continue;
      }
      if (Node.isCallExpression(e) && e.getExpression().getText() === "t") {
        const [keyArg, opts] = e.getArguments();
        if (!keyArg || !Node.isStringLiteral(keyArg)) return null;
        const text = ctx.english.get(keyArg.getLiteralText());
        if (text === undefined) return null;
        if (opts) {
          if (!Node.isObjectLiteralExpression(opts)) return null;
          for (const prop of opts.getProperties()) {
            if (Node.isShorthandPropertyAssignment(prop)) {
              ctx.names.set(prop.getName(), prop.getName());
              continue;
            }
            if (!Node.isPropertyAssignment(prop)) return null;
            const init = prop.getInitializer();
            if (
              !init ||
              !(
                isSimpleExpr(init) ||
                Node.isStringLiteral(init) ||
                Node.isNumericLiteral(init)
              )
            )
              return null;
            if (prop.getName() === "count") return null; // plurals need their own key
            ctx.names.set(prop.getName(), init.getText());
          }
        }
        ctx.usedKeys.push(keyArg.getLiteralText());
        msg += text;
        continue;
      }
      return null;
    } else if (Node.isJsxElement(c)) {
      const tag = c.getOpeningElement().getTagNameNode().getText();
      // <code>/<kbd> are inline: their text travels inside the sentence.
      if (BLOCK_TAGS.has(tag) || ["pre", "style", "script"].includes(tag))
        return null;
      const idx = ctx.comps.length;
      const open = c.getOpeningElement().getText();
      // An anchor needs content for jsx-a11y; Trans replaces it with the translation.
      ctx.comps.push(
        tag === "a" ? `${open}link</a>` : open.slice(0, -1).trimEnd() + " />"
      );
      const inner = buildTrans(c.getJsxChildren(), ctx);
      if (inner === null) return null;
      msg += `<${idx}>${inner}</${idx}>`;
    } else if (Node.isJsxSelfClosingElement(c)) {
      const tag = c.getTagNameNode().getText();
      if (BLOCK_TAGS.has(tag)) return null;
      const idx = ctx.comps.length;
      ctx.comps.push(c.getText());
      msg += `<${idx}></${idx}>`;
    } else {
      return null;
    }
  }
  return msg;
}

/** Elements whose children read as one sentence mixing text and inline elements. */
function transCandidates(sf) {
  const all = [
    ...sf.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...sf.getDescendantsOfKind(SyntaxKind.JsxFragment),
  ];
  const isCandidate = (el) => {
    const tag = Node.isJsxElement(el)
      ? el.getOpeningElement().getTagNameNode().getText()
      : "";
    if (SKIP_PARENTS.has(tag)) return false;
    const kids = el.getJsxChildren();
    const words = kids.some((k) => Node.isJsxText(k) && hasWords(k.getText()));
    const inline = kids.some(
      (k) =>
        Node.isJsxElement(k) ||
        Node.isJsxSelfClosingElement(k) ||
        (Node.isJsxExpression(k) && /\bt\(/.test(k.getText()))
    );
    const pieces = kids.filter(
      (k) => !(Node.isJsxText(k) && !k.getText().trim())
    ).length;
    return words && inline && pieces > 1;
  };
  const cands = all.filter(isCandidate);
  const set = new Set(cands);
  return cands.filter((el) => {
    for (let p = el.getParent(); p; p = p.getParent())
      if (set.has(p)) return false;
    return true;
  });
}

function main() {
  const jsonPath = path.join(LOCALES_DIR, "en", `${AREA}.json`);
  const json = fs.existsSync(jsonPath)
    ? JSON.parse(fs.readFileSync(jsonPath, "utf8"))
    : {};
  let total = 0;

  for (const file of FILES.filter((f) => !/\.test\.tsx?$/.test(f))) {
    const sf = project.addSourceFileAtPath(file);
    const fileKey = fileKeyFor(file);
    const bucket = json[fileKey] || {};
    const byText = new Map(Object.entries(bucket).map(([k, v]) => [v, k]));
    const used = new Set(Object.keys(bucket));
    const edits = []; // { start, end, text, comp }
    const comps = new Set();

    const keyFor = (text) => {
      if (byText.has(text)) return `${AREA}.${fileKey}.${byText.get(text)}`;
      let slug = slugFor(text);
      let s = slug,
        i = 2;
      while (used.has(s)) s = slug + i++;
      used.add(s);
      byText.set(text, s);
      bucket[s] = text;
      return `${AREA}.${fileKey}.${s}`;
    };
    const note = (node, why, text) =>
      report.push(
        `${file}:${node.getStartLineNumber()} [${why}] ${(
          text || node.getText()
        )
          .replace(/\s+/g, " ")
          .slice(0, 110)}`
      );

    const english = TRANS_MODE
      ? (globalThis.__english ||= loadEnglish(LOCALES_DIR))
      : null;
    if (TRANS_MODE) {
      for (const el of transCandidates(sf)) {
        const ctx = { names: new Map(), comps: [], usedKeys: [], english };
        const kids = el.getJsxChildren();
        const msg = buildTrans(kids, ctx);
        if (msg === null) {
          note(el, "trans-skip");
          continue;
        }
        const trimmed = msg.replace(/\s+/g, " ").trim();
        if (!hasWords(trimmed.replace(/<\/?\d+>/g, ""))) continue;
        const comp = enclosingComponent(el);
        if (!comp) {
          note(el, "no-component", trimmed);
          continue;
        }
        const key = keyFor(trimmed);
        const vals = [...ctx.names].map(([n, expr]) =>
          n === expr ? n : `${n}: ${expr}`
        );
        const props = [`t={t}`, `i18nKey="${key}"`];
        if (vals.length) props.push(`values={{ ${vals.join(", ")} }}`);
        // Numbered slots (<0>…</0>) index into an array; an object is not read by position.
        if (ctx.comps.length)
          props.push(
            `components={[${ctx.comps
              .map((c, i) => c.replace(/^<([\w.]+)/, `<$1 key="slot${i}"`))
              .join(", ")}]}`
          );
        const first =
          kids.find((k) => !(Node.isJsxText(k) && !k.getText().trim())) ||
          kids[0];
        const last =
          [...kids]
            .reverse()
            .find((k) => !(Node.isJsxText(k) && !k.getText().trim())) ||
          kids[kids.length - 1];
        edits.push({
          start: first.getStart(),
          end: last.getEnd(),
          text: `<Trans ${props.join(" ")} />`,
          comp,
          trans: true,
        });
      }
    }

    // --- JSX children runs -------------------------------------------------
    const parents = TRANS_MODE
      ? []
      : [
          ...sf.getDescendantsOfKind(SyntaxKind.JsxElement),
          ...sf.getDescendantsOfKind(SyntaxKind.JsxFragment),
        ];
    for (const parent of parents) {
      const tag = Node.isJsxElement(parent)
        ? parent.getOpeningElement().getTagNameNode().getText()
        : "";
      if (SKIP_PARENTS.has(tag)) continue;
      const children = parent.getJsxChildren();
      // Split into runs of text + simple expressions, separated by elements.
      const runs = [];
      let cur = [];
      const flush = () => {
        if (cur.length) runs.push(cur);
        cur = [];
      };
      for (const c of children) {
        if (Node.isJsxText(c)) cur.push(c);
        else if (Node.isJsxExpression(c)) {
          const e = c.getExpression();
          if (!e) continue; // comment
          if (
            Node.isStringLiteral(e) ||
            Node.isNoSubstitutionTemplateLiteral(e) ||
            isSimpleExpr(e)
          )
            cur.push(c);
          else flush();
        } else flush();
      }
      flush();
      const textRuns = runs.filter((r) =>
        r.some(
          (n) =>
            (Node.isJsxText(n) && hasWords(n.getText())) ||
            (Node.isJsxExpression(n) &&
              (Node.isStringLiteral(n.getExpression()) ||
                Node.isNoSubstitutionTemplateLiteral(n.getExpression())) &&
              hasWords(n.getExpression().getLiteralText()))
        )
      );
      if (!textRuns.length) continue;
      if (textRuns.length > 1) {
        note(parent, "mixed-inline", parent.getText());
        continue;
      }
      const run = textRuns[0];
      let message = "";
      const values = [];
      const names = new Set();
      let bad = false;
      for (const n of run) {
        if (Node.isJsxText(n)) {
          const { out, unknown } = decodeEntities(
            cleanJsxText(n.getFullText())
          );
          if (unknown) bad = true;
          message += out;
        } else {
          const e = n.getExpression();
          if (
            Node.isStringLiteral(e) ||
            Node.isNoSubstitutionTemplateLiteral(e)
          )
            message += e.getLiteralText();
          else {
            let name = placeholderName(e),
              base = name,
              i = 2;
            while (names.has(name)) name = base + i++;
            names.add(name);
            values.push(
              `${name === e.getText() ? name : `${name}: ${e.getText()}`}`
            );
            message += `{{${name}}}`;
          }
        }
      }
      if (bad) {
        note(parent, "entity");
        continue;
      }
      const lead = /^\s/.test(message),
        trail = /\s$/.test(message);
      const trimmed = message.replace(/\s+/g, " ").trim();
      if (!looksLikeProse(trimmed.replace(/\{\{\w+\}\}/g, "x"))) continue;
      const comp = enclosingComponent(parent);
      if (!comp) {
        note(parent, "no-component", trimmed);
        continue;
      }
      const key = keyFor(trimmed);
      const call = values.length
        ? `t("${key}", { ${values.join(", ")} })`
        : `t("${key}")`;
      const text = `${lead ? '{" "}' : ""}{${call}}${trail ? '{" "}' : ""}`;
      edits.push({
        start: run[0].getStart(),
        end: run[run.length - 1].getEnd(),
        text,
        comp,
      });
      // JsxText getStart skips leading trivia, so use full start for text nodes
      if (Node.isJsxText(run[0]))
        edits[edits.length - 1].start = run[0].getPos();
    }

    // --- string props ------------------------------------------------------
    for (const attr of TRANS_MODE
      ? []
      : sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
      const name = attr.getNameNode().getText();
      if (!TEXT_ATTRS.has(name)) continue;
      const init = attr.getInitializer();
      if (!init) continue;
      let message = null,
        values = [];
      if (Node.isStringLiteral(init)) {
        const { out, unknown } = decodeEntities(init.getLiteralText());
        if (unknown) {
          note(attr, "entity");
          continue;
        }
        message = out;
      } else if (Node.isJsxExpression(init)) {
        const e = init.getExpression();
        if (
          e &&
          (Node.isStringLiteral(e) || Node.isNoSubstitutionTemplateLiteral(e))
        )
          message = e.getLiteralText();
        else if (e && Node.isTemplateExpression(e)) {
          const spans = e.getTemplateSpans();
          if (!spans.every((s) => isSimpleExpr(s.getExpression()))) {
            if (hasWords(e.getHead().getLiteralText()))
              note(attr, "complex-template");
            continue;
          }
          message = e.getHead().getLiteralText();
          const names = new Set();
          for (const s of spans) {
            let n = placeholderName(s.getExpression()),
              b = n,
              i = 2;
            while (names.has(n)) n = b + i++;
            names.add(n);
            values.push(
              n === s.getExpression().getText()
                ? n
                : `${n}: ${s.getExpression().getText()}`
            );
            message += `{{${n}}}` + s.getLiteral().getLiteralText();
          }
        }
      }
      if (message === null) continue;
      // Single lowercase words in alt text are placeholders ("img"), not prose.
      if (name === "alt" && /^[a-z]+$/.test(message.trim())) continue;
      const trimmed = message.replace(/\s+/g, " ").trim();
      if (!looksLikeProse(trimmed.replace(/\{\{\w+\}\}/g, "x"))) continue;
      const comp = enclosingComponent(attr);
      if (!comp) {
        note(attr, "no-component", trimmed);
        continue;
      }
      const key = keyFor(trimmed);
      const call = values.length
        ? `t("${key}", { ${values.join(", ")} })`
        : `t("${key}")`;
      edits.push({
        start: init.getStart(),
        end: init.getEnd(),
        text: `{${call}}`,
        comp,
      });
    }

    // --- string branches: {cond ? "A" : "B"}, {x || "A"} ---------------------
    const literals = [
      ...sf.getDescendantsOfKind(SyntaxKind.StringLiteral),
      ...sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral),
    ];
    for (const lit of TRANS_MODE ? [] : literals) {
      let node = lit,
        parent = lit.getParent(),
        branch = false;
      while (parent) {
        if (Node.isParenthesizedExpression(parent)) {
          node = parent;
          parent = parent.getParent();
          continue;
        }
        if (
          Node.isConditionalExpression(parent) &&
          parent.getCondition() !== node
        ) {
          branch = true;
          node = parent;
          parent = parent.getParent();
          continue;
        }
        if (
          Node.isBinaryExpression(parent) &&
          ["||", "??"].includes(parent.getOperatorToken().getText()) &&
          parent.getRight() === node
        ) {
          branch = true;
          node = parent;
          parent = parent.getParent();
          continue;
        }
        break;
      }
      if (!branch || !parent || !Node.isJsxExpression(parent)) continue;
      const holder = parent.getParent();
      const inChildren =
        Node.isJsxElement(holder) || Node.isJsxFragment(holder);
      const inTextAttr =
        Node.isJsxAttribute(holder) &&
        TEXT_ATTRS.has(holder.getNameNode().getText());
      if (!inChildren && !inTextAttr) continue;
      if (
        inChildren &&
        Node.isJsxElement(holder) &&
        SKIP_PARENTS.has(holder.getOpeningElement().getTagNameNode().getText())
      )
        continue;
      const trimmed = lit.getLiteralText().replace(/\s+/g, " ").trim();
      if (!looksLikeProse(trimmed)) continue;
      const comp = enclosingComponent(lit);
      if (!comp) {
        note(lit, "no-component", trimmed);
        continue;
      }
      edits.push({
        start: lit.getStart(),
        end: lit.getEnd(),
        text: `t("${keyFor(trimmed)}")`,
        comp,
      });
    }

    // --- visible object properties: { title: "Assets" } (opt-in) ------------
    if (WITH_PROPS && !TRANS_MODE) {
      for (const prop of sf.getDescendantsOfKind(
        SyntaxKind.PropertyAssignment
      )) {
        if (!TEXT_PROPS.has(prop.getName())) continue;
        const init = prop.getInitializer();
        if (
          !init ||
          !(
            Node.isStringLiteral(init) ||
            Node.isNoSubstitutionTemplateLiteral(init)
          )
        )
          continue;
        const trimmed = init.getLiteralText().replace(/\s+/g, " ").trim();
        if (!looksLikeProse(trimmed)) continue;
        const comp = enclosingComponent(prop);
        if (!comp) {
          note(prop, "no-component", trimmed);
          continue;
        }
        edits.push({
          start: init.getStart(),
          end: init.getEnd(),
          text: `t("${keyFor(trimmed)}")`,
          comp,
        });
      }
    }

    if (!edits.length) {
      project.removeSourceFile(sf);
      continue;
    }

    // A component that already binds `t` to something else is left alone.
    const okComps = new Set();
    for (const e of edits) {
      if (okComps.has(e.comp)) continue;
      const usesTranslation = /useTranslation\(/.test(e.comp.getText());
      const tBound = e.comp
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .some((id) => id.getText() === "t");
      if (tBound && !usesTranslation) {
        note(e.comp, "t-collision", `component ${e.comp.getStartLineNumber()}`);
        continue;
      }
      okComps.add(e.comp);
    }
    const applied = edits.filter((e) => okComps.has(e.comp));
    if (!applied.length) {
      project.removeSourceFile(sf);
      continue;
    }

    // Hook insertions, computed on the original text.
    const inserts = [];

    // `t` used inside a memo/callback/effect must be one of its deps, or the
    // memoised text keeps the old language after a switch.
    const depCalls = new Set();
    for (const e of applied) {
      let n = sf.getDescendantAtPos(e.start);
      while (n && n !== e.comp) {
        const p = n.getParent();
        if (
          p &&
          Node.isCallExpression(p) &&
          /^(React\.)?(useMemo|useCallback|useEffect|useLayoutEffect)$/.test(
            p.getExpression().getText()
          ) &&
          p.getArguments()[0] === n
        ) {
          depCalls.add(p);
        }
        n = p;
      }
    }
    for (const call of depCalls) {
      const deps = call.getArguments()[1];
      if (!deps || !Node.isArrayLiteralExpression(deps)) continue;
      if (deps.getElements().some((el) => el.getText() === "t")) continue;
      const els = deps.getElements();
      if (!els.length) {
        const end = deps.getEnd() - 1;
        inserts.push({ start: end, end, text: "t" });
        continue;
      }
      const after = els[els.length - 1].getEnd(); // after the last dep, before any trailing comma
      inserts.push({ start: after, end: after, text: ", t" });
    }
    for (const comp of okComps) {
      if (/useTranslation\(/.test(comp.getText())) continue;
      const body = comp.getBody();
      if (Node.isBlock(body)) {
        inserts.push({
          start: body.getStart() + 1,
          end: body.getStart() + 1,
          text: "\n  const { t } = useTranslation();",
        });
      } else {
        // Arrow with an expression body: wrap it in a block.
        inserts.push({
          start: body.getStart(),
          end: body.getStart(),
          text: "{\n  const { t } = useTranslation();\n  return ",
        });
        inserts.push({
          start: body.getEnd(),
          end: body.getEnd(),
          text: ";\n}",
        });
      }
    }

    const i18nImport = sf
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue() === "react-i18next");
    const needsTrans = applied.some((e) => e.trans);
    if (
      i18nImport &&
      needsTrans &&
      !i18nImport.getNamedImports().some((n) => n.getName() === "Trans")
    ) {
      inserts.push({
        start: i18nImport.getStart(),
        end: i18nImport.getEnd(),
        text: `import { ${[
          "Trans",
          ...i18nImport.getNamedImports().map((n) => n.getText()),
        ].join(", ")} } from "react-i18next";`,
      });
    }
    if (!i18nImport) {
      const imports = sf.getImportDeclarations();
      const at = imports.length ? imports[imports.length - 1].getEnd() : 0;
      inserts.push({
        start: at,
        end: at,
        text: `${at ? "\n" : ""}import { ${
          needsTrans ? "Trans, " : ""
        }useTranslation } from "react-i18next";${at ? "" : "\n"}`,
      });
    }

    let text = sf.getFullText();
    const all = [...applied, ...inserts].sort(
      (a, b) => b.start - a.start || b.end - a.end
    );
    for (const e of all)
      text = text.slice(0, e.start) + e.text + text.slice(e.end);
    fs.writeFileSync(file, text);
    json[fileKey] = bucket;
    total += applied.length;
    project.removeSourceFile(sf);
  }

  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2) + "\n");
  fs.appendFileSync(
    REPORT_FILE,
    report.join("\n") + (report.length ? "\n" : "")
  );
  console.log(
    `${AREA}: ${total} strings extracted, ${report.length} left for review`
  );
}

main();
