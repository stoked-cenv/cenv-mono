### `deploy` command

Use `deploy` to view in app help documentation.

```shell
cenv deploy <suite> <...application> [--parameters] [--stack] [--ecr] [--docker] [--skip-build] [--cenv] [--force] [--dependencies] [--cli] [--ui] [--strict-versions] [--verify] [--key] [--add-key-account <account>] [--log-level <logLevel>] [--bootstrap]
```


`<suite>` must be set to one of the suite names listed in suites.json in the mono root directory.
`<...application>` space separated list of package names that exist in the mono repo.
- `--parameters` option:
  - Shorthand: `-p`
  - Type: boolean
  - Default: `rue`
  - Description: Deploy `cenv` parameters for the relavant packages defined by `<suite>`, `<...application>`, or if none exist the current directory. Effectively this will trigger `cenv params init`, `cenv params deploy`, and then finally `cenv params materializze` for each package.
- `--ecr` option:
  - Shorthand: `-e`
  - Type: boolean
  - Default: `true`
  - Description: Choose a theme, defaults to `vue`, other choices are `buble`, `dark` and `pure`.
- `--plugins` option:
  - Shorthand: `-p`
  - Type: boolean
  - Default: `false`
  - Description: Provide a list of plugins to insert as `<script>` tags to `index.html`.

### `serve` command

Run a server on `localhost` with livereload.

```shell
docsify serve <path> [--open false] [--port 3000]

# docsify s <path> [-o false] [-p 3000]
```

- `--open` option:
  - Shorthand: `-o`
  - Type: boolean
  - Default: `false`
  - Description: Open the docs in the default browser, defaults to `false`. To explicitly set this option to `false` use `--no-open`.
- `--port` option:
  - Shorthand: `-p`
  - Type: number
  - Default: `3000`
  - Description: Choose a listen port, defaults to `3000`.

### `generate` command

Docsify's generators.

```shell
docsify generate <path> [--sidebar _sidebar.md]

# docsify g <path> [-s _sidebar.md]
```

- `--sidebar` option:
  - Shorthand: `-s`
  - Type: string
  - Default: `_sidebar.md`
  - Description: Generate sidebar file, defaults to `_sidebar.md`.

## Contributing
Please see the [Contributing Guidelines](./CONTRIBUTING.md)

## Contribution

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/docsifyjs/docsify-cli)

## License

[MIT](LICENSE)
