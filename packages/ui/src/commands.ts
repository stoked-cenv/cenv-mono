export class Commands {
  static module: any = null;

  static list() {
    return [['Cenv', 'cenv'], ['Deploy', 'deploy'], ['Destroy', 'destroy'], ['UI', 'ui'], ['Add', 'add'], ['Remove', 'rm'], ['Params', 'params'], ['Docker', 'docker'], ['Build', 'build'], ['Init', 'init'], ['Exec', 'exec'], ['Configure', 'configure'], ['Stat', 'stat'], ['Test', 'test'], ['Pull', 'pull'], ['Push', 'push'], ['Bump', 'bump'], ['Clean', 'clean'], ['Env', 'env'], ['Lambda', 'lambda'], ['Docs', 'docs'],];
  }
}
