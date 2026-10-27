/** Reports JSX elements that mix t() calls with untranslated English text. */
const { Project, SyntaxKind, Node } = require("ts-morph");
const project = new Project({ skipAddingFilesFromTsConfig: true });
let n = 0;
for (const file of process.argv.slice(2)) {
  const sf = project.addSourceFileAtPath(file);
  for (const el of [
    ...sf.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...sf.getDescendantsOfKind(SyntaxKind.JsxFragment),
  ]) {
    const kids = el.getJsxChildren();
    const english = kids.some(
      (k) => Node.isJsxText(k) && /[A-Za-z]{2,}/.test(k.getText())
    );
    // t() directly in a child, or inside a child element (<b>{t(...)}</b>)
    const translated = kids.some(
      (k) =>
        (Node.isJsxExpression(k) || Node.isJsxElement(k)) &&
        /\bt\(/.test(k.getText())
    );
    if (english && translated) {
      n++;
      console.log(
        `${file}:${el.getStartLineNumber()} ${el
          .getText()
          .replace(/\s+/g, " ")
          .slice(0, 140)}`
      );
    }
  }
  project.removeSourceFile(sf);
}
console.log(`${n} mixed element(s)`);
