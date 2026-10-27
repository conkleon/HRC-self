/** Reports t() calls inside useMemo/useCallback/useEffect whose deps omit t. */
const { Project, SyntaxKind, Node } = require("ts-morph");
const project = new Project({ skipAddingFilesFromTsConfig: true });
let bad = 0;
for (const file of process.argv.slice(2)) {
  const sf = project.addSourceFileAtPath(file);
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (
      !/^(React\.)?(useMemo|useCallback|useEffect|useLayoutEffect)$/.test(
        call.getExpression().getText()
      )
    )
      continue;
    const [fn, deps] = call.getArguments();
    if (!fn || !deps || !Node.isArrayLiteralExpression(deps)) continue;
    const usesT = fn
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((c) => c.getExpression().getText() === "t");
    if (usesT && !deps.getElements().some((el) => el.getText() === "t")) {
      bad++;
      console.log(`${file}:${call.getStartLineNumber()}`);
    }
  }
  project.removeSourceFile(sf);
}
console.log(`${bad} hook(s) missing t in deps`);
