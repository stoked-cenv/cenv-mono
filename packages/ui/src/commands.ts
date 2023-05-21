export class Commands {
  static module = null;
  static list() {
    return [
      ['Deploy', 'deploy'],
      ['Destroy', 'destroy'],
      ['Add', 'add'],
      ['Remove', 'rm'],
      ['Params', 'params'],
      ['Docker', 'docker'],
      ['Build', 'build'],
      ['UI', 'ui'],
      ['Exec', 'exec'],
      ['Configure', 'configure'],
      ['Test', 'test'],
      ['Pull', 'pull'],
      ['Push', 'push'],
      ['Bump', 'bump'],
      ['Clean', 'clean'],
      ['Env', 'env'],
      ['Lambda', 'lambda'],
      ['Docs', 'docs'],
    ];
  }
}
