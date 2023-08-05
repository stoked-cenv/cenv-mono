import path from 'path';
import { existsSync, mkdirSync, rmdirSync, writeFileSync } from 'fs';
import { CenvLog, LogLevel } from './log';
import { Template } from './templates';
import { search_sync } from './file'
import { Cenv, CommandInfo, InitCommandOptions, NewCommandOptions } from './cenv';
import { execCmd } from './proc';
import { cmdInit } from './cli'


export async function Init(options: InitCommandOptions, cmdInfo: CommandInfo) {

  const {primaryPackagePath, metas} = getWorkspaceData();
  const folderName = path.parse(process.cwd()).name;

  const globalPackage = createGlobalsPackage(folderName, primaryPackagePath, options?.scope);

  const cenvConfig: any = {
    globalPackage, defaultSuite: folderName, primaryPackagePath: path.relative(process.cwd(), primaryPackagePath)
  }
  if (options?.scope) {
    cenvConfig.scope = options.scope;
  }

  cenvConfig.suites = {};
  cenvConfig.suites[folderName] = {
    "packages": metas.filter((w: { meta: any, path: string }) => !w.meta.name.endsWith('globals'))
  }

  const configOutput = JSON.stringify(cenvConfig, null, 2) + '\n';
  writeFileSync(path.join(process.cwd(), 'cenv.json'), configOutput);
  console.log(`${CenvLog.colors.info('generated')} ${CenvLog.colors.infoBold('cenv.json')}`)
  if (CenvLog.logLevel === LogLevel.VERBOSE) {
    console.log(CenvLog.colors.info(JSON.stringify(cenvConfig, null, 2)))
  }

  await execCmd(`npm init -y`, {silent: true});
  await cmdInit({logLevel: process.env.CENV_LOG_LEVEL}, cmdInfo);
}

function createGlobalsPackage(projectName: string, primaryPackagePath: string, scope?: string) {
  const globalsNameNoScope = projectName + '-globals';
  const globalsPath = path.join(primaryPackagePath, 'globals');
  if (!existsSync(globalsPath)) {
    mkdirSync(globalsPath, {recursive: true});
  }
  const cenvDir = path.join(globalsPath, '.cenv');
  if (!existsSync(cenvDir)) {
    mkdirSync(cenvDir);
  }
  const globalsCenvPath = path.join(cenvDir, '.cenv.globals');
  if (!existsSync(globalsCenvPath)) {
    writeFileSync(globalsCenvPath, '');
  }

  const globalsCenvEnvTemplatePath = path.join(cenvDir, '.cenv.env.globals.template');
  if (!existsSync(globalsCenvEnvTemplatePath)) {
    writeFileSync(globalsCenvEnvTemplatePath, '');
  }

  const globalsName = scope ? `${scope}/${globalsNameNoScope}` : globalsNameNoScope;
  const globalMeta = {
    "name": globalsName, "version": "0.0.1"
  };

  writeFileSync(path.join(globalsPath, 'package.json'), JSON.stringify(globalMeta, null, 2) + '\n');
  console.log(`${CenvLog.colors.info('generated')} ${CenvLog.colors.infoBold('globals package')}`);

  if (CenvLog.logLevel === LogLevel.VERBOSE) {
    console.log(CenvLog.colors.info(JSON.stringify(globalMeta, null, 2)))
    console.log(' ')
  }
  return globalsName;
}

function getPackages() {
  const pkgs: string[] = search_sync(process.cwd(), false, true, 'package.json', {excludedDirs: ['cdk.out', 'node_modules', 'dist']}) as string[];
  const metas: { meta: any, path: string }[] = pkgs.map(pkgPath => {
    return {meta: require(pkgPath), path: path.parse(pkgPath).dir};
  })
  return metas;
}

function getWorkspaceData() {
  const metas = getPackages().filter(m => m.path !== process.cwd())
  let primaryPackagePath = path.join(process.cwd(), 'packages');
  let largestCount = 0;
  const pathCounts: Record<string, number> = {}
  for (let i = 0; i < metas.length; i++) {
    const pkg = metas[i];
    const containingDir = path.parse(pkg.path).dir;
    if (!pathCounts[containingDir]) {
      pathCounts[containingDir] = 1;
    } else {
      pathCounts[containingDir]++;
    }
    if (pathCounts[containingDir] > largestCount) {
      largestCount = pathCounts[containingDir];
      primaryPackagePath = containingDir
    }
  }
  const globalPackage = metas.find(m => m.meta.cenv?.globals);
  return {primaryPackagePath, metas, globalPackage};
}

export async function New(name: string, options: NewCommandOptions, cmdInfo: CommandInfo) {
  const projectPath = path.join(process.cwd(), name);
  if (existsSync(projectPath)) {
    if (!options?.force) {
      CenvLog.single.alertLog(`the directory ${name} already exists, either add the --force flag to replace the existing data or choose a new directory`);
      process.exit(636);
    } else {
      rmdirSync(projectPath);
      mkdirSync(projectPath);
    }
  }
  mkdirSync(path.join(projectPath, 'packages'), {recursive: true});
  process.chdir(projectPath);
  console.log(process.cwd());
  await Init({}, cmdInfo);

  await Template.newWeb()
}